import { useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { logout } from "@/server/functions/auth"
import { LogOutIcon } from "lucide-react"

export function SiteHeader({ title = "Dashboard" }: { title?: string }) {
  const router = useRouter()
  const logoutFn = useServerFn(logout)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            title="Log out"
            onClick={async () => {
              await logoutFn()
              await router.navigate({ to: "/login" })
            }}
          >
            <LogOutIcon className="size-4" />
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
