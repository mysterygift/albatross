import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, HelpCircle, Search } from 'lucide-react'
import { findNavTrail, isNavGroup } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import { ProductionSwitcher } from '@/components/production-switcher'
import { SidebarTrigger } from '@/components/ui/sidebar'

type TopBarProps = {
  onOpenTutorial?: () => void
  onOpenSearch?: () => void
}

type Crumb = { label: string; to?: string }

function Breadcrumbs() {
  const { pathname } = useLocation()
  const trail = findNavTrail(pathname)
  if (!trail) return null
  const crumbs: Crumb[] = []
  if (trail.group.label && trail.group.label !== trail.item.label) crumbs.push({ label: trail.group.label })
  crumbs.push({ label: trail.item.label, to: isNavGroup(trail.item) ? trail.item.defaultChild : trail.item.to })
  // Detail routes show the parent crumb only; the page header carries the name.
  if (trail.sub && !trail.isDetail && trail.sub.label !== trail.item.label) {
    crumbs.push({ label: trail.sub.label })
  }
  const lastIndex = crumbs.length - 1
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, i) => {
          const isLast = i === lastIndex && !trail.isDetail
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
              <li className="truncate">
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {crumb.label}
                  </span>
                ) : crumb.to ? (
                  <Link to={crumb.to} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

export function TopBar({ onOpenTutorial, onOpenSearch }: TopBarProps) {
  return (
    <header data-slot="top-bar" className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <ProductionSwitcher />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onOpenSearch?.()
          }}
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onOpenTutorial?.()
          }}
          aria-label="Open tutorial"
        >
          <HelpCircle className="size-4" />
        </Button>
      </div>
    </header>
  )
}
