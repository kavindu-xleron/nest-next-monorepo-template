import { Global, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { LoggerModule } from "nestjs-pino"
import { ProblemDetailsFilter } from "@shared/filters/problem-details.filter"
import { validateEnv } from "./config/env.schema"
import { DatabaseModule } from "./database/database.module"
import { HealthModule } from "./observability/health/health.module"
import { loggerModuleOptions } from "./observability/logger.config"

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
