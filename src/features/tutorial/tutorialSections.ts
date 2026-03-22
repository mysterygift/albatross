import { LayoutDashboard, CalendarDays, PiggyBank, Users, UserCircle2, Wrench } from 'lucide-react'

export const TUTORIAL_SECTION_IDS = ['dashboard', 'schedule', 'budget', 'crew', 'cast', 'equipment'] as const

export type TutorialSectionId = (typeof TUTORIAL_SECTION_IDS)[number]

export type TutorialSectionConfig = {
  id: TutorialSectionId
  title: string
  description: string
  route: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

export const TUTORIAL_SECTIONS: TutorialSectionConfig[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'High-level snapshot of your production, tasks, and upcoming shoot days.',
    route: '/',
    icon: LayoutDashboard,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'Plan shoot days, stripboards, and shot lists in one place.',
    route: '/schedule/calendar',
    icon: CalendarDays,
  },
  {
    id: 'budget',
    title: 'Budget',
    description: 'Track estimated vs actual spend and vendor finance risk.',
    route: '/budget',
    icon: PiggyBank,
  },
  {
    id: 'crew',
    title: 'Crew Management',
    description: 'Manage crew roles, bookings, and day-out-of-days.',
    route: '/people/crew-manager',
    icon: Users,
  },
  {
    id: 'cast',
    title: 'Cast Management',
    description: 'Keep cast details organised and aligned with the schedule.',
    route: '/people/cast-manager',
    icon: UserCircle2,
  },
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Track equipment, locations, and what’s needed on set.',
    route: '/equipment',
    icon: Wrench,
  },
]

