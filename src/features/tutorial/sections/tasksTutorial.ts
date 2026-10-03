import type { TutorialFlow } from '../engine/types'

export const tasksFlow: TutorialFlow = {
  sectionId: 'tasks',
  title: 'Tasks',
  route: '/tasks',
  steps: [
    {
      id: 'overview',
      title: 'Tasks',
      body: 'Tasks track what must happen before the shoot, grouped into sections. They also feed the Dashboard.',
      instruction: 'Press Next to add a task.',
      requires: { kind: 'view' },
    },
    {
      id: 'new-task',
      title: 'Create a task',
      body: 'Tasks can have a due date, an owner and subtasks.',
      instruction: 'Click New task.',
      target: 'tasks-new',
      hint: 'Click the highlighted New task button.',
      requires: { kind: 'click' },
    },
    {
      id: 'save-task',
      title: 'Save the task',
      body: 'Describe the task and save it.',
      instruction: 'Fill in the form in the open dialog and save it.',
      requires: { kind: 'event', event: 'task.created' },
      hint: 'Save the task in the open dialog to continue.',
    },
  ],
}
