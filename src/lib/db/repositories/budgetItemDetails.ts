/**
 * Typed classification for budget line items.
 * Query key convention for UI: ['budget-item-with-details', budgetItemId]
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { BudgetItem, BudgetItemDetails, BudgetItemWithDetails, LineItemType } from '../types'

const ITEM_TABLE = 'budget_items'
const DETAILS_TABLE = 'budget_item_details'

function rowToItem(r: Record<string, unknown>): BudgetItem {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    category_id: r.category_id as string | null,
    account_id: r.account_id as string | null,
    description: r.description as string,
    estimated_cost: (r.estimated_cost as number) ?? 0,
    actual_cost: (r.actual_cost as number) ?? 0,
    vendor: r.vendor as string | null,
    status: (r.status as string) ?? 'draft',
    line_item_type: (r.line_item_type as BudgetItem['line_item_type']) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToDetails(r: Record<string, unknown>): BudgetItemDetails {
  return {
    id: r.details_id as string,
    budget_item_id: r.details_budget_item_id as string,
    line_item_type: r.details_line_item_type as LineItemType,
    details_json: r.details_json as string,
    created_at: r.details_created_at as string,
    updated_at: r.details_updated_at as string,
  }
}

/**
 * Fetch a budget item with its typed details (if any).
 * Use query key ['budget-item-with-details', budgetItemId] when wiring UI.
 */
export async function getBudgetItemWithDetails(
  budgetItemId: string
): Promise<BudgetItemWithDetails | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT
      i.*,
      d.id as details_id,
      d.budget_item_id as details_budget_item_id,
      d.line_item_type as details_line_item_type,
      d.details_json as details_json,
      d.created_at as details_created_at,
      d.updated_at as details_updated_at
    FROM ${ITEM_TABLE} i
    LEFT JOIN ${DETAILS_TABLE} d ON d.budget_item_id = i.id
    WHERE i.id = $1 AND i.deleted_at IS NULL
    LIMIT 1
    `,
    [budgetItemId]
  )
  if (rows.length === 0) return null
  const r = rows[0]!
  const budget_item = rowToItem(r)
  const details =
    (r.details_id as string | null) != null ? rowToDetails(r) : null
  return { budget_item, details }
}

/**
 * Set or update typed classification for a budget item.
 * Updates budget_items.line_item_type and upserts budget_item_details in one transaction.
 * details_json is stored as-is (opaque payload; type-specific schemas in a later stage).
 */
export async function saveBudgetItemDetails(data: {
  budgetItemId: string
  lineItemType: LineItemType
  details: unknown
}): Promise<void> {
  const ts = now()
  const detailsJson = JSON.stringify(data.details ?? {})

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const detailsId = uuid()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${ITEM_TABLE} SET line_item_type = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [data.lineItemType, ts, data.budgetItemId],
      },
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(budget_item_id) DO UPDATE SET
            line_item_type = excluded.line_item_type,
            details_json = excluded.details_json,
            updated_at = excluded.updated_at
        `,
        bindValues: [detailsId, data.budgetItemId, data.lineItemType, detailsJson, ts, ts],
      },
      outboxStatementForRow({
        entity: ITEM_TABLE,
        entityId: data.budgetItemId,
        operation: 'update',
        payloadJson: JSON.stringify({ line_item_type: data.lineItemType }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })
}

/**
 * Save base budget item fields and typed details in one transaction.
 * Use when the panel saves both base fields and (optionally) type-specific details.
 * If lineItemType is null, clears the details row and sets line_item_type to null.
 */
export async function saveBudgetItemWithDetails(data: {
  budgetItemId: string
  description: string
  estimated_cost: number
  vendor: string | null
  lineItemType: LineItemType | null
  details?: unknown
}): Promise<void> {
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN TRANSACTION', bindValues: [] },
    {
      sql: `UPDATE ${ITEM_TABLE} SET description = $1, estimated_cost = $2, vendor = $3, line_item_type = $4, updated_at = $5 WHERE id = $6 AND deleted_at IS NULL`,
      bindValues: [
        data.description,
        data.estimated_cost,
        data.vendor,
        data.lineItemType,
        ts,
        data.budgetItemId,
      ],
    },
  ]

  if (data.lineItemType != null && data.details !== undefined) {
    const detailsJson = JSON.stringify(data.details ?? {})
    const detailsId = uuid()
    statements.push({
      sql: `
        INSERT INTO ${DETAILS_TABLE} (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(budget_item_id) DO UPDATE SET
          line_item_type = excluded.line_item_type,
          details_json = excluded.details_json,
          updated_at = excluded.updated_at
      `,
      bindValues: [detailsId, data.budgetItemId, data.lineItemType, detailsJson, ts, ts],
    })
  } else {
    statements.push({
      sql: `DELETE FROM ${DETAILS_TABLE} WHERE budget_item_id = $1`,
      bindValues: [data.budgetItemId],
    })
  }

  statements.push(
    outboxStatementForRow({
      entity: ITEM_TABLE,
      entityId: data.budgetItemId,
      operation: 'update',
      payloadJson: JSON.stringify({
        description: data.description,
        estimated_cost: data.estimated_cost,
        vendor: data.vendor,
        line_item_type: data.lineItemType,
      }),
    }),
    { sql: 'COMMIT', bindValues: [] }
  )

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/**
 * Clear typed classification from a budget item.
 * Sets line_item_type to null and removes the budget_item_details row.
 */
export async function clearBudgetItemDetails(budgetItemId: string): Promise<void> {
  const ts = now()

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${ITEM_TABLE} SET line_item_type = NULL, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
        bindValues: [ts, budgetItemId],
      },
      {
        sql: `DELETE FROM ${DETAILS_TABLE} WHERE budget_item_id = $1`,
        bindValues: [budgetItemId],
      },
      outboxStatementForRow({
        entity: ITEM_TABLE,
        entityId: budgetItemId,
        operation: 'update',
        payloadJson: JSON.stringify({ line_item_type: null }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })
}
