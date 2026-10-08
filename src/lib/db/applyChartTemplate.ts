/**
 * Apply a chart of accounts template to an existing production (see `@/lib/budget/chartTemplates`).
 *
 * Account changes (removals, renames, additions) run in one transaction. Production totals, template fringe
 * rules and the contingency scope are then brought in line for the given budget revision.
 */
import {
  getChartTemplate,
  planChartTemplate,
  type ChartTemplateId,
  type ChartTemplateMode,
  type ChartTemplatePlan,
} from '@/lib/budget/chartTemplates'
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import type { SqlStatement } from './databaseAdapter'
import { outboxStatementForRows, type OutboxRow } from './outbox'
import {
  accountDeletionStatements,
  listAccounts,
  listDeletedAccountIdsByCode,
  listPostedAccountIds,
  reviveAccountSql,
} from './repositories/budgetAccounts'
import {
  createFringeRule,
  listContingencyRules,
  listFringeRules,
  updateContingencyRule,
} from './repositories/budgetDerived'
import {
  createProductionTotal,
  listProductionTotals,
  updateProductionTotal,
} from './repositories/productionTotals'
import type { BudgetAccount } from './types'

export async function previewChartTemplate(
  productionId: string,
  templateId: ChartTemplateId,
  mode: ChartTemplateMode
): Promise<ChartTemplatePlan> {
  const [accounts, posted] = await Promise.all([listAccounts(productionId), listPostedAccountIds(productionId)])
  return planChartTemplate(accounts, posted, getChartTemplate(templateId), mode)
}

export type ApplyChartTemplateResult = {
  added: number
  removed: number
  renamed: number
  skipped: number
  fringeRulesAdded: string[]
  totalsUpdated: string[]
}

export async function applyChartTemplate(params: {
  productionId: string
  revisionId?: string | null
  templateId: ChartTemplateId
  mode: ChartTemplateMode
}): Promise<ApplyChartTemplateResult> {
  const { productionId, revisionId, templateId, mode } = params
  const template = getChartTemplate(templateId)
  const accountsBefore = await listAccounts(productionId)
  const posted = await listPostedAccountIds(productionId)
  const plan = planChartTemplate(accountsBefore, posted, template, mode)
  const contingencyBefore = await listContingencyRules(productionId, revisionId)

  const ts = now()
  const removedIds = new Set(plan.remove.map((a) => a.id))
  const idByCode = new Map<string, string>()
  for (const a of accountsBefore) {
    if (!removedIds.has(a.id) && !idByCode.has(a.code)) idByCode.set(a.code, a.id)
  }
  // Codes stay unique across deleted rows too, so a template code that was deleted (now or before) revives that row.
  const deletedIdByCode = await listDeletedAccountIdsByCode(productionId)
  for (const a of plan.remove) deletedIdByCode.set(a.code, a.id)
  const statements: SqlStatement[] = await accountDeletionStatements([...removedIds], ts)
  const outboxRows: OutboxRow[] = []
  for (const { account, name } of plan.rename) {
    statements.push({
      sql: `UPDATE budget_accounts SET name = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [name, ts, account.id],
    })
    outboxRows.push({ entity: 'budget_accounts', entityId: account.id, operation: 'update', payloadJson: JSON.stringify({ name }) })
  }
  const sortOrder = new Map(template.accounts.map((t, i) => [t.code, i]))
  for (const t of plan.add) {
    const revivedId = deletedIdByCode.get(t.code)
    const id = revivedId ?? uuid()
    idByCode.set(t.code, id)
    const parentId = t.parentCode ? idByCode.get(t.parentCode) ?? null : null
    const sort = sortOrder.get(t.code) ?? 0
    statements.push(
      revivedId
        ? { sql: reviveAccountSql, bindValues: [t.name, parentId, sort, t.isPostable ? 1 : 0, ts, id] }
        : {
            sql: `INSERT INTO budget_accounts (id, production_id, code, name, parent_account_id, sort_order, is_postable, archived_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
            bindValues: [id, productionId, t.code, t.name, parentId, sort, t.isPostable ? 1 : 0, ts, ts],
          }
    )
    outboxRows.push({
      entity: 'budget_accounts',
      entityId: id,
      operation: revivedId ? 'update' : 'create',
      payloadJson: JSON.stringify({
        id,
        production_id: productionId,
        code: t.code,
        name: t.name,
        parent_account_id: parentId,
        sort_order: sort,
        is_postable: t.isPostable,
        ...(revivedId ? { deleted_at: null, archived_at: null, color_hex: null } : {}),
      }),
    })
  }
  const outbox = outboxStatementForRows(outboxRows)
  if (outbox) statements.push(outbox)

  if (statements.length > 0) {
    await runInSerializedTransaction(async () => {
      await executeBatch(await getDb(), [
        { sql: 'BEGIN', bindValues: [] },
        ...statements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
  }

  // Accounts holding a clashing template code aren't the template's accounts, so leave them out of totals and fringes.
  const clashing = new Set(plan.skipped.map((s) => s.account.code))
  const accountsAfter = await listAccounts(productionId)
  const templateAccounts = accountsAfter.filter((a) => !clashing.has(a.code))
  const totalsUpdated = await syncProductionTotals(productionId, revisionId, template.totals, templateAccounts, accountsAfter)
  const fringeRulesAdded = await addTemplateFringes(productionId, revisionId, template.fringes, templateAccounts)
  await rescopeContingency(contingencyBefore, accountsBefore, accountsAfter)

  return {
    added: plan.add.length,
    removed: plan.remove.length,
    renamed: plan.rename.length,
    skipped: plan.skipped.length,
    fringeRulesAdded,
    totalsUpdated,
  }
}

function activeIdsForCodes(accounts: BudgetAccount[], codes: string[], postable: boolean): string[] {
  const byCode = new Map(accounts.filter((a) => !a.archived_at).map((a) => [a.code, a]))
  return codes
    .map((code) => byCode.get(code))
    .filter((a): a is BudgetAccount => a != null && a.is_postable === postable)
    .map((a) => a.id)
}

/** Create each template total, or add the template's header accounts to an existing total of the same name. */
async function syncProductionTotals(
  productionId: string,
  revisionId: string | null | undefined,
  totals: { name: string; headerCodes: string[] }[],
  templateAccounts: BudgetAccount[],
  allAccounts: BudgetAccount[]
): Promise<string[]> {
  if (totals.length === 0) return []
  const existing = await listProductionTotals(productionId, revisionId)
  const validHeaderIds = new Set(allAccounts.filter((a) => !a.is_postable && !a.archived_at).map((a) => a.id))
  const updated: string[] = []
  for (const total of totals) {
    const headerIds = activeIdsForCodes(templateAccounts, total.headerCodes, false)
    if (headerIds.length === 0) continue
    const match = existing.find((t) => t.name.trim().toLowerCase() === total.name.toLowerCase())
    if (!match) {
      await createProductionTotal({ production_id: productionId, revision_id: revisionId, name: total.name, account_ids: headerIds })
      updated.push(total.name)
      continue
    }
    const current = match.account_ids.filter((id) => validHeaderIds.has(id))
    const merged = [...new Set([...current, ...headerIds])]
    if (merged.length === match.account_ids.length && merged.every((id) => match.account_ids.includes(id))) continue
    await updateProductionTotal({ id: match.id, name: match.name, account_ids: merged })
    updated.push(match.name)
  }
  return updated
}

/** Add template fringe rules that don't exist yet (matched by name), scoped to the template's accounts. */
async function addTemplateFringes(
  productionId: string,
  revisionId: string | null | undefined,
  fringes: { name: string; rate: number; accountCodes: string[] }[],
  accounts: BudgetAccount[]
): Promise<string[]> {
  if (fringes.length === 0) return []
  const existingNames = new Set(
    (await listFringeRules(productionId, revisionId)).map((r) => r.name.trim().toLowerCase())
  )
  const added: string[] = []
  for (const fringe of fringes) {
    if (existingNames.has(fringe.name.toLowerCase())) continue
    const scope = activeIdsForCodes(accounts, fringe.accountCodes, true)
    if (scope.length === 0) continue
    await createFringeRule({
      production_id: productionId,
      revision_id: revisionId,
      name: fringe.name,
      rate: fringe.rate,
      base_kind: 'budget',
      scope_mode: 'include_subtrees',
      scope_account_ids: scope,
    })
    added.push(fringe.name)
  }
  return added
}

/**
 * A contingency rule that covered every top-level account (the default) keeps doing so after the template
 * changes the top level. Rules scoped to a hand-picked subset are left alone unless all their accounts were removed.
 */
async function rescopeContingency(
  rules: { id: string; scope_account_ids: string[] }[],
  accountsBefore: BudgetAccount[],
  accountsAfter: BudgetAccount[]
): Promise<void> {
  const rootsBefore = accountsBefore.filter((a) => !a.parent_account_id).map((a) => a.id)
  const rootsAfter = accountsAfter.filter((a) => !a.parent_account_id).map((a) => a.id)
  if (rootsAfter.length === 0) return
  const liveIds = new Set(accountsAfter.map((a) => a.id))
  for (const rule of rules) {
    const coveredAllRoots = rootsBefore.length > 0 && rootsBefore.every((id) => rule.scope_account_ids.includes(id))
    const nothingLeft = !rule.scope_account_ids.some((id) => liveIds.has(id))
    if (!coveredAllRoots && !nothingLeft) continue
    const current = rule.scope_account_ids.filter((id) => liveIds.has(id))
    if (current.length === rootsAfter.length && rootsAfter.every((id) => current.includes(id))) continue
    await updateContingencyRule(rule.id, { scope_account_ids: rootsAfter })
  }
}
