# Next + Nest Monorepo Template

A production-oriented starting point for a TypeScript product: a Next.js front end
and a NestJS API in one Turborepo, sharing types through a contracts package, with
the operational pieces already wired — structured logging, graceful shutdown,
health probes, migrations, hosted auth, and automated releases.

The goal is that the boring, easy-to-get-wrong parts are done, so a new project
starts at "write the feature" rather than "wire up the framework".

## Stack

| Area       | Choice                                                 |
| ---------- | ------------------------------------------------------ |
| Monorepo   | Turborepo + pnpm workspaces                            |
| Front end  | Next.js 16 (App Router), React 19, Tailwind v4, shadcn |
| API        | NestJS 11 on Express                                   |
| Database   | PostgreSQL 17 + Drizzle ORM (`pg` driver)              |
| Auth       | Clerk (hosted identity, local `users` table for FKs)   |
| Validation | Zod schemas shared between both apps                   |
| Logging    | pino via `nestjs-pino`, correlation IDs                |
| API docs   | OpenAPI / Swagger at `/docs`                           |
| Releases   | semantic-release driven by Conventional Commits        |

## Requirements

- **Node 22.14+** (`.nvmrc` pins 22.23.2). Node 20 is end-of-life and the release
  tooling will not run on it.
- **pnpm 10** — `corepack enable` picks up the version from `packageManager`.
- **Docker**, for the local Postgres.
- A **Clerk** account. A free development instance is enough.

## Quick start

```bash
pnpm install

# API — fill in DATABASE_URL and your Clerk keys
cp apps/api/.env.example apps/api/.env

# Web — fill in NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY
cp apps/web/.env.example apps/web/.env.local

pnpm db:up          # start Postgres
pnpm db:migrate     # apply migrations
pnpm db:seed        # optional: an admin and a regular user

pnpm dev            # both apps
```

- Web: http://localhost:3000
- API: http://localhost:5001
- API docs: http://localhost:5001/docs

> Run `pnpm dev` from the **repo root**, not `pnpm --filter api dev`. Only Turbo
> knows to build `@workspace/contracts` first, and the API imports its compiled
> output.

## Layout

```
apps/
  api/                 NestJS API
    src/
      core/            app-wide infrastructure — no business rules
        auth/          provider-agnostic guards, ports, Clerk adapter
        config/        Zod-validated environment
        database/      Drizzle schema, migrations, seed
        observability/ logging config, health probes, shutdown sequence
        webhooks/      signature verification (Svix adapter)
      modules/         business domains, one folder each
        users/         domain / application / infrastructure / presentation
      shared/          framework-adjacent helpers, domain-free
  web/                 Next.js app
    app/               routes (sign-in, sign-up, dashboard)
    lib/               validated env, typed API client
    proxy.ts           route protection (Next 16's middleware)
packages/
  contracts/           Zod schemas shared by both apps
  ui/                  shadcn components
  eslint-config/       shared flat configs
  typescript-config/   shared tsconfig bases
docker/
  compose.dev.yml      Postgres for local development only
```

## API architecture

`apps/api/src` is three top-level areas, and dependencies point one way:
`modules/ → core/ → shared/`, never upward.

`core/` is infrastructure every app needs regardless of what it does — config, database, logging,
health, auth, webhook verification. `modules/` holds business domains, one folder each. `shared/`
is domain-free helpers.

Inside a module, four layers:

| Layer             | Holds                                           | Changes when            |
| ----------------- | ----------------------------------------------- | ----------------------- |
| `domain/`         | plain entity types, `abstract class` ports      | a business rule changes |
| `application/`    | use cases, entity → DTO mapping                 | a business rule changes |
| `infrastructure/` | adapters implementing the ports (Drizzle, SDKs) | the database changes    |
| `presentation/`   | controllers, DTOs, Swagger                      | the transport changes   |

To place a file, ask what would force it to change. A different database is `infrastructure`; a
different transport is `presentation`; a different rule is `domain`/`application`. Two answers
means it needs splitting.

The boundaries are enforced by `no-restricted-imports` zones in `apps/api/eslint.config.mjs`, and
`pnpm --filter api lint` runs with `--max-warnings 0`, so a violation fails the build rather than
scrolling past.

Reasoning and the decisions that shaped it: `docs/adr/0001-layered-modules.md`.

### Adding a domain module

1. `modules/<name>/domain/` — entity types and an `abstract class <Name>Repository`.
2. `core/database/schema/<name>.ts`, re-exported from `schema/index.ts`; then `pnpm db:generate`.
3. `modules/<name>/infrastructure/drizzle/` — the adapter and a mapper. **The mapper is the only
   file that should know a column name.**
4. `modules/<name>/application/` — the service holding use cases.
5. `modules/<name>/presentation/` — controller and `createZodDto` DTOs wrapping
   `packages/contracts` schemas.
6. `<name>.module.ts` — bind the port to the adapter, export the service:

   ```ts
   providers: [
     <Name>Service,
     { provide: <Name>Repository, useClass: Drizzle<Name>Repository },
   ],
   exports: [<Name>Service, <Name>Repository],
   ```

7. `index.ts` — export the module, the service, and entity types. **Nothing else** — other modules
   reach yours only through this barrel.
8. Register it in `app.module.ts`.

Ports are **abstract classes, not interfaces**: an interface is erased at compile time and cannot
be a Nest DI token. For the same reason, never write `import type` on a port — it erases the
runtime value and DI fails at boot while typecheck stays green.

### Swapping the database

Write an adapter implementing the domain port, then change one line:

```ts
{ provide: UsersRepository, useClass: MongoUsersRepository }
```

Nothing in `application/` or `presentation/` changes — `UsersService` has no import from
`core/database` and pulls in no driver. The domain's `User` is a plain type, not a Drizzle row.

### Swapping the auth provider

`BearerAuthGuard` contains no Clerk imports. It delegates to two ports: `TokenVerifier` (credential
→ claims) and `PrincipalResolver` (claims → your user). Both are supplied from the composition root
in `app.module.ts`:

```ts
AuthModule.register({
  imports: [UsersModule],
  verifier: { provide: TokenVerifier, useClass: ClerkTokenVerifier },
  resolver: { provide: PrincipalResolver, useClass: UserPrincipalResolver },
})
```

Moving to Auth0 is a new `TokenVerifier` and a changed binding. Selecting by environment:

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

Supporting several credential types at once — session tokens _and_ machine API keys — is
`CompositeTokenVerifier`, which dispatches on each strategy's `supports()`. The guard still does
not change. A stub `ApiKeyTokenVerifier` is in `core/auth/strategies/api-key/` as a worked example.

> Any new environment variable must be declared in `core/config/env.schema.ts`. `@nestjs/config`
> replaces its config object with whatever `validate` returns, and `z.object` strips undeclared
> keys — so an unlisted variable is invisible to `ConfigService` no matter what is in `.env`.

## Scripts

Run from the repo root:

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `pnpm dev`         | Both apps in watch mode                               |
| `pnpm build`       | Build everything, in dependency order                 |
| `pnpm lint`        | ESLint across all workspaces                          |
| `pnpm typecheck`   | `tsc --noEmit` across all workspaces                  |
| `pnpm test`        | Unit tests                                            |
| `pnpm test:e2e`    | End-to-end tests                                      |
| `pnpm format`      | Prettier write                                        |
| `pnpm db:up`       | Start the local Postgres container                    |
| `pnpm db:down`     | Stop it                                               |
| `pnpm db:generate` | Generate a migration from schema changes              |
| `pnpm db:migrate`  | Apply pending migrations                              |
| `pnpm db:seed`     | Seed development data                                 |
| `pnpm release:dry` | Show what the next release would be, changing nothing |

## Environment

Both apps validate their environment at startup and refuse to run on bad input,
so a misconfiguration fails immediately with a readable message instead of at the
first request. See `apps/api/.env.example` and `apps/web/.env.example`.

The API additionally requires `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SECRET` and `CORS_ORIGIN` when `NODE_ENV=production` — absent in
development, mandatory in a real deployment.

## What is already handled

**Shared contracts, not duplicated types.** `packages/contracts` holds plain Zod
schemas. The API binds them as runtime DTOs through `nestjs-zod`; the web client
parses responses with the same schemas. A drift between the two fails at the
boundary rather than as an `undefined` deep in a component.

The contracts package is deliberately framework-free — no Nest imports — because
the browser bundle imports it too.

**Correlation IDs end to end.** Every request gets an `x-request-id` (honouring an
inbound one), it is echoed on the response, attached to every log line for that
request, and included in error bodies. The web app surfaces it on failure, so a
user's screenshot maps to one request in the logs.

**RFC 7807 error responses.** A single global filter turns anything thrown into
`application/problem+json`. Log level follows the response status rather than the
exception class, each failure logs exactly once, and internal messages never reach
the client — the real cause goes to the log, joined by `requestId`.

**A real graceful shutdown.** On `SIGTERM` the app fails readiness _first_ so the
load balancer stops routing, waits a configurable drain interval, hangs up idle
keep-alive sockets, closes the server, then releases the database pool — with a
hard deadline that force-exits if something hangs.

Liveness deliberately checks nothing but the process. If it pinged the database, a
database blip would make Kubernetes restart every healthy pod.

**Auth that fails closed.** A global guard with an explicit `@Public()` opt-out, so a new
route is protected unless it says otherwise. Roles come from Clerk; a local `users` row is
kept in sync by webhook (Svix-verified) and by just-in-time upsert as a fallback, so other
tables have something to key on.

The guard itself is provider-agnostic — it delegates token verification to a swappable
`TokenVerifier` strategy and user resolution to a `PrincipalResolver` the users module
implements. Changing identity provider is a new adapter and one binding, not a rewrite. See
**Swapping the auth provider** above.

**Automated releases.** Conventional Commits are enforced by commitlint on commit,
and semantic-release turns them into a version, tag, changelog and GitHub release.
See `docs/RELEASING.md`.

## Conventions

Commits follow Conventional Commits, enforced by commitlint on `commit-msg`. A
scope is optional but encouraged, and must come from the enum in
`commitlint.config.js` when used. The type decides the version bump and whether
the change appears in the changelog at all — broadly, only `feat`, `fix` and
`perf` are published to users.

`docs/COMMIT_CONVENTIONS.md` holds the full type → release → changelog table and
is the source of truth; it is deliberately not restated here, because the copy
that drifts is the one people read.

## Known gaps

Honest about what is not finished:

- **No Dockerfiles for the apps.** `docker/compose.dev.yml` runs Postgres for local
  development only; there is no production image yet.
- **Pull requests are not CI-gated.** Lint, typecheck, test and build run on pushes
  to `main` as part of the release workflow, but nothing runs on a PR.
- **e2e coverage is thin.** Unit tests mock the database. Meaningful end-to-end
  tests need a Postgres service container.
- **Clerk session claims must be configured — this is required, not optional.** Session
  tokens carry no `email` or `role` by default, and authentication now **fails closed**: a
  token with no `email` claim is rejected with `401` rather than having an address
  synthesised for it. Add a JWT template in the Clerk dashboard emitting `email` and `role`
  before anything can sign in. The webhook sync path deliberately keeps a fallback instead,
  because Clerk retries non-2xx responses and an emailless `user.created` would retry forever.
- **`packages/contracts` has a conformance test that never runs** — the package has
  no `test` script wired up.

## Documentation

- `docs/adr/0001-layered-modules.md` — why the API is laid out the way it is, and what would
  justify reversing each decision
- `docs/RELEASING.md` — how versioning works and why each setting is what it is
- `docs/COMMIT_CONVENTIONS.md` — commit format and scopes
- `docs/LOGGING_AND_ERROR_HANDLING.md` — the error taxonomy and logging strategy
- `docs/implementation plans/` — how the template was built, and what was found
  auditing it

## Adding UI components

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components land in `packages/ui/src/components` and are imported from the shared
package:

```tsx
import { Button } from "@workspace/ui/components/button"
```
