import type { TutorialFlow } from '../engine/types'

export const movementOrdersFlow: TutorialFlow = {
  sectionId: 'movement_orders',
  title: 'Movement Orders',
  route: '/movement-orders',
  steps: [
    {
      id: 'overview',
      title: 'Movement orders',
      body: 'Movement orders give each person their route between locations for a shoot day. Each one is personalised.',
      instruction: 'Press Next to generate one.',
      requires: { kind: 'view' },
    },
    {
      id: 'generate',
      title: 'Generate a preview',
      body: 'Choose a shoot day and unit, then generate a preview to see the route.',
      instruction: 'Click Generate preview.',
      target: 'movement-generate',
      hint: 'Click the highlighted Generate button.',
      needs: ['shootDay'],
      requires: { kind: 'click' },
    },
  ],
}
