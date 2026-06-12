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

// es-toolkit's `./compat/*` subpath exports are CJS-only (no `import`
// condition), so recharts' `import last from "es-toolkit/compat/last"` pulls
// the CommonJS build. In the minified production bundle Rollup's CJS→ESM
// interop mangles one nested `require` into `var r = r()` (a getter shadowed by
// the local it initializes) — i.e. "r is not a function" — which crashes the
// only route that uses recharts (the team dashboard's radar chart). Dev is
// unaffected because esbuild pre-bundles the dep differently. Redirect these
// flat default imports to the ESM barrel's named export so the whole path stays
// ESM (and tree-shakeable, since es-toolkit is sideEffects:false). Build only —
// dev resolution already works and we don't want to change its optimizeDeps.
function esToolkitCompatEsm(): Plugin {
  const prefix = "es-toolkit/compat/"
  const virtual = "\0es-toolkit-compat:"
  return {
    name: "minisystem-es-toolkit-compat-esm",
    enforce: "pre",
    apply: "build",
    resolveId(id) {
      if (!id.startsWith(prefix)) return null
      const name = id.slice(prefix.length)
      // only flat subpaths like `compat/last`, not `compat/array/last`
      if (name.includes("/")) return null
      return virtual + name
    },
    load(id) {
      if (!id.startsWith(virtual)) return null
      const name = id.slice(virtual.length)
      // cover both default and named import sites
      return `export { ${name}, ${name} as default } from "es-toolkit/compat"`
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
    "import.meta.env.VITE_DEVTOOLS_DISABLED": JSON.stringify(!withDevtools),
  },
  plugins: [
    esToolkitCompatEsm(),
    ...(withDevtools ? [devtools()] : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    realtimeDev(),
  ],
})

export default config
