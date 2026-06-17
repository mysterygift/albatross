import type { BudgetAccount, BudgetItem, Expense } from '@/lib/db/types'

export type AccountTreeNode = {
  account: BudgetAccount
  children: AccountTreeNode[]
}

export type AccountTotals = {
  budgetTotal: number
  actualTotal: number
  variance: number
  percentSpent: number | null
}

/** Parse account code as number for ordering; non-numeric codes sort as 0 then by string. */
function codeAsNumber(code: string): number {
  const n = parseInt(String(code).trim(), 10)
  return Number.isNaN(n) ? 0 : n
}

/** Order accounts by numeric code, then sort_order, then code string (matches chart display). */
export function compareBudgetAccountsByCode(a: BudgetAccount, b: BudgetAccount): number {
  return (
    codeAsNumber(a.code) - codeAsNumber(b.code) ||
    a.sort_order - b.sort_order ||
    a.code.localeCompare(b.code)
  )
}

function compareCodeStrings(a: string, b: string): number {
  return codeAsNumber(a) - codeAsNumber(b) || a.localeCompare(b)
}

/** Sort line items for CSV export: account code order, then description within account. */
export function sortBudgetItemsForExport(
  items: BudgetItem[],
  accounts: BudgetAccount[],
  categories: Array<{ id: string; code: string }>
): BudgetItem[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  return [...items].sort((a, b) => {
    const accA = a.account_id ? accountById.get(a.account_id) : null
    const accB = b.account_id ? accountById.get(b.account_id) : null
    if (accA && accB) {
      const byAccount = compareBudgetAccountsByCode(accA, accB)
      if (byAccount !== 0) return byAccount
    } else if (accA && !accB) return -1
    else if (!accA && accB) return 1
    else {
      const catA = a.category_id ? categoryById.get(a.category_id) : null
      const catB = b.category_id ? categoryById.get(b.category_id) : null
      const byCategory = compareCodeStrings(catA?.code ?? '', catB?.code ?? '')
      if (byCategory !== 0) return byCategory
    }
    return a.description.localeCompare(b.description)
  })
}

/**
 * Build account tree from flat list. Roots have parent_account_id === null.
 * Siblings ordered by numeric code ascending, then sort_order, then code string for stability.
 */
export function buildAccountTree(accounts: BudgetAccount[]): AccountTreeNode[] {
  const byParent = new Map<string | null, BudgetAccount[]>()
  for (const a of accounts) {
    const key = a.parent_account_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(a)
  }
  for (const arr of byParent.values()) {
    arr.sort(compareBudgetAccountsByCode)
  }
  function node(parentKey: string | null): AccountTreeNode[] {
    const list = byParent.get(parentKey) ?? []
    return list.map((account) => ({
      account,
      children: node(account.id),
    }))
  }
  return node(null)
}

/**
 * Compute rollup totals per account using post-order traversal.
 * Direct totals from items/expenses for this account, then add children's totals.
 * Actuals from expenses only (budget_items.actual_cost not used).
 */
export function computeAccountTotals(
  accounts: BudgetAccount[],
  items: BudgetItem[],
  expenses: Expense[]
): Map<string, AccountTotals> {
  const tree = buildAccountTree(accounts)
  const directBudget = new Map<string, number>()
  const directActual = new Map<string, number>()
  for (const a of accounts) {
    directBudget.set(
      a.id,
      items.filter((i) => i.account_id === a.id).reduce((s, i) => s + i.estimated_cost, 0)
    )
    directActual.set(
      a.id,
      expenses.filter((e) => e.account_id === a.id).reduce((s, e) => s + e.amount, 0)
    )
  }
  const budgetTotal = new Map<string, number>()
  const actualTotal = new Map<string, number>()
  function visit(node: AccountTreeNode): void {
    for (const c of node.children) visit(c)
    const id = node.account.id
    const bud = (directBudget.get(id) ?? 0) + node.children.reduce((s, c) => s + (budgetTotal.get(c.account.id) ?? 0), 0)
    const act = (directActual.get(id) ?? 0) + node.children.reduce((s, c) => s + (actualTotal.get(c.account.id) ?? 0), 0)
    budgetTotal.set(id, bud)
    actualTotal.set(id, act)
  }
  for (const root of tree) visit(root)
  const result = new Map<string, AccountTotals>()
  for (const a of accounts) {
    const bud = budgetTotal.get(a.id) ?? 0
    const act = actualTotal.get(a.id) ?? 0
    result.set(a.id, {
      budgetTotal: bud,
      actualTotal: act,
      variance: bud - act,
      percentSpent: bud > 0 ? act / bud : null,
    })
  }
  return result
}

/** Uncoded spend total: sum of expenses where account_id IS NULL. */
export function uncodedSpendTotal(expenses: Expense[]): number {
  return expenses.filter((e) => e.account_id == null).reduce((s, e) => s + e.amount, 0)
}

/** List of expenses with account_id IS NULL. */
export function uncodedExpensesList(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => e.account_id == null)
}

/** Budget items with account_id IS NULL (legacy, display-only in Stage 4). */
export function legacyBudgetItemsList(items: BudgetItem[]): BudgetItem[] {
  return items.filter((i) => i.account_id == null)
}

/**
 * Return the set of leaf (postable) account ids in the subtree of the given node.
 * Used for group/production totals to sum leaf totals without double-counting.
 */
export function getDescendantLeafIdsFromNode(node: AccountTreeNode): Set<string> {
  if (node.account.is_postable) return new Set([node.account.id])
  const out = new Set<string>()
  for (const c of node.children) {
    getDescendantLeafIdsFromNode(c).forEach((id) => out.add(id))
  }
  return out
}

/**
 * Return the set of leaf account ids in the subtree of the given account (by id).
 * If the account is not found in the tree, returns an empty set.
 */
export function getDescendantLeafIds(accountTree: AccountTreeNode[], accountId: string): Set<string> {
  const idToNode = new Map<string, AccountTreeNode>()
  function index(nodes: AccountTreeNode[]) {
    for (const n of nodes) {
      idToNode.set(n.account.id, n)
      index(n.children)
    }
  }
  index(accountTree)
  const node = idToNode.get(accountId)
  if (!node) return new Set()
  return getDescendantLeafIdsFromNode(node)
}

/** Scope row: root account id and whether to include children (subtree). */
export type RuleScope = { account_id: string; include_children: number }

// Scopes may overlap (e.g. parent and child accounts selected).
// We deduplicate expanded account IDs to prevent double-counting.
/**
 * Given root account_ids and include_children=1, return the de-duplicated set of account ids
 * in scope (subtree expansion). Uses the tree to expand efficiently.
 */
export function resolveScopeAccountIds(
  ruleScopes: RuleScope[],
  accountTree: AccountTreeNode[]
): Set<string> {
  const idToNode = new Map<string, AccountTreeNode>()
  function index(nodes: AccountTreeNode[]) {
    for (const n of nodes) {
      idToNode.set(n.account.id, n)
      index(n.children)
    }
  }
  index(accountTree)
  const out = new Set<string>()
  for (const scope of ruleScopes) {
    if (!scope.include_children) {
      out.add(scope.account_id)
      continue
    }
    const node = idToNode.get(scope.account_id)
    if (!node) continue
    function collect(n: AccountTreeNode) {
      out.add(n.account.id)
      for (const c of n.children) collect(c)
    }
    collect(node)
  }
  return out
}

/**
 * Sum budget or actual totals for the given account ids from the totals map.
 * baseKind 'budget' uses budgetTotal; 'actual' uses actualTotal.
 * Missing accounts (e.g. deleted or changed) are treated as zero to avoid crashes.
 */
export function computeRuleBaseTotal(
  scopeAccountIds: Set<string>,
  totalsMap: Map<string, AccountTotals>,
  baseKind: 'budget' | 'actual'
): number {
  let sum = 0
  for (const id of scopeAccountIds) {
    const t = totalsMap.get(id)
    sum += baseKind === 'budget' ? (t?.budgetTotal ?? 0) : (t?.actualTotal ?? 0)
  }
  return sum
}

export type FringeRuleRow = {
  id: string
  name: string
  rate: number
  base_kind: 'budget' | 'actual'
  is_enabled: boolean
  scope_account_ids: string[]
}

export type FringeTotalsResult = {
  perRule: Array<{ ruleId: string; name: string; rate: number; base: number; amount: number; baseKind: 'budget' | 'actual' }>
  totalFringesAmount: number
}

/**
 * Compute fringe amounts per rule and total. Only enabled rules are included.
 * Bases use existing account totals (legacy items with account_id NULL are already excluded from rollups).
 */
export function computeFringeTotals(
  fringeRules: FringeRuleRow[],
  totalsMap: Map<string, AccountTotals>,
  tree: AccountTreeNode[]
): FringeTotalsResult {
  const perRule: FringeTotalsResult['perRule'] = []
  let totalFringesAmount = 0
  for (const rule of fringeRules) {
    if (!rule.is_enabled) continue
    const ruleScopes = rule.scope_account_ids.map((account_id) => ({ account_id, include_children: 1 as number }))
    const scopeIds = resolveScopeAccountIds(ruleScopes, tree)
    const base = computeRuleBaseTotal(scopeIds, totalsMap, rule.base_kind)
    const amount = base * rule.rate
    perRule.push({
      ruleId: rule.id,
      name: rule.name,
      rate: rule.rate,
      base,
      amount,
      baseKind: rule.base_kind,
    })
    totalFringesAmount += amount
  }
  return { perRule, totalFringesAmount }
}

export type ContingencyRuleRow = {
  id: string
  name: string
  rate: number
  base_kind: 'budget' | 'actual'
  is_enabled: boolean
  scope_account_ids: string[]
}

export type ContingencyTotalsResult = {
  perRule: Array<{ ruleId: string; name: string; rate: number; base: number; amount: number; baseKind: 'budget' | 'actual' }>
  totalContingencyAmount: number
}

/**
 * Compute contingency amounts per rule and total. Only enabled rules are included.
 */
export function computeContingencyTotals(
  contingencyRules: ContingencyRuleRow[],
  totalsMap: Map<string, AccountTotals>,
  tree: AccountTreeNode[]
): ContingencyTotalsResult {
  const perRule: ContingencyTotalsResult['perRule'] = []
  let totalContingencyAmount = 0
  for (const rule of contingencyRules) {
    if (!rule.is_enabled) continue
    const ruleScopes = rule.scope_account_ids.map((account_id) => ({ account_id, include_children: 1 as number }))
    const scopeIds = resolveScopeAccountIds(ruleScopes, tree)
    const base = computeRuleBaseTotal(scopeIds, totalsMap, rule.base_kind)
    const amount = base * rule.rate
    perRule.push({
      ruleId: rule.id,
      name: rule.name,
      rate: rule.rate,
      base,
      amount,
      baseKind: rule.base_kind,
    })
    totalContingencyAmount += amount
  }
  return { perRule, totalContingencyAmount }
}
