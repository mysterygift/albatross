import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const scheduleTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Schedule overview',
    body: [
      'The Schedule is where you review the production timeline and shoot structure.',
      '',
      'Use it to see how shoot days, scenes, and work are laid out across the life of the production.',
    ].join('\n'),
  },
  {
    id: 'shoot-days',
    title: 'Shoot days and structure',
    body: [
      'The demo production includes seeded shoot days and activity so you can explore safely.',
      '',
      'Scroll the calendar to see how work is distributed across days, and open a day to review its call, runtime, and location details.',
    ].join('\n'),
  },
  {
    id: 'relationships',
    title: 'How schedule feeds other workflows',
    body: [
      'The schedule connects into other areas of Albatross:',
      '',
      '• People bookings and day‑out‑of‑days.',
      '• Budgeting and labour planning.',
      '• Production readiness and wrap checks later on.',
    ].join('\n'),
  },
  {
    id: 'explore-next',
    title: 'What to explore next',
    body: [
      'Take a moment to inspect the seeded schedule and open a few days.',
      '',
      'Then, when you are ready, continue into Budget or People to see how schedule choices flow into costs and crew/cast planning.',
    ].join('\n'),
  },
]

