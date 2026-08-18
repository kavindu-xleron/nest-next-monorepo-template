# Phase 1 — Mechanical moves

**Status:** ✅ complete (2026-08-18). No defects. All 21 import rewrites correct, exactly eight suppressions landed, `tsc-alias` proven under load-bearing aliases.

**Goal:** get every file to its final top-level home. Nothing else.
**Risk:** low. High diff volume, near-zero semantic change.
**Prerequisite:** Phase 0 merged.

The only edits permitted in this phase are `git mv` and import path rewrites. No renamed symbols, no
extracted functions, no changed logic. That constraint is the whole point — it makes Phases 2–5
reviewable, because their diffs will contain only real changes instead of being buried under sixty
renamed files.

Internal layer folders (`domain/`, `application/`, …) are **not** created here. `modules/users/` and
`core/webhooks/` stay flat until Phases 3 and 5 split them.

---

## 1. Move the directories

- [x] Run as one batch, then commit before touching imports — a commit containing only renames lets
      reviewers use `git log --follow`:

  ```bash
  cd apps/api/src

  mkdir -p shared core modules

  git mv common/filters shared/filters
  git mv common/http    shared/http
  rmdir common

  git mv config   core/config
  git mv database core/database
  git mv auth     core/auth
  git mv webhooks core/webhooks

  mkdir -p core/observability
  git mv health core/observability/health

  git mv users modules/users
  ```

Resulting map:

| From                  | To                               | Notes                                    |
| --------------------- | -------------------------------- | ---------------------------------------- |
| `src/common/filters/` | `src/shared/filters/`            | filter + spec                            |
| `src/common/http/`    | `src/shared/http/`               | `health-route` + spec                    |
| `src/config/`         | `src/core/config/`               | `env.schema` + spec                      |
| `src/database/`       | `src/core/database/`             | **moves as a unit** — see §4             |
| `src/health/`         | `src/core/observability/health/` | 4 files + 3 specs                        |
| `src/auth/`           | `src/core/auth/`                 | flat for now; Phase 4 restructures       |
| `src/webhooks/`       | `src/core/webhooks/`             | flat for now; Phase 5 relocates          |
| `src/users/`          | `src/modules/users/`             | flat for now; Phase 3 splits into layers |

`app.module.ts`, `app.controller.ts`, `app.service.ts`, `main.ts` stay at `src/`.

---

## 2. Rewrite imports

Twenty-one import statements change. Imports that stayed inside a moved folder do **not** — they are
listed at the end so you can confirm you did not touch them by accident.

### `src/app.controller.ts`

| Line | From                                 | To                                       |
| ---- | ------------------------------------ | ---------------------------------------- |
| 2    | `./auth/decorators/public.decorator` | `@core/auth/decorators/public.decorator` |

### `src/app.module.ts`

| Line | From                                      | To                                         |
| ---- | ----------------------------------------- | ------------------------------------------ |
| 9    | `./auth/auth.module`                      | `@core/auth/auth.module`                   |
| 10   | `./auth/guards/clerk-auth.guard`          | `@core/auth/guards/clerk-auth.guard`       |
| 11   | `./auth/guards/roles.guard`               | `@core/auth/guards/roles.guard`            |
| 12   | `./common/filters/problem-details.filter` | `@shared/filters/problem-details.filter`   |
| 13   | `./common/http/health-route`              | `@shared/http/health-route`                |
| 14   | `./config/env.schema`                     | `@core/config/env.schema`                  |
| 15   | `./database/database.module`              | `@core/database/database.module`           |
| 16   | `./health/health.module`                  | `@core/observability/health/health.module` |
| 17   | `./users/users.module`                    | `@modules/users/users.module`              |
| 18   | `./webhooks/webhooks.module`              | `@core/webhooks/webhooks.module`           |

### `src/core/auth/auth.module.ts`

| Line | From                    | To                            |
| ---- | ----------------------- | ----------------------------- |
| 2    | `../users/users.module` | `@modules/users/users.module` |

⚠️ Violates the core→modules zone. Add the suppression:

```ts
// eslint-disable-next-line no-restricted-imports -- removed in Phase 4 (auth strategy)
import { UsersModule } from "@modules/users/users.module"
```

### `src/core/auth/guards/clerk-auth.guard.ts`

| Line | From                        | To                             |
| ---- | --------------------------- | ------------------------------ |
| 10   | `../../users/users.service` | `@modules/users/users.service` |

⚠️ Same suppression, same expiry (Phase 4).

### `src/core/auth/guards/clerk-auth.guard.spec.ts`

| Line | From                        | To                             |
| ---- | --------------------------- | ------------------------------ |
| 4    | `../../users/users.service` | `@modules/users/users.service` |

Spec files are matched by the `src/core/**` zone too — suppress here as well, or the lint gate fails.

### `src/core/observability/health/health.controller.ts`

| Line | From                                  | To                                       |
| ---- | ------------------------------------- | ---------------------------------------- |
| 3    | `../auth/decorators/public.decorator` | `@core/auth/decorators/public.decorator` |

Core-to-core, so no suppression needed — the zone only forbids `@modules/*`.

### `src/core/webhooks/clerk-webhook.controller.ts`

| Line | From                                  | To                                       |
| ---- | ------------------------------------- | ---------------------------------------- |
| 15   | `../auth/decorators/public.decorator` | `@core/auth/decorators/public.decorator` |
| 16   | `../users/users.repository`           | `@modules/users/users.repository`        |
| 17   | `../users/users.service`              | `@modules/users/users.service`           |

⚠️ Lines 16–17 need the suppression, expiring in **Phase 5**.

### `src/core/webhooks/webhooks.module.ts`

| Line | From                    | To                            |
| ---- | ----------------------- | ----------------------------- |
| 2    | `../users/users.module` | `@modules/users/users.module` |

⚠️ Suppression, expiring in Phase 5.

### `src/core/webhooks/clerk-webhook.controller.spec.ts`

| Line | From                        | To                                |
| ---- | --------------------------- | --------------------------------- |
| 2    | `../users/users.repository` | `@modules/users/users.repository` |
| 3    | `../users/users.service`    | `@modules/users/users.service`    |

⚠️ Suppression, expiring in Phase 5.

### `src/modules/users/users.repository.ts`

| Line | From                          | To                               |
| ---- | ----------------------------- | -------------------------------- |
| 3    | `../database/database.module` | `@core/database/database.module` |
| 4    | `../database/schema/users`    | `@core/database/schema/users`    |

Legal: modules may import core.

### `src/modules/users/users.service.ts`

| Line | From                       | To                            |
| ---- | -------------------------- | ----------------------------- |
| 13   | `../database/schema/users` | `@core/database/schema/users` |

Legal for now. Phase 3 deletes this import entirely in favour of the domain entity.

### `src/modules/users/users.controller.ts`

| Line | From                                        | To                                             |
| ---- | ------------------------------------------- | ---------------------------------------------- |
| 25   | `../auth/decorators/current-user.decorator` | `@core/auth/decorators/current-user.decorator` |
| 26   | `../auth/decorators/roles.decorator`        | `@core/auth/decorators/roles.decorator`        |

### `apps/api/test/app.e2e-spec.ts`

| Line | From                                  | To                                         |
| ---- | ------------------------------------- | ------------------------------------------ |
| 9    | `../src/auth/guards/clerk-auth.guard` | `../src/core/auth/guards/clerk-auth.guard` |

Relative, not aliased — this file sits outside `src/`. Aliases resolve here too via the e2e
`moduleNameMapper`, but a relative path to a sibling directory is clearer.

### Imports that must NOT change

Confirm these are untouched — each points inside a folder that moved as a whole:

```
shared/filters/problem-details.filter.ts:10   ../http/health-route
core/database/database.module.ts:12           ./schema
core/database/migrate.ts:5                    ./schema
core/database/seed.ts:3,4                     ./schema, ./schema/users
core/database/schema/index.ts:1               ./users
core/auth/guards/clerk-auth.guard.ts:11       ../decorators/public.decorator
core/auth/guards/roles.guard.ts:8             ../decorators/roles.decorator
core/observability/health/*                   ./health.service, ./graceful-shutdown.service, …
modules/users/users.controller.ts:32,33       ./dto, ./users.service
modules/users/users.module.ts:2-4             ./users.controller, ./users.repository, ./users.service
modules/users/dto/index.ts                    ./create-user.dto, …
src/main.ts:8                                 ./app.module
all *.spec.ts subject imports                 ./<subject>
```

---

## 3. Config path updates

- [x] `apps/api/drizzle.config.ts`:

  ```ts
  schema: "./src/core/database/schema/index.ts",
  out: "./src/core/database/migrations",
  ```

- [x] `apps/api/package.json`:

  ```json
  "db:migrate": "ts-node -r tsconfig-paths/register src/core/database/migrate.ts",
  "db:seed":    "ts-node -r tsconfig-paths/register src/core/database/seed.ts"
  ```

- [x] Root `package.json` `db:generate` / `db:migrate` / `db:seed` delegate via
      `pnpm --filter api ...`, so they need no change. Confirm rather than assume.

---

## 4. Two things that would break if you split `database/`

**`migrate.ts` resolves migrations relative to itself:**

```ts
const migrationsFolder = path.join(__dirname, "migrations")
```

Because `migrate.ts`, `seed.ts`, `schema/` and `migrations/` all move together into
`core/database/`, this keeps working untouched. If you are tempted to relocate `migrate.ts` to a
`scripts/` folder, this line must change with it — and it fails at runtime, not compile time.

**`seed.ts` imports the `users` table directly** (`./schema/users`). That is legal now and stays
legal after Phase 3, because tables are not moving out of `core/database/schema/` — see the
"one decision that changed" note in the [README](./README.md).

---

## 5. Verify

- [x] `pnpm --filter api lint` → `0 problems`. Any core→modules complaint means a suppression comment
      is missing; add it with its phase number, do not weaken the rule.
- [x] `pnpm --filter api typecheck` → clean.
- [x] `pnpm --filter api test` → same test count as before the phase. A drop means a spec file was
      left behind by a `git mv`.
- [x] `pnpm --filter api test:e2e` → passes.
- [x] `pnpm --filter api build && pnpm --filter api start:prod` → boots, `/health/live` returns 200.
      **This is the first real test of `tsc-alias`** — the aliases are load-bearing from now on.
- [x] `grep -rn "@core/\|@modules/\|@shared/" apps/api/dist/` → no matches.
- [x] `pnpm db:up && pnpm db:migrate && pnpm db:seed` → both scripts complete against dev Postgres.
- [x] `pnpm --filter api db:generate` → reports no schema changes. If it wants to emit a migration,
      `drizzle.config.ts` is pointing at the wrong path and would generate a duplicate baseline.
- [x] `git diff --stat HEAD~1 -- '*.ts'` shows import-only line changes. Any deleted or added
      function body means something other than a move crept in.

## Rollback

`git revert` the two commits (renames, then imports). Nothing outside `apps/api` is touched.

## Definition of done

- `src/` top level is exactly: `main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts`,
  `core/`, `modules/`, `shared/`.
- Every cross-area import uses an alias; every within-area import is relative.
- Exactly eight `-- removed in Phase N` suppressions exist and no others:
  three expiring in Phase 4 (`auth.module.ts`, `clerk-auth.guard.ts`, `clerk-auth.guard.spec.ts`)
  and five in Phase 5 (`clerk-webhook.controller.ts` ×2, `webhooks.module.ts`,
  `clerk-webhook.controller.spec.ts` ×2). `grep -rc "removed in Phase" apps/api/src` confirms.
