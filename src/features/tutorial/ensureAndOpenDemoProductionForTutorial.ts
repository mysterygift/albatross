import type { Production } from '@/lib/db/types'
import { ensureDemoData } from '@/lib/db/seed/demoProductionSeed'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import { getProductionBySlug } from '@/lib/db/repositories/production'

export type EnsureDemoProductionForTutorialResult = {
  productionId: string
  production: Production
}

type EnsureDemoOptions = {
  /**
   * Optional callback used to mark the demo as the current production in UI state.
   * Callers can pass setCurrentProductionId from useCurrentProduction.
   */
  setCurrentProductionId?: (id: string) => void
}

/**
 * Ensure the canonical demo production exists and is selected for tutorial use.
 *
 * Behaviour:
 * - If the singleton demo production (DEMO_SLUG) already exists, ensureDemoData still runs crew
 *   backfill when crew rows are missing (older installs).
 * - Otherwise, run the canonical demo seed (ensureDemoData) to create it.
 * - Resolve the demo production row and optionally mark it as the current production via callback.
 *
 * This helper is:
 * - Idempotent: repeated calls converge on the same DEMO_SLUG production.
 * - UI-free: it does not navigate, show toasts, or open modals.
 * - Canonical: it reuses the existing demo seed + repository helpers.
 */
export async function ensureAndOpenDemoProductionForTutorial(
  options: EnsureDemoOptions = {},
): Promise<EnsureDemoProductionForTutorialResult> {
  // Ensure demo data exists (no-op when the singleton DEMO_SLUG already exists).
  await ensureDemoData()

  // Look up the canonical demo production by slug.
  const production = await getProductionBySlug(DEMO_SLUG)
  if (!production) {
    throw new Error('Demo production could not be found after seeding.')
  }

  // Let callers align UI state with the demo production selection.
  if (options.setCurrentProductionId) {
    try {
      options.setCurrentProductionId(production.id)
    } catch (err) {
      throw new Error(
        `Demo production created/found (id=${production.id}), but failed to set as current production: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  return {
    productionId: production.id,
    production,
  }
}

