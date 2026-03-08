import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  DollarSign,
  Calendar,
  Film,
  FileText,
  MapPin,
  Users,
  FileCheck,
  Music,
  Settings,
  FolderOpen,
  Megaphone,
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

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/productions', label: 'Productions', icon: FolderOpen },
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
  {
    to: '/schedule',
    label: 'Schedule',
    icon: Calendar,
    defaultChild: '/schedule/calendar',
    sub: [
      { to: '/schedule/calendar', label: 'Calendar' },
      { to: '/schedule/stripboard', label: 'Stripboard' },
      { to: '/schedule/shots', label: 'Shot Lists' },
      { to: '/schedule/script-import', label: 'Script Import' },
    ],
  },
  {
    to: '/people',
    label: 'People',
    icon: Users,
    defaultChild: '/people/bookings',
    sub: [
      { to: '/people/bookings', label: 'Bookings' },
      { to: '/people/day-out-of-days', label: 'Day Out of Days' },
      { to: '/people/cast-manager', label: 'Cast Manager' },
    ],
  },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/equipment', label: 'Equipment', icon: Film },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/call-sheets', label: 'Call Sheets', icon: Megaphone },
  { to: '/readiness', label: 'Tasks', icon: FileCheck },
  { to: '/deliverables', label: 'Deliverables', icon: FileCheck },
  { to: '/music-clearance', label: 'Music & Archive', icon: Music },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function isNavGroup(item: NavItem): item is NavItem & { defaultChild: string; sub: NavSubItem[] } {
  return 'sub' in item && Array.isArray(item.sub)
}
