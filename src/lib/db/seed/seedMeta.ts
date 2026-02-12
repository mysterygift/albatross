import { getDb } from '../client'

const TABLE = 'seed_meta'

export async function getSeedMeta(key: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT value FROM ${TABLE} WHERE key = $1`,
    [key]
  )
  return rows.length ? (rows[0]!.value as string) : null
}

export async function setSeedMeta(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${TABLE} (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value]
  )
}

export async function getLastSeededAt(): Promise<string | null> {
  return getSeedMeta('last_seeded_at')
}

export async function getSeedVersion(): Promise<string | null> {
  return getSeedMeta('seed_version')
}
