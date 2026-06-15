/**
 * Delete a budget line item after relocating matched expenses and petty-cash floats.
 * All writes run in one executeBatch transaction per DATABASE_LAYER.md.
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { getRelatedExpensesForLineItem } from '@/lib/budget/matching'
import { roundMoney } from '@/lib/money/roundMoney'
import type { BudgetItem, BudgetItemExpenseLink, Expense } from '../types'
import { getAccountById } from './budgetAccounts'
import { listBudgetItemExpenseLinksForBudgetItem } from './budgetReconciliation'
import { listFloatsByBudgetItem } from './floats'
import { resolveBudgetRevisionId } from './budgetRevisions'

const ITEM_TABLE = 'budget_items'
const LINKS_TABLE = 'budget_item_expense_links'
const FLOATS_TABLE = 'floats'
const EXP_TABLE = 'expenses'

export type ExpenseRelink = { linkId: string; targetBudgetItemId: string }
export type ExpenseAccountRelink = { expenseId: string; targetBudgetItemId: string }
export type FloatRelink = { floatId: string; targetBudgetItemId: string }

export type DeleteBudgetLineItemParams = {
  productionId: string
  revisionId?: string | null
  budgetItemId: string
  expenseRelinks: ExpenseRelink[]
  expenseAccountRelinks: ExpenseAccountRelink[]
  floatRelinks: FloatRelink[]
}

async function assertBudgetItemInProduction(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetItemId: string,
  productionId: string,
  label: string
): Promise<void> {
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${ITEM_TABLE} WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL`,
    [budgetItemId, productionId]
  )
  if (rows.length === 0) {
    throw new Error(`${label} not found, deleted, or does not belong to this production`)
  }
}

function assertCompleteCoverage<T extends { id: string }>(
  loaded: T[],
  providedIds: string[],
  entityLabel: string
): void {
  if (loaded.length !== providedIds.length) {
    throw new Error(
      `Expected ${loaded.length} ${entityLabel} relink(s), received ${providedIds.length}`
    )
  }
  const loadedIds = new Set(loaded.map((r) => r.id))
  for (const id of providedIds) {
    if (!loadedIds.has(id)) {
      throw new Error(`Unknown or duplicate ${entityLabel} id in relink request: ${id}`)
    }
  }
}

export async function deleteBudgetLineItemWithRelinks(
  params: DeleteBudgetLineItemParams
): Promise<void> {
  const { productionId, revisionId, budgetItemId, expenseRelinks, expenseAccountRelinks, floatRelinks } = params

  const db = await getDb()
  const itemRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, account_id, line_item_type FROM ${ITEM_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [budgetItemId]
  )
  const item = itemRows[0]
  if (!item) throw new Error('Budget item not found or already deleted')
  if ((item.production_id as string) !== productionId) {
    throw new Error('Budget item does not belong to this production')
  }

  const expenseRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, account_id, transaction_type FROM ${EXP_TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const productionExpenses = expenseRows.map(
    (r) =>
      ({
        id: r.id as string,
        production_id: r.production_id as string,
        account_id: (r.account_id as string | null) ?? null,
        transaction_type: (r.transaction_type as Expense['transaction_type']) ?? null,
      }) as Expense
  )

  const [links, floats] = await Promise.all([
    listBudgetItemExpenseLinksForBudgetItem(budgetItemId, productionId, revisionId),
    listFloatsByBudgetItem(budgetItemId),
  ])

  const deletedBudgetItem = {
    id: budgetItemId,
    production_id: productionId,
    budget_revision_id: null,
    category_id: null,
    account_id: (item.account_id as string | null) ?? null,
    description: '',
    estimated_cost: 0,
    actual_cost: 0,
    vendor: null,
    status: 'draft',
    line_item_type: (item.line_item_type as BudgetItem['line_item_type']) ?? null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  } satisfies BudgetItem

  const linkedExpenseIds = new Set(links.map((l) => l.expense_id))
  const relatedUnlinkedExpenses = getRelatedExpensesForLineItem(
    deletedBudgetItem,
    productionExpenses,
    deletedBudgetItem.account_id
  ).filter((e) => !linkedExpenseIds.has(e.id))

  assertCompleteCoverage(
    links,
    expenseRelinks.map((r) => r.linkId),
    'expense link'
  )
  assertCompleteCoverage(
    relatedUnlinkedExpenses.map((e) => ({ id: e.id })),
    expenseAccountRelinks.map((r) => r.expenseId),
    'posted expense'
  )
  assertCompleteCoverage(
    floats.map((f) => ({ id: f.id })),
    floatRelinks.map((r) => r.floatId),
    'float'
  )

  const targetItemIds = new Set<string>()
  for (const r of expenseRelinks) {
    if (r.targetBudgetItemId === budgetItemId) {
      throw new Error('Cannot relink to the line item being deleted')
    }
    targetItemIds.add(r.targetBudgetItemId)
  }
  for (const r of expenseAccountRelinks) {
    if (r.targetBudgetItemId === budgetItemId) {
      throw new Error('Cannot relink to the line item being deleted')
    }
    targetItemIds.add(r.targetBudgetItemId)
  }
  for (const r of floatRelinks) {
    if (r.targetBudgetItemId === budgetItemId) {
      throw new Error('Cannot relink to the line item being deleted')
    }
    targetItemIds.add(r.targetBudgetItemId)
  }
  for (const targetId of targetItemIds) {
    await assertBudgetItemInProduction(db, targetId, productionId, 'Target budget item')
  }

  const targetAccountByItemId = new Map<string, string | null>()
  for (const targetId of targetItemIds) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT account_id FROM ${ITEM_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [targetId]
    )
    const accountId = (rows[0]?.account_id as string | null) ?? null
    targetAccountByItemId.set(targetId, accountId)
    if (!accountId) {
      throw new Error('Target line item must belong to a postable account before expenses can be moved')
    }
    const account = await getAccountById(accountId)
    if (!account) throw new Error('Account not found')
    if (!account.is_postable) {
      throw new Error('Only leaf (postable) accounts may receive expenses')
    }
  }

  for (const relink of expenseAccountRelinks) {
    const expense = productionExpenses.find((e) => e.id === relink.expenseId)
    if (!expense) throw new Error('Posted expense not found or deleted')
    if (expense.account_id !== deletedBudgetItem.account_id) {
      throw new Error('Posted expense does not belong to the deleted line item account')
    }
    if (linkedExpenseIds.has(relink.expenseId)) {
      throw new Error('Posted expense is already covered by a matched expense relink')
    }
  }

  const linkById = new Map(links.map((l) => [l.id, l]))
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const ts = now()

  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
    ]
    const recodedExpenseIds = new Set<string>()

    for (const relink of expenseRelinks) {
      const sourceLink = linkById.get(relink.linkId)!
      await appendExpenseRelinkStatements({
        statements,
        sourceLink,
        targetBudgetItemId: relink.targetBudgetItemId,
        productionId,
        budgetRevisionId,
        ts,
        conn,
      })
      const targetAccountId = targetAccountByItemId.get(relink.targetBudgetItemId)
      if (targetAccountId && !recodedExpenseIds.has(sourceLink.expense_id)) {
        recodedExpenseIds.add(sourceLink.expense_id)
        statements.push({
          sql: `UPDATE ${EXP_TABLE} SET account_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          bindValues: [targetAccountId, ts, sourceLink.expense_id],
        })
        statements.push(
          outboxStatementForRow({
            entity: EXP_TABLE,
            entityId: sourceLink.expense_id,
            operation: 'update',
            payloadJson: JSON.stringify({ account_id: targetAccountId }),
          })
        )
      }
    }

    for (const relink of expenseAccountRelinks) {
      const targetAccountId = targetAccountByItemId.get(relink.targetBudgetItemId)
      if (!targetAccountId || recodedExpenseIds.has(relink.expenseId)) continue
      recodedExpenseIds.add(relink.expenseId)
      statements.push({
        sql: `UPDATE ${EXP_TABLE} SET account_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [targetAccountId, ts, relink.expenseId],
      })
      statements.push(
        outboxStatementForRow({
          entity: EXP_TABLE,
          entityId: relink.expenseId,
          operation: 'update',
          payloadJson: JSON.stringify({ account_id: targetAccountId }),
        })
      )
    }

    for (const relink of floatRelinks) {
      statements.push({
        sql: `UPDATE ${FLOATS_TABLE} SET budget_item_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [relink.targetBudgetItemId, ts, relink.floatId],
      })
    }

    statements.push({
      sql: `UPDATE ${ITEM_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, budgetItemId],
    })
    statements.push(
      outboxStatementForRow({
        entity: ITEM_TABLE,
        entityId: budgetItemId,
        operation: 'delete',
        payloadJson: null,
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })

    await executeBatch(conn, statements)
  })
}

async function appendExpenseRelinkStatements(args: {
  statements: Array<{ sql: string; bindValues: unknown[] }>
  sourceLink: BudgetItemExpenseLink
  targetBudgetItemId: string
  productionId: string
  budgetRevisionId: string
  ts: string
  conn: Awaited<ReturnType<typeof getDb>>
}): Promise<void> {
  const { statements, sourceLink, targetBudgetItemId, productionId, budgetRevisionId, ts, conn } =
    args
  const matchedAmount = roundMoney(sourceLink.matched_amount)

  const existingAtTarget = await conn.select<Record<string, unknown>[]>(
    `SELECT id, matched_amount FROM ${LINKS_TABLE}
     WHERE budget_item_id = $1 AND expense_id = $2 AND deleted_at IS NULL`,
    [targetBudgetItemId, sourceLink.expense_id]
  )
  const existing = existingAtTarget[0]

  if (existing) {
    const merged = roundMoney(Number(existing.matched_amount ?? 0) + matchedAmount)
    statements.push({
      sql: `UPDATE ${LINKS_TABLE} SET matched_amount = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [merged, ts, existing.id as string],
    })
    statements.push({
      sql: `UPDATE ${LINKS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sourceLink.id],
    })
  } else {
    statements.push({
      sql: `UPDATE ${LINKS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sourceLink.id],
    })
    const newId = uuid()
    statements.push({
      sql: `INSERT INTO ${LINKS_TABLE}
        (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      bindValues: [
        newId,
        productionId,
        budgetRevisionId,
        targetBudgetItemId,
        sourceLink.expense_id,
        matchedAmount,
        ts,
        ts,
      ],
    })
  }
}
