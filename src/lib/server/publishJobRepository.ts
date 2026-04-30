import { getDb, now } from '@/lib/db/client'

const TABLE = 'publish_jobs'

export async function insertPublishJob(row: {
  id: string
  production_id: string
  connection_id: string
  status: string
  progress_stage?: string | null
  progress_message?: string | null
  total_bytes?: number | null
}): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, connection_id, status, progress_stage, progress_message, total_bytes, uploaded_bytes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
    [
      row.id,
      row.production_id,
      row.connection_id,
      row.status,
      row.progress_stage ?? null,
      row.progress_message ?? null,
      row.total_bytes ?? null,
      now(),
    ],
  )
}

export async function updatePublishJobProgress(
  id: string,
  patch: Partial<{
    status: string
    progress_stage: string | null
    progress_message: string | null
    uploaded_bytes: number
    total_bytes: number | null
    error_kind: string | null
    error_message: string | null
    finished_at: string | null
  }>,
): Promise<void> {
  const db = await getDb()
  const keys = Object.keys(patch) as Array<keyof typeof patch>
  if (keys.length === 0) return
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of keys) {
    sets.push(`${String(k)} = $${i++}`)
    vals.push(patch[k] ?? null)
  }
  vals.push(id)
  await db.execute(`UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = $${i}`, vals)
}

export async function listPublishJobsForDev(limit = 50): Promise<
  Array<{
    id: string
    production_id: string
    connection_id: string
    status: string
    created_at: string
  }>
> {
  const db = await getDb()
  return db.select(
    `SELECT id, production_id, connection_id, status, created_at FROM ${TABLE} ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
}
