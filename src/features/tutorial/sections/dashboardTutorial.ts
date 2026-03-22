import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const dashboardTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Dashboard overview',
    body: [
      'The Dashboard is your starting point for understanding where the current production stands.',
      '',
      'From here you can see required items, upcoming shoot days, budget health, tasks, and key risk areas at a glance.',
    ].join('\n'),
  },
  {
    id: 'production-context',
    title: 'Current production context',
    body: [
      'Albatross always works inside the selected production.',
      '',
      'For onboarding, a demo production is provided so you can explore safely without affecting real data. You can change productions from the Productions area whenever you are ready.',
    ].join('\n'),
  },
  {
    id: 'key-workflows',
    title: 'Key workflows from the Dashboard',
    body: [
      'Use the cards on this page to jump into core workflows:',
      '',
      '• Schedule – explore stripboards and next shoot days.',
      '• Budget – review estimated vs actual spend and vendor finance.',
      '• Crew / Cast – manage people and bookings.',
      '• Equipment – track what you need on set.',
    ].join('\n'),
  },
  {
    id: 'completion',
    title: 'Next steps',
    body: [
      'You have seen how the Dashboard ties your production together.',
      '',
      'When you are ready, head back to the Tutorial Home to explore Schedule, Budget, Crew Management, Cast Management, or Equipment at your own pace.',
    ].join('\n'),
  },
]

