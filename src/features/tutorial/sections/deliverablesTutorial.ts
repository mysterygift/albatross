import type { TutorialFlow } from '../engine/types'

export const deliverablesFlow: TutorialFlow = {
  sectionId: 'deliverables',
  title: 'Deliverables',
  route: '/deliverables',
  steps: [
    {
      id: 'overview',
      title: 'Deliverables',
      body: 'Deliverables are the files you owe a client or broadcaster, with their technical specs and delivery status.',
      instruction: 'Press Next to add one.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-deliverable',
      title: 'Add a deliverable',
      body: 'Add the first file you need to deliver.',
      instruction: 'Click Add deliverable.',
      target: 'deliverables-add',
      hint: 'Click the highlighted Add deliverable button.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-deliverable',
      title: 'Save the deliverable',
      body: 'Give it a name and save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'deliverable.created' },
      hint: 'Save the deliverable in the open dialog to continue.',
    },
  ],
}
