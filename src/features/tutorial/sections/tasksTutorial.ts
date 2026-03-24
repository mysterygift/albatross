import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const tasksTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Tasks overview',
    body: [
      'Tasks is the production readiness workspace for tracking operational to-dos and deadlines.',
      '',
      'Use it to capture work items, assign ownership context, and monitor completion across departments.',
    ].join('\n'),
  },
  {
    id: 'structure',
    title: 'Sections, parent tasks, and subtasks',
    body: [
      'Tasks can be grouped into sections, with parent tasks and nested subtasks for clearer execution plans.',
      '',
      'This structure helps teams break larger milestones into actionable work while preserving hierarchy.',
    ].join('\n'),
  },
  {
    id: 'priorities-and-filters',
    title: 'Priorities and filters',
    body: [
      'Filter by search, status, department, priority, and due timing to focus on what needs attention now.',
      '',
      'The completion score gives a quick pulse on readiness progress for the production.',
    ].join('\n'),
  },
  {
    id: 'templates',
    title: 'Template-driven setup',
    body: [
      'Use templates to seed repeatable task structures, then customise for your specific production.',
      '',
      'This speeds up onboarding while keeping department checklists consistent.',
    ].join('\n'),
  },
]
