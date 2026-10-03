import type { Production } from '@/lib/db/types'
import { createProductionFromTemplate } from '@/lib/db/createProductionFromTemplate'
import { getProductionById } from '@/lib/db/repositories/production'

export const TUTORIAL_PROJECT_NAME = 'Tutorial project'

/**
 * Returns the user's tutorial project, creating it on first use. The project is an ordinary production after
 * the tutorial ends: it is never deleted or reset by the tutorial, and the user can keep working in it.
 * The demo productions (DEMO_SLUG and the episodic demo) are untouched.
 */
export async function ensureTutorialProject(existingId: string | null): Promise<Production> {
  if (existingId) {
    const existing = await getProductionById(existingId)
    if (existing && !existing.archived_at) return existing
  }
  return createProductionFromTemplate({
    name: TUTORIAL_PROJECT_NAME,
    notes: 'Created by the Albatross tutorial. Keep working in it, or rename it when you are ready.',
    template: 'tutorial',
  })
}
