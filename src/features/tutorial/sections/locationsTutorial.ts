import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const locationsTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Locations overview',
    body: [
      'Locations is your one-stop shop for all locations planning.',
      '',
      'Use it to keep each location profile in one place, including status, costs, and practical notes used by scheduling and movement workflows.',
    ].join('\n'),
  },
  {
    id: 'location-records',
    title: 'Building complete location records',
    body: [
      'Each location can include address, what3words, parking information, availability constraints, and notes.',
      '', 
      'Capture these details early so departments work from a single source of truth during prep and shoot.',
    ].join('\n'),
  },
  {
    id: 'status-and-costs',
    title: 'Status and fees',
    body: [
      'Track booked status from unbooked through hold/booked/wrap so the team sees current readiness.',
      '',
      'Permit and location fees give production and finance a quick view of location-related costs.',
    ].join('\n'),
  },
  {
    id: 'next-actions',
    title: 'What to explore next',
    body: [
      'Open a few seeded location records and review their notes and fee fields.',
      '',
      'Then continue into Call Sheets and Movement Orders to see how location data drives daily documents.',
    ].join('\n'),
  },
]
