import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { users } from "./schema/users"

async function runSeed() {
  const connectionString =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/nest_db"

  console.log("Seeding database...")
  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool, { schema })

  try {
    await db
      .insert(users)
      .values([
        {
          clerkId: "user_admin_dev_01",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          role: "admin",
        },
        {
          clerkId: "user_regular_dev_01",
          email: "user@example.com",
          firstName: "Regular",
          lastName: "User",
          role: "user",
        },
      ])
      .onConflictDoNothing({ target: users.clerkId })

    console.log("Database seeded successfully.")
  } catch (error) {
    console.error("Seeding failed:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runSeed()
