import type { TutorialFlow } from '../engine/types'

export const budgetFlow: TutorialFlow = {
  sectionId: 'budget',
  title: 'Budget',
  route: '/budget',
  steps: [
    {
      id: 'overview',
      title: 'The budget plan',
      body: 'Line items are your estimates. Expenses are what you actually spend. Comparing the two shows where the production is tracking.',
      instruction: 'Press Next to open the budget.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-line-item',
      title: 'Add a line item',
      body: 'Every estimate is a line item within an account.',
      instruction: 'Expand an account, then click Add line item on it.',
      target: 'budget-add-line-item',
      hint: 'Expand an account in the budget, then click Add line item on it.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-line-item',
      title: 'Save the estimate',
      body: 'Give the item a description and an amount, then save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'budget.item_created' },
      hint: 'Save the line item in the open dialog to continue.',
    },
  ],
}
