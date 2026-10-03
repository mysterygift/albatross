import type { TutorialFlow } from '../engine/types'

export const callSheetsFlow: TutorialFlow = {
  sectionId: 'call_sheets',
  title: 'Call Sheets',
  route: '/call-sheets',
  steps: [
    {
      id: 'overview',
      title: 'Call sheets',
      body: 'A call sheet tells the crew and cast what happens on a shoot day. Pick a day and unit, and the sheet fills in from the schedule.',
      instruction: 'Press Next to generate one.',
      requires: { kind: 'view' },
    },
    {
      id: 'generate',
      title: 'Generate a preview',
      body: 'Generate creates the PDF for the selected day and unit. Preview it before you send anything.',
      instruction: 'Click Generate preview.',
      target: 'callsheet-generate',
      hint: 'Click the highlighted Generate button.',
      needs: ['shootDay'],
      requires: { kind: 'click' },
    },
  ],
}
