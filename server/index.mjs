// production entry: srvx serves the TanStack Start fetch handler + static
// client assets; the crossws upgrade handler is attached to the underlying
// Node HTTP server for /_ws.
import { serve } from "srvx/node"
import { serveStatic } from "srvx/static"
import entry from "../dist/server/server.js"
import { REALTIME_PATH, getWsAdapter, publish } from "../dist/ws/bundle-entry.js"

const port = Number(process.env.PORT ?? 3000)
const debugRealtime = process.env.DEBUG_REALTIME === "1"

const server = serve({
  port,
  middleware: [serveStatic({ dir: "dist/client" })],
  fetch(request) {
    if (debugRealtime) {
      const url = new URL(request.url)
      if (url.pathname === "/__debug-publish") {
        publish(url.searchParams.get("eventId") ?? "debug", [url.searchParams.get("channel") ?? "public"], {
          type: "toast",
          message: url.searchParams.get("message") ?? "ping",
          variant: "info",
          durationMs: 3000,
        })
        return new Response("ok")
      }
    }
    return entry.fetch(request)
  },
})

await server.ready()

const adapter = getWsAdapter()
server.node.server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith(REALTIME_PATH)) adapter.handleUpgrade(req, socket, head)
  else socket.destroy()
})

console.log(`MiniSystem listening on ${server.url ?? `http://localhost:${port}`}`)
