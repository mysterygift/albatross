/**
 * Chart of accounts templates that can be applied to an existing production, plus the pure planner that
 * works out what applying one would change. DB work lives in `@/lib/db/applyChartTemplate`.
 */
import type { BudgetAccount } from '@/lib/db/types'
import {
  DEMO_ATL_HEADER_CODES,
  DEMO_BTL_HEADER_CODES,
  DEMO_CHART_OF_ACCOUNTS,
} from '@/lib/db/seed/demoBudgetSeed'
import { BBC_CHART_TEMPLATE } from './bbcChartTemplate'

export type ChartTemplateAccount = {
  code: string
  name: string
  parentCode: string | null
  isPostable: boolean
}

/** A fringe (e.g. employer's NI) applied to a set of template accounts. */
export type ChartTemplateFringe = {
  name: string
  rate: number
  accountCodes: string[]
}

/** A production total (Cost Report rollup) made of top-level header accounts. */
export type ChartTemplateTotal = {
  name: string
  headerCodes: string[]
}

export type ChartTemplate = {
  id: ChartTemplateId
  name: string
  description: string
  /** Ordered parents-first. */
  accounts: ChartTemplateAccount[]
  totals: ChartTemplateTotal[]
  fringes: ChartTemplateFringe[]
}

export type ChartTemplateId = 'standard' | 'bbc'

/**
 * merge: add template accounts that are missing; leave everything else alone.
 * replace: also remove accounts that are not in the template and have no line items or expenses
 * (in themselves or below them), and rename matching accounts to the template's names.
 */
export type ChartTemplateMode = 'merge' | 'replace'

function standardParentCode(code: string): string | null {
  const n = Number(code)
  return n % 100 === 0 ? null : String(Math.floor(n / 100) * 100)
}

export const STANDARD_CHART_TEMPLATE: ChartTemplate = {
  id: 'standard',
  name: 'Standard',
  description:
    'The default Albatross chart used by new productions: script, producers, directors, cast, crew departments, locations, post and deliverables.',
  accounts: DEMO_CHART_OF_ACCOUNTS.map(({ code, name }) => {
    const parentCode = standardParentCode(code)
    return { code, name, parentCode, isPostable: parentCode != null }
  }),
  totals: [
    { name: 'Above the Line', headerCodes: DEMO_ATL_HEADER_CODES },
    { name: 'Below the Line', headerCodes: DEMO_BTL_HEADER_CODES },
  ],
  fringes: [],
}

export const CHART_TEMPLATES: ChartTemplate[] = [STANDARD_CHART_TEMPLATE, BBC_CHART_TEMPLATE]

export function getChartTemplate(id: ChartTemplateId): ChartTemplate {
  const template = CHART_TEMPLATES.find((t) => t.id === id)
  if (!template) throw new Error(`Unknown chart template: ${id}`)
  return template
}

export type ChartTemplatePlan = {
  /** Existing accounts to delete (replace mode only). Children are listed before their parents. */
  remove: BudgetAccount[]
  /** Existing accounts that match the template but carry a different name (replace mode only). */
  rename: { account: BudgetAccount; name: string }[]
  /** Template accounts to create, parents first. */
  add: ChartTemplateAccount[]
  /** Template accounts that cannot be created because their code (or their parent's) clashes with the existing chart. */
  skipped: { account: ChartTemplateAccount; reason: string }[]
  /** Existing accounts that stay but aren't part of the template's structure (in replace mode, only ones with postings). */
  keep: BudgetAccount[]
}

/**
 * Work out what applying `template` would do. `postedAccountIds` are accounts with line items or expenses;
 * those (and their ancestors) are never removed.
 */
export function planChartTemplate(
  accounts: BudgetAccount[],
  postedAccountIds: Set<string>,
  template: ChartTemplate,
  mode: ChartTemplateMode
): ChartTemplatePlan {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const childrenOf = new Map<string, BudgetAccount[]>()
  for (const a of accounts) {
    if (!a.parent_account_id) continue
    const list = childrenOf.get(a.parent_account_id) ?? []
    list.push(a)
    childrenOf.set(a.parent_account_id, list)
  }
  const templateByCode = new Map(template.accounts.map((t) => [t.code, t]))

  const anchoredMemo = new Map<string, boolean>()
  const isAnchored = (a: BudgetAccount): boolean => {
    const cached = anchoredMemo.get(a.id)
    if (cached !== undefined) return cached
    const result = postedAccountIds.has(a.id) || (childrenOf.get(a.id) ?? []).some(isAnchored)
    anchoredMemo.set(a.id, result)
    return result
  }

  /** Same code, same postable flag and same place in the tree as the template account. */
  const matchesMemo = new Map<string, boolean>()
  const matchesTemplate = (a: BudgetAccount): boolean => {
    const cached = matchesMemo.get(a.id)
    if (cached !== undefined) return cached
    const t = templateByCode.get(a.code)
    let result = false
    if (t && t.isPostable === a.is_postable) {
      const parent = a.parent_account_id ? byId.get(a.parent_account_id) : undefined
      result =
        t.parentCode == null
          ? parent == null
          : parent != null && parent.code === t.parentCode && matchesTemplate(parent)
    }
    matchesMemo.set(a.id, result)
    return result
  }

  const remove: BudgetAccount[] = []
  if (mode === 'replace') {
    // Post-order so children come before parents.
    const visit = (a: BudgetAccount) => {
      for (const child of childrenOf.get(a.id) ?? []) visit(child)
      if (!isAnchored(a) && !matchesTemplate(a)) remove.push(a)
    }
    for (const a of accounts) if (!a.parent_account_id || !byId.has(a.parent_account_id)) visit(a)
  }
  const removedIds = new Set(remove.map((a) => a.id))
  const remaining = accounts.filter((a) => !removedIds.has(a.id))

  const existingByCode = new Map<string, BudgetAccount>()
  for (const a of remaining) if (!existingByCode.has(a.code)) existingByCode.set(a.code, a)

  const rename =
    mode === 'replace'
      ? remaining
          .filter((a) => matchesTemplate(a) && templateByCode.get(a.code)!.name !== a.name)
          .map((a) => ({ account: a, name: templateByCode.get(a.code)!.name }))
      : []

  const add: ChartTemplateAccount[] = []
  const skipped: ChartTemplatePlan['skipped'] = []
  /** Codes that can act as a parent once the template is applied. */
  const headerCodes = new Set<string>()
  const skippedCodes = new Set<string>()
  for (const t of template.accounts) {
    const existing = existingByCode.get(t.code)
    if (existing && matchesTemplate(existing)) {
      if (!existing.is_postable) headerCodes.add(t.code)
      continue
    }
    if (existing) {
      skipped.push({ account: t, reason: `Code ${t.code} is already used by your account “${existing.name}”` })
      skippedCodes.add(t.code)
      continue
    }
    if (t.parentCode != null && !headerCodes.has(t.parentCode)) {
      skipped.push({ account: t, reason: `Its parent ${t.parentCode} was skipped` })
      skippedCodes.add(t.code)
      continue
    }
    add.push(t)
    if (!t.isPostable) headerCodes.add(t.code)
  }

  const keep = remaining.filter((a) => !matchesTemplate(a))
  return { remove, rename, add, skipped, keep }
}
