import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { publish } from "@/server/realtime/publish"
import { debugRateLimit } from "@/server/rate-limit/middleware"

// throwaway helper for the /debug-realtime panel; publishes to the public
// channel so the round-trip can be tested without auth — strictly rate
// limited since anyone can reach it
export const debugPublish = createServerFn({ method: "POST" })
  .middleware([debugRateLimit])
  .validator(z.object({ eventId: z.string(), message: z.string() }))
  .handler(({ data }) => {
    publish(data.eventId, ["public"], {
      type: "toast",
      message: data.message,
      variant: "info",
      durationMs: 3000,
    })
    return { publishedAt: Date.now() }
  })
