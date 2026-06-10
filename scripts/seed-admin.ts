import { eq } from "drizzle-orm"
import { db, tables } from "../src/db"
import { hashPassword } from "../src/server/auth/password"

const username = process.env.ADMIN_USERNAME ?? "admin"
const password = process.env.ADMIN_PASSWORD ?? "admin"

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
  console.log(`reset password for admin '${username}'`)
} else {
  db.insert(tables.users)
    .values({ role: "admin", username, passwordHash: hashPassword(password) })
    .run()
  console.log(`created admin '${username}'`)
}
