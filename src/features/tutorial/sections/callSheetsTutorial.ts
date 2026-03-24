import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const callSheetsTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Call Sheets overview',
    body: [
      'Call Sheets builds a day-and-unit specific call sheet from your schedule, cast, crew, and location data.',
      '',
      'It is designed to move from selection to preview quickly while keeping details consistent with live production data.',
    ].join('\n'),
  },
  {
    id: 'day-and-unit-selection',
    title: 'Select shoot day and unit',
    body: [
      'Start by selecting the shoot day and unit to scope the call sheet correctly.',
      '',
      'Albatross pulls the matching strips, cast requirements, crew bookings, locations, and key contacts for that context.',
    ].join('\n'),
  },
  {
    id: 'preview-and-weather',
    title: 'Preview and weather fallback',
    body: [
      'Generate a PDF preview before saving to verify notes, times, and contact sections.',
      '',
      'If live weather lookup is unavailable, manual or stored weather values are used so production can still publish on time.',
    ].join('\n'),
  },
  {
    id: 'distribution',
    title: 'Distribution workflow',
    body: [
      'Use distribution to generate personalised call sheets for selected recipients.',
      '',
      'Call sheets are watermarked with the name of the recipient to prevent unauthorized distribution.',
      '',
      'Once you\'ve selected all of the recipients, you can choose a location to save all of the call sheets to. We recommend using a single folder per unit per day.',
    ].join('\n'),
  },
]
