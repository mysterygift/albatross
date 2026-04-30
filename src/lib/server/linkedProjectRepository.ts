import { getDb, now } from '@/lib/db/client'
import type { LinkState } from '@/lib/server/types'

const TABLE = 'linked_projects'

export async function getLinkedProjectByProductionId(
  productionId: string,
): Promise<{
  production_id: string
  connection_id: string
  remote_project_id: string
  remote_project_url: string | null
  linked_at: string
  last_synced_at: string | null
  link_state: LinkState
  baseline_etag: string | null
} | null> {
  const db = await getDb()
  const rows = await db.select<
    Array<{
      production_id: string
      connection_id: string
      remote_project_id: string
      remote_project_url: string | null
      linked_at: string
      last_synced_at: string | null
      link_state: string
      baseline_etag: string | null
    }>
  >(`SELECT * FROM ${TABLE} WHERE production_id = $1`, [productionId])
  const r = rows[0]
  if (!r) return null
  return { ...r, link_state: r.link_state as LinkState }
}

export async function listAllLinkedProjects(): Promise<
  Array<{
    production_id: string
    connection_id: string
    remote_project_id: string
    remote_project_url: string | null
    link_state: LinkState
  }>
> {
  const db = await getDb()
  const rows = await db.select<
    Array<{
      production_id: string
      connection_id: string
      remote_project_id: string
      remote_project_url: string | null
      link_state: string
    }>
  >(`SELECT production_id, connection_id, remote_project_id, remote_project_url, link_state FROM ${TABLE}`, [])
  return rows.map((r) => ({ ...r, link_state: r.link_state as LinkState }))
}

export async function upsertLinkedProject(input: {
  production_id: string
  connection_id: string
  remote_project_id: string
  remote_project_url: string | null
  link_state?: LinkState
}): Promise<void> {
  const db = await getDb()
  const ts = now()
  const state = input.link_state ?? 'linked'
  await db.execute(
    `INSERT INTO ${TABLE} (production_id, connection_id, remote_project_id, remote_project_url, linked_at, last_synced_at, link_state, baseline_etag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT(production_id) DO UPDATE SET
       connection_id = excluded.connection_id,
       remote_project_id = excluded.remote_project_id,
       remote_project_url = excluded.remote_project_url,
       link_state = excluded.link_state,
       last_synced_at = excluded.last_synced_at`,
    [input.production_id, input.connection_id, input.remote_project_id, input.remote_project_url, ts, ts, state],
  )
}

export async function updateLinkedProjectState(
  productionId: string,
  link_state: LinkState,
  baseline_etag?: string | null,
): Promise<void> {
  const db = await getDb()
  if (baseline_etag !== undefined) {
    await db.execute(`UPDATE ${TABLE} SET link_state = $1, baseline_etag = $2 WHERE production_id = $3`, [
      link_state,
      baseline_etag,
      productionId,
    ])
    return
  }
  await db.execute(`UPDATE ${TABLE} SET link_state = $1 WHERE production_id = $2`, [link_state, productionId])
}

export async function deleteLinkedProject(productionId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${TABLE} WHERE production_id = $1`, [productionId])
}

export async function touchLastSynced(productionId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE ${TABLE} SET last_synced_at = $1 WHERE production_id = $2`, [now(), productionId])
}
