import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { Button } from "@/components/ui/button"
import { getCurrentUser, logout } from "@/server/functions/auth"

export const Route = createFileRoute("/team")({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user || user.role !== "team") throw redirect({ to: "/login" })
    return { user }
  },
  component: TeamLayout,
})

function TeamLayout() {
  const router = useRouter()
  const logoutFn = useServerFn(logout)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium">MiniSystem — Team</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logoutFn()
            await router.navigate({ to: "/login" })
          }}
        >
          Log out
        </Button>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
