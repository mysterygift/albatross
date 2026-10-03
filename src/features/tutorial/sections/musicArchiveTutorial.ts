import type { TutorialFlow } from '../engine/types'

export const musicArchiveFlow: TutorialFlow = {
  sectionId: 'music_archive',
  title: 'Music & Archive',
  route: '/music-clearance',
  steps: [
    {
      id: 'overview',
      title: 'Music clearance',
      body: 'Every track needs its clearance tracked before delivery. Cue sheets record the music for delivery and royalties.',
      instruction: 'Press Next to add a track.',
      requires: { kind: 'view' },
    },
    {
      id: 'add-track',
      title: 'Add a track',
      body: 'Each piece of music you use gets a record with its clearance status.',
      instruction: 'Click Add track.',
      target: 'music-add-track',
      hint: 'Click the highlighted Add track button.',
      requires: { kind: 'click' },
    },
    {
      id: 'finish',
      title: 'Cue sheets',
      body: 'Once clearances are in, generate the cue sheet PDF from this page. That is the end of the core tour.',
      instruction: 'Press Finish to complete the tutorial.',
      requires: { kind: 'view' },
    },
  ],
}
