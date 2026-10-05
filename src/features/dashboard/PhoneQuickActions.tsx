import { Link } from 'react-router-dom'
import { Clapperboard, LayoutList, Megaphone, Receipt, Route, Users, type LucideIcon } from 'lucide-react'

import { useIsPhone } from '@/hooks/use-is-phone'
import { useShowExperimental } from '@/hooks/useShowExperimental'
import { isMobilePlatform } from '@/lib/platform'

type QuickAction = { to: string; label: string; icon: LucideIcon; experimental?: boolean }

/** What people reach for on a phone during a shoot day; everything else is in the tab bar or More. */
const ACTIONS: QuickAction[] = [
  { to: '/call-sheets', label: 'Call sheet', icon: Megaphone },
  { to: '/schedule/stripboard', label: 'Stripboard', icon: LayoutList },
  { to: '/movement-orders', label: 'Movement order', icon: Route },
  { to: '/people/crew-manager', label: 'Crew contacts', icon: Users },
  { to: '/schedule/script-supervisor', label: 'Script supervisor', icon: Clapperboard, experimental: true },
  { to: '/budget/receipt-capture', label: 'Log a receipt', icon: Receipt, experimental: true },
]

/**
 * iPhone dashboard shortcuts: large targets for the on-set pages, which on desktop sit several levels
 * deep in the sidebar. Experimental pages appear only when experimental features are switched on.
 */
export function PhoneQuickActions() {
  const isPhone = useIsPhone()
  const { showExperimental } = useShowExperimental()
  if (!isPhone || !isMobilePlatform()) return null

  const actions = ACTIONS.filter((a) => showExperimental || !a.experimental)
  return (
    <nav aria-label="On set" className="grid grid-cols-2 gap-2">
      {actions.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium active:bg-muted/60"
        >
          <Icon className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 leading-tight">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
