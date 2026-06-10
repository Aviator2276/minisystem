import { createMiddleware } from "@tanstack/react-start"
import { getCookie, setResponseStatus } from "@tanstack/react-start/server"
import { SESSION_COOKIE, getSessionUser } from "./session"
import type { SessionUser } from "./session"

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message)
  }
}

export const authMiddleware = createMiddleware({ type: "function" }).server(
  ({ next }) => {
    const user = getSessionUser(getCookie(SESSION_COOKIE))
    return next({ context: { user } })
  }
)

function require(check: (user: SessionUser) => boolean) {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(({ next, context }) => {
      if (!context.user || !check(context.user)) {
        setResponseStatus(401)
        throw new UnauthorizedError()
      }
      return next({ context: { user: context.user } })
    })
}

export const requireUser = require(() => true)
export const requireAdmin = require((user) => user.role === "admin")
