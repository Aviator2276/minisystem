import { count, eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { db, tables } from "@/db"
import { hashPassword } from "@/server/auth/password"

/**
 * Production boot: apply pending migrations, then make sure an admin login
 * exists. ADMIN_USERNAME/ADMIN_PASSWORD env vars create (or reset) the
 * account; without them a first boot gets admin/admin and logs a warning.
 */
export function bootstrap(migrationsFolder = "src/db/migrations"): void {
  migrate(db, { migrationsFolder })

  const username = process.env.ADMIN_USERNAME ?? "admin"
  const password = process.env.ADMIN_PASSWORD

  const [{ value: admins }] = db
    .select({ value: count() })
    .from(tables.users)
    .where(eq(tables.users.role, "admin"))
    .all()

  if (admins === 0) {
    const initial = password ?? "admin"
    db.insert(tables.users)
      .values({ role: "admin", username, passwordHash: hashPassword(initial) })
      .run()
    if (!password) {
      console.warn(
        `[bootstrap] created default admin '${username}' with password 'admin' — set ADMIN_USERNAME/ADMIN_PASSWORD and restart, or change it immediately`
      )
    } else {
      console.log(`[bootstrap] created admin '${username}'`)
    }
  } else if (password) {
    // explicit env credentials always win, so a forgotten password is
    // recoverable by restarting the container with ADMIN_PASSWORD set
    const existing = db
      .select()
      .from(tables.users)
      .where(eq(tables.users.username, username))
      .get()
    if (existing) {
      db.update(tables.users)
        .set({ passwordHash: hashPassword(password) })
        .where(eq(tables.users.id, existing.id))
        .run()
      console.log(`[bootstrap] reset password for admin '${username}'`)
    } else {
      db.insert(tables.users)
        .values({
          role: "admin",
          username,
          passwordHash: hashPassword(password),
        })
        .run()
      console.log(`[bootstrap] created admin '${username}'`)
    }
  }
}
