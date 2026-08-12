# Phase 6 — Make the structure self-perpetuating

**Goal:** ensure the next module written — by a teammate, a template consumer, or an agent — lands in
the right shape without anyone re-deriving it.
**Risk:** low.
**Prerequisite:** Phase 5 merged.

A template's directory structure is a claim about how to extend it. Phases 0–5 make the claim
enforceable at lint time for the _rules_; this phase writes down the _reasoning_, which lint cannot
carry. Skipping it is how a codebase ends up with `modules/orders/orders.service.ts` sitting flat
beside a properly layered `modules/users/` six months from now.

---

## 1. `AGENTS.md`

The file already carries a `<!-- BEGIN:nextjs-agent-rules -->` block for the web app. Add an API
section beside it, in the same terse register — this file is read by agents on every session, so
brevity is load-bearing.

- [ ] ```markdown
      # apps/api — architecture rules

      Layered modules. Dependencies point one way: `modules/ -> core/ -> shared/`. Never upward.

      - `domain/` — plain types and `abstract class` ports. No Nest, no Drizzle, no vendor SDK.
      - `application/` — use cases. Depends on domain ports only.
      - `infrastructure/` — adapters implementing domain ports (Drizzle, HTTP clients, vendor SDKs).
      - `presentation/` — controllers, DTOs, Swagger. Calls `application/`, never a repository.

      Which layer? Ask what would force the file to change: a different database is
      `infrastructure`, a different transport is `presentation`, a different business
      rule is `domain`/`application`. Two answers means it needs splitting.

      - Ports are abstract classes, never interfaces — an interface cannot be a DI token.
      - Never `import type` a port. It erases the runtime value and DI fails at boot
        while typecheck stays green.
      - Relative imports inside a module; `@core` / `@modules` / `@shared` across.
      - Reach another module only through its `index.ts`.
      - `core/` must not import `modules/`. Define a port in core and let the module
        implement it — see `core/auth/ports/`.
      ```

---

## 2. `README.md`

The root README is still the shadcn template boilerplate. Whatever else it grows, it needs the
extension path.

- [ ] Add an "API architecture" section: the three-way `core` / `modules` / `shared` split in four
      sentences, the layer table, and a link to
      `docs/implementation plans/modular-architecture/README.md` for the reasoning.
- [ ] Add "Adding a domain module" — the checklist in §4 below.
- [ ] Add "Swapping the auth provider": write a `TokenVerifier`, change one binding in
      `app.module.ts`. Include the env-driven `useFactory` form from
      [phase 4 §5](./phase-4-auth-strategy.md), and the reminder that any new variable must be
      declared in `core/config/env.schema.ts` or `ConfigService` cannot see it.
- [ ] Add "Swapping the database": write an adapter implementing `UsersRepository`, change one
      binding in `users.module.ts`. Mention that the in-memory fake from Phase 3 §8 is a working
      example if you kept it.

---

## 3. The ADR

- [ ] `docs/adr/0001-layered-modules.md` — a new `docs/adr/` directory. Short, and specifically the
      things a reader six months out will otherwise re-litigate:
  - **Ports are abstract classes.** Interfaces are erased; string tokens are the alternative and they
    make every call site noisier.
  - **Drizzle tables stay centralized in `core/database/schema/`** while repository ports live in
    `modules/*/domain/`. Record the reasoning from the [README](./README.md#the-one-decision-that-changed)
    — cross-domain foreign keys and the `db.query.*` API — and the trigger for reversing it: a module
    that genuinely needs a different store.
  - **`AuthModule` is a dynamic module** so adapters are passed in from the composition root. That is
    what keeps `core/` from importing `modules/`; a plain `@Module` cannot.
  - **The `clerk_id` column was not renamed.** The domain says `externalId` and the mapper bridges.
    Cost: one indirection. Benefit: no migration, no coordinated deploy.
- [ ] Cross-link from `INITIAL_IMPLEMENTATION_PLAN.md`'s "Two architecture calls worth stating
      explicitly" section. This ADR is the third call, and it is the one that governs the other two.

---

## 4. Adding a domain module

- [ ] Put this in the README, and consider it the acceptance test for the whole refactor — if a step
      here is unclear, the structure is not carrying its own weight:
  1. `modules/<name>/domain/` — entity types and `abstract class <Name>Repository`.
  2. `core/database/schema/<name>.ts`, re-exported from `schema/index.ts`; `pnpm db:generate`.
  3. `modules/<name>/infrastructure/drizzle/` — adapter + mapper. The mapper is the only file that
     knows a column name.
  4. `modules/<name>/application/` — the service holding use cases.
  5. `modules/<name>/presentation/` — controller and `createZodDto` DTOs wrapping
     `packages/contracts` schemas.
  6. `<name>.module.ts` — bind `{ provide: <Name>Repository, useClass: Drizzle<Name>Repository }`,
     export the service.
  7. `index.ts` — export the module, the service, and entity types. **Nothing else.**
  8. Register in `app.module.ts`.

---

## 5. A generator (optional, but the decay is real)

Eight files per module is a convention that erodes without tooling. Two options:

- [ ] **`nest g` schematic** — a custom collection in the repo, invoked as
      `nest g -c ./tools/schematics module users`. Most idiomatic for Nest; also the most work.
- [ ] **`plop`** — a `plopfile.mjs` with a `module` generator and eight Handlebars templates. About an
      hour, no Nest-specific knowledge, and template consumers can read it.
- [ ] **Do neither, deliberately** — and accept that step 4 above is the generator. Defensible while
      there is one module. Revisit at three.

Recommendation: plop, once a second module exists. Writing a generator against a single example
bakes in accidents.

---

## 6. Close the loop on the plan

- [ ] Mark every phase document complete, in the style the existing plans use
      (`INITIAL_IMPLEMENTATION_PLAN.md` phases carry `[x]` and a completion note).
- [ ] Append a short "what actually happened" note to this folder's
      [README](./README.md) — where estimates were wrong, which risks in the register fired, anything
      discovered mid-flight. `REMEDIATION_PLAN.md` exists because the first pass through the initial
      plan left gaps; the same honesty is worth more than a tidy checklist.
- [ ] Re-run the full gate one final time on `main`:

  ```bash
  pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
  pnpm --filter api start:prod   # and curl /health/live
  ```

## Definition of done

- `AGENTS.md` states the dependency direction and the two DI gotchas.
- `README.md` documents adding a module and swapping either adapter.
- An ADR records the four decisions and what would reverse each.
- Someone who has not read this plan folder can add a module correctly from the README alone.
