# Phase 0 — Aliases and boundaries

**Goal:** make the target architecture expressible and enforceable before anything moves.
**Risk:** low, with one sharp edge — path aliases break the production build unless `tsc-alias` is wired in.
**Files moved:** none.

Everything here is tooling. No `src/` file changes except imports staying exactly as they are. Landing
this first means every later phase is checked by the linter as it goes in, rather than audited
afterwards.

---

## 1. Clear the three pre-existing lint warnings

`eslint-plugin-only-warn` is applied globally in `packages/eslint-config/base.js`, which downgrades
**every rule in the repo to a warning**. A boundary rule that only warns will be ignored within a
week. The fix is `--max-warnings 0` on the lint script (step 4), but that only works from a clean
baseline. Today:

```
drizzle.config.ts         9:7  warning  DATABASE_URL is not listed as a dependency in root turbo.json
src/database/migrate.ts   9:5  warning  DATABASE_URL is not listed as a dependency in root turbo.json
src/database/seed.ts      8:5  warning  DATABASE_URL is not listed as a dependency in root turbo.json
```

- [ ] Root `turbo.json` — add `globalEnv` above `tasks`:

  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "ui": "tui",
    "globalEnv": ["DATABASE_URL"],
    "tasks": { ... }
  }
  ```

  `globalEnv` rather than a per-task `env` because these three files are read by the `db:*` scripts,
  which run outside Turbo's task graph — there is no single task to attach it to.

- [ ] `pnpm --filter api lint` → `0 problems`.

---

## 2. Path aliases

- [ ] `apps/api/tsconfig.json` — `baseUrl: "./"` already exists, so `paths` is all that is needed:

  ```json
  {
    "extends": "@workspace/typescript-config/nestjs.json",
    "compilerOptions": {
      "outDir": "./dist",
      "baseUrl": "./",
      "paths": {
        "@core/*": ["src/core/*"],
        "@modules/*": ["src/modules/*"],
        "@shared/*": ["src/shared/*"]
      }
    }
  }
  ```

  Three aliases, not one per layer. `@modules/users/domain/user.entity` is legible; a flat `@/`
  alias would defeat the whole point, which is that the boundary rules in step 5 can pattern-match
  on the prefix.

### The import convention this implies

**Relative inside a module, aliased across a boundary.** Inside `modules/users/`, write
`./domain/user.entity`. Crossing into another top-level area, write `@core/...`. Two reasons:

- Step 5's third zone blocks `@modules/*/domain/**` from _everywhere_, including the users module
  itself. A module reaching its own internals via alias would trip its own rule.
- Relative imports inside a module make it copy-pasteable. `git mv modules/users modules/accounts`
  leaves internal imports intact.

Inside `core/`, treat each top-level area (`auth`, `database`, `observability`, `webhooks`) as a
module for this purpose: relative within `core/auth/`, `@core/auth/...` when reached from
`core/webhooks/`.

---

## 3. Make the production build survive aliases

**`nest build` runs plain `tsc`, and `tsc` does not rewrite path aliases.** Type-checking passes,
tests pass, and `dist/main.js` contains a literal `require("@core/config/env.schema")` that throws
`MODULE_NOT_FOUND` at boot. This repo has already shipped one broken `dist` path — see
`REMEDIATION_PLAN.md` §2, where `start:prod` pointed at a file the build had silently relocated. The
failure mode is identical: a fully green pipeline over an unstartable app.

- [ ] Install the rewriter:

  ```bash
  pnpm --filter api add -D tsc-alias
  ```

- [ ] `apps/api/package.json` — chain it onto the build:

  ```json
  "build": "nest build && tsc-alias -p tsconfig.build.json",
  ```

  `tsconfig.build.json` extends `tsconfig.json`, so it inherits `paths` and `outDir` with no further
  config.

- [ ] The `db:migrate` / `db:seed` scripts already run through `ts-node -r tsconfig-paths/register`,
      so they resolve aliases from source with no change.

**Why not the alternatives:** `nest build --webpack` resolves aliases but changes the whole output
shape and breaks the current `node dist/main` entrypoint. `-r tsconfig-paths/register` at runtime
works but needs a second `baseUrl` pointing into `dist`, and puts a resolution hook in the production
process. `tsc-alias` rewrites the emitted requires at build time and leaves nothing behind.

---

## 4. Jest — two configs, two different roots

This is the step most likely to be got wrong, because the two suites have different `rootDir` values
and therefore need different mappings for the same alias.

- [ ] `apps/api/package.json`, the `jest` block (`rootDir: "src"`):

  ```json
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@core/(.*)$": "<rootDir>/core/$1",
    "^@modules/(.*)$": "<rootDir>/modules/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1"
  }
  ```

- [ ] `apps/api/test/jest-e2e.json` (`rootDir: "."` — note the extra `src/`):

  ```json
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@core/(.*)$": "<rootDir>/src/core/$1",
    "^@modules/(.*)$": "<rootDir>/src/modules/$1",
    "^@shared/(.*)$": "<rootDir>/src/shared/$1"
  }
  ```

- [ ] Keep the existing `^(\\.{1,2}/.*)\\.js$` mapping first. It strips the `.js` extensions that
      `@workspace/contracts` requires (see the comment in `packages/contracts/src/index.ts`) and is
      unrelated to aliases.

A wrong mapping here fails loudly (`Cannot find module '@core/...'`), so the verify step catches it.
The dangerous one is step 3, which fails silently.

---

## 5. Boundary rules

These live in `apps/api/eslint.config.mjs`, not in `@workspace/eslint-config`. They describe this
app's layout, not a general Nest convention, and the shared package is consumed by `web` and `ui`
too.

- [ ] Replace `apps/api/eslint.config.mjs` in full:

  ```js
  import { nodeNestConfig } from "@workspace/eslint-config/node-nest"

  /**
   * Architectural boundaries for the layered module structure.
   * See docs/implementation plans/modular-architecture/README.md.
   *
   * Direction of dependency: modules -> core -> shared. Never upward.
   */
  export default [
    ...nodeNestConfig,

    // core/ is infrastructure. It may not know a business domain exists.
    {
      files: ["src/core/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@modules/*", "@modules/**", "**/modules/**"],
                message:
                  "core must not depend on a business module. Define a port in core (see core/auth/ports) and let the module implement it.",
              },
            ],
          },
        ],
      },
    },

    // domain/ is plain types and ports. No framework, no driver, no vendor SDK.
    {
      files: ["src/modules/*/domain/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "drizzle-orm",
                  "drizzle-orm/**",
                  "pg",
                  "@nestjs/swagger",
                  "nestjs-zod",
                  "@clerk/**",
                  "svix",
                ],
                message:
                  "domain/ holds business types and ports. Persistence, HTTP and vendor SDKs belong in infrastructure/ or presentation/.",
              },
            ],
          },
        ],
      },
    },

    // Modules talk to each other through index.ts, never through internals.
    {
      files: ["src/modules/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "@modules/*/domain/**",
                  "@modules/*/application/**",
                  "@modules/*/infrastructure/**",
                  "@modules/*/presentation/**",
                ],
                message:
                  "Import another module through its index.ts barrel. Inside your own module, use relative paths.",
              },
            ],
          },
        ],
      },
    },
  ]
  ```

- [ ] `apps/api/package.json` — make warnings fail:

  ```json
  "lint": "eslint --max-warnings 0",
  ```

### Expect Phase 1 to violate the first zone

`core/auth/auth.module.ts` and `core/webhooks/*` import from the users module today. That is the
coupling Phases 4 and 5 exist to remove — it will not be fixed by moving files in Phase 1. Do **not**
weaken the rule to accommodate it. Instead, Phase 1 adds line-level suppressions that name their
expiry:

```ts
// eslint-disable-next-line no-restricted-imports -- removed in Phase 4 (auth strategy)
import { UsersModule } from "@modules/users/users.module"
```

Eight of these go in during Phase 1 — three expiring in Phase 4, five in Phase 5. A
`grep -rn "removed in Phase" apps/api/src` is then an accurate progress bar, and the rule stays
honest in the meantime.

---

## 6. Verify

Run in order. The last one is the one that matters.

- [ ] `pnpm --filter api lint` → `0 problems`.
- [ ] `pnpm --filter api typecheck` → clean.
- [ ] `pnpm --filter api test` → all suites pass.
- [ ] `pnpm --filter api test:e2e` → all suites pass.
- [ ] **`pnpm --filter api build && pnpm --filter api start:prod`** → boots and serves
      `curl localhost:5001/health/live`. Nothing uses an alias yet, so this is a baseline; re-run it
      at the end of Phase 1, when the aliases are load-bearing.
- [ ] `grep -r "@core/\|@modules/\|@shared/" apps/api/dist/` → **no matches** after Phase 1. Any hit
      means `tsc-alias` did not run and the build is broken in production only.

## Rollback

Every change is additive and confined to config files. Revert the commit; no source file depends on
anything introduced here.

## Definition of done

- `paths` resolve in `tsc`, both Jest suites, `ts-node`, and the emitted `dist`.
- `pnpm --filter api lint` fails the build on a boundary violation, not just warns.
- `src/` is byte-identical to before this phase.
