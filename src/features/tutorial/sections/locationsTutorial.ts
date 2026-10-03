import type { TutorialFlow } from '../engine/types'

export const locationsFlow: TutorialFlow = {
  sectionId: 'locations',
  title: 'Locations',
  route: '/locations',
  steps: [
    {
      id: 'overview',
      title: 'Locations',
      body: 'Locations track status, fees and access notes. Scenes can point at a location so the schedule knows where to go.',
      instruction: 'Press Next to add a location.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-location',
      title: 'Add a location',
      body: 'Start with one location you will shoot at.',
      instruction: 'Click Add location.',
      target: 'locations-add',
      hint: 'Click the highlighted Add location button.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-location',
      title: 'Save the location',
      body: 'Enter a name and booked status, then save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'location.created' },
      hint: 'Save the location in the open dialog to continue.',
    },
  ],
}
