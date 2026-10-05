import { NavLink, useLocation } from 'react-router-dom'
import { findNavTrail, isNavGroup } from '@/app/navigation'
import { useShowExperimental } from '@/hooks/useShowExperimental'
import { cn } from '@/lib/utils'

export function SectionTabs() {
  const { pathname } = useLocation()
  const { showExperimental } = useShowExperimental()
  const trail = findNavTrail(pathname)
  if (!trail || trail.isDetail || !isNavGroup(trail.item)) return null
  const { item } = trail
  // Experimental tabs follow the sidebar toggle; the one being viewed stays so a direct link isn't orphaned.
  const tabs = item.sub.filter((s) => showExperimental || !s.experimental || s.to === trail.sub?.to)
  if (tabs.length < 2) return null

  return (
    <nav
      aria-label={`${item.label} sections`}
      data-slot="section-tabs"
      className="flex shrink-0 gap-1 border-b px-4 pt-2"
    >
      {tabs.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end
          className={({ isActive }) =>
            cn(
              '-mb-px rounded-t-md border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-ring px-3 py-1.5 text-sm font-medium transition-colors',
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
