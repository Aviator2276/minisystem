import { TanStackDevtools } from "@tanstack/react-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

/**
 * Dev-only devtools. Lives in its own file because @tanstack/devtools-vite
 * surgically removes the <TanStackDevtools> JSX element from production
 * builds — the element must sit directly inside enclosing JSX (here, a
 * fragment) so that removal leaves valid syntax behind. Do not wrap the
 * element in `{condition && ...}`.
 */
export function AppDevtools() {
  // headless browser tests set MINISYSTEM_DISABLE_DEVTOOLS: the devtools
  // console pipe aborts on navigation and trips the Vite error overlay
  if (!import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS_DISABLED) {
    return null
  }
  return (
    <>
      <TanStackDevtools
        config={{
          position: "bottom-right",
        }}
        plugins={[
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
