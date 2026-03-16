import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const castTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Cast Management overview',
    body: [
      'Cast Management is where you review cast records and cast-specific planning for the production.',
      '',
      'This is the cast side of the people system and is intentionally separate from Crew Management.',
    ].join('\n'),
  },
  {
    id: 'cast-vs-crew',
    title: 'Cast vs Crew',
    body: [
      'Cast and crew are different operational systems:',
      '',
      '• Cast relates to characters/performers and cast planning.',
      '• Crew relates to departments/positions and staffing.',
      '',
      'They may connect later through bookings and schedule context, but they are taught separately.',
    ].join('\n'),
  },
  {
    id: 'relationship',
    title: 'How cast supports other workflows',
    body: [
      'Cast data can later support:',
      '',
      '• Bookings.',
      '• Day out of Days.',
      '• Scheduling context.',
      '• Role/character planning.',
    ].join('\n'),
  },
  {
    id: 'explore-demo',
    title: 'Explore the demo cast data',
    body: [
      'Review the seeded cast list in the demo production.',
      '',
      'Open a cast record to see how role/character information and cast context are represented, and notice how these records differ from crew records.',
    ].join('\n'),
  },
  {
    id: 'completion',
    title: 'Next steps',
    body: [
      'You’ve seen how Cast Management captures characters/performers as a distinct workflow from crew staffing.',
      '',
      'When you’re ready, continue to Equipment next, or return to the Tutorial Home to explore another section.',
    ].join('\n'),
  },
]

