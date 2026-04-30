import { getDb, now, uuid } from '@/lib/db/client'

const TABLE = 'server_connections'

export async function listServerConnections(): Promise<
  Array<{
    id: string
    display_name: string
    base_url: string
    workspace_id: string | null
    account_username: string
    last_validated_at: string | null
    created_at: string
  }>
> {
  const db = await getDb()
  return db.select(
    `SELECT id, display_name, base_url, workspace_id, account_username, last_validated_at, created_at
     FROM ${TABLE} ORDER BY created_at DESC`,
    [],
  )
}

export async function getServerConnectionById(id: string): Promise<{
  id: string
  display_name: string
  base_url: string
  workspace_id: string | null
  account_username: string
  last_validated_at: string | null
  created_at: string
} | null> {
  const db = await getDb()
  const rows = await db.select<
    Array<{
      id: string
      display_name: string
      base_url: string
      workspace_id: string | null
      account_username: string
      last_validated_at: string | null
      created_at: string
    }>
  >(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function insertServerConnection(input: {
  display_name: string
  base_url: string
  workspace_id: string | null
  account_username: string
}): Promise<string> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, display_name, base_url, workspace_id, account_username, last_validated_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.display_name, input.base_url, input.workspace_id, input.account_username, ts, ts],
  )
  return id
}

export async function touchServerConnectionValidated(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE ${TABLE} SET last_validated_at = $1 WHERE id = $2`, [now(), id])
}

export async function deleteServerConnection(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
}
