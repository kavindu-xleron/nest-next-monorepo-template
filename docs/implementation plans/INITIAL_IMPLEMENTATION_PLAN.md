# Implementation Plan

Roadmap for turning this scaffold into a production-grade Next + Nest monorepo template.
Phases are ordered by dependency, not priority. Check items off as they land.

## Locked decisions

| Area      | Choice                                                       | Why                                                                     |
| --------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| ORM       | **Drizzle** (`drizzle-orm` + `drizzle-kit`, `pg` driver)     | SQL-first, light runtime, no codegen daemon                             |
| Auth      | **Clerk** (`@clerk/nextjs` on web, `@clerk/backend` in Nest) | Hosted identity; no password/refresh-token surface to own               |
| Contracts | **Hand-authored Zod** in `packages/contracts`                | One schema validates Nest requests _and_ types Next forms               |
| Release   | **semantic-release** at repo root, single version line       | Nothing is published to npm; we want tags + CHANGELOG + GitHub releases |
| Docker    | **Split**: dev services compose vs. app images               | Local dev runs on host for fast HMR; app images are CI-only             |

### Two architecture calls worth stating explicitly

**1. API contracts are NOT derived from the Drizzle schema.**

It is tempting to use `drizzle-zod`'s `createSelectSchema()` to generate contracts from tables. We
deliberately do not, because the DB schema and the public API contract are different things and
should be free to change independently:

- The `users` row holds `clerkId`, `deletedAt`, and other internal columns the API must never expose.
- Deriving contracts from tables means any DB refactor silently reshapes your public API.
- It would pull `drizzle-orm/pg-core` into the web bundle, since the web app imports contracts.

Instead: contracts are hand-authored Zod, and type-level conformance tests (`expectTypeOf`) fail
`typecheck` if the DB and contract shapes drift apart. `drizzle-zod` may still be used _inside_
the API for internal insert/update validation.

**2. Clerk owns identity, but we still keep a local `users` table.**

Clerk cannot be a foreign key target. Anything that references a user (posts, audit rows, ownership
checks) needs a local row. Sync runs on two paths, because webhooks alone are not reliable enough:

- **Clerk webhooks** (`user.created` / `user.updated` / `user.deleted`) verified with Svix, upserting
  into Postgres. Requires `rawBody: true` on the Nest app and a `@Public()` route — Svix signature
  verification needs the unparsed body.
- **Just-in-time upsert** on the first authenticated request, as a safety net for missed or
  out-of-order webhook deliveries.

Roles live in Clerk `publicMetadata`, surfaced into the session JWT as a custom claim so `RolesGuard`
reads them without a DB round trip, and are mirrored onto `users.role` so they are joinable in SQL.

---

## Phase 0 — Foundation

The API was scaffolded outside the monorepo's shared tooling and currently conflicts with it.

- [x] Delete `apps/api/.prettierrc` (single quotes / `trailingComma: all`) — it contradicts the root
      config (`semi: false`, double quotes, `trailingComma: es5`).
- [x] Drop `eslint-plugin-prettier` from the API. Formatting runs through the Prettier CLI, not as a
      lint rule — as configured it made `pnpm lint` and `pnpm format` undo each other.
- [x] Reformat the API to repo style.
- [x] Add `packages/typescript-config/nestjs.json` (`strict: true`, decorators, CommonJS) and have the
      API extend it. The API currently sets `noImplicitAny: false` and no `strict`, making the app
      that will hold all business logic the least type-safe one in the repo.
- [x] Point the API at `@workspace/eslint-config` with a Node/Nest layer.
- [x] Delete root `.eslintrc.js` — legacy eslintrc format that ESLint 9 flat config never reads.
- [x] `turbo.json`: add `test` / `test:e2e` tasks, `dist/**` outputs for the API (its builds are
      currently uncacheable), and `.env*` inputs.
- [x] Root `package.json`: add `test`, bump `engines.node` to `>=20.9.0` (required by `@clerk/backend`).
- [x] `.gitignore`: negate `!.env.example` — the current `.env*` rule makes committing one impossible.
- [x] Add `.editorconfig` and `.nvmrc`.

## Phase 1 — Commit hygiene

Must precede Phase 9: semantic-release derives versions from commit history.

- [x] `husky` + `@commitlint/cli` + `@commitlint/config-conventional`.
- [x] Scope enum from the workspaces: `api`, `web`, `ui`, `contracts`, `config`, `deps`, `release`.
- [x] `lint-staged` on `pre-commit`; `commitlint` on `commit-msg`; `turbo typecheck` on `pre-push`.
- [x] Root `"prepare": "husky"`.

## Phase 2 — Config + logging

- [x] `@nestjs/config` with a Zod schema that fails fast at boot. Everything downstream (DB URL, Clerk
      keys, log level) depends on this.
- [x] `nestjs-pino` + `pino`, with:
  - `bufferLogs: true` + `app.useLogger()` so Nest's own bootstrap logs go through pino
  - `genReqId` honouring an inbound `x-request-id`, echoed back on the response
  - AsyncLocalStorage so `this.logger.log()` deep in a service carries the request ID automatically
  - redaction of `authorization`, `cookie`, `set-cookie`, `password`
  - `autoLogging.ignore` for health checks so they do not drown the logs
  - `pino-pretty` in dev only
- [x] Global exception filter emitting RFC 7807 `problem+json` including the correlation ID.

## Phase 3 — Graceful shutdown

- [x] `app.enableShutdownHooks()`.
- [x] `@nestjs/terminus` with **separate** `/health/live` and `/health/ready`.
- [x] Drain sequence on SIGTERM — the part most templates get wrong:

      1. flip readiness to failing **first**, so the load balancer stops routing
      2. wait a configurable drain interval
      3. hang up idle keep-alive sockets, then stop accepting connections
      4. hard timeout that force-exits if a request hangs

- [x] Tune `server.keepAliveTimeout` / `headersTimeout` for proxies.
- [x] `closeIdleConnections()` after the drain. `server.close()` only waits for sockets to go idle on
      their own, and Nest's `closeOpenConnections()` is a no-op unless `forceCloseConnections` was
      passed to `NestFactory.create`. Without this, a load balancer's keep-alive socket kept the close
      pending past the hard deadline, so every deploy ended in `exit(1)`. Covered by
      `graceful-shutdown.service.spec.ts`.

## Phase 4 — Postgres + Drizzle

- [x] `docker/compose.dev.yml`: Postgres 17 with healthcheck and named volume. **Dev services only —
      no app containers.** Local dev is `pnpm db:up` + `pnpm dev` on the host.
- [x] `pg` Pool (chosen over `postgres.js` for explicit pool sizing and a clean `pool.end()` in the
      Phase 3 drain) wired to a `DrizzleModule` exposing a typed db instance.
- [x] **Close the pool in `onApplicationShutdown`, never `onModuleDestroy`.** Nest's shutdown order
      (verified in `@nestjs/core/nest-application-context.js`, `close()`) is:

      1. `onModuleDestroy()`
      2. `beforeApplicationShutdown()`  ← Phase 3's readiness flip and drain wait
      3. `dispose()`                    ← the HTTP server closes here
      4. `onApplicationShutdown()`

      `onModuleDestroy` runs *first* — before the drain. Releasing the pool there would tear it down
      seconds before the server stops accepting traffic, so every request arriving during the drain
      window would fail on a dead pool. Step 4 is the only safe place. The same reasoning applies to
      any resource in-flight requests still depend on (caches, message-broker channels).

- [x] Schema in `apps/api/src/database/schema/` — the API is the only consumer, so it does not need
      to be its own package.
- [x] `drizzle-kit generate` producing committed SQL migrations. Run `migrate` as a **separate
      deploy step**, never on app boot, and never `push` outside dev.
- [x] Seed script; conventions: UUIDv7 ids, `createdAt` / `updatedAt`.

## Phase 5 — Contracts + user routes

- [x] `packages/contracts`: hand-authored Zod schemas + inferred types (see architecture note above).
- [x] `nestjs-zod` so one schema serves as both validation pipe and Swagger DTO.
- [x] Type-level conformance tests between contracts and Drizzle row types.
- [x] User CRUD + `GET /users/me`, cursor pagination, response whitelisting so internal columns
      cannot leak.
- [x] `/api/v1` prefix with versioning enabled; Swagger at `/docs`.

## Phase 6 — Access control (Clerk)

- [x] `ClerkAuthGuard` using `@clerk/backend` `verifyToken()` — networkless after the JWKS cache warms.
- [x] Applied **globally** with a `@Public()` escape hatch, so routes are secure by default.
- [x] Webhook route for user sync (`rawBody: true`, Svix verification, `@Public()`).
- [x] JIT user upsert on first authenticated request.
- [x] `@Roles()` + `RolesGuard` reading the custom session claim.
- [x] CASL for ownership rules ("edit own profile, admin edits any").
- [x] `@nestjs/throttler`, `helmet`, CORS allowlist from config.
- [x] Injectable current-user provider so tests can swap in a fake identity.

## Phase 7 — Web integration

- [ ] `@clerk/nextjs` `<ClerkProvider>` + `clerkMiddleware()`; protected routes.
- [ ] Typed API client sharing `packages/contracts`, attaching the Clerk token as a Bearer header.

> Read `node_modules/next/dist/docs/` before writing any of this — per `AGENTS.md`, Next 16 differs
> from prior conventions.

## Phase 8 — Tests, CI, Docker images

- [ ] Move the API's inline jest config out of `package.json` into a real config file.
- [ ] Unit tests per service; e2e against a **real Postgres via testcontainers**, not mocks.
- [ ] GitHub Actions: install → lint → typecheck → test → build.
- [ ] Multi-stage `apps/api/Dockerfile` and `apps/web/Dockerfile` (`pnpm deploy --filter`, Next
      standalone output). Built in CI only — never used for local dev.

## Phase 9 — semantic-release

- [ ] Root `semantic-release` on `main`, CI-only, gated behind Phase 8's tests.
- [ ] `commit-analyzer`, `release-notes-generator`, `changelog`, `git`, `github`.
- [ ] Tag drives versioned Docker image tags.
- [ ] Needs `contents: write` permission; release commit carries `[skip ci]`.

> If `@workspace/ui` is ever published to npm, switch to Changesets — semantic-release's single
> version line only works while every package stays private.
