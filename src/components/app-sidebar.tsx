import * as React from "react"
import { Link } from "@tanstack/react-router"

import { NavEvents } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  TrophyIcon,
  UsersIcon,
  RadioIcon,
  ZapIcon,
} from "lucide-react"

const navMain = [
  {
    title: "Dashboard",
    url: "/admin",
    exact: true,
    icon: <LayoutDashboardIcon />,
  },
  { title: "Events", url: "/admin/events", icon: <TrophyIcon /> },
  { title: "Teams", url: "/admin/teams", icon: <UsersIcon /> },
]

const navSecondary = [
  { title: "Realtime debug", url: "/debug-realtime", icon: <RadioIcon /> },
]

export function AppSidebar({
  events,
  user,
  ...props
}: {
  events: { id: string; name: string; status: string }[]
  user: { username: string; role: string }
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link to="/admin">
                <ZapIcon className="size-5!" />
                <span className="text-base font-semibold">MiniSystem</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavEvents events={events} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
