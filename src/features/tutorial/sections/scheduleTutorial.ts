import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const scheduleTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Schedule overview',
    body: [
      'The Schedule is where you review the production timeline and shoot structure.',
      '',
      'Use it to see how shoot days, scenes, and work are laid out across the life of the production.',
      '',
      'Episodic projects: If the current production was created as episodic, the calendar and stripboard can filter by shooting bloc (a dated block of photography) and show episode context on strips from each scene’s episode assignment.',
    ].join('\n'),
  },
  {
    id: 'episodic',
    title: 'Episodic vs single story',
    body: [
      'Single-story productions behave as before: every scene belongs to one continuous story.',
      '',
      'Episodic productions add episodes (managed in Settings) and optional shooting blocs (named date ranges). Each scene is assigned to an episode when you create or edit it in Shot Lists. Shoot days pick up a bloc from those dates (or stay “outside blocs” until you adjust bloc ranges in Settings).',
      '',
      'On the stripboard, day headers can show the bloc label; shot and scene strips can show a small episode badge. Use the bloc filter to focus one block of photography or only days not tied to a bloc.',
    ].join('\n'),
  },
  {
    id: 'shoot-days',
    title: 'Shoot days and structure',
    body: [
      'The demo production includes seeded shoot days and activity so you can explore safely.',
      '',
      'Scroll the calendar to see how work is distributed across days, and open a day to review its call, runtime, and location details.',
      '',
      'On episodic demos, try the shooting-bloc filter on the calendar and stripboard to see how days line up with blocks.',
    ].join('\n'),
  },
  {
    id: 'relationships',
    title: 'How schedule feeds other workflows',
    body: [
      'The schedule connects into other areas of Albatross:',
      '',
      '• People bookings and day‑out‑of‑days.',
      '• Budgeting and labour planning.',
      '• Production readiness and wrap checks later on.',
    ].join('\n'),
  },
  {
    id: 'explore-next',
    title: 'What to explore next',
    body: [
      'Take a moment to inspect the seeded schedule and open a few days.',
      '',
      'Then, when you are ready, continue into Budget or People to see how schedule choices flow into costs and crew/cast planning.',
    ].join('\n'),
  },
]

