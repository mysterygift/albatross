import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import type { SoftDeletable } from '../types'

const TABLE = 'budget_revisions'
let ensuredApprovalColumn = false

export type BudgetRevision = {
  id: string
  production_id: string
  name: string
  created_from_revision_id: string | null
  is_live: boolean
  approval: 'unapproved' | 'pending' | 'approved'
} & SoftDeletable

function rowToBudgetRevision(r: Record<string, unknown>): BudgetRevision {
  const approvalRaw = String(r.approval ?? 'unapproved').toLowerCase()
  const approval: BudgetRevision['approval'] =
    approvalRaw === 'pending' || approvalRaw === 'approved' ? approvalRaw : 'unapproved'
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    created_from_revision_id: (r.created_from_revision_id as string | null) ?? null,
    is_live: Boolean(r.is_live),
    approval,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

async function backfillNullRevisionIdsForProduction(
  productionId: string,
  revisionId: string
): Promise<void> {
  const db = await getDb()
  await executeBatch(db, [
    {
      sql: `UPDATE budget_items
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE production_totals
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE cost_report_groups
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE budget_item_expense_links
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE floats
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE float_expense_links
            SET budget_revision_id = $2
            WHERE budget_revision_id IS NULL
              AND float_id IN (SELECT id FROM floats WHERE production_id = $1)`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE fringe_rules
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
    {
      sql: `UPDATE contingency_rules
            SET budget_revision_id = $2
            WHERE production_id = $1 AND budget_revision_id IS NULL`,
      bindValues: [productionId, revisionId],
    },
  ])
}

async function hasAnyBudgetScopedDataForProduction(productionId: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<{ exists_flag: number }[]>(
    `SELECT 1 AS exists_flag
     WHERE EXISTS (SELECT 1 FROM budget_items WHERE production_id = $1)
        OR EXISTS (SELECT 1 FROM production_totals WHERE production_id = $1)
        OR EXISTS (SELECT 1 FROM cost_report_groups WHERE production_id = $1)
        OR EXISTS (SELECT 1 FROM budget_item_expense_links WHERE production_id = $1)
        OR EXISTS (SELECT 1 FROM floats WHERE production_id = $1)
        OR EXISTS (
          SELECT 1
          FROM float_expense_links l
          INNER JOIN floats f ON f.id = l.float_id
          WHERE f.production_id = $1
        )
        OR EXISTS (SELECT 1 FROM fringe_rules WHERE production_id = $1)
        OR EXISTS (SELECT 1 FROM contingency_rules WHERE production_id = $1)`,
    [productionId]
  )
  return rows.length > 0
}

/**
 * Canonical resolver for the working/live budget revision in a production.
 */
export async function getLiveBudgetRevisionForProduction(
  productionId: string
): Promise<BudgetRevision | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE}
     WHERE production_id = $1 AND is_live = 1 AND deleted_at IS NULL
     LIMIT 1`,
    [productionId]
  )
  return rows.length ? rowToBudgetRevision(rows[0]!) : null
}

export async function listBudgetRevisionsByProduction(
  productionId: string
): Promise<BudgetRevision[]> {
  try {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE}
       WHERE production_id = $1 AND deleted_at IS NULL
       ORDER BY is_live DESC, updated_at DESC, created_at DESC`,
      [productionId]
    )
    if (rows.length > 0) return rows.map(rowToBudgetRevision)

    // Existing productions that already have budget data should never appear as "no revisions".
    if (!(await hasAnyBudgetScopedDataForProduction(productionId))) return []
    const revisionId = await getOrCreateLiveBudgetRevisionIdForProduction(productionId)
    const created = await getBudgetRevisionByIdForProduction(productionId, revisionId)
    return created ? [created] : []
  } catch (err) {
    throw err
  }
}

export async function getBudgetRevisionByIdForProduction(
  productionId: string,
  revisionId: string
): Promise<BudgetRevision | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE}
     WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [productionId, revisionId]
  )
  return rows.length ? rowToBudgetRevision(rows[0]!) : null
}

/**
 * Resolves the revision that UI surfaces should use:
 * - if a selected id exists and belongs to this production, use it
 * - otherwise fall back to the production live revision
 */
export async function resolveSelectedBudgetRevision(params: {
  productionId: string
  selectedRevisionId?: string | null
}): Promise<BudgetRevision | null> {
  const selectedRevisionId = params.selectedRevisionId ?? null
  if (selectedRevisionId) {
    const selected = await getBudgetRevisionByIdForProduction(params.productionId, selectedRevisionId)
    if (selected) return selected
  }
  return getLiveBudgetRevisionForProduction(params.productionId)
}

/**
 * Returns the live revision id for the production, creating the default live revision
 * only when no revision exists yet (migration safety for newly budgeted productions).
 */
export async function getOrCreateLiveBudgetRevisionIdForProduction(
  productionId: string
): Promise<string> {
  const existing = await getLiveBudgetRevisionForProduction(productionId)
  if (existing) return existing.id

  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, NULL, 1, 'unapproved', $4, $5, NULL)`,
    [id, productionId, 'Current budget', ts, ts]
  )
  await backfillNullRevisionIdsForProduction(productionId, id)
  return id
}

/**
 * Canonical resolver for budget-aware repositories:
 * - use caller-provided revisionId when present
 * - otherwise resolve the production's current live/working revision
 */
export async function resolveBudgetRevisionId(params: {
  productionId: string
  revisionId?: string | null
}): Promise<string> {
  const revisionId = params.revisionId ?? null
  if (revisionId) return revisionId
  return getOrCreateLiveBudgetRevisionIdForProduction(params.productionId)
}

/**
 * Sets exactly one live revision for the production.
 * Transactional: unset all existing live rows, then set target row live.
 */
export async function setLiveBudgetRevisionForProduction(params: {
  productionId: string
  revisionId: string
}): Promise<void> {
  const target = await getBudgetRevisionByIdForProduction(params.productionId, params.revisionId)
  if (!target) throw new Error('Revision not found for production')

  const db = await getDb()
  const ts = now()
  await runInSerializedTransaction(async () => {
    await executeBatch(db, [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${TABLE}
              SET is_live = 0, updated_at = $2
              WHERE production_id = $1 AND deleted_at IS NULL AND is_live = 1`,
        bindValues: [params.productionId, ts],
      },
      {
        sql: `UPDATE ${TABLE}
              SET is_live = 1, updated_at = $3
              WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL`,
        bindValues: [params.productionId, params.revisionId, ts],
      },
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

export async function renameBudgetRevisionForProduction(params: {
  productionId: string
  revisionId: string
  name: string
}): Promise<void> {
  const trimmedName = params.name.trim()
  if (!trimmedName) throw new Error('Revision name is required')
  const existing = await getBudgetRevisionByIdForProduction(params.productionId, params.revisionId)
  if (!existing) throw new Error('Revision not found for production')

  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE}
     SET name = $3, updated_at = $4
     WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [params.productionId, params.revisionId, trimmedName, ts]
  )
}

export async function setBudgetRevisionApprovalForProduction(params: {
  productionId: string
  revisionId: string
  approval: BudgetRevision['approval']
}): Promise<void> {
  if (!['unapproved', 'pending', 'approved'].includes(params.approval)) {
    throw new Error('Invalid budget revision approval status')
  }
  try {
    const existing = await getBudgetRevisionByIdForProduction(params.productionId, params.revisionId)
    if (!existing) throw new Error('Revision not found for production')

    const db = await getDb()
    const ts = now()
    try {
      await db.execute(
        `UPDATE ${TABLE}
         SET approval = $3, updated_at = $4
         WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.revisionId, params.approval, ts]
      )
    } catch (updateError) {
      const updateMessage = updateError instanceof Error ? updateError.message : String(updateError)
      if (!ensuredApprovalColumn && updateMessage.includes('no such column: approval')) {
        await db.execute(
          `ALTER TABLE ${TABLE}
           ADD COLUMN approval TEXT NOT NULL DEFAULT 'unapproved' CHECK (approval IN ('unapproved', 'pending', 'approved'))`
        )
        ensuredApprovalColumn = true
        await db.execute(
          `UPDATE ${TABLE}
           SET approval = $3, updated_at = $4
           WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [params.productionId, params.revisionId, params.approval, ts]
        )
      } else {
        throw updateError
      }
    }
  } catch (error) {
    throw error
  }
}

export async function deleteBudgetRevisionForProduction(params: {
  productionId: string
  revisionId: string
}): Promise<void> {
  const existing = await getBudgetRevisionByIdForProduction(params.productionId, params.revisionId)
  if (!existing) throw new Error('Revision not found for production')
  if (existing.is_live) throw new Error('Live budget revision cannot be deleted')

  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE}
     SET deleted_at = $3, updated_at = $3
     WHERE production_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [params.productionId, params.revisionId, ts]
  )
}
