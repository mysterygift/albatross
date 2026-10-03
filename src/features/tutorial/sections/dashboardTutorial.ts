import type { TutorialFlow } from '../engine/types'

export const dashboardFlow: TutorialFlow = {
  sectionId: 'dashboard',
  title: 'Dashboard',
  route: '/',
  steps: [
    {
      id: 'overview',
      title: 'Welcome to your tutorial project',
      body: 'The Dashboard is where you see where the production stands. This is your own Tutorial project: everything you create here stays with it.',
      instruction: 'Press Next to look around the Dashboard.',
      requires: { kind: 'view' },
    },
    {
      id: 'checklist',
      title: 'Setup checklist',
      body: 'The checklist shows the first things to set up. Items tick off as you complete them.',
      instruction: 'The checklist is highlighted. Press Next when you have read it.',
      target: 'dashboard-checklist',
      optional: true,
      requires: { kind: 'view' },
    },
    {
      id: 'tasks',
      title: 'Tasks due soon',
      body: 'Upcoming tasks appear here so nothing slips. You will add some later in the Tasks section.',
      instruction: 'The tasks card is highlighted. Press Next to continue.',
      target: 'dashboard-tasks',
      optional: true,
      requires: { kind: 'view' },
    },
  ],
}
