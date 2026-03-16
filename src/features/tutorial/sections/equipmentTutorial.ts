import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const equipmentTutorialSteps: TutorialStep[] = [
  {
    id: 'equipment-overview',
    title: 'Equipment overview',
    body: `Equipment is where you review and organise the kit your production needs — what exists, what’s planned, and what’s required on set.`,
  },
  {
    id: 'records-and-lists',
    title: 'Equipment records and lists',
    body: `Use the Registry to browse individual equipment records (category, source, status, vendor, dates).\n\nYou can also use Equipment Lists to build shoot-day or department kits. This demo production includes seeded data — feel free to explore it.`,
  },
  {
    id: 'why-it-matters',
    title: 'Why equipment matters elsewhere',
    body: `Good kit planning connects to real workflows later — rentals, purchases, vendors, and production logistics.\n\nIt also supports operational readiness: what’s needed, what’s missing, and what needs to move when.`,
  },
  {
    id: 'explore-demo-data',
    title: 'Explore the demo data',
    body: `A few things to inspect:\n- scan the Registry and open/edit a record (without saving) to see the fields\n- try filters/search to spot gaps or patterns\n- open Equipment Lists and check how items are grouped for a kit or shoot day`,
  },
  {
    id: 'completion',
    title: 'Completion',
    body: `That’s it for Equipment. You can return to Tutorial Home at any time — or keep exploring the app freely.`,
  },
]

