export type DashboardCardId =
  | 'nextShootDay'
  | 'budgetHealth'
  | 'tasksDue'
  | 'riskWatch'
  | 'vendorFinance'
  | 'floats'
  | 'deliverables'

export const DASHBOARD_CARD_OPTIONS: { id: DashboardCardId; label: string }[] = [
  { id: 'nextShootDay', label: 'Next shoot day details' },
  { id: 'budgetHealth', label: 'Budget health' },
  { id: 'tasksDue', label: 'Tasks due soon' },
  { id: 'riskWatch', label: 'Risk watch' },
  { id: 'vendorFinance', label: 'Vendor finance' },
  { id: 'floats', label: 'Petty cash floats' },
  { id: 'deliverables', label: 'Deliverables' },
]

export const HIDDEN_CARDS_STORAGE_KEY = 'albatross.dashboard.hiddenCards'

const VALID_IDS = new Set<string>(DASHBOARD_CARD_OPTIONS.map((o) => o.id))

/** Per-viewer convenience only. Storage can be unavailable or corrupt, so every access is guarded. */
export function readHiddenCards(): DashboardCardId[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_CARDS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const hidden = (parsed as { hidden?: unknown }).hidden
    if (!Array.isArray(hidden)) return []
    return hidden.filter((id): id is DashboardCardId => typeof id === 'string' && VALID_IDS.has(id))
  } catch {
    return []
  }
}

export function writeHiddenCards(hidden: DashboardCardId[]): void {
  try {
    if (hidden.length === 0) {
      window.localStorage.removeItem(HIDDEN_CARDS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(HIDDEN_CARDS_STORAGE_KEY, JSON.stringify({ hidden }))
    }
  } catch {
    /* storage unavailable: preference lasts for this session only */
  }
}
