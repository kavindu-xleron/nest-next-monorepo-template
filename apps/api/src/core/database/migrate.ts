import * as path from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import * as schema from "./schema"

async function runMigrations() {
  const connectionString =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/nest_db"

  console.log("Running database migrations...")
  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool, { schema })

  try {
    const migrationsFolder = path.join(__dirname, "migrations")
    await migrate(db, { migrationsFolder })
    console.log("Database migrations completed successfully.")
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigrations()
