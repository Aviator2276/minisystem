import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

export type Db = BetterSQLite3Database<typeof schema>

export const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/minisystem.db"

export function createDb(path: string = DATABASE_PATH): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  return drizzle(sqlite, { schema })
}

// single connection per process, surviving dev-server module duplication
const globalForDb = globalThis as unknown as { __minisystemDb?: Db }

export const db: Db = (globalForDb.__minisystemDb ??= createDb())

export * as tables from "./schema"
