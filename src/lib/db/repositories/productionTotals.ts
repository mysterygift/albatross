import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { ProductionTotal } from '../types'

const BUDGET_ACCOUNTS_TABLE = 'budget_accounts'

const TOTALS_TABLE = 'production_totals'
const MAPPINGS_TABLE = 'production_total_accounts'

function rowToTotal(r: Record<string, unknown>): ProductionTotal {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export type ProductionTotalWithAccountIds = ProductionTotal & { account_ids: string[] }

export async function listProductionTotals(productionId: string): Promise<ProductionTotalWithAccountIds[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TOTALS_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC`,
    [productionId]
  )
  if (rows.length === 0) return []
  const totals = rows.map(rowToTotal)
  const totalIds = totals.map((t) => t.id)
  const placeholders = totalIds.map((_, i) => `$${i + 1}`).join(', ')
  const mappingRows = await db.select<Record<string, unknown>[]>(
    `SELECT production_total_id, account_id FROM ${MAPPINGS_TABLE} WHERE production_total_id IN (${placeholders})`,
    totalIds
  )
  const accountIdsByTotal = new Map<string, string[]>()
  for (const t of totals) accountIdsByTotal.set(t.id, [])
  for (const m of mappingRows) {
    const totalId = m.production_total_id as string
    const accountId = m.account_id as string
    const arr = accountIdsByTotal.get(totalId)
    if (arr) arr.push(accountId)
  }
  return totals.map((t) => ({ ...t, account_ids: accountIdsByTotal.get(t.id) ?? [] }))
}

export async function listProductionTotalAccountIds(totalId: string): Promise<string[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT account_id FROM ${MAPPINGS_TABLE} WHERE production_total_id = $1`,
    [totalId]
  )
  return rows.map((r) => r.account_id as string)
}

async function validateHeaderAccounts(
  productionId: string,
  accountIds: string[]
): Promise<void> {
  if (accountIds.length === 0) return
  const uniqueIds = [...new Set(accountIds)]
  const db = await getDb()
  const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, is_postable, archived_at, deleted_at FROM ${BUDGET_ACCOUNTS_TABLE} WHERE id IN (${placeholders})`,
    uniqueIds
  )
  const byId = new Map(rows.map((r) => [r.id as string, r]))
  for (const accountId of accountIds) {
    const row = byId.get(accountId)
    if (!row) throw new Error(`Account not found: ${accountId}`)
    if (row.deleted_at != null) throw new Error('Account is deleted')
    if (row.production_id !== productionId) throw new Error('All accounts must belong to the same production')
    if (row.is_postable) throw new Error('Only header accounts may be attached to a production total')
    if (row.archived_at != null) throw new Error('Archived accounts cannot be used in production totals')
  }
}

export async function createProductionTotal(data: {
  production_id: string
  name: string
  account_ids: string[]
}): Promise<ProductionTotal> {
  const name = String(data.name).trim()
  if (!name) throw new Error('Name is required')
  const accountIds = data.account_ids ?? []
  await validateHeaderAccounts(data.production_id, accountIds)

  const id = uuid()
  const ts = now()
  const sortOrder = 0

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `INSERT INTO ${TOTALS_TABLE} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [id, data.production_id, name, sortOrder, ts, ts],
      },
    ]
    for (const accountId of accountIds) {
      statements.push({
        sql: `INSERT INTO ${MAPPINGS_TABLE} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
        bindValues: [uuid(), id, accountId],
      })
    }
    statements.push(
      outboxStatementForRow({
        entity: TOTALS_TABLE,
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify({ ...data, id, name }),
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })

  const list = await getDb().then((db) =>
    db.select<Record<string, unknown>[]>(`SELECT * FROM ${TOTALS_TABLE} WHERE id = $1`, [id])
  )
  return rowToTotal(list[0]!)
}

export async function updateProductionTotal(data: {
  id: string
  name: string
  account_ids: string[]
}): Promise<ProductionTotal> {
  const name = String(data.name).trim()
  if (!name) throw new Error('Name is required')

  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TOTALS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [data.id]
  )
  if (existing.length === 0) throw new Error('Production total not found')
  const productionId = existing[0]!.production_id as string
  await validateHeaderAccounts(productionId, data.account_ids)

  const ts = now()

  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `UPDATE ${TOTALS_TABLE} SET name = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [name, ts, data.id],
      },
      {
        sql: `DELETE FROM ${MAPPINGS_TABLE} WHERE production_total_id = $1`,
        bindValues: [data.id],
      },
    ]
    for (const accountId of data.account_ids) {
      statements.push({
        sql: `INSERT INTO ${MAPPINGS_TABLE} (id, production_total_id, account_id) VALUES ($1, $2, $3)`,
        bindValues: [uuid(), data.id, accountId],
      })
    }
    statements.push(
      outboxStatementForRow({
        entity: TOTALS_TABLE,
        entityId: data.id,
        operation: 'update',
        payloadJson: JSON.stringify({ name, account_ids: data.account_ids }),
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })

  const list = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TOTALS_TABLE} WHERE id = $1`, [data.id])
  return rowToTotal(list[0]!)
}

export async function deleteProductionTotal(id: string): Promise<void> {
  const ts = now()
  const db = await getDb()
  await db.execute(
    `UPDATE ${TOTALS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  const { outboxPush } = await import('../outbox')
  await outboxPush(TOTALS_TABLE, id, 'delete', null)
}
