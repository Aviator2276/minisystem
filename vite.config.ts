import { defineConfig } from "vite"
import type { Plugin, ViteDevServer } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import type * as PublishModuleNs from "./src/server/realtime/publish"
import type * as WsModuleNs from "./src/server/realtime/ws"

type PublishModule = typeof PublishModuleNs
type WsModule = typeof WsModuleNs

const REALTIME_PATH = "/_ws"

// attaches the crossws upgrade handler to Vite's dev HTTP server; production
// uses server/index.mjs, which wires the same adapter onto the srvx server
function realtimeDev(): Plugin {
  return {
    name: "minisystem-realtime-dev",
    configureServer(server: ViteDevServer) {
      // dev-only trigger so the publish path can be exercised headlessly
      server.middlewares.use("/__debug-publish", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        const eventId = url.searchParams.get("eventId") ?? "debug"
        const message = url.searchParams.get("message") ?? "ping"
        server
          .ssrLoadModule("/src/server/realtime/publish.ts")
          .then((mod) => {
            ;(mod as PublishModule).publish(eventId, ["public"], {
              type: "toast",
              message,
              variant: "info",
              durationMs: 3000,
            })
            res.end("ok")
          })
          .catch((error) => {
            res.statusCode = 500
            res.end(String(error))
          })
      })
      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (!req.url?.startsWith(REALTIME_PATH)) return
        server
          .ssrLoadModule("/src/server/realtime/ws.ts")
          .then((mod) =>
            (mod as WsModule).getWsAdapter().handleUpgrade(req, socket, head)
          )
          .catch((error) => {
            console.error("[realtime] upgrade failed", error)
            socket.destroy()
          })
      })
    },
  }
}

// MINISYSTEM_DISABLE_DEVTOOLS opts out of TanStack Devtools (used by headless
// browser tests: the devtools console pipe aborts on navigation, which trips
// the Vite error overlay and blocks clicks)
const withDevtools = !process.env.MINISYSTEM_DISABLE_DEVTOOLS

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    "import.meta.env.MINISYSTEM_DEVTOOLS": JSON.stringify(withDevtools),
  },
  plugins: [
    ...(withDevtools ? [devtools()] : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    realtimeDev(),
  ],
})

export default config
