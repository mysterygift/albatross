import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const crewTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Crew Management overview',
    body: [
      'Crew Management is where you organise production staff by department and role.',
      '',
      'This area focuses on crew only – cast is handled separately – and uses the demo production so you can explore structure without touching real data.',
    ].join('\n'),
  },
  {
    id: 'departments-positions',
    title: 'Departments and positions',
    body: [
      'Crew is structured into departments (such as Camera, Sound, Production) with specific positions in each.',
      '',
      'This hierarchy makes it clear who is responsible for what, and which heads of department (HODs) are attached to each area of the production.',
    ].join('\n'),
  },
  {
    id: 'why-crew-matters',
    title: 'Why crew data matters elsewhere',
    body: [
      'Accurate crew records support other workflows in Albatross:',
      '',
      '• Scheduling and bookings for shoot days.',
      '• Labour planning and staffing coverage.',
      '• Budget context for crew costs and vendor work.',
      '• Overall production readiness and daily operations.',
    ].join('\n'),
  },
  {
    id: 'explore-demo-crew',
    title: 'Explore the demo crew structure',
    body: [
      'Use the demo data to review how departments and roles are laid out.',
      '',
      'Scan the department summary, use filters or search to focus on a team, and inspect one or two crew records to see how department, role, and contact details are captured.',
    ].join('\n'),
  },
  {
    id: 'completion-next-steps',
    title: 'Completion and next steps',
    body: [
      'You have seen how Crew Management organises the production team by department and role.',
      '',
      'When you are ready, continue to the Cast Management tutorial next – cast is taught separately so crew and cast stay clearly distinct in your mental model.',
    ].join('\n'),
  },
]

