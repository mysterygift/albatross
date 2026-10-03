import type { TutorialFlow } from '../engine/types'

export const budgetFlow: TutorialFlow = {
  sectionId: 'budget',
  title: 'Budget',
  route: '/budget',
  steps: [
    {
      id: 'overview',
      title: 'The budget plan',
      body: 'Line items are your estimates. Expenses are what you actually spend. Comparing the two shows where the production is tracking. Your tutorial project starts with a few estimates and a deposit so you can see how they fit together.',
      instruction: 'Press Next to look at the budget.',
      requires: { kind: 'view' },
    },
    {
      id: 'explore',
      title: 'Read the estimates',
      body: 'Each account groups related costs. The writer fees, director fee and lead cast estimates were added for you.',
      instruction: 'Expand the Writer Fees, Director Fee or Lead Cast account to see its line items. Press Next when you have looked.',
      requires: { kind: 'view' },
      optional: true,
      passthrough: true,
    },
    {
      id: 'add-line-item',
      title: 'Add a line item',
      body: 'Every estimate is a line item within an account.',
      instruction: 'Expand an account group, then click the + Add line item button on one of its accounts.',
      passthrough: true,
      target: 'budget-add-line-item',
      hint: 'Click one of the highlighted + Add line item buttons. Expand an account group first if none are showing.',
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
    {
      id: 'compare',
      title: 'Estimate against actual',
      body: 'The deposit you saw is an expense. Once spend is recorded against a line item, the budget shows how much of each estimate is used.',
      instruction: 'Press Finish to continue with the next section.',
      requires: { kind: 'view' },
    },
  ],
}
