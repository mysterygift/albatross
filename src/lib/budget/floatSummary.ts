/**
 * Production-level float reconciliation summaries (derived only; no DB).
 */

import type { FloatExpenseLink, Person, PettyCashFloat, PettyCashFloatReconciliationStatus } from '@/lib/db/types'
import { getPettyCashFloatDerived } from '@/lib/budget/floatExpenseMatching'

export type FloatSummaryRow = {
  floatId: string
  /** Budget line item this float belongs to (for navigation). */
  budgetItemId: string
  personName: string
  department: string
  role: string
  allocated: number
  matched: number
  remaining: number
  status: PettyCashFloatReconciliationStatus
  currency: string
  /** ISO date string from float (for age / reminders). */
  issuedDate: string
}

export type FloatSummaryForProduction = {
  totalAllocated: number
  totalMatched: number
  totalRemaining: number
  floatCount: number
  /** True when floats use more than one currency code (totals are not a single-currency figure). */
  hasMixedCurrencies: boolean
  statusCounts: {
    unmatched: number
    partial: number
    matched: number
    overspent: number
  }
  floats: FloatSummaryRow[]
}

export function getFloatSummaryForProduction(params: {
  floats: PettyCashFloat[]
  floatExpenseLinks: FloatExpenseLink[]
  people: Person[]
}): FloatSummaryForProduction {
  const { floats, floatExpenseLinks, people } = params
  const personById = new Map(people.map((p) => [p.id, p]))

  const linksByFloatId = new Map<string, FloatExpenseLink[]>()
  for (const link of floatExpenseLinks) {
    const list = linksByFloatId.get(link.float_id) ?? []
    list.push(link)
    linksByFloatId.set(link.float_id, list)
  }

  const rows: FloatSummaryRow[] = []
  let totalAllocated = 0
  let totalMatched = 0
  let totalRemaining = 0
  const statusCounts: FloatSummaryForProduction['statusCounts'] = {
    unmatched: 0,
    partial: 0,
    matched: 0,
    overspent: 0,
  }

  const currencyCodes = new Set<string>()

  for (const f of floats) {
    currencyCodes.add(f.currency)
    const links = linksByFloatId.get(f.id) ?? []
    const d = getPettyCashFloatDerived(f, links)
    const person = personById.get(f.person_id)
    const personName = person?.name ?? 'Unknown'
    const department = person?.department?.trim() ? person.department.trim() : 'Unassigned'
    const role = person?.role_name?.trim() ? person.role_name.trim() : '—'

    rows.push({
      floatId: f.id,
      budgetItemId: f.budget_item_id,
      personName,
      department,
      role,
      allocated: d.allocated,
      matched: d.matched,
      remaining: d.remaining,
      status: d.status,
      currency: f.currency,
      issuedDate: f.issued_date,
    })

    totalAllocated += d.allocated
    totalMatched += d.matched
    totalRemaining += d.remaining
    statusCounts[d.status] += 1
  }

  return {
    totalAllocated,
    totalMatched,
    totalRemaining,
    floatCount: floats.length,
    hasMixedCurrencies: currencyCodes.size > 1,
    statusCounts,
    floats: rows,
  }
}

export type DepartmentFloatGroup = {
  totalAllocated: number
  totalMatched: number
  totalRemaining: number
  floatCount: number
  floats: FloatSummaryRow[]
}

/** Group summary rows by `department` (from `Person.department`, or "Unassigned"). */
export function groupFloatsByDepartment(
  summaryOrRows: FloatSummaryForProduction | FloatSummaryRow[]
): Record<string, DepartmentFloatGroup> {
  const rows = Array.isArray(summaryOrRows) ? summaryOrRows : summaryOrRows.floats
  const out: Record<string, DepartmentFloatGroup> = {}

  for (const row of rows) {
    const dept = row.department || 'Unassigned'
    if (!out[dept]) {
      out[dept] = {
        totalAllocated: 0,
        totalMatched: 0,
        totalRemaining: 0,
        floatCount: 0,
        floats: [],
      }
    }
    const g = out[dept]!
    g.floats.push(row)
    g.totalAllocated += row.allocated
    g.totalMatched += row.matched
    g.totalRemaining += row.remaining
    g.floatCount += 1
  }

  return out
}

/** Unmatched, partial, or overspent — actionable reconciliation states. */
export function isActionableFloatStatus(status: PettyCashFloatReconciliationStatus): boolean {
  return status !== 'matched'
}
