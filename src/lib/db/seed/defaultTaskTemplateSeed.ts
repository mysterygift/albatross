/**
 * Ensures the "Starter" task template exists for the Default production template.
 * Uses the existing task-template model; creates template + items if not present.
 */

import { listTaskTemplates, createTaskTemplate, createTaskTemplateItem } from '../repositories/taskTemplates'

const STARTER_TEMPLATE_NAME = 'Starter'

const STARTER_ITEMS: { section_name: string; description: string; sort_order: number }[] = [
  { section_name: 'Pre-Production', description: 'Script breakdown', sort_order: 0 },
  { section_name: 'Pre-Production', description: 'Schedule draft', sort_order: 1 },
  { section_name: 'Pre-Production', description: 'Budget draft', sort_order: 2 },
  { section_name: 'Principal Photography', description: 'Principal photography', sort_order: 3 },
  { section_name: 'Post-Production', description: 'Picture lock', sort_order: 4 },
  { section_name: 'Post-Production', description: 'Sound mix', sort_order: 5 },
  { section_name: 'Post-Production', description: 'Final delivery', sort_order: 6 },
]

/**
 * Returns the task template id for "Starter". Creates the template and items if it does not exist.
 */
export async function ensureStarterTaskTemplate(): Promise<string> {
  const templates = await listTaskTemplates()
  const existing = templates.find((t) => t.name === STARTER_TEMPLATE_NAME)
  if (existing) return existing.id

  const template = await createTaskTemplate({
    name: STARTER_TEMPLATE_NAME,
    description: 'Starter tasks for a new production: Pre-Production, Principal Photography, Post-Production.',
  })
  for (const item of STARTER_ITEMS) {
    await createTaskTemplateItem({
      task_template_id: template.id,
      description: item.description,
      section_name: item.section_name,
      sort_order: item.sort_order,
    })
  }
  return template.id
}
