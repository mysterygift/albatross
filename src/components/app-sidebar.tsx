import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navItems, isNavGroup } from '@/app/navigation'

export function AppSidebar() {
  const location = useLocation()
  const pathname = location.pathname

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="font-semibold text-sidebar-foreground">Albatross</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                if (isNavGroup(item)) {
                  const isExpanded = pathname === item.to || pathname.startsWith(item.to + '/')
                  const isParentActive = item.sub.some((s) => s.to === pathname) || pathname === item.to
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isParentActive}>
                        <NavLink
                          to={item.to}
                          aria-expanded={isExpanded}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 pr-1',
                              (isActive || isParentActive) && 'data-[active=true]'
                            )
                          }
                        >
                          <item.icon className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <ChevronRight
                            className={cn(
                              'size-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-200 ease-out',
                              'group-hover/menu-item:text-mint-600 group-data-[active=true]/menu-button:text-mint-500',
                              isExpanded && 'rotate-90'
                            )}
                            aria-hidden
                          />
                        </NavLink>
                      </SidebarMenuButton>
                      <div
                        className={cn(
                          'grid transition-[grid-template-rows] duration-200 ease-out',
                          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        )}
                        aria-hidden
                      >
                        <div className="overflow-hidden">
                          <SidebarMenuSub>
                            {item.sub.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.to}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === subItem.to}
                                  className={cn(
                                    pathname === subItem.to &&
                                      'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                  )}
                                >
                                  <NavLink
                                    to={subItem.to}
                                    className={({ isActive }) =>
                                      cn(
                                        'flex items-center gap-2',
                                        isActive &&
                                          'bg-sidebar-accent text-sidebar-accent-foreground data-[active=true]'
                                      )
                                    }
                                  >
                                    <span>{subItem.label}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </div>
                      </div>
                    </SidebarMenuItem>
                  )
                }
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2',
                            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                          )
                        }
                      >
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}
