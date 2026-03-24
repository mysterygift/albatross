import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import type { BudgetRevision } from './repositories/budgetRevisions'
import {
  getLiveBudgetRevisionForProduction,
  listBudgetRevisionsByProduction,
} from './repositories/budgetRevisions'

type Stmt = { sql: string; bindValues: unknown[] }
type IdMap = Map<string, string>

function trimRequiredName(name: string): string {
  const n = String(name).trim()
  if (!n) throw new Error('Revision name is required')
  return n
}

function rowToRevision(r: Record<string, unknown> | undefined): BudgetRevision {
  if (!r || typeof r !== 'object') {
    throw new Error('Invalid budget revision row')
  }
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

function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function buildDuplicateLiveDraftName(params: {
  liveRevisionName: string
  existingRevisionNames: string[]
}): string {
  const baseLive = normalizeWhitespace(params.liveRevisionName) || 'Current budget'
  const baseDraft = `${baseLive} Draft`
  const existing = new Set(
    params.existingRevisionNames
      .map((name) => normalizeWhitespace(name))
      .filter(Boolean)
  )
  if (!existing.has(baseDraft)) return baseDraft

  let suffix = 2
  while (existing.has(`${baseDraft} ${suffix}`)) suffix += 1
  return `${baseDraft} ${suffix}`
}

async function loadRevisionOrThrow(
  productionId: string,
  revisionId: string
): Promise<Record<string, unknown>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM budget_revisions
     WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [revisionId, productionId]
  )
  if (rows.length === 0) {
    throw new Error('Source revision not found for production')
  }
  return rows[0]!
}

export async function createBlankBudgetRevision(params: {
  productionId: string
  name: string
}): Promise<BudgetRevision> {
  const ts = now()
  const name = trimRequiredName(params.name)
  const id = uuid()
  return runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, NULL, 0, 'unapproved', $4, $5, NULL)`,
      [id, params.productionId, name, ts, ts]
    )
    const createdRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM budget_revisions WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL`,
      [id, params.productionId]
    )
    const row = createdRows[0]
    if (!row) {
      throw new Error('Created budget revision could not be read back; try again.')
    }
    return rowToRevision(row)
  })
}

export async function createBudgetRevisionFromExisting(params: {
  productionId: string
  sourceRevisionId: string
  newRevisionName: string
}): Promise<BudgetRevision> {
  const db = await getDb()
  const ts = now()
  const targetName = trimRequiredName(params.newRevisionName)
  await loadRevisionOrThrow(params.productionId, params.sourceRevisionId)

  const targetRevisionId = uuid()

  await runInSerializedTransaction(async () => {
    const conn = await getDb()

    const [
      sourceItems,
      sourceItemDetails,
      sourceTotals,
      sourceGroups,
      sourceLinks,
      sourceFloats,
      sourceFloatLinks,
      sourceFringe,
      sourceContingency,
    ] = await Promise.all([
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM budget_items
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT d.* FROM budget_item_details d
         INNER JOIN budget_items i ON i.id = d.budget_item_id
         WHERE i.production_id = $1 AND i.budget_revision_id = $2 AND i.deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM production_totals
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM cost_report_groups
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM budget_item_expense_links
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM floats
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM float_expense_links
         WHERE budget_revision_id = $1 AND deleted_at IS NULL`,
        [params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM fringe_rules
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
      conn.select<Record<string, unknown>[]>(
        `SELECT * FROM contingency_rules
         WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL`,
        [params.productionId, params.sourceRevisionId]
      ),
    ])

    const sourceTotalIds = sourceTotals.map((r) => r.id as string)
    const sourceGroupIds = sourceGroups.map((r) => r.id as string)
    const sourceFringeIds = sourceFringe.map((r) => r.id as string)
    const sourceContingencyIds = sourceContingency.map((r) => r.id as string)

    const [sourceTotalAccounts, sourceGroupAccounts, sourceFringeScopes, sourceContingencyScopes] =
      await Promise.all([
        sourceTotalIds.length
          ? conn.select<Record<string, unknown>[]>(
              `SELECT * FROM production_total_accounts WHERE production_total_id IN (${sourceTotalIds.map((_, i) => `$${i + 1}`).join(', ')})`,
              sourceTotalIds
            )
          : Promise.resolve([]),
        sourceGroupIds.length
          ? conn.select<Record<string, unknown>[]>(
              `SELECT * FROM cost_report_group_accounts WHERE group_id IN (${sourceGroupIds.map((_, i) => `$${i + 1}`).join(', ')})`,
              sourceGroupIds
            )
          : Promise.resolve([]),
        sourceFringeIds.length
          ? conn.select<Record<string, unknown>[]>(
              `SELECT * FROM fringe_rule_scopes WHERE rule_id IN (${sourceFringeIds.map((_, i) => `$${i + 1}`).join(', ')})`,
              sourceFringeIds
            )
          : Promise.resolve([]),
        sourceContingencyIds.length
          ? conn.select<Record<string, unknown>[]>(
              `SELECT * FROM contingency_rule_scopes WHERE rule_id IN (${sourceContingencyIds.map((_, i) => `$${i + 1}`).join(', ')})`,
              sourceContingencyIds
            )
          : Promise.resolve([]),
      ])

    const itemIdMap: IdMap = new Map()
    const totalIdMap: IdMap = new Map()
    const groupIdMap: IdMap = new Map()
    const floatIdMap: IdMap = new Map()
    const fringeIdMap: IdMap = new Map()
    const contingencyIdMap: IdMap = new Map()

    const statements: Stmt[] = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, 0, 'unapproved', $5, $6, NULL)`,
        bindValues: [
          targetRevisionId,
          params.productionId,
          targetName,
          params.sourceRevisionId,
          ts,
          ts,
        ],
      },
    ]

    for (const r of sourceItems) {
      const newId = uuid()
      itemIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO budget_items (id, production_id, budget_revision_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL)`,
        bindValues: [
          newId,
          params.productionId,
          targetRevisionId,
          r.category_id ?? null,
          r.account_id ?? null,
          r.description,
          r.estimated_cost ?? 0,
          r.actual_cost ?? 0,
          r.vendor ?? null,
          r.status ?? 'draft',
          r.line_item_type ?? null,
          ts,
          ts,
        ],
      })
    }

    for (const r of sourceItemDetails) {
      const sourceBudgetItemId = r.budget_item_id as string
      const mappedBudgetItemId = itemIdMap.get(sourceBudgetItemId)
      if (!mappedBudgetItemId) continue
      statements.push({
        sql: `INSERT INTO budget_item_details (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [uuid(), mappedBudgetItemId, r.line_item_type, r.details_json, ts, ts],
      })
    }

    for (const r of sourceTotals) {
      const newId = uuid()
      totalIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO production_totals (id, production_id, budget_revision_id, name, sort_order, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
        bindValues: [newId, params.productionId, targetRevisionId, r.name, r.sort_order ?? 0, ts, ts],
      })
    }

    for (const r of sourceTotalAccounts) {
      const mappedTotalId = totalIdMap.get(r.production_total_id as string)
      if (!mappedTotalId) continue
      statements.push({
        sql: `INSERT INTO production_total_accounts (id, production_total_id, account_id)
              VALUES ($1, $2, $3)`,
        bindValues: [uuid(), mappedTotalId, r.account_id],
      })
    }

    for (const r of sourceGroups) {
      const newId = uuid()
      groupIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO cost_report_groups (id, production_id, budget_revision_id, code, name, sort_order, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
        bindValues: [
          newId,
          params.productionId,
          targetRevisionId,
          r.code ?? null,
          r.name,
          r.sort_order ?? 0,
          ts,
          ts,
        ],
      })
    }

    for (const r of sourceGroupAccounts) {
      const mappedGroupId = groupIdMap.get(r.group_id as string)
      if (!mappedGroupId) continue
      statements.push({
        sql: `INSERT INTO cost_report_group_accounts (id, group_id, account_id)
              VALUES ($1, $2, $3)`,
        bindValues: [uuid(), mappedGroupId, r.account_id],
      })
    }

    for (const r of sourceLinks) {
      const mappedItemId = itemIdMap.get(r.budget_item_id as string)
      if (!mappedItemId) continue
      statements.push({
        sql: `INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
        bindValues: [
          uuid(),
          params.productionId,
          targetRevisionId,
          mappedItemId,
          r.expense_id,
          r.matched_amount,
          ts,
          ts,
        ],
      })
    }

    for (const r of sourceFloats) {
      const mappedItemId = itemIdMap.get(r.budget_item_id as string)
      if (!mappedItemId) continue
      const newId = uuid()
      floatIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO floats (id, production_id, budget_revision_id, budget_item_id, person_id, amount, currency, issued_date, notes, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)`,
        bindValues: [
          newId,
          params.productionId,
          targetRevisionId,
          mappedItemId,
          r.person_id,
          r.amount,
          r.currency,
          r.issued_date,
          r.notes ?? null,
          Date.now(),
          Date.now(),
        ],
      })
    }

    for (const r of sourceFloatLinks) {
      const mappedFloatId = floatIdMap.get(r.float_id as string)
      if (!mappedFloatId) continue
      statements.push({
        sql: `INSERT INTO float_expense_links (id, budget_revision_id, float_id, expense_id, matched_amount, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
        bindValues: [
          uuid(),
          targetRevisionId,
          mappedFloatId,
          r.expense_id,
          r.matched_amount,
          Date.now(),
          Date.now(),
        ],
      })
    }

    for (const r of sourceFringe) {
      const newId = uuid()
      fringeIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO fringe_rules (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
        bindValues: [
          newId,
          params.productionId,
          targetRevisionId,
          r.name,
          r.rate,
          r.base_kind ?? 'budget',
          r.scope_mode ?? 'include_subtrees',
          r.is_enabled ?? 1,
          ts,
          ts,
        ],
      })
    }

    for (const r of sourceFringeScopes) {
      const mappedRuleId = fringeIdMap.get(r.rule_id as string)
      if (!mappedRuleId) continue
      statements.push({
        sql: `INSERT INTO fringe_rule_scopes (id, rule_id, account_id, include_children)
              VALUES ($1, $2, $3, $4)`,
        bindValues: [uuid(), mappedRuleId, r.account_id, r.include_children ?? 1],
      })
    }

    for (const r of sourceContingency) {
      const newId = uuid()
      contingencyIdMap.set(r.id as string, newId)
      statements.push({
        sql: `INSERT INTO contingency_rules (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
        bindValues: [
          newId,
          params.productionId,
          targetRevisionId,
          r.name,
          r.rate,
          r.base_kind ?? 'budget',
          r.scope_mode ?? 'include_subtrees',
          r.is_enabled ?? 1,
          ts,
          ts,
        ],
      })
    }

    for (const r of sourceContingencyScopes) {
      const mappedRuleId = contingencyIdMap.get(r.rule_id as string)
      if (!mappedRuleId) continue
      statements.push({
        sql: `INSERT INTO contingency_rule_scopes (id, rule_id, account_id, include_children)
              VALUES ($1, $2, $3, $4)`,
        bindValues: [uuid(), mappedRuleId, r.account_id, r.include_children ?? 1],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })

  const createdRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM budget_revisions WHERE id = $1 LIMIT 1`,
    [targetRevisionId]
  )
  return rowToRevision(createdRows[0])
}

export async function duplicateLiveBudgetRevisionAsDraft(params: {
  productionId: string
}): Promise<BudgetRevision> {
  const live = await getLiveBudgetRevisionForProduction(params.productionId)
  if (!live) {
    throw new Error('No live budget revision found for production')
  }

  const revisions = await listBudgetRevisionsByProduction(params.productionId)
  const newRevisionName = buildDuplicateLiveDraftName({
    liveRevisionName: live.name,
    existingRevisionNames: revisions.map((r) => r.name),
  })

  return createBudgetRevisionFromExisting({
    productionId: params.productionId,
    sourceRevisionId: live.id,
    newRevisionName,
  })
}
