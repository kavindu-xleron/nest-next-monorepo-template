# Modular Architecture Plan

Restructuring `apps/api` from seven flat folders under `src/` into `core` / `modules` / `shared`,
with ports-and-adapters seams at the two places this template will actually be forked: the data
source and the auth provider.

This file is the index and the decision record. **Each phase has its own document** with exact file
moves, full code, and verification steps. Phases are ordered so each one compiles, passes
`pnpm --filter api test`, and lands as its own commit. Nothing here requires a database migration.

| Phase                                                             | Scope                                                   | Risk     |
| ----------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [0 — Aliases and boundaries](./phase-0-aliases-and-boundaries.md) | Path aliases, `tsc-alias`, ESLint zones. No files move. | Low      |
| [1 — Mechanical moves](./phase-1-mechanical-moves.md)             | `git mv` + import rewrites. Zero logic edits.           | Low      |
| [2 — CoreModule](./phase-2-core-module.md)                        | Extract logger config, collapse `app.module.ts`         | Low      |
| [3 — Users domain](./phase-3-users-domain.md)                     | Entity, repository port, Drizzle adapter, layer split   | Medium   |
| [4 — Auth strategy](./phase-4-auth-strategy.md)                   | `TokenVerifier` / `PrincipalResolver`, guard rewrite    | **High** |
| [5 — Webhooks](./phase-5-webhooks.md)                             | Split verification / mapping / persistence              | Medium   |
| [6 — Guardrails](./phase-6-guardrails.md)                         | AGENTS.md, README, ADR, module generator                | Low      |

---

## Why this, and why now

The current layout is not wrong for seven files — it is wrong for the next twenty. Three concrete
couplings make forking this template harder than it needs to be:

**1. The domain entity _is_ the Drizzle row.** `users.repository.ts` imports the `DRIZZLE` token and
the `users` table, and `users.service.ts` imports `User` from `database/schema/users`. Swapping
Postgres for anything else means rewriting the service, not just the repository. The service also
inherits `undefined`-vs-`null` semantics from Drizzle's return shapes.

**2. `ClerkAuthGuard` does four jobs at once** — extract the bearer token, verify it against Clerk,
normalize claims, and JIT-provision a local user row. Adding a second strategy (Auth0, machine API
keys, a service token for internal callers) means forking the whole guard. It also makes `auth/`
depend on the `users` domain, which is backwards: authentication is infrastructure, users is a
business domain.

**3. `webhooks/` is a transport, not a domain.** `clerk-webhook.controller.ts` mixes Svix signature
verification (generic infrastructure), Clerk payload mapping (identity-provider knowledge), and user
persistence — reaching past `UsersService` into `UsersRepository` directly to do the soft-delete.
Adding Stripe webhooks would pile a second unrelated controller into the same flat folder.

Folder moves alone fix none of these. The moves are Phases 1–2; the seams are Phases 3–5.

---

## Locked decisions

| Area              | Choice                                                           | Why                                                                                              |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Port style        | **Abstract classes**, not interfaces + string tokens             | An abstract class survives compilation, so it _is_ the DI token — no `@Inject("...")`            |
| Layer names       | `domain` / `application` / `infrastructure` / `presentation`     | Names state the dependency direction; anyone who has read a clean-architecture post navigates it |
| Drizzle tables    | **Stay centralized** in `core/database/schema/`                  | See "The one decision that changed" below                                                        |
| Imports           | Aliases (`@core`, `@modules`, `@shared`) across; relative within | Makes boundary lint rules expressible, and kills `../../../../` chains                           |
| Boundaries        | ESLint `no-restricted-imports` zones + `--max-warnings 0`        | Core rule, zero new lint dependencies                                                            |
| `clerk_id` column | **Not renamed.** Mapped to `externalId` at the adapter boundary  | Provider-neutral domain without a migration; rename the column later if ever                     |

### The one decision that changed

An earlier sketch put each domain's Drizzle table in `modules/<domain>/infrastructure/`. On closer
look that is the wrong trade for this template, and the plan keeps tables in
`core/database/schema/`:

- The moment a second domain lands, `posts.authorId` wants `.references(() => users.id)` — a
  cross-module infrastructure import, which is exactly what the boundary rules forbid. Distributing
  tables forces you to either drop real foreign keys or punch a hole in the rule on day one.
- `drizzle(pool, { schema })` needs the full schema object for relational queries (`db.query.*`).
  Distributed tables mean `core/database` can no longer assemble it, so you silently give up that
  API.
- `seed.ts` and `drizzle.config.ts` both point at a single schema barrel today. Keeping it costs
  nothing and avoids glob-based drizzle-kit config.

This does not weaken either goal. **The repository port is the seam that makes the data source
swappable — not the physical location of the table file.** A module that genuinely needs a different
store (Mongo, an HTTP API, Redis) writes an adapter that never touches `core/database` at all, and
the centralized Postgres schema simply has no table for it. Revisit only if that happens.

---

## Target structure

```
src/
  main.ts
  app.module.ts                    # ~20 lines: CoreModule + feature modules + composition
  app.controller.ts                # root "/" route, stays put
  app.service.ts

  shared/                          # framework-adjacent, domain-free, imported by anyone
    filters/problem-details.filter.ts
    http/health-route.ts
    types/page.ts                  # Page<T> — cursor pagination shape

  core/                            # app-wide infrastructure. Never imports from modules/
    core.module.ts                 # @Global — one import line in AppModule
    config/env.schema.ts
    database/
      database.module.ts
      schema/{index,users}.ts
      migrations/
      migrate.ts
      seed.ts
    observability/
      logger.config.ts             # extracted from app.module.ts
      health/{health.module,health.controller,health.service,graceful-shutdown.service}.ts
    auth/
      auth.module.ts               # dynamic module: adapters passed in from the root
      ports/{token-verifier,principal-resolver}.ts
      guards/{bearer-auth.guard,roles.guard}.ts
      decorators/{public,roles,current-user}.decorator.ts
      strategies/clerk/clerk-token-verifier.ts
    webhooks/
      ports/webhook-verifier.ts
      svix/svix-webhook.verifier.ts
      webhooks.module.ts

  modules/                         # business domains. May import core/ and shared/, never each
    users/                         # other's internals
      index.ts                     # public API — the ONLY entry point for other modules
      users.module.ts
      domain/
        user.entity.ts             # plain types. No Drizzle, no Nest, no Clerk
        users.repository.ts        # abstract class = port + DI token
      application/
        users.service.ts
        user-principal.resolver.ts # implements core's PrincipalResolver port
      infrastructure/drizzle/
        drizzle-users.repository.ts
        user.mapper.ts             # row <-> entity, and clerkId -> externalId
      presentation/
        users.controller.ts
        clerk-user-sync.controller.ts
        dto/
```

Dependency direction, top to bottom — every arrow points down, none point up:

```
presentation  ->  application  ->  domain
     |                |               ^
     +----------------+---------------+
                      |
              infrastructure  (implements domain ports)

modules/*  ->  core/, shared/          core/  ->  shared/ only
```

### Which layer does a file belong in?

Ask **"what would force this file to change?"** Each layer has exactly one answer:

| Change              | Layer that moves               |
| ------------------- | ------------------------------ |
| Postgres → Mongo    | `infrastructure`               |
| REST → GraphQL      | `presentation`                 |
| Clerk → Auth0       | `infrastructure` (new adapter) |
| A new business rule | `domain` / `application`       |

If a file would change for two of those reasons, it is misplaced or needs splitting. That is exactly
what is wrong with `clerk-auth.guard.ts` today. The faster gut check: **read the import block.**
Drizzle in a service, `@nestjs/swagger` in a repository, or anything at all beyond types in
`domain/` means wrong layer — which is what the Phase 0 lint zones encode.

---

## Risk register

| Risk                                                         | Phase | Mitigation                                                                    |
| ------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------- |
| Aliases break `dist` at runtime (`nest build` is `tsc`)      | 0     | `tsc-alias` in the build script; `start:prod` boot check before merging       |
| Jest alias mapping wrong (two configs, different roots)      | 0     | Both suites run in Phase 0's verify step                                      |
| Boundary rules are only warnings (`eslint-plugin-only-warn`) | 0     | `--max-warnings 0` on the lint script, after clearing 3 pre-existing warnings |
| Global guard order changes → `RolesGuard` sees no user       | 4     | Both guards in one module; e2e `401` and `403` assertions                     |
| E2E guard spy silently detached from the new guard           | 4     | Called out in Phase 4 §5; assert `403` (not just "not 200")                   |
| `import type` on a port → runtime DI failure                 | 3, 4  | Boot check each phase; a compile-clean build can still fail here              |
| Reviewer fatigue from a 60-file rename diff                  | 1     | Phase 1 is moves only — no logic edits in the same commit                     |

## Out of scope

Deliberately not in this plan: renaming the `clerk_id` column, CQRS or a mediator, event sourcing,
`packages/contracts` restructuring, and splitting the API into multiple Nest apps. The seams below
make any of them cheaper later; none is justified by the current three-domain surface.
