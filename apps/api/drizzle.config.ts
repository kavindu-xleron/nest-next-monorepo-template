import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/core/database/schema/index.ts",
  out: "./src/core/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgres://postgres:postgres@localhost:5432/nest_db",
  },
})
