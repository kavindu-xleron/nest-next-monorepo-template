# Remediation Plan

Findings from auditing phases 4–6, ordered so that each group is testable once the group above it
lands. Everything in P0 and P1 was reproduced against the running application, not inferred from
reading the code.

Verification method: built the app, booted it against the dev Postgres with `NODE_ENV` left at its
schema default and no Clerk keys set, and issued live HTTP requests. Any rows created during probing
were removed afterwards.

---

## P0 — Nothing else is testable until these land

### 1. The application does not boot

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]:
Package subpath './dist/services/schema-object-factory' is not defined
by "exports" in @nestjs/swagger/package.json
```

`patchNestJsSwagger()` in `apps/api/src/main.ts` reaches into `@nestjs/swagger` internals that v11
hides behind its `exports` map. It is a nestjs-zod v3 shim; v4 wires Swagger up automatically
through `createZodDto`.

- [ ] Delete the `patchNestJsSwagger` import and its call from `main.ts`.
- [ ] Verify: the app starts and `/docs` still renders request/response schemas.

### 2. `start:prod` points at a path the build no longer produces

`drizzle.config.ts` sits at the package root and is not excluded from `tsconfig.build.json`, so
TypeScript widened the inferred `rootDir` to the package root. Output moved from `dist/main.js` to
`dist/src/main.js`, while the script still says `node dist/main`.

- [ ] Add `drizzle.config.ts` to `tsconfig.build.json`'s `exclude` (or set `rootDir: "./src"`
      explicitly, which fails loudly instead of silently relocating output).
- [ ] Verify: `dist/main.js` exists and `pnpm --filter api start:prod` boots.
- [ ] This also unblocks the Phase 8 Docker `CMD`, which would have inherited the same broken path.

### 3. No request validation runs anywhere

`ZodValidationPipe` is registered globally, but the DTOs are `z.infer` **types**, not classes. Types
are erased at runtime, so the pipe has no metatype to resolve a schema from and every request passes
straight through. Reproduced:

```
POST /api/v1/users {"email":"definitely-not-an-email","role":"superadmin"}  ->  201 Created
GET  /api/v1/users?limit=not-a-number                                      ->  200 OK
```

Both were persisted. `role: "superadmin"` is outside the contract enum, which also makes
`toUserDto`'s `user.role as "user" | "admin"` cast a lie and puts the response in breach of its own
contract.

The fix must not drag Nest into `packages/contracts` — the web app imports that package, and it has
to stay framework-free. So the schemas stay pure and the API wraps them:

```ts
// packages/contracts — unchanged, pure Zod, imported by web
export const CreateUserSchema = z.object({ ... })

// apps/api/src/users/dto/create-user.dto.ts — Nest-side binding
import { createZodDto } from "nestjs-zod"
import { CreateUserSchema } from "@workspace/contracts"
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
```

- [ ] Add `apps/api/src/users/dto/` classes wrapping each contract schema used in a
      `@Body()` or `@Query()` position.
- [ ] Point the controllers at the DTO classes. Services keep using the contract types.
- [ ] Verify: the two requests above return 400, and `?limit=10` still coerces to a number.

### 4. Add a test that actually boots the application

Findings 1 and 3 both survived a green pipeline: `tsc` passes because the offending export exists in
the _types_, and all 63 unit tests pass because none of them call `bootstrap()`. This gap matters
more than any single fix above — it is why a completely unstartable app looked healthy.

- [ ] An e2e spec that builds the real application and hits `/health/live`, `/docs`, and one
      validated route.
- [ ] Run it in CI (Phase 8) alongside the unit tests.

---

## P1 — Security. All four reproduced against the running app

### 5. Complete authentication bypass

`apps/api/src/auth/guards/clerk-auth.guard.ts` treats "no token" as a reason to authenticate:

```
GET /api/v1/users     (no Authorization header)  ->  200  [full user list]
GET /api/v1/users/me  (no Authorization header)  ->  200  {"email":"user@example.com",...}
```

`NODE_ENV` **defaults to `development`** in the env schema, so a deployment that simply forgets to
set it exposes the entire API to anonymous callers.

- [ ] Delete the fallback branch outright. An auth guard containing a "skip auth" path is a landmine
      regardless of how it is fenced — the fence is one missing env var away from being gone.
- [ ] For local development, use a Clerk development instance (they are free) rather than bypassing.
- [ ] For tests, override the guard in the testing module. That is the seam the plan called for, and
      it keeps the fake identity in test code where it cannot ship.

### 6. Any authenticated user can promote themselves to admin

`users.controller.ts` carries no `@Roles()` and no ownership check, and `UpdateUserSchema` includes
`role`, which `users.service.ts` passes straight through to the update.

```
PATCH /api/v1/users/{id} {"role":"admin"}  ->  200  {"role":"admin"}
```

Unlike finding 5, **this is exploitable in production with a valid Clerk token.** It does not depend
on the bypass.

Splitting the routes is cleaner than one route plus field-stripping, because it makes the privileged
surface obvious in the controller rather than conditional in a service:

- [ ] `PATCH /users/me` — self-service. Its DTO **must not contain `role`**.
- [ ] `PATCH /users/:id` — `@Roles("admin")`, full DTO including `role`.
- [ ] `@Roles("admin")` on `GET /users`, `POST /users`, `DELETE /users/:id`.
- [ ] `GET /users/:id` — self-or-admin.
- [ ] Verify: a non-admin token gets 403 on each admin route, and cannot change its own `role`.

### 7. Unsigned webhooks are accepted and persisted

`clerk-webhook.controller.ts` skips Svix verification when `CLERK_WEBHOOK_SECRET` is unset outside
production, falling back to `evt = req.body`.

```
POST /api/v1/webhooks/clerk  (no svix headers)  ->  200 {"success":true}
```

This wrote a real row. Anyone reachable can mint users, including with
`public_metadata.role = "admin"`.

- [ ] Verify signatures unconditionally. No environment-dependent branch.
- [ ] Treat a missing `CLERK_WEBHOOK_SECRET` as a startup failure, not a runtime fallback.
- [ ] Drop the `JSON.stringify(req.body)` fallback — Svix must see the exact bytes received. If
      `rawBody` is absent that is a misconfiguration to fail on, not to work around.
- [ ] Confirm handling is idempotent; Clerk retries deliveries.

### 8. CORS reflects any origin with credentials

`CORS_ORIGIN` defaults to `"*"`, which `main.ts` turns into `origin: true` alongside
`credentials: true`. Any website can then make credentialed cross-origin requests and read the
responses. `CORS_ORIGIN` is not in `REQUIRED_IN_PRODUCTION`, so **this default reaches production**.

- [ ] Never pair a reflected origin with `credentials: true`.
- [ ] Default to an explicit development origin (`http://localhost:3000`) instead of `*`.
- [ ] Add `CORS_ORIGIN` to `REQUIRED_IN_PRODUCTION` so a real deployment must state its allowlist.

---

## P2 — Correctness

### 9. `GET /users/me` returns someone else's profile

`users.service.ts` `findMe()` returns the first row of the table and never looks at the caller. The
`CurrentUser` decorator exists but is not used anywhere.

- [ ] Take the authenticated user from `@CurrentUser()` and return that profile.

### 10. JIT sync never updates an existing user

`ensureJitUser` returns early when the `clerkId` already exists, so `user.updated` webhooks are a
no-op — which is the entire purpose of that event. Name, email and role changes in Clerk never reach
Postgres.

- [ ] Make it a genuine upsert (`onConflictDoUpdate` on `clerk_id`).
- [ ] Decide explicitly which fields Clerk owns. If Clerk owns `role`, a local admin edit will be
      overwritten on the next sync; if the database owns it, the webhook must not touch it. Either is
      defensible, but it has to be a decision rather than an accident.

### 11. CASL is dead code

`CaslAbilityFactory` appears only as a provider/export in `auth.module.ts`. There is no
`PoliciesGuard`, no `@CheckPolicies` decorator, and it is never injected. Separately,
`detectSubjectType: item.constructor` cannot work against Drizzle rows, which are plain objects whose
constructor is `Object`, never `UserSubject`.

- [ ] Either finish it — `PoliciesGuard` + `@CheckPolicies`, and a `detectSubjectType` that works on
      plain rows — or delete it. Given that finding 6's route split already expresses the ownership
      rules, deleting is the honest option until a resource needs something more than self-or-admin.

### 12. The claims being read do not exist by default

The guard reads `verified.role`, `verified.email`, `verified.first_name`. Clerk session tokens carry
none of these unless custom claims are configured, so in practice role is always `"user"` and every
JIT-provisioned user gets a fabricated `${clerkId}@clerk.dev` address.

- [ ] Configure the custom session-token claims in the Clerk dashboard, **or** fetch the user through
      `clerkClient.users.getUser()` on provision.
- [ ] Document whichever is chosen — this is the step that silently no-ops if skipped.

### 13. `verifyToken` is missing `authorizedParties`

Clerk recommends it to reject tokens minted for a different Clerk application.

- [ ] Pass `authorizedParties` from config.

---

## P3 — Dependencies and consistency

### 14. `@clerk/backend` is two majors behind

Installed 1.34; current is 3.16. `@clerk/nextjs` v7 — required for Next 16 in Phase 7 — expects
backend v3, so this upgrade is unavoidable, and `verifyToken`'s signature changed across it.

- [ ] Upgrade before Phase 7 rather than during it, so an auth change and a frontend integration are
      not being debugged at the same time.

### 15. The zod split is back

`packages/contracts` and `apps/api` are on `^3.24.2`; `packages/ui` is on `^4.4.3`. The web app
imports both, so two zod majors land in one graph — precisely what the shared contracts package
exists to prevent.

- [ ] Align all three on zod 4. `nestjs-zod@4.3.1` accepts `zod >= 3.14.3`, so it does not constrain
      the choice.
- [ ] Expect small call-site changes: `z.string().url()` → `z.url()`, and `error.format()` →
      `z.prettifyError()`.

### 16. `POST /users` fabricates Clerk IDs

`clerk_dev_${Date.now()}_...` produces users who can never authenticate, because no such Clerk
identity exists.

- [ ] Once finding 6 makes this route admin-only, either drop it (users should arrive via Clerk
      webhooks) or have it invite through the Clerk API so the local row matches a real identity.

---

## Suggested order

1. **P0 1–3** in one pass — the app boots and validates. Then **P0 4**, so the pipeline can catch a
   regression of any of them.
2. **P1 5–8**. Do 5 and 6 together: 6 is what makes 5 catastrophic rather than merely wrong.
3. **P2 9–13**, which are mostly small once the auth surface is settled.
4. **P3 14–16** before Phase 7 begins.
