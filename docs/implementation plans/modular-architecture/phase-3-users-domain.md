# Phase 3 — The users domain: port and adapter

**Status:** ✅ complete (2026-08-18). `ensureJitUser`'s payload field was renamed `clerkId` → `externalId` during review (§3.3) — it was the last provider vocabulary left in `application/`. The §8 grep was also over-strict and is now scoped to `domain/` + `application/`.

**Goal:** make the data source swappable, and establish the layer shape every future module copies.
**Risk:** medium. Real logic changes, including one performance fix.
**Prerequisite:** Phase 2 merged.

This is the pattern-setter. Everything here is mechanical _once the shape is agreed_, and the shape
is what Phase 6 writes into the contributor docs.

Two behaviour changes ride along because they are consequences of the split, not opportunistic
cleanups: the `role` cast disappears (§3.2) and the per-request `UPDATE` stops (§4.2).

---

## Target layout

```
modules/users/
  index.ts
  users.module.ts
  domain/
    user.entity.ts
    users.repository.ts
  application/
    users.service.ts
    users.service.spec.ts
  infrastructure/drizzle/
    user.mapper.ts
    user.mapper.spec.ts
    drizzle-users.repository.ts
  presentation/
    users.controller.ts
    users.controller.spec.ts
    dto/
```

`user-principal.resolver.ts` lands in `application/` during Phase 4; `clerk-user-sync.controller.ts`
in `presentation/` during Phase 5.

---

## 1. Domain

### 1.1 `shared/types/page.ts`

- [x] Cursor pagination is not users-specific, and the domain must not import an API contract:

  ```ts
  /**
   * Cursor page as the domain sees it. Structurally identical to
   * PaginatedResponseDto in @workspace/contracts, and deliberately a separate
   * type: the contract is a public API promise, this is an internal shape, and
   * they must be free to diverge.
   */
  export interface Page<T> {
    items: T[]
    nextCursor: string | null
    hasMore: boolean
  }
  ```

### 1.2 `domain/user.entity.ts`

- [x] Plain types only. This file must import nothing but `@shared` types:

  ```ts
  export type UserRole = "user" | "admin"

  /**
   * A user as the business understands one.
   *
   * `externalId` is the identity-provider subject. It is deliberately not
   * called clerkId: the column is still `clerk_id` (renaming it is a migration
   * we do not need), and the mapper in infrastructure/drizzle is the only place
   * that knows the two are the same thing.
   *
   * There is no `deletedAt` here. Soft deletion is a persistence strategy; the
   * domain's position is that a deleted user is simply not returned.
   */
  export interface User {
    id: string
    externalId: string
    email: string
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
    role: UserRole
    createdAt: Date
    updatedAt: Date
  }

  export interface NewUser {
    externalId: string
    email: string
    role?: UserRole
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string | null
  }

  export type UserPatch = Partial<NewUser>
  ```

### 1.3 `domain/users.repository.ts`

- [x] The port. An `abstract class`, not an interface — it compiles to a real JS class, so it doubles
      as the DI token and the call sites stay `@Inject`-free:

  ```ts
  import { Page } from "@shared/types/page"
  import { NewUser, User, UserPatch } from "./user.entity"

  /**
   * Persistence port for users.
   *
   * Abstract class rather than interface: an interface is erased at compile
   * time and cannot be a Nest DI token, which is what forces the
   * @Inject("USERS_REPOSITORY") string-token style. A class survives.
   *
   * Absence is `null`, never `undefined` — Drizzle returns undefined for a
   * missing row and the previous code let that leak all the way into the
   * service. The port picks one and the adapter converts.
   */
  export abstract class UsersRepository {
    abstract findById(id: string): Promise<User | null>
    abstract findByEmail(email: string): Promise<User | null>
    abstract findByExternalId(externalId: string): Promise<User | null>
    abstract findPage(
      cursor: string | undefined,
      limit: number
    ): Promise<Page<User>>
    abstract create(data: NewUser): Promise<User>
    abstract update(id: string, data: UserPatch): Promise<User | null>
    abstract softDelete(id: string): Promise<void>
  }
  ```

> **Never write `import type { UsersRepository }`.** The `type` keyword erases the import, the
> constructor's `design:paramtypes` metadata becomes `Object`, and Nest fails at runtime with an
> unresolvable-dependency error that points at the wrong file. This compiles cleanly and passes
> typecheck. It is the single most likely way to lose an afternoon in this phase.

---

## 2. Infrastructure

### 2.1 `infrastructure/drizzle/user.mapper.ts`

- [x] The only file in the application that knows the column is called `clerk_id`:

  ```ts
  import {
    NewUser as DbNewUser,
    User as UserRow,
  } from "@core/database/schema/users"
  import { NewUser, User, UserRole } from "../../domain/user.entity"

  export function toEntity(row: UserRow): User {
    return {
      id: row.id,
      externalId: row.clerkId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      avatarUrl: row.avatarUrl,
      role: normalizeRole(row.role),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  export function toInsert(data: NewUser): DbNewUser {
    return {
      clerkId: data.externalId,
      email: data.email,
      role: data.role ?? "user",
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      avatarUrl: data.avatarUrl ?? null,
    }
  }

  /**
   * `role` is varchar(50) in Postgres, so any string can be in there — the
   * previous code papered over this with `user.role as "user" | "admin"` in the
   * service, which REMEDIATION_PLAN.md §3 correctly called a lie (a row with
   * role "superadmin" was actually persisted during that audit).
   *
   * Narrowing happens here instead, at the boundary where the untrusted string
   * enters the application. Anything unrecognised degrades to the least
   * privileged role rather than being asserted into the type system.
   */
  function normalizeRole(role: string): UserRole {
    return role === "admin" ? "admin" : "user"
  }
  ```

- [x] `toPatch(data: UserPatch)` follows the same shape — spread only the keys that are present, so a
      partial update never nulls a field it did not mention.

### 2.2 `infrastructure/drizzle/drizzle-users.repository.ts`

- [x] Today's `users.repository.ts` body, with three changes: `implements UsersRepository`, every
      return threaded through `toEntity`, and `?? null` on the lookups.

  ```ts
  @Injectable()
  export class DrizzleUsersRepository implements UsersRepository {
    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

    async findById(id: string): Promise<User | null> {
      const rows = await this.db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      return rows[0] ? toEntity(rows[0]) : null
    }

    // ... findByEmail, findByExternalId (was findByClerkId) identically shaped
  }
  ```

- [x] `findPaginated` → `findPage`, returning `Page<User>`. The `limit + 1` over-fetch and
      `lt(users.id, cursor)` keyset logic is correct — carry it over unchanged.
- [x] `create` keeps the "insert returned no row" guard. That is a genuine invariant check, not
      defensive noise.
- [x] `softDelete` returns `Promise<void>` now. The old return value was never used.
- [x] `implements`, not `extends`: `UsersRepository` is a pure contract with no shared behaviour, so
      `implements` avoids a pointless `super()` call. (`TokenVerifier` in Phase 4 goes the other way,
      and explains why.)

---

## 3. Application

### 3.1 Move and re-point

- [x] `git mv users.service.ts application/users.service.ts` (and its spec).
- [x] Delete `import { User } from "@core/database/schema/users"`; import the domain entity instead.
- [x] The constructor is **unchanged** — `constructor(private readonly usersRepository: UsersRepository)`
      now injects the port, resolved through `emitDecoratorMetadata` against the `provide:` binding in
      §5. No `@Inject`, no string token.

### 3.2 Fold the cast away

- [x] `toUserDto` currently contains `role: user.role as "user" | "admin"`. With `normalizeRole` in
      the mapper, `user.role` is already `UserRole` and the cast deletes itself. Confirm the assertion
      is gone rather than merely unnecessary.

### 3.3 Rename call sites

- [x] `usersRepository.findByClerkId(...)` → `findByExternalId(...)`
- [x] `usersRepository.findPaginated(cursor, limit)` → `findPage(cursor, limit)`
- [x] `create({ clerkId: ... })` → `create({ externalId: ... })`. Note `create()` in `UsersService`
      currently synthesises `clerk_dev_${Date.now()}_${random}` for admin-created users; keep that
      behaviour but name the field `externalId`.
- [x] **`ensureJitUser`'s payload parameter too** — rename its `clerkId` field to `externalId`, not
      just the repository calls it makes. It is easy to miss because the method compiles fine either
      way: the value gets renamed on the first line of the body and everything downstream is already
      correct. But the parameter is the module's public surface, and leaving it means the one piece
      of provider vocabulary left in `application/` is on the signature every caller sees. Phase 4's
      `UserPrincipalResolver` passes `externalId: claims.subject`, so this has to change regardless
      — doing it here keeps Phase 4 focused on the auth seam.

      Four call sites move with it: `clerk-auth.guard.ts`, `clerk-webhook.controller.ts`, and their
      two specs. All four use object shorthand (`clerkId,`) over a local named `clerkId`, so each
      becomes `externalId: clerkId`.

### 3.4 New use case for Phase 5

- [x] Add `removeByExternalId(externalId: string): Promise<void>` — find, and soft-delete if present.
      Phase 5 needs it to stop the webhook controller reaching into the repository directly. Adding it
      here keeps that phase to a pure move.

---

## 4. The write-per-request fix

### 4.1 What is happening now

`ensureJitUser` finds the existing row and then **unconditionally** calls `usersRepository.update()`,
which sets `updatedAt: new Date()`. `ClerkAuthGuard` calls `ensureJitUser` on every non-`@Public()`
request. Therefore **every authenticated request issues a DB UPDATE** — a write, a WAL record, and
row bloat, per request, to store data that did not change.

This is fixed here rather than filed separately because Phase 4 routes _every_ request through this
method via `PrincipalResolver`. Carrying the bug forward would make the new seam look like the cause.

### 4.2 The fix

- [x] In `ensureJitUser`, compare before writing:

  ```ts
  const existing = await this.usersRepository.findByExternalId(
    payload.externalId
  )
  if (existing) {
    const role = payload.role ?? existing.role
    const drifted =
      existing.email !== payload.email ||
      existing.role !== role ||
      existing.firstName !== (payload.firstName ?? existing.firstName) ||
      existing.lastName !== (payload.lastName ?? existing.lastName)

    if (!drifted) {
      return this.toUserDto(existing)
    }
    // ... existing update path
  }
  ```

- [x] Leave the email-collision branch (`findByEmail` → adopt the row, set `externalId`) intact. That
      path is the webhook/JIT reconciliation described in `INITIAL_IMPLEMENTATION_PLAN.md` and is
      genuinely a write.

---

## 5. Module and barrel

- [x] `users.module.ts`:

  ```ts
  @Module({
    controllers: [UsersController],
    providers: [
      UsersService,
      { provide: UsersRepository, useClass: DrizzleUsersRepository },
    ],
    exports: [UsersService, UsersRepository],
  })
  export class UsersModule {}
  ```

  `UsersRepository` is exported because Phase 5's webhook path and any future module-level
  composition bind against the token, not the adapter. It is **not** re-exported from `index.ts`.

- [x] `modules/users/index.ts` — the module's public API:

  ```ts
  export { UsersModule } from "./users.module"
  export { UsersService } from "./application/users.service"
  export type { User, UserRole, NewUser, UserPatch } from "./domain/user.entity"
  ```

  Deliberately absent: `UsersRepository`, `DrizzleUsersRepository`, the mapper, the DTOs. Nothing
  outside this module may reach the persistence layer, and the Phase 0 lint zone enforces it.

---

## 6. Presentation

- [x] `git mv users.controller.ts presentation/` and `git mv dto presentation/dto`.
- [x] The DTO classes are unchanged — they already wrap `@workspace/contracts` schemas via
      `createZodDto`, which is exactly the right shape: contracts stay framework-free for the web app,
      the API binds them at its edge.
- [x] The controller's `@CurrentUser()` and `@Roles()` imports keep their `@core/auth/...` paths.
- [x] `findMe(user?.id)` and the self-or-admin check in `findOne` stay as they are. They are
      authorization decisions expressed at the transport edge, which is where they belong.

---

## 7. Tests

The existing specs construct classes directly (`new UsersService(repository)`) with hand-rolled mock
objects rather than `Test.createTestingModule`, so this phase is cheap for them. That is luck worth
preserving — keep the direct-construction style.

- [x] `users.service.spec.ts`:
  - `findByClerkId` → `findByExternalId`, `findPaginated` → `findPage` in the mock object.
  - `mockUserRow` becomes a `User` **entity**: drop `clerkId` and `deletedAt`, add `externalId`.
    Rename it `mockUser` — it is no longer a row.
  - Every `mockResolvedValue(undefined)` → `mockResolvedValue(null)`.
  - The assertion that `toUserDto` "strips internal clerkId and deletedAt" still passes, and now for a
    stronger reason: those fields never reach the service at all.
- [x] **New:** `ensureJitUser` calls `repository.update` when a claim drifted, and does **not** call it
      when nothing changed. This is the regression test for §4 — without it the write-per-request bug
      silently returns the first time someone refactors the comparison.
- [x] **New:** `user.mapper.spec.ts` — `toEntity` maps `clerkId` → `externalId`; `normalizeRole`
      returns `"user"` for `"superadmin"`, `""`, and `"ADMIN"`. Pure functions, no DB, no Nest.
- [x] `users.controller.spec.ts` — import path only.

---

## 8. Verify

- [x] `pnpm --filter api lint typecheck test test:e2e` → green.
- [x] `grep -rn "import type.*Repository" apps/api/src` → no matches. See the warning in §1.3.
- [x] `grep -rn "clerkId" apps/api/src/modules/users/domain apps/api/src/modules/users/application`
      → no matches. Provider naming must not survive above the infrastructure boundary.

      Scoped to those two directories deliberately. `clerkId` **is** expected under
      `infrastructure/drizzle/` — the mapper translates it, and the adapter has to name the column
      to query it (`eq(users.clerkId, externalId)`). A repo-wide `grep` over `src/modules` produces
      false positives on correct code and trains you to ignore it.

- [x] `grep -rn "as \"user\" | \"admin\"" apps/api/src` → no matches.
- [x] **Prove the swap.** Temporarily bind an in-memory fake in `users.module.ts`:

  ```ts
  { provide: UsersRepository, useValue: new InMemoryUsersRepository() }
  ```

  Stop Postgres (`pnpm db:down`), boot, and confirm `/api/v1/users/me` responds. This is the entire
  point of the phase; if it does not work, something still reaches the database directly. Revert the
  binding afterwards, but consider keeping the fake under `infrastructure/in-memory/` — it makes
  e2e tests DB-free later.

- [x] **Prove the write fix.** Boot against dev Postgres with statement logging on
      (`ALTER SYSTEM SET log_statement = 'all'`), issue the same authenticated request twice, and
      confirm the second produces **no** `UPDATE users`. Before this phase it produced one every time.

## Rollback

Three commits (domain + infrastructure, application + fix, presentation + tests) revert independently
in reverse order. The database is untouched throughout — no migration, no column rename.

## Definition of done

- `UsersService` compiles with zero imports from `@core/database`.
- Swapping the repository binding runs the app with no database.
- A repeat authenticated request issues no write.
- `modules/users/index.ts` exposes the module, the service, and entity types — nothing else.
