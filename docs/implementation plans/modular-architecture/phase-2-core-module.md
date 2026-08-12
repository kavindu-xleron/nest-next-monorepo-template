# Phase 2 — CoreModule and a legible root

**Goal:** collapse `app.module.ts` from 100 lines of interleaved wiring into a composition root you
can read in one screen.
**Risk:** low, but it touches global provider registration — read §4 before starting.
**Prerequisite:** Phase 1 merged.

`app.module.ts` currently holds the pino factory (40 lines), the throttler factory, the config
validation hookup, four global providers, and eight module imports. None of that is domain logic and
none of it belongs at the root. The root module's job is to say _what this application is composed
of_, and right now that sentence is buried.

---

## 1. Extract the logger configuration

The pino block is configuration, not wiring. It reads badly inside a module decorator and it is the
part most likely to be edited by someone who does not otherwise care about `app.module.ts`.

- [ ] `src/core/observability/logger.config.ts`:

  ```ts
  import { randomUUID } from "node:crypto"
  import { ConfigModule, ConfigService } from "@nestjs/config"
  import { Params } from "nestjs-pino"
  import { isHealthRoute } from "@shared/http/health-route"

  /**
   * pino wiring, kept out of app.module.ts because it is configuration rather
   * than composition. Behaviour is unchanged from the inline version:
   *
   * - an inbound x-request-id is honoured and echoed back on the response, so a
   *   correlation id survives a hop from the web app
   * - authorization, cookie, set-cookie and *.password are redacted
   * - health probes are excluded from access logging, or they drown everything
   * - pino-pretty is dev-only; production emits newline-delimited JSON
   */
  export function loggerOptions(configService: ConfigService): Params {
    const isProduction = configService.get<string>("NODE_ENV") === "production"
    const logLevel = configService.get<string>("LOG_LEVEL", "info")

    return {
      pinoHttp: {
        level: logLevel,
        genReqId: (req, res) => {
          const rawHeader = req.headers["x-request-id"]
          const existingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
          const reqId = existingId || randomUUID()
          res.setHeader("x-request-id", reqId)
          return reqId
        },
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
          "*.password",
        ],
        autoLogging: {
          ignore: (req) => isHealthRoute(req.url),
        },
        transport: isProduction
          ? undefined
          : {
              target: "pino-pretty",
              options: { colorize: true, singleLine: true },
            },
      },
    }
  }

  export const loggerModuleOptions = {
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: loggerOptions,
  }
  ```

- [ ] Copy the body verbatim from `app.module.ts`. Resist tidying it in the same commit — a behaviour
      change hidden inside an extraction is the hardest kind to spot in review.

Optionally do the same for the throttler factory (`throttler.config.ts`). It is six lines, so inlining
it in `CoreModule` is defensible; extract only if you expect per-route throttle profiles later.

---

## 2. Create `CoreModule`

- [ ] `src/core/core.module.ts`:

  ```ts
  import { Module, Global } from "@nestjs/common"
  import { ConfigModule, ConfigService } from "@nestjs/config"
  import { APP_FILTER, APP_GUARD } from "@nestjs/core"
  import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
  import { LoggerModule } from "nestjs-pino"
  import { ProblemDetailsFilter } from "@shared/filters/problem-details.filter"
  import { validateEnv } from "./config/env.schema"
  import { DatabaseModule } from "./database/database.module"
  import { loggerModuleOptions } from "./observability/logger.config"
  import { HealthModule } from "./observability/health/health.module"

  /**
   * Everything the application needs regardless of which business domains are
   * enabled: configuration, logging, rate limiting, the database pool, health
   * probes, and the RFC 7807 error shape.
   *
   * @Global so DatabaseModule's DRIZZLE token stays injectable without every
   * feature module re-importing it — DatabaseModule was already @Global before
   * this refactor, so this preserves existing behaviour rather than widening it.
   *
   * Auth is NOT here. It needs adapters supplied by a business module, so it is
   * composed in app.module.ts. See phase-4-auth-strategy.md.
   */
  @Global()
  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      LoggerModule.forRootAsync(loggerModuleOptions),
      ThrottlerModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => [
          {
            ttl: configService.get<number>("THROTTLE_TTL_MS", 60000),
            limit: configService.get<number>("THROTTLE_LIMIT", 100),
          },
        ],
      }),
      DatabaseModule,
      HealthModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
    exports: [DatabaseModule, HealthModule],
  })
  export class CoreModule {}
  ```

- [ ] Note what did **not** move: `ClerkAuthGuard` and `RolesGuard` stay registered in
      `app.module.ts` for now. Moving them is Phase 4's job, and doing it here would mean changing
      guard registration twice.

---

## 3. Slim `app.module.ts`

- [ ] The whole file becomes:

  ```ts
  import { Module } from "@nestjs/common"
  import { APP_GUARD } from "@nestjs/core"
  import { CoreModule } from "@core/core.module"
  import { AuthModule } from "@core/auth/auth.module"
  import { ClerkAuthGuard } from "@core/auth/guards/clerk-auth.guard"
  import { RolesGuard } from "@core/auth/guards/roles.guard"
  import { WebhooksModule } from "@core/webhooks/webhooks.module"
  import { UsersModule } from "@modules/users/users.module"
  import { AppController } from "./app.controller"
  import { AppService } from "./app.service"

  @Module({
    imports: [CoreModule, AuthModule, UsersModule, WebhooksModule],
    controllers: [AppController],
    providers: [
      AppService,
      { provide: APP_GUARD, useClass: ClerkAuthGuard }, // -> Phase 4
      { provide: APP_GUARD, useClass: RolesGuard }, // -> Phase 4
    ],
  })
  export class AppModule {}
  ```

  From ~100 lines to ~25. After Phase 4 and 5 it drops to about 15, and every line is a statement
  about composition.

---

## 4. Guard ordering — read before running

Nest applies global guards in provider registration order; across modules that follows module
initialization order. Two facts follow:

- **`RolesGuard` must run after the authenticating guard.** It reads `request.user`, which the auth
  guard populates. They must live in the same module, in that order, so their relative sequence is
  not left to module resolution. Phase 4 formalises this by registering both inside
  `AuthModule.register()`; this phase preserves it by leaving both in `AppModule`.
- **`ThrottlerGuard` moving into `CoreModule` changes its position relative to the auth guards.**
  `CoreModule` is first in `AppModule`'s imports, so it should still initialise first — but this is
  ordering by convention, not by guarantee. It is also **not a correctness issue**: throttle-before-auth
  is a cost preference (reject floods before doing crypto), not a security property. If the verify
  step shows the order flipped and you care, register `ThrottlerGuard` in `AppModule` ahead of the
  auth guards instead.

---

## 5. Verify

- [ ] `pnpm --filter api test test:e2e` → green. The e2e `x-request-id` assertion is the regression
      test for the logger extraction; if `genReqId` were dropped or mistyped, that test fails.
- [ ] `pnpm --filter api dev` → pino-pretty colourised output appears, and hitting
      `/health/live` repeatedly produces **no** access log lines (`autoLogging.ignore` intact).
- [ ] `NODE_ENV=production pnpm --filter api start:prod` → log lines are raw JSON, not pretty-printed.
- [ ] `curl -H "x-request-id: abc123" localhost:5001/api/v1/` → response echoes
      `x-request-id: abc123`; a request without the header gets a generated UUID.
- [ ] Throttling still engages: exceed `THROTTLE_LIMIT` against `/api/v1/` and get `429`.
- [ ] Boot with `DRAIN_INTERVAL_MS=40000 SHUTDOWN_TIMEOUT_MS=30000` → the app **refuses to start**
      with the `superRefine` message from `env.schema.ts`. This confirms `validateEnv` is still wired
      through `CoreModule`; a silently dropped `validate` option would leave the app booting with
      unvalidated config.
- [ ] `wc -l apps/api/src/app.module.ts` → under 30.

## Rollback

Single commit, no file moves, no signature changes. Revert cleanly.

## Definition of done

- `app.module.ts` contains only imports, controllers, and the two guards awaiting Phase 4.
- `CoreModule` owns config, logging, throttling, database, health, and the error filter.
- Log output, correlation ids, throttling, and env validation are observably unchanged.
