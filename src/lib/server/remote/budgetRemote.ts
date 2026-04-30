import type { ServerPublishContext } from '@/lib/db/projectDataSource'
import { coerceIsoString, coerceNumber } from '@/lib/db/sqlValueCoercion'
import type { BudgetItem, Expense } from '@/lib/db/types'
import { serverRuntimeList } from '@/lib/server/serverClient'

function mapBudgetItem(r: Record<string, unknown>): BudgetItem {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    category_id: r.category_id as string | null,
    account_id: r.account_id as string | null,
    description: r.description as string,
    estimated_cost: coerceNumber(r.estimated_cost, 0),
    actual_cost: coerceNumber(r.actual_cost, 0),
    vendor: r.vendor as string | null,
    status: (r.status as string) ?? 'draft',
    line_item_type: (r.line_item_type as BudgetItem['line_item_type']) ?? null,
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

function mapExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category_id: r.category_id as string | null,
    account_id: r.account_id as string | null,
    transaction_type: (r.transaction_type as Expense['transaction_type']) ?? null,
    vendor_id: (r.vendor_id as string | null) ?? null,
    amount: coerceNumber(r.amount, 0),
    date: coerceIsoString(r.date),
    vendor: r.vendor as string | null,
    notes: r.notes as string | null,
    expense_type: (r.expense_type as Expense['expense_type']) ?? 'other',
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

export async function remoteListBudgetItems(
  ctx: ServerPublishContext,
  revisionId: string | null,
): Promise<BudgetItem[]> {
  const q = revisionId ? { revision_id: revisionId } : undefined
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'budget_items',
    q,
  )
  return rows.map(mapBudgetItem)
}

export async function remoteListExpenses(ctx: ServerPublishContext): Promise<Expense[]> {
  const rows = await serverRuntimeList<Record<string, unknown>>(
    ctx.baseUrl,
    ctx.token,
    ctx.remoteProjectId,
    'expenses',
  )
  return rows.map(mapExpense)
}
