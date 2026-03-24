import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const musicArchiveTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Music & Archive overview',
    body: [
      'Music & Archive Clearance tracks music usage details needed for legal and delivery workflows.',
      '',
      'It helps production maintain a clean record of tracks used and related rights metadata.',
    ].join('\n'),
  },
  {
    id: 'track-register',
    title: 'Build the track register',
    body: [
      'Add tracks with title, artist, and publisher/label information as soon as selections are known.',
      '',
      'A reliable track register reduces clearance surprises late in post and delivery.',
    ].join('\n'),
  },
  {
    id: 'cue-sheet-export',
    title: 'Cue sheet export',
    body: [
      'Generate a cue sheet PDF from the tracked music list for handoff and reporting.',
      '',
      'Use this export as part of your final archive package and downstream delivery documentation.',
    ].join('\n'),
  },
  {
    id: 'archive-practice',
    title: 'Archive-ready practice',
    body: [
      'Keep this section updated throughout production instead of waiting until wrap.',
      '',
      'That creates a cleaner audit trail when you assemble final archive and distribution materials.',
    ].join('\n'),
  },
]
