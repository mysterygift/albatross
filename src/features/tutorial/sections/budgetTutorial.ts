import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const budgetTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Budget overview',
    body: [
      'The Budget page manages the financial plan for your production.',
      '',
      'Here you work with accounts, line items (planned costs), and expenses (actual spend) using the seeded demo production as a safe sandbox.',
    ].join('\n'),
  },
  {
    id: 'line-items-vs-expenses',
    title: 'Line items vs expenses',
    body: [
      'Line items represent the budgeted estimate for a piece of work or cost.',
      '',
      'Expenses are the actual transactions recorded during the production. The demo budget already contains example line items and expenses so you can see how they relate.',
    ].join('\n'),
  },
  {
    id: 'explore-structure',
    title: 'Exploring the budget structure',
    body: [
      'Use the budget view to expand accounts, inspect line items, and open expense details.',
      '',
      'As you browse, compare estimated vs actual values to get a feel for how the demo production is tracking against its plan.',
    ].join('\n'),
  },
  {
    id: 'actualisation',
    title: 'Actualisation and matching spend',
    body: [
      'Albatross supports matching expenses to line items so you can reconcile budget vs actual spend.',
      '',
      'The demo data includes examples you can inspect; later you can use the actualisation workflow to connect real expenses to their budget lines.',
    ].join('\n'),
  },
  {
    id: 'completion',
    title: 'Next steps',
    body: [
      'Take a moment to explore the seeded budget: expand a few accounts, open line items, and look at their related expenses.',
      '',
      'When you are ready, head back to the Tutorial Home to continue with Crew, Cast, or Equipment tutorials at your own pace.',
    ].join('\n'),
  },
]

