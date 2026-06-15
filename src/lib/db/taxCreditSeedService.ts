import { createTaxCreditScheme, listTaxCreditSchemes } from './repositories/taxCredits'

/** AVEC default schemes seeded when tax credits are first enabled for a production. */
const AVEC_DEFAULTS = [
  {
    name: 'AVEC (Live action feature / TV)',
    net_rate: 0.255,
    cap_percent: 0.8,
    min_qualifying_percent: 0.1,
    max_qualifying_amount: null,
    max_core_budget: null,
    is_vfx: false,
    sort_order: 0,
  },
  {
    name: "AVEC (Animation / children's TV)",
    net_rate: 0.2925,
    cap_percent: 0.8,
    min_qualifying_percent: 0.1,
    max_qualifying_amount: null,
    max_core_budget: null,
    is_vfx: false,
    sort_order: 1,
  },
  {
    name: 'AVEC (Enhanced limited budget)',
    net_rate: 0.3975,
    cap_percent: 0.8,
    min_qualifying_percent: 0.1,
    max_qualifying_amount: 15_000_000,
    max_core_budget: 23_500_000,
    is_vfx: false,
    sort_order: 2,
  },
  {
    name: 'AVEC (UK VFX)',
    net_rate: 0.2925,
    cap_percent: null,
    min_qualifying_percent: 0.1,
    max_qualifying_amount: null,
    max_core_budget: null,
    is_vfx: true,
    sort_order: 3,
  },
] as const

/**
 * Seed AVEC default schemes for a production if none exist yet.
 * Schemes are created disabled-by-default except the first two standard AVEC rates are enabled.
 */
export async function seedAvecTaxCreditSchemes(productionId: string): Promise<void> {
  const existing = await listTaxCreditSchemes(productionId)
  if (existing.length > 0) return

  for (const scheme of AVEC_DEFAULTS) {
    const created = await createTaxCreditScheme({
      production_id: productionId,
      ...scheme,
    })
    const { setTaxCreditSchemeEnabled } = await import('./repositories/taxCredits')
    await setTaxCreditSchemeEnabled(created.id, false)
  }
}
