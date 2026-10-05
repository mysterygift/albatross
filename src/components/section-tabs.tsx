import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { findNavTrail, isNavGroup } from '@/app/navigation'
import { useShowExperimental } from '@/hooks/useShowExperimental'
import { cn } from '@/lib/utils'

export function SectionTabs() {
  const { pathname } = useLocation()
  const { showExperimental } = useShowExperimental()
  const trail = findNavTrail(pathname)
  const navRef = useRef<HTMLElement>(null)
  // On a phone the strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])
  if (!trail || trail.isDetail || !isNavGroup(trail.item)) return null
  const { item } = trail
  // Experimental tabs follow the sidebar toggle; the one being viewed stays so a direct link isn't orphaned.
  const tabs = item.sub.filter((s) => showExperimental || !s.experimental || s.to === trail.sub?.to)
  if (tabs.length < 2) return null

  return (
    <nav
      ref={navRef}
      aria-label={`${item.label} sections`}
      data-slot="section-tabs"
      className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b px-3 pt-2 sm:px-4"
    >
      {tabs.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end
          className={({ isActive }) =>
            cn(
              '-mb-px shrink-0 whitespace-nowrap rounded-t-md border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-ring px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}
