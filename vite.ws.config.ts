import { defineConfig } from "vite"

// builds the standalone realtime bundle imported by server/index.mjs;
// node_modules stay external (the app deploys with its node_modules)
export default defineConfig({
  resolve: { tsconfigPaths: true },
  publicDir: false,
  build: {
    ssr: true,
    target: "node22",
    outDir: "dist/ws",
    emptyOutDir: true,
    lib: {
      entry: "src/server/realtime/bundle-entry.ts",
      formats: ["es"],
      fileName: () => "ws.mjs",
    },
  },
})
