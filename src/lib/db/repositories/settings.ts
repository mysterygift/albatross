import { getDb, runInSerializedTransaction } from '../client'

const TABLE = 'settings'

/** One-time: flip legacy default `false` to on; dev users who opt out once keep `false` after this runs. */
const CURRENCY_API_DEFAULT_ON_MIGRATION_KEY = '_migration_currency_api_default_on_v1'

const DEFAULTS: Record<string, string> = {
  display_currency: 'GBP',
  enable_currency_conversion_api: 'true',
  enable_api_call_tracking: 'false',
}

export const FIRST_LAUNCH_TUTORIAL_SEEN_KEY = 'first_launch_tutorial_seen'

export async function getFirstLaunchTutorialSeen(): Promise<boolean> {
  try {
    const value = await getSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY)
    if (value === null) return false
    return value === 'true'
  } catch {
    return false
  }
}

export async function setFirstLaunchTutorialSeen(seen: boolean): Promise<void> {
  try {
    await setSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY, seen ? 'true' : 'false')
  } catch {
  }
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

/** Ensure default keys exist. Call on first run / app init. Single queued write to avoid lock contention. */
export async function ensureSettingsDefaults(): Promise<void> {
  const entries = Object.entries(DEFAULTS)
  if (entries.length === 0) return
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const placeholders = entries.map((_, i) => `($${2 * i + 1}, $${2 * i + 2})`).join(', ')
    const values = entries.flatMap(([k, v]) => [k, v])
    await db.execute(
      `INSERT OR IGNORE INTO ${TABLE} (key, value) VALUES ${placeholders}`,
      values
    )

    const migRows = await db.select<{ value: string }[]>(
      `SELECT value FROM ${TABLE} WHERE key = $1`,
      [CURRENCY_API_DEFAULT_ON_MIGRATION_KEY]
    )
    if (migRows.length === 0 || migRows[0]!.value !== 'true') {
      await db.execute(
        `UPDATE ${TABLE} SET value = 'true' WHERE key = 'enable_currency_conversion_api' AND value = 'false'`
      )
      await db.execute(
        `INSERT INTO ${TABLE} (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [CURRENCY_API_DEFAULT_ON_MIGRATION_KEY, 'true']
      )
    }
  })
}
