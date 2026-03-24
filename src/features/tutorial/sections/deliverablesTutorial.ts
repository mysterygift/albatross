import type { TutorialStep } from '@/features/tutorial/SectionTutorialPanel'

export const deliverablesTutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'Deliverables overview',
    body: [
      'Deliverables tracks what must be supplied, to whom, and by when.',
      '',
      'It combines schedule-facing due dates with delivery status so teams can manage handover risk.',
    ].join('\n'),
  },
  {
    id: 'templates-and-creation',
    title: 'Create manually or from templates',
    body: [
      'Create one-off deliverables or apply templates to generate a full list for the production.',
      '',
      'Template application can use an anchor date to calculate due dates consistently.',
    ].join('\n'),
  },
  {
    id: 'status-and-approvals',
    title: 'Status, approval, and ownership',
    body: [
      'Track each deliverable through preparation, QC, readiness, and delivery states.',
      '',
      'Approval status and recipient details help coordinate who needs to sign off and receive each item.',
    ].join('\n'),
  },
  {
    id: 'technical-specs-and-attachments',
    title: 'Technical specs and attachments',
    body: [
      'Use the technical spec panel to capture format requirements such as resolution, codec, and audio mix.',
      '',
      'Attach supporting files to keep references and delivery artifacts connected to each deliverable.',
    ].join('\n'),
  },
]
