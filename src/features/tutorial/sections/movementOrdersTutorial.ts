import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const movementOrdersTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Movement Orders overview',
    body: [
      'Movement Orders generates day/unit movement packs from scheduled strips and ordered locations.',
      '',
      'It combines location sequence, contacts, and travel leg data into one distribution-ready document.',
      '',
      'Important: In order to collect routing data, you must have an OpenRouteService API key set in the app settings.',
    ].join('\n'),
  },
  {
    id: 'open-route-service-key',
    title: 'OpenRouteService API key',
    body: [
      'This is free to sign up for and can be found at openrouteservice.org.',
      '',
      'There is a button in the app settings to take you to the OpenRouteService website. Do not share your key with anyone.',
    ].join('\n'),
  },
  {
    id: 'build-context',
    title: 'Build from scheduled work',
    body: [
      'Choose a shoot day and unit to build movement order context from scheduled strips.',
      '',
      'The page assembles ordered locations, location contacts, and movement legs for that selected unit.',
    ].join('\n'),
  },
  {
    id: 'travel-enrichment',
    title: 'Travel data enrichment',
    body: [
      'Refresh travel data to enrich movement legs with driving/walking estimates and route notes. Note that the current formatting of directions will be updated in a future release.',
      '',
      'This gives departments practical travel planning information before day call.',
    ].join('\n'),
  },
  {
    id: 'preview-and-distribute',
    title: 'Preview and distribute',
    body: [
      'Preview the movement order PDF, then save or distribute personalised copies to recipients.',
      '',
      'Use this flow to keep transport communication aligned with the latest schedule and location sequence.',
    ].join('\n'),
  },
]
