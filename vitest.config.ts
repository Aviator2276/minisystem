import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "server",
          environment: "node",
          include: [
            "src/{server,games,db,shared}/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
        },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/{components,hooks,routes,lib}/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
})
