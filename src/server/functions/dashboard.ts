import { createServerFn } from "@tanstack/react-start"
import { db } from "@/db"
import { requireAdmin } from "@/server/auth/middleware"
import * as dashboard from "@/server/services/dashboard"

export const getAdminDashboard = createServerFn()
  .middleware([requireAdmin])
  .handler(() => dashboard.getAdminDashboard(db))
