import { getDb, now, uuid } from '../client'

const TABLE = 'exchange_rates'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export type ExchangeRateRow = {
  id: string
  base_currency: string
  quote_currency: string
  rate: number
  fetched_at: string
}

export async function getCachedRate(
  baseCurrency: string,
  quoteCurrency: string
): Promise<{ rate: number; fetched_at: string } | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT rate, fetched_at FROM ${TABLE} WHERE base_currency = $1 AND quote_currency = $2`,
    [baseCurrency.toLowerCase(), quoteCurrency.toLowerCase()]
  )
  if (rows.length === 0) return null
  const r = rows[0]!
  const fetchedAt = r.fetched_at as string
  const age = Date.now() - new Date(fetchedAt).getTime()
  if (age >= CACHE_TTL_MS) return null
  return { rate: r.rate as number, fetched_at: fetchedAt }
}

export async function upsertRate(
  baseCurrency: string,
  quoteCurrency: string,
  rate: number
): Promise<void> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, base_currency, quote_currency, rate, fetched_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (base_currency, quote_currency) DO UPDATE SET rate = $4, fetched_at = $5`,
    [id, baseCurrency.toLowerCase(), quoteCurrency.toLowerCase(), rate, ts]
  )
}

/** Return any cached rate (even stale) for fallback. */
export async function getAnyCachedRate(
  baseCurrency: string,
  quoteCurrency: string
): Promise<number | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT rate FROM ${TABLE} WHERE base_currency = $1 AND quote_currency = $2`,
    [baseCurrency.toLowerCase(), quoteCurrency.toLowerCase()]
  )
  return rows.length ? (rows[0]!.rate as number) : null
}
