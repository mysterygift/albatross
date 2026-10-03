import type { TutorialFlow } from '../engine/types'

export const castFlow: TutorialFlow = {
  sectionId: 'cast',
  title: 'Cast Management',
  route: '/people/cast-manager',
  steps: [
    {
      id: 'overview',
      title: 'Cast',
      body: 'Cast members appear in scenes and shots. Keeping their details here keeps the schedule accurate.',
      instruction: 'Press Next to add a cast member.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-cast',
      title: 'Add a cast member',
      body: 'Cast members are added the same way as crew, and marked as cast.',
      instruction: 'Click Add cast.',
      target: 'cast-add',
      hint: 'Click the highlighted Add cast button to open the form.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-cast',
      title: 'Save the cast member',
      body: 'Enter a name and save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'person.created' },
      hint: 'Save the cast member in the open dialog to continue.',
    },
    {
      id: 'assign-cast',
      title: 'Put cast in a shot',
      body: 'Cast members appear in the shots they play in. Assign them from the shot list.',
      instruction: 'Open Shot list, select a shot and click Add cast.',
      route: '/schedule/shots',
      target: 'shot-add-cast',
      hint: 'Click the highlighted Add cast button in the shot list.',
      needs: ['shot', 'castMember'],
      requires: { kind: 'event', event: 'cast.assigned' },
    },
  ],
}
