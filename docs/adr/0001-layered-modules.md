# ADR 0001 — Layered modules in `apps/api`

**Status:** accepted
**Date:** 2026-08-18
**Supersedes:** the flat `src/{auth,common,config,database,health,users,webhooks}` layout

`INITIAL_IMPLEMENTATION_PLAN.md` states two architecture calls explicitly — contracts are not
derived from the Drizzle schema, and Clerk owns identity while a local `users` table still exists.
This is the third, and it governs the other two: **where code lives, and which direction
dependencies point.**

The full migration, phase by phase, is in
[`docs/implementation plans/modular-architecture/`](../implementation%20plans/modular-architecture/README.md).

---

## Context

Seven flat folders under `src/` were fine for seven files. Three couplings made the template
expensive to fork:

1. **The domain entity was the Drizzle row.** `users.service.ts` imported `User` from
   `database/schema/users`, so swapping the data source meant rewriting the service, not just the
   repository. The service also inherited Drizzle's `undefined`-for-missing semantics.
2. **`ClerkAuthGuard` did four jobs** — parse the header, verify against Clerk, normalize claims,
   JIT-provision a user row. A second strategy meant forking the whole guard, and the fourth job
   made `auth/` depend on the `users` domain, which is backwards: authentication is infrastructure,
   users is a business domain.
3. **`webhooks/` was a transport pretending to be a domain.** One controller mixed Svix
   verification, Clerk payload mapping, and persistence — reaching past `UsersService` into
   `UsersRepository` to soft-delete.

## Decision

`src/` is `core/` (app-wide infrastructure), `modules/` (business domains, internally layered
`domain` / `application` / `infrastructure` / `presentation`), and `shared/` (domain-free helpers).
Dependencies point `modules → core → shared` and never upward, enforced by
`no-restricted-imports` zones in `apps/api/eslint.config.mjs` with `--max-warnings 0`.

### Ports are abstract classes, not interfaces

A TypeScript `interface` is erased at compile time, so it cannot be a Nest DI token. The usual
workaround is a string or symbol token plus `@Inject("USERS_REPOSITORY")` at every call site. An
`abstract class` compiles to a real JS class and _is_ the token, so constructors stay clean:

```ts
constructor(private readonly usersRepository: UsersRepository) {}
```

**Cost:** one non-obvious failure mode. `import type { UsersRepository }` erases the import,
`design:paramtypes` degrades to `Object`, and DI fails at boot while typecheck stays green. Written
into `AGENTS.md` because it is not discoverable from the code.

**Reverse if:** never, realistically. The alternative is strictly noisier.

### Drizzle tables stay centralized in `core/database/schema/`

Repository _ports_ live in `modules/*/domain/`, but the `pgTable` definitions do not move with
them. An earlier draft of the plan distributed tables into each module's `infrastructure/`; that
was reversed before implementation.

**Why:** the moment a second domain lands, `posts.authorId` wants `.references(() => users.id)` —
a cross-module infrastructure import, exactly what the boundary rules forbid. Distributing tables
forces you to drop real foreign keys or punch a hole in the rule on day one. It also gives up
`drizzle(pool, { schema })`, and with it the `db.query.*` relational API, since `core/database`
could no longer assemble the schema object.

**This does not weaken the goal.** The repository port is what makes the data source swappable —
not the table file's location. A module that genuinely needs a different store writes an adapter
that never touches `core/database` at all, and the centralized Postgres schema simply has no table
for it. Verified during Phase 3: loading the compiled `UsersService` reaches zero `pg`,
`drizzle-orm`, or `core/database` modules.

**Reverse if:** a module needs a different store _and_ has no foreign-key relationship to anything
in Postgres. Move that module's tables only; leave the rest.

### `AuthModule` is a dynamic module

`AuthModule.register({ imports, verifier, resolver })` receives its adapters from the composition
root in `app.module.ts` rather than importing them:

```ts
AuthModule.register({
  imports: [UsersModule],
  verifier: { provide: TokenVerifier, useClass: ClerkTokenVerifier },
  resolver: { provide: PrincipalResolver, useClass: UserPrincipalResolver },
})
```

**Why:** JIT user provisioning is owned by the users domain, but the guard that triggers it lives
in `core/`. A plain `@Module` would have to import `UsersModule`, recreating the core→modules
dependency. Instead `core/auth/ports/principal-resolver.ts` declares what core needs and
`modules/users/application/user-principal.resolver.ts` implements it. Core never learns a users
module exists.

**Cost:** the wiring is less obvious than a static `@Module`, and adapter bugs surface at boot
rather than at compile time.

**Reverse if:** never while `core/` may not import `modules/`.

### The `clerk_id` column was not renamed

The domain says `externalId`; `infrastructure/drizzle/user.mapper.ts` bridges to the `clerk_id`
column. **Cost:** one indirection, and one file that knows both names. **Benefit:** a
provider-neutral domain with no migration and no coordinated deploy.

**Reverse if:** you are already writing a migration that touches the `users` table — fold the
rename in and delete the mapping.

---

## Consequences

**Swapping the data source** is a new adapter file plus one binding line in `users.module.ts`.
**Swapping the identity provider** is a new `TokenVerifier` plus one binding line in
`app.module.ts` — `BearerAuthGuard` contains no Clerk imports and should never need editing again.
Supporting several credential types at once is `CompositeTokenVerifier` dispatching on
`supports()`; the guard still does not change.

**Two behaviour changes rode along, deliberately:**

- `ensureJitUser` no longer writes unconditionally. It previously issued a DB `UPDATE` on _every_
  authenticated request, because it always called `update()` and the repository set
  `updatedAt: new Date()`. It now compares first.
- Authentication **fails closed on a missing email claim** (`401`) instead of synthesising
  `<clerkId>@clerk.dev`. Clerk session tokens carry no `email` by default, so a JWT template
  emitting `email` and `role` is now required rather than merely recommended. The webhook path
  deliberately keeps a fallback, because Clerk retries non-2xx with backoff and an emailless
  `user.created` would retry forever.

**A cost worth naming:** roughly eight files per module where there was previously one folder of
four. That is the price of the seams above, and it is only worth paying at the boundaries that
actually get swapped. Do not add layers to a module that has no port.
