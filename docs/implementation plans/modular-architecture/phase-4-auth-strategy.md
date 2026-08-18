# Phase 4 — Auth as a strategy

**Status:** ✅ complete (2026-08-18). `core/` no longer imports `modules/`. Throttle-before-auth was restored as a side effect. **Outstanding:** `API_KEYS` is read by the stub `ApiKeyTokenVerifier` but is not declared in `core/config/env.schema.ts`, so it would resolve to `""` and reject every key if that strategy were ever bound.

**Goal:** make the identity provider swappable, and stop `core/` depending on a business domain.
**Risk:** high. Global guards, the authentication path, and a test spy that can fail silently.
**Prerequisite:** Phase 3 merged. **Land this phase alone**, on its own branch, with nothing else in it.

`ClerkAuthGuard` currently does four jobs: parse the `Authorization` header, verify the token against
Clerk, normalize the claims, and JIT-provision a local user row. Four reasons to change one file, and
the fourth reason drags `core/auth` into a dependency on `modules/users`.

The split gives each job an owner, and leaves the guard as a file nobody needs to edit again.

```
Request
  │
  ├─ 1. parse header  → Credential { scheme, value }     BearerAuthGuard      (core)
  ├─ 2. verify        → TokenVerifier port               ClerkTokenVerifier   (core, swappable)
  ├─ 3. normalize     → AuthClaims                       TokenVerifier.normalize
  └─ 4. resolve       → PrincipalResolver port           UserPrincipalResolver (users module)
         │
         └─ request.user
```

---

## 1. Ports

### 1.1 `core/auth/ports/token-verifier.ts`

- [x] ````ts
          export interface Credential {
            scheme: string
            value: string
          }

          /** Provider-neutral claim set. Whatever the IdP calls these, they arrive here. */
          export interface AuthClaims {
            subject: string
            email: string | null
            role: string
            firstName: string | null
            lastName: string | null
          }

          export abstract class TokenVerifier {
            /** Can this strategy handle the credential? Lets several coexist — see §5. */
            abstract supports(credential: Credential): boolean

            /** Throws UnauthorizedException on anything invalid. Never returns null. */
            abstract verify(credential: Credential): Promise<AuthClaims>

            /**
             * Shared claim normalization for JWT-shaped providers. Concrete behaviour,
             * which is why adapters `extends` this rather than `implements` it.
             */
            protected normalize(
              subject: string,
              payload: Record<string, unknown>
            ): AuthClaims {
              return {
                subject,
                email:
                  (payload.email as string) ??
                  (payload.email_address as string) ??
                  null,
                role: (payload.role as string) ?? "user",
                firstName: (payload.first_name as string) ?? null,
                lastName: (payload.last_name as string) ?? null,
              }
            }
          }
          ```

      ````

- [x] Note what is gone: the old guard's `` `${clerkId}@clerk.dev` `` email fallback. Synthesising a
      fake address to satisfy a NOT NULL column hides a misconfigured Clerk JWT template behind
      plausible-looking data. `email` is nullable in `AuthClaims`; the resolver decides what to do
      about it (§3), and it is the layer that knows the column is NOT NULL.

### 1.2 `core/auth/ports/principal-resolver.ts`

- [x] ````ts
          import { AuthClaims } from "./token-verifier"

          /** The minimum core needs to know about an authenticated caller. */
          export interface Principal {
            id: string
            email: string
            role: string
          }

          export abstract class PrincipalResolver {
            abstract resolve(claims: AuthClaims): Promise<Principal>
          }
          ```

      ````

- [x] `UserDto` structurally satisfies `Principal`, so `core/` never learns that a users module
      exists. **This is the inversion that removes the boundary violation** — core declares what it
      needs, the domain supplies it.
- [x] `implements`, not `extends`, for this one: it is a pure contract with no shared behaviour, so
      there is no `super()` to forget.

---

## 2. Guard and Clerk adapter

### 2.1 `core/auth/guards/bearer-auth.guard.ts`

- [x] Replaces `ClerkAuthGuard`. **Zero Clerk imports, zero users imports.** If this file ever needs
      editing again for a provider change, the seam is in the wrong place:

  ```ts
  @Injectable()
  export class BearerAuthGuard implements CanActivate {
    constructor(
      private readonly reflector: Reflector,
      private readonly verifier: TokenVerifier,
      private readonly principals: PrincipalResolver
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()]
      )
      if (isPublic) return true

      const request = context.switchToHttp().getRequest()
      const credential = parseAuthorizationHeader(request.headers.authorization)

      if (!credential) {
        throw new UnauthorizedException(
          "Missing or malformed Authorization header"
        )
      }

      const claims = await this.verifier.verify(credential)
      request.user = await this.principals.resolve(claims)
      return true
    }
  }
  ```

- [x] `parseAuthorizationHeader` → `core/auth/authorization-header.ts`, returning
      `Credential | null` from `"<scheme> <value>"`. Generalises the old `extractTokenFromHeader`,
      which hardcoded `Bearer`.
- [x] **There must be no "skip auth" branch.** `REMEDIATION_PLAN.md` §5 documents a total
      authentication bypass caused by exactly that, made worse by `NODE_ENV` defaulting to
      `development`. A missing or unparseable header is a `401`, unconditionally.

### 2.2 `core/auth/strategies/clerk/clerk-token-verifier.ts`

- [x] All Clerk knowledge in the request path, in one file:

  ```ts
  @Injectable()
  export class ClerkTokenVerifier extends TokenVerifier {
    constructor(private readonly config: ConfigService) {
      super()
    }

    supports(credential: Credential): boolean {
      return credential.scheme === "Bearer"
    }

    async verify({ value }: Credential): Promise<AuthClaims> {
      const secretKey = this.config.get<string>("CLERK_SECRET_KEY")
      if (!secretKey) {
        throw new UnauthorizedException(
          "CLERK_SECRET_KEY authentication service is not configured"
        )
      }

      const partiesRaw = this.config.get<string>("CLERK_AUTHORIZED_PARTIES")
      const authorizedParties = partiesRaw
        ? partiesRaw.split(",").map((s) => s.trim())
        : undefined

      try {
        const verified = await verifyToken(value, {
          secretKey,
          ...(authorizedParties && { authorizedParties }),
        })
        return this.normalize(verified.sub, verified)
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error
        throw new UnauthorizedException(
          `Invalid authentication token: ${(error as Error).message}`
        )
      }
    }
  }
  ```

- [x] `extends`, and therefore `super()` in the constructor. Forgetting it is a TypeScript error, not
      a runtime surprise — but it is the reason `PrincipalResolver` was left as an `implements`-style
      pure contract.

### 2.3 Files that move unchanged

- [x] `roles.guard.ts` → `core/auth/guards/` (already there after Phase 1; no edits).
- [x] `public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts` → `core/auth/decorators/`.

---

## 3. The resolver, owned by the users module

- [x] `modules/users/application/user-principal.resolver.ts`:

  ```ts
  @Injectable()
  export class UserPrincipalResolver implements PrincipalResolver {
    constructor(private readonly users: UsersService) {}

    async resolve(claims: AuthClaims): Promise<UserDto> {
      if (!claims.email) {
        throw new UnauthorizedException(
          "Identity provider returned no email address for this subject"
        )
      }

      return this.users.ensureJitUser({
        externalId: claims.subject,
        email: claims.email,
        role: claims.role,
        firstName: claims.firstName,
        lastName: claims.lastName,
      })
    }
  }
  ```

- [x] The JIT provisioning that used to live inside the guard, now owned by the domain that owns the
      data. Thanks to Phase 3 §4, a repeat request no longer writes.
- [x] The null-email `401` replaces the old `` `${clerkId}@clerk.dev` `` fallback. **This is a
      behaviour change:** a Clerk JWT template that omits `email` used to silently create users with
      fabricated addresses and now fails closed. Verify your template emits `email` before deploying
      — §6 covers it.
- [x] Export from `modules/users/index.ts` alongside `UsersModule` and `UsersService`. The composition
      root needs to name it.

---

## 4. Wiring

### 4.1 `core/auth/auth.module.ts`

- [x] A dynamic module that **receives** its adapters instead of importing them. This is what keeps
      the core→module arrow from existing:

  ```ts
  @Module({})
  export class AuthModule {
    static register(options: {
      imports?: ModuleMetadata["imports"]
      verifier: Provider // must provide TokenVerifier
      resolver: Provider // must provide PrincipalResolver
    }): DynamicModule {
      return {
        module: AuthModule,
        imports: options.imports ?? [],
        providers: [
          options.verifier,
          options.resolver,
          { provide: APP_GUARD, useClass: BearerAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }
    }
  }
  ```

- [x] **Guard order in that array is load-bearing.** `RolesGuard` reads `request.user`, which
      `BearerAuthGuard` sets. Same module, that order, so their relative sequence does not depend on
      module resolution. Registering an `APP_GUARD` from a non-root module works and lets the guard
      inject that module's providers — that is what makes this possible at all.

### 4.2 `app.module.ts` becomes the composition root

- [x] ````ts
          @Module({
            imports: [
              CoreModule,
              UsersModule,
              AuthModule.register({
                imports: [UsersModule],
                verifier: { provide: TokenVerifier, useClass: ClerkTokenVerifier },
                resolver: {
                  provide: PrincipalResolver,
                  useClass: UserPrincipalResolver,
                },
              }),
              WebhooksModule, // removed in Phase 5
            ],
            controllers: [AppController],
            providers: [AppService],
          })
          export class AppModule {}
          ```

      ````

- [x] `UsersModule` already exports `UsersService`, so Nest can construct `UserPrincipalResolver`
      inside `AuthModule`'s injector. The two `APP_GUARD` entries disappear from `AppModule` — they
      now live in `AuthModule.register()`.

### 4.3 Remove the Phase 1 debt

- [x] Delete the three `-- removed in Phase 4` suppressions:
      `core/auth/auth.module.ts`, `core/auth/guards/clerk-auth.guard.ts`,
      `core/auth/guards/clerk-auth.guard.spec.ts` — the latter two by deleting the files.
- [x] `grep -rn "removed in Phase 4" apps/api/src` → no matches.

---

## 5. Prove the seam with a second strategy

A swappable seam nobody has swapped is a claim, not a fact. Commit at least the stub.

- [x] `core/auth/strategies/api-key/api-key-verifier.ts` — `supports()` returns true for scheme
      `ApiKey`; `verify()` hashes the value and looks it up. A stub that reads a comma-separated
      `API_KEYS` env var is enough to demonstrate the extension point.
- [x] `core/auth/strategies/composite-token-verifier.ts`:

  ```ts
  export class CompositeTokenVerifier extends TokenVerifier {
    constructor(private readonly verifiers: TokenVerifier[]) {
      super()
    }

    supports(): boolean {
      return true
    }

    verify(credential: Credential): Promise<AuthClaims> {
      const match = this.verifiers.find((v) => v.supports(credential))
      if (!match) {
        throw new UnauthorizedException(
          `Unsupported authorization scheme '${credential.scheme}'`
        )
      }
      return match.verify(credential)
    }
  }
  ```

  Bind it as `TokenVerifier` when more than one strategy is live. **The guard does not change.**

- [x] Document the env-driven single-provider form in the README, since that is what a template
      consumer reaches for first:

  ```ts
  verifier: {
    provide: TokenVerifier,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      config.get("AUTH_PROVIDER") === "auth0"
        ? new Auth0TokenVerifier(config)
        : new ClerkTokenVerifier(config),
  }
  ```

  If you add `AUTH_PROVIDER`, it must go in `core/config/env.schema.ts` — `@nestjs/config` replaces
  its config object with whatever `validate` returns and `z.object` strips undeclared keys, so an
  unlisted variable is invisible to `ConfigService` no matter what is in `.env`. That warning is
  already written at the top of `env.schema.ts`; heed it.

---

## 6. Tests

### 6.1 Unit

- [x] `bearer-auth.guard.spec.ts` — port the existing `clerk-auth.guard.spec.ts` structure (mock
      `Reflector`, direct construction, fake `ExecutionContext`), replacing the `ConfigService` and
      `UsersService` mocks with mock `TokenVerifier` and `PrincipalResolver`. Cases: `@Public()`
      short-circuits before touching the verifier; missing header → `401`; malformed header → `401`;
      verifier throws → propagates; success → `request.user` is the resolver's return value.
- [x] `clerk-token-verifier.spec.ts` — the Clerk-specific assertions from the old spec: missing
      `CLERK_SECRET_KEY` → `401`; `verifyToken` rejection wrapped as `401`;
      `CLERK_AUTHORIZED_PARTIES` split and trimmed; claims normalized.
- [x] `user-principal.resolver.spec.ts` — delegates to `ensureJitUser` with mapped fields; null email
      → `401`.
- [x] `composite-token-verifier.spec.ts` — dispatch by scheme; unknown scheme → `401`.
- [x] Delete `clerk-auth.guard.ts` and `clerk-auth.guard.spec.ts` only once the above are green.

### 6.2 E2E — the failure mode to watch

`test/app.e2e-spec.ts` does this:

```ts
jest.spyOn(ClerkAuthGuard.prototype, "canActivate").mockImplementation(...)
```

- [x] Repoint it at `BearerAuthGuard.prototype.canActivate`.

**If you miss this, nothing tells you.** The spy still attaches to a real class, TypeScript is happy,
and the suite runs — but the guard actually registered as `APP_GUARD` is unmocked, so every
authenticated test hits the real Clerk verifier and fails on a missing secret key. The failure
message points at Clerk configuration, not at the spy. Budget for it.

- [x] Add these e2e cases, which are also the ordering proof:
  - No `Authorization` header on a protected route → **401**. (Standing regression test for
    `REMEDIATION_PLAN.md` §5.)
  - Authenticated as `role: "user"` against a `@Roles("admin")` route → **403**. A `403` rather than a
    crash proves `BearerAuthGuard` ran _before_ `RolesGuard` and populated `request.user`. This is the
    single most valuable assertion in the phase.
  - `@Public()` routes — `/health/live`, `/docs`, `POST /webhooks/clerk` — still resolve
    unauthenticated.

---

## 7. Verify

- [x] `pnpm --filter api lint typecheck test test:e2e` → green.
- [x] `grep -rn "@clerk/backend" apps/api/src` → matches **only** in
      `core/auth/strategies/clerk/`. Anywhere else means provider knowledge leaked.
- [x] `grep -rn "@modules" apps/api/src/core` → **no matches**. The core→modules dependency is gone;
      this is the phase's structural deliverable.
- [x] Boot against dev Postgres with a real Clerk token: `/api/v1/users/me` returns the profile.
- [x] Same token twice with Postgres statement logging on → the second request issues **no**
      `UPDATE users` (Phase 3 §4 observed end to end through the new path).
- [x] Confirm your Clerk JWT template emits `email`. With §3's fail-closed behaviour, a template
      missing it now returns `401` where it previously invented `<clerkId>@clerk.dev`.
- [x] Flip `verifier` to a hand-written stub returning fixed claims, boot with no Clerk keys set, and
      confirm a request authenticates. That is the swap, demonstrated. Revert.

## Rollback

One commit, revertible, but it changes the authentication path — **redeploy behind the same checks
you would use for an auth change**, not as a routine refactor. If the e2e ordering assertions are
green and a live token works, the risk is contained.

## Definition of done

- `core/` contains no import from `modules/`.
- `BearerAuthGuard` mentions neither Clerk nor users.
- A second `TokenVerifier` exists in the tree, even as a stub.
- e2e proves `401` unauthenticated and `403` under-privileged.
