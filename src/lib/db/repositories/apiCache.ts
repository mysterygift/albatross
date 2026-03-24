import { getDb } from '../client'

const TABLE = 'api_cache'

export type ApiCacheUpsert = {
  key: string
  provider: string
  endpoint: string
  requestHash: string
  responseJson: string
  createdAt: number
  updatedAt: number
}

export type ApiCacheEntry = {
  data: unknown
  updatedAt: number
}

export async function getApiCacheByKey(key: string): Promise<ApiCacheEntry | null> {
  const db = await getDb()
  const rows = await db.select<{ response_json: string; updated_at: number }[]>(
    `SELECT response_json, updated_at FROM ${TABLE} WHERE key = $1`,
    [key]
  )
  if (!rows.length) return null
  const row = rows[0]!
  let data: unknown
  try {
    data = JSON.parse(row.response_json) as unknown
  } catch {
    return null
  }
  const updatedAt = Number(row.updated_at)
  if (!Number.isFinite(updatedAt)) return null
  return { data, updatedAt }
}

export async function upsertApiCache(entry: ApiCacheUpsert): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${TABLE} (key, provider, endpoint, request_hash, response_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(key) DO UPDATE SET
       response_json = excluded.response_json,
       updated_at = excluded.updated_at`,
    [
      entry.key,
      entry.provider,
      entry.endpoint,
      entry.requestHash,
      entry.responseJson,
      entry.createdAt,
      entry.updatedAt,
    ]
  )
}
