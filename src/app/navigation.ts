import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  DollarSign,
  Calendar,
  Film,
  FileText,
  MapPin,
  Users,
  CheckSquare,
  PackageCheck,
  ScrollText,
  Music,
  Settings,
  FolderOpen,
  Megaphone,
  Route,
  ShieldAlert,
} from 'lucide-react'

export type NavSubItem = { to: string; label: string }

export type NavItem =
  | { to: string; label: string; icon: LucideIcon }
  | {
      to: string
      label: string
      icon: LucideIcon
      defaultChild: string
      sub: NavSubItem[]
    }

export type NavGroup = { id: string; label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    id: 'top',
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/productions', label: 'Productions', icon: FolderOpen },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    items: [
      {
        to: '/schedule',
        label: 'Schedule',
        icon: Calendar,
        defaultChild: '/schedule/calendar',
        sub: [
          { to: '/schedule/calendar', label: 'Calendar' },
          { to: '/schedule/stripboard', label: 'Stripboard' },
          { to: '/schedule/shots', label: 'Shot Lists' },
          { to: '/schedule/storyboard', label: 'Storyboard' },
        ],
      },
      {
        // Script routes intentionally stay under /schedule/script-* (menu bridge depends on them).
        to: '/schedule/script-import',
        label: 'Script',
        icon: ScrollText,
        defaultChild: '/schedule/script-import',
        sub: [
          { to: '/schedule/script-import', label: 'Script Import' },
          { to: '/schedule/script-sections', label: 'Script Sections' },
          { to: '/schedule/script-supervisor', label: 'Script Supervisor' },
        ],
      },
      { to: '/locations', label: 'Locations', icon: MapPin },
      { to: '/equipment', label: 'Equipment', icon: Film },
      { to: '/risk-assessments', label: 'Risk Assessments', icon: ShieldAlert },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        to: '/people',
        label: 'People',
        icon: Users,
        defaultChild: '/people/cast-manager',
        sub: [
          { to: '/people/cast-manager', label: 'Cast Manager' },
          { to: '/people/crew-manager', label: 'Crew Manager' },
          { to: '/people/bookings', label: 'Bookings' },
          { to: '/people/day-out-of-days', label: 'Day Out of Days' },
        ],
      },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      {
        to: '/budget',
        label: 'Budget',
        icon: DollarSign,
        defaultChild: '/budget',
        sub: [
          { to: '/budget', label: 'Budget' },
          { to: '/budget/vendors', label: 'Vendors' },
        ],
      },
    ],
  },
  {
    id: 'deliver',
    label: 'Deliver',
    items: [
      { to: '/call-sheets', label: 'Call Sheets', icon: Megaphone },
      { to: '/movement-orders', label: 'Movement Orders', icon: Route },
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/deliverables', label: 'Deliverables', icon: PackageCheck },
      { to: '/music-clearance', label: 'Music & Archive', icon: Music },
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    items: [{ to: '/tasks', label: 'Tasks', icon: CheckSquare }],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

export const navItems: NavItem[] = navGroups.flatMap((g) => g.items)

export function isNavGroup(item: NavItem): item is NavItem & { defaultChild: string; sub: NavSubItem[] } {
  return 'sub' in item && Array.isArray(item.sub)
}

export type NavTrail = {
  group: NavGroup
  item: NavItem
  sub?: NavSubItem
  /** True when the pathname is a nested/detail route of the matched entry rather than the entry itself. */
  isDetail: boolean
}

function pathMatches(pathname: string, base: string): boolean {
  if (base === '/') return pathname === '/'
  return pathname === base || pathname.startsWith(base + '/')
}

/**
 * Longest-prefix match of a pathname against the nav tree. Detail routes fall back to the nearest parent.
 */
export function findNavTrail(pathname: string): NavTrail | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let best: { len: number; trail: NavTrail } | null = null
  for (const group of navGroups) {
    for (const item of group.items) {
      const consider = (base: string, sub?: NavSubItem) => {
        if (!pathMatches(clean, base)) return
        if (best && base.length < best.len) return
        best = { len: base.length, trail: { group, item, sub, isDetail: clean !== base } }
      }
      consider(item.to)
      if (isNavGroup(item)) for (const s of item.sub) consider(s.to, s)
    }
  }
  return best ? (best as { trail: NavTrail }).trail : null
}
