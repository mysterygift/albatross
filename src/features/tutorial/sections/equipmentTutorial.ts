import type { TutorialFlow } from '../engine/types'

export const equipmentFlow: TutorialFlow = {
  sectionId: 'equipment',
  title: 'Equipment',
  route: '/equipment',
  steps: [
    {
      id: 'overview',
      title: 'Equipment',
      body: 'The equipment registry lists the kit you own or hire. Equipment lists then group it for a shoot day or department.',
      instruction: 'Press Next to add an item.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-equipment',
      title: 'Add an item',
      body: 'Add a piece of kit to the registry.',
      instruction: 'Click Add Equipment.',
      target: 'equipment-add',
      hint: 'Click the highlighted Add Equipment button.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-equipment',
      title: 'Save the item',
      body: 'Give the item a name and quantity, then save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'equipment.created' },
      hint: 'Save the item in the open dialog to continue.',
    },
  ],
}
