import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { ChevronRight } from 'lucide-react'
import { AlbatrossLogo } from '@/components/AlbatrossLogo'
import { cn } from '@/lib/utils'
import { navGroups, isNavGroup, findNavTrail } from '@/app/navigation'
import { getCommandAccelerator, labelWithShortcut, navCommandIdByPath } from '@/app/menuSchema'

function navTooltip(label: string, path: string): string {
  const id = navCommandIdByPath[path]
  return labelWithShortcut(label, id ? getCommandAccelerator(id) : undefined)
}

const STORAGE_KEY = 'albatross.sidebar.groups'

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>
    }
  } catch {
    // ignore unreadable storage
  }
  return {}
}

function saveExpanded(value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore unavailable storage
  }
}

export function AppSidebar() {
  const location = useLocation()
  const pathname = location.pathname
  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded)

  const activeItemTo = findNavTrail(pathname)?.item.to

  // Auto-open the group containing the current route when the route changes
  // (adjusting state during render, keyed on the active item).
  const [lastActiveItem, setLastActiveItem] = useState<string | undefined>(undefined)
  if (activeItemTo !== lastActiveItem) {
    setLastActiveItem(activeItemTo)
    if (activeItemTo && !expanded[activeItemTo]) {
      const next = { ...expanded, [activeItemTo]: true }
      saveExpanded(next)
      setExpanded(next)
    }
  }

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveExpanded(next)
      return next
    })
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <AlbatrossLogo className="size-6" />
          <span className="font-semibold text-sidebar-foreground">Albatross</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.id}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (isNavGroup(item)) {
                    const isOpen = Boolean(expanded[item.to])
                    const isParentActive = activeItemTo === item.to
                    const submenuId = `sidebar-sub-${group.id}-${item.label.toLowerCase().replace(/\s+/g, '-')}`
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isParentActive} tooltip={navTooltip(item.label, item.to)}>
                          <NavLink to={item.defaultChild} className="flex items-center gap-2 pr-7">
                            <item.icon className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          type="button"
                          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label}`}
                          aria-expanded={isOpen}
                          aria-controls={submenuId}
                          onClick={() => toggle(item.to)}
                        >
                          <ChevronRight
                            className={cn(
                              'text-sidebar-foreground/60 transition-transform duration-200 ease-out',
                              isOpen && 'rotate-90'
                            )}
                            aria-hidden
                          />
                        </SidebarMenuAction>
                        <div
                          id={submenuId}
                          className={cn(
                            'grid transition-[grid-template-rows] duration-200 ease-out',
                            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          )}
                          inert={!isOpen}
                        >
                          <div className="overflow-hidden">
                            <SidebarMenuSub>
                              {item.sub.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.to}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isParentActive && findNavTrail(pathname)?.sub?.to === subItem.to}
                                  >
                                    <NavLink to={subItem.to} end className="flex items-center gap-2">
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
                      <SidebarMenuButton
                        asChild
                        isActive={activeItemTo === item.to}
                        tooltip={navTooltip(item.label, item.to)}
                      >
                        <NavLink to={item.to} end={item.to === '/'} className="flex items-center gap-2">
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
        ))}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}
