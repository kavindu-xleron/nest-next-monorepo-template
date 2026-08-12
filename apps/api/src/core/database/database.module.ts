import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export const PG_POOL = "PG_POOL"
export const DRIZZLE = "DRIZZLE"

export type DrizzleDB = NodePgDatabase<typeof schema>

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name)

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Releasing the database connection pool MUST occur in `onApplicationShutdown` (Step 4),
   * NEVER in `onModuleDestroy` (Step 1).
   *
   * Nest's shutdown order:
   *   1. onModuleDestroy()
   *   2. beforeApplicationShutdown()  <- readiness flip & drain window
   *   3. dispose()                    <- HTTP server closes
   *   4. onApplicationShutdown()      <- pool closes HERE
   *
   * Closing the pool in onModuleDestroy would destroy connection handles before the drain window
   * finishes, causing in-flight HTTP requests during drain to crash with DB connection errors.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Closing PostgreSQL connection pool on application shutdown (signal: ${signal || "SIGTERM"})...`
    )
    await this.pool.end()
    this.logger.log("PostgreSQL connection pool closed cleanly.")
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connectionString =
          configService.get<string>("DATABASE_URL") ||
          "postgres://postgres:postgres@localhost:5432/nest_db"
        return new Pool({
          connectionString,
          max: 20,
        })
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): DrizzleDB => {
        return drizzle(pool, { schema })
      },
    },
    DatabaseService,
  ],
  exports: [PG_POOL, DRIZZLE, DatabaseService],
})
export class DatabaseModule {}
