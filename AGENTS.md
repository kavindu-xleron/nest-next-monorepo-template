<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:api-architecture-rules -->

# apps/api — architecture rules

Layered modules. Dependencies point one way: `modules/ → core/ → shared/`. Never upward.

- `core/` — app-wide infrastructure: config, database, logging, health, auth, webhooks. No business rules.
- `modules/<domain>/` — one business domain each, internally layered:
  - `domain/` — plain types and `abstract class` ports. No Nest, no Drizzle, no vendor SDK.
  - `application/` — use cases. Depends on domain ports only.
  - `infrastructure/` — adapters implementing domain ports (Drizzle, HTTP clients, vendor SDKs).
  - `presentation/` — controllers, DTOs, Swagger. Calls `application/`, never a repository.
- `shared/` — framework-adjacent, domain-free helpers.

Which layer? Ask what would force the file to change: a different database is
`infrastructure`, a different transport is `presentation`, a different business rule is
`domain`/`application`. Two answers means it needs splitting.

## Rules the linter enforces

- `core/` must not import `modules/`. Define a port in core and let the module implement it —
  see `core/auth/ports/`.
- Reach another module only through its `index.ts`, never its internals.
- Relative imports inside a module; `@core` / `@modules` / `@shared` across.
- `domain/` may not import `drizzle-orm`, `pg`, `@clerk/*`, `svix`, `nestjs-zod`, or `@nestjs/swagger`.

`pnpm --filter api lint` runs with `--max-warnings 0`, so a boundary violation fails the build.

## Two ways to break dependency injection while typecheck stays green

- **Ports are abstract classes, never interfaces.** An interface is erased at compile time and
  cannot be a Nest DI token.
- **Never `import type` a port.** It erases the runtime value, `design:paramtypes` becomes
  `Object`, and Nest fails at boot with an error pointing at the wrong file.

## Other things worth knowing before editing

- A new env var must be declared in `core/config/env.schema.ts`. `@nestjs/config` replaces its
  config object with whatever `validate` returns and `z.object` strips undeclared keys, so an
  unlisted variable is invisible to `ConfigService` no matter what is in `.env`.
- Path aliases are rewritten into `dist` by `tsc-alias`, chained onto `nest build`. If you change
  the build script, keep it — `tsc` alone leaves `require("@core/...")` in the output and the app
  fails at boot only in production.
- ESLint flat config **replaces** a rule's options rather than merging them. A more-specific
  `files:` block placed before a general one is silently discarded. See the ordering note in
  `apps/api/eslint.config.mjs`.

Full reasoning: `docs/adr/0001-layered-modules.md`.

<!-- END:api-architecture-rules -->
