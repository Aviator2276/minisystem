import { Link } from "@tanstack/react-router"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  MoreHorizontalIcon,
  TrophyIcon,
  ListChecksIcon,
  BarChart3Icon,
  UsersIcon,
} from "lucide-react"

export function NavEvents({
  events,
}: {
  events: {
    id: string
    slug: string
    name: string
    status: string
  }[]
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Events</SidebarGroupLabel>
      <SidebarMenu>
        {events.map((event) => (
          <SidebarMenuItem key={event.id}>
            <SidebarMenuButton asChild>
              <Link
                to="/admin/events/$eventSlug"
                params={{ eventSlug: event.slug }}
              >
                <TrophyIcon />
                <span>{event.name}</span>
                <Badge variant="outline" className="ml-auto text-[0.6rem]">
                  {event.status.replace("_", " ")}
                </Badge>
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="rounded-none data-[state=open]:bg-accent"
                >
                  <MoreHorizontalIcon />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-36"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem asChild>
                  <Link
                    to="/admin/events/$eventSlug"
                    params={{ eventSlug: event.slug }}
                  >
                    <UsersIcon />
                    <span>Roster</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/admin/events/$eventSlug/matches"
                    params={{ eventSlug: event.slug }}
                  >
                    <ListChecksIcon />
                    <span>Matches</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/admin/events/$eventSlug/rankings"
                    params={{ eventSlug: event.slug }}
                  >
                    <BarChart3Icon />
                    <span>Rankings</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {events.length === 0 && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="text-sidebar-foreground/70">
              <Link to="/admin/events">
                <MoreHorizontalIcon className="text-sidebar-foreground/70" />
                <span>No events yet</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
