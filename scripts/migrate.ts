import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { createDb, DATABASE_PATH } from "../src/db"

migrate(createDb(), { migrationsFolder: "src/db/migrations" })
console.log(`migrated ${DATABASE_PATH}`)
