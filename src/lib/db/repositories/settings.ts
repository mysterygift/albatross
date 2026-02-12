import { getDb } from '../client'

const TABLE = 'settings'

const DEFAULTS: Record<string, string> = {
  display_currency: 'GBP',
  enable_currency_conversion_api: 'false',
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT value FROM ${TABLE} WHERE key = $1`,
    [key]
  )
  return rows.length ? (rows[0]!.value as string) : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${TABLE} (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  )
}

/** Ensure default keys exist. Call on first run / app init. */
export async function ensureSettingsDefaults(): Promise<void> {
  const db = await getDb()
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT 1 FROM ${TABLE} WHERE key = $1`,
      [key]
    )
    if (rows.length === 0) {
      await db.execute(`INSERT INTO ${TABLE} (key, value) VALUES ($1, $2)`, [key, value])
    }
  }
}
