import {
  LayoutDashboard,
  CalendarDays,
  PiggyBank,
  Users,
  UserCircle2,
  Wrench,
  MapPin,
  FileText,
  Route,
  CheckSquare,
  Clapperboard,
  Music2,
} from 'lucide-react'

export const TUTORIAL_SECTION_IDS = [
  'dashboard',
  'schedule',
  'budget',
  'crew',
  'cast',
  'equipment',
  'locations',
  'call_sheets',
  'movement_orders',
  'tasks',
  'deliverables',
  'music_archive',
] as const

export type TutorialSectionId = (typeof TUTORIAL_SECTION_IDS)[number]

export type TutorialSectionConfig = {
  id: TutorialSectionId
  title: string
  description: string
  route: string
  page: 1 | 2
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

export const TUTORIAL_SECTIONS: TutorialSectionConfig[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'High-level snapshot of your production, tasks, and upcoming shoot days.',
    route: '/',
    page: 1,
    icon: LayoutDashboard,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'Plan shoot days, stripboards, and shot lists in one place.',
    route: '/schedule/calendar',
    page: 1,
    icon: CalendarDays,
  },
  {
    id: 'budget',
    title: 'Budget',
    description: 'Track estimated vs actual spend, float reconciliation, and budget revisions.',
    route: '/budget',
    page: 1,
    icon: PiggyBank,
  },
  {
    id: 'crew',
    title: 'Crew Management',
    description: 'Manage crew roles, bookings, and day-out-of-days.',
    route: '/people/crew-manager',
    page: 1,
    icon: Users,
  },
  {
    id: 'cast',
    title: 'Cast Management',
    description: 'Keep cast details organised and aligned with the schedule.',
    route: '/people/cast-manager',
    page: 1,
    icon: UserCircle2,
  },
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Track equipment, locations, and what’s needed on set.',
    route: '/equipment',
    page: 1,
    icon: Wrench,
  },
  {
    id: 'locations',
    title: 'Locations',
    description: 'Track location status, fees, and practical access notes.',
    route: '/locations',
    page: 2,
    icon: MapPin,
  },
  {
    id: 'call_sheets',
    title: 'Call Sheets',
    description: 'Generate and distribute call sheets by shoot day and unit.',
    route: '/call-sheets',
    page: 2,
    icon: FileText,
  },
  {
    id: 'movement_orders',
    title: 'Movement Orders',
    description: 'Build route-aware movement orders and distribute personalised PDFs.',
    route: '/movement-orders',
    page: 2,
    icon: Route,
  },
  {
    id: 'tasks',
    title: 'Tasks',
    description: 'Organise production tasks with sections, subtasks, and filters.',
    route: '/readiness',
    page: 2,
    icon: CheckSquare,
  },
  {
    id: 'deliverables',
    title: 'Deliverables',
    description: 'Track delivery status, technical specs, and recipient requirements.',
    route: '/deliverables',
    page: 2,
    icon: Clapperboard,
  },
  {
    id: 'music_archive',
    title: 'Music & Archive',
    description: 'Manage track clearance and export cue sheets for delivery records.',
    route: '/music-clearance',
    page: 2,
    icon: Music2,
  },
]

