/**
 * Fawaz Ahmed Exchange API (optional, toggleable in Dev Settings).
 * If enable_currency_conversion_api is false, no fetch and no cache read.
 */
import { getSetting } from '@/lib/db/repositories/settings'
import {
  getCachedRate,
  upsertRate,
  getAnyCachedRate,
} from '@/lib/db/repositories/exchange-rates'

const FAWAZ_BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies'

/**
 * Get exchange rate base -> quote. Returns null if conversion API is disabled or rate unavailable.
 * Never throws; returns null on failure. Uses cache (24h) when enabled.
 */
export async function getRate(base: string, quote: string): Promise<number | null> {
  const enabled = await getSetting('enable_currency_conversion_api')
  if (enabled !== 'true') return null

  const baseLower = base.toLowerCase()
  const quoteLower = quote.toLowerCase()
  if (baseLower === quoteLower) return 1

  const cached = await getCachedRate(baseLower, quoteLower)
  if (cached) return cached.rate

  try {
    const url = `${FAWAZ_BASE}/${baseLower}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Record<string, unknown>
    const baseRates = data[baseLower] as Record<string, number> | undefined
    const rate = baseRates?.[quoteLower]
    if (rate == null || typeof rate !== 'number') return null
    await upsertRate(baseLower, quoteLower, rate)
    return rate
  } catch {
    const stale = await getAnyCachedRate(baseLower, quoteLower)
    return stale
  }
}
