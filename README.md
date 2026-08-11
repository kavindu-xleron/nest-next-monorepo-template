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
      auth/            Clerk guard, role guard, decorators
      common/          exception filter, shared HTTP helpers
      config/          Zod-validated environment
      database/        Drizzle schema, migrations, seed
      health/          liveness, readiness, shutdown sequence
      users/           example domain: controller, service, repository, DTOs
      webhooks/        Clerk user-sync webhook
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

**Auth that fails closed.** The Clerk guard is applied globally with an explicit
`@Public()` opt-out, so a new route is protected unless it says otherwise. Roles
come from Clerk; a local `users` row is kept in sync by webhook (Svix-verified) and
by just-in-time upsert as a fallback, so other tables have something to key on.

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
- **Clerk session claims need configuring.** Session tokens carry no `email` or
  `role` by default. Until custom claims are set in the Clerk dashboard, every
  just-in-time user is created with the default role and a synthesised email.
- **`packages/contracts` has a conformance test that never runs** — the package has
  no `test` script wired up.

## Documentation

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
