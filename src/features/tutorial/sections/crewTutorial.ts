import type { TutorialFlow } from '../engine/types'

export const crewFlow: TutorialFlow = {
  sectionId: 'crew',
  title: 'Crew Management',
  route: '/people/crew-manager',
  steps: [
    {
      id: 'overview',
      title: 'Crew',
      body: 'Crew members hold roles and availability. Bookings connect them to shoot days.',
      instruction: 'Press Next to add a crew member.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-crew',
      title: 'Add a crew member',
      body: 'Add someone who will work on the shoot.',
      instruction: 'Click Add crew.',
      target: 'crew-add',
      hint: 'Click the highlighted Add button to open the form.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-crew',
      title: 'Save the crew member',
      body: 'Enter a name and role, then save.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'person.created' },
      hint: 'Save the crew member in the open dialog to continue.',
    },
    {
      id: 'booking',
      title: 'Book crew onto a day',
      body: 'Bookings put crew on a shoot day. The booking is what makes the day show who is working.',
      instruction: 'Open Bookings, click New booking and book your crew member onto a shoot day.',
      route: '/people/bookings',
      target: 'bookings-add',
      hint: 'Click the highlighted button to start a booking.',
      needs: ['shootDay'],
      requires: { kind: 'event', event: 'booking.created' },
    },
  ],
}
