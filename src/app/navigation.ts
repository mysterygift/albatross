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
  BookOpen,
} from 'lucide-react'

/**
 * `experimental` entries are hidden from the sidebar and search unless Settings → Developer →
 * "Show experimental features" is on. Their routes stay registered, so links still work.
 */
export type NavSubItem = { to: string; label: string; experimental?: boolean }

export type NavItem =
  | { to: string; label: string; icon: LucideIcon; experimental?: boolean }
  | {
      to: string
      label: string
      icon: LucideIcon
      defaultChild: string
      sub: NavSubItem[]
      experimental?: boolean
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
          { to: '/schedule/script-breakdown', label: 'Script Breakdown' },
          { to: '/schedule/script-supervisor', label: 'Script Supervisor', experimental: true },
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
          { to: '/people/overtime', label: 'Overtime', experimental: true },
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
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/guidebook', label: 'Guidebook', icon: BookOpen },
    ],
  },
]

export const navItems: NavItem[] = navGroups.flatMap((g) => g.items)

/**
 * The nav tree as shown to the user: with `showExperimental` off, experimental items and sub-items
 * are removed, as are groups left empty. A parent whose default child is hidden falls back to its
 * first visible sub-item.
 */
export function visibleNavGroups(showExperimental: boolean, groups: NavGroup[] = navGroups): NavGroup[] {
  if (showExperimental) return groups
  const out: NavGroup[] = []
  for (const group of groups) {
    const items: NavItem[] = []
    for (const item of group.items) {
      if (item.experimental) continue
      if (!isNavGroup(item)) {
        items.push(item)
        continue
      }
      const sub = item.sub.filter((s) => !s.experimental)
      if (sub.length === 0) continue
      const defaultChild = sub.some((s) => s.to === item.defaultChild) ? item.defaultChild : sub[0]!.to
      items.push({ ...item, sub, defaultChild })
    }
    if (items.length > 0) out.push({ ...group, items })
  }
  return out
}

export function isNavGroup(item: NavItem): item is NavItem & { defaultChild: string; sub: NavSubItem[] } {
  return 'sub' in item && Array.isArray(item.sub)
}

/** Labels of every nav entry marked experimental, e.g. "People: Overtime". */
export function experimentalNavLabels(groups: NavGroup[] = navGroups): string[] {
  const out: string[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (item.experimental) out.push(item.label)
      if (isNavGroup(item)) {
        for (const sub of item.sub) if (sub.experimental) out.push(`${item.label}: ${sub.label}`)
      }
    }
  }
  return out
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
