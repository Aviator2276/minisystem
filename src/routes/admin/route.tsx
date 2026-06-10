import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/server/functions/auth"
import { listEvents } from "@/server/functions/events"

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user || user.role !== "admin") throw redirect({ to: "/login" })
    return { user }
  },
  loader: () => listEvents(),
  component: AdminLayout,
})

function AdminLayout() {
  const { user } = Route.useRouteContext()
  const events = Route.useLoaderData()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" events={events} user={user} />
      <SidebarInset>
        <SiteHeader title="MiniSystem" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
            <div className="px-4 lg:px-6">
              <Outlet />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
