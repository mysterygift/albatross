/**
 * Derived petty cash float reminders (no persistence, no background jobs).
 * Severity rules are shared across Budget, Dashboard, Wrap, and dialogs.
 */

import type { FloatExpenseLink, Person, PettyCashFloat, PettyCashFloatReconciliationStatus } from '@/lib/db/types'
import { getPettyCashFloatDerived } from '@/lib/budget/floatExpenseMatching'

export type FloatReminderSeverity = 'info' | 'warning' | 'critical'

export type FloatReminderRow = {
  floatId: string
  personName: string
  department: string
  remaining: number
  currency: string
  issuedDate: string
  ageDays: number
  severity: FloatReminderSeverity
}

export type OutstandingFloatReminders = {
  totalOutstanding: number
  unresolvedCount: number
  /** True if any reminder has severity critical (e.g. age &gt; 14 or overspent + stale). */
  hasCritical: boolean
  reminders: FloatReminderRow[]
}

/** Calendar days since `issuedDate` (YYYY-MM-DD). Non-negative. */
export function issuedDateToAgeDays(issuedDateStr: string): number {
  const parts = issuedDateStr.trim().split('-').map((x) => parseInt(x, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
  const y = parts[0]!
  const m = parts[1]!
  const d = parts[2]!
  const issued = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  issued.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - issued.getTime()
  const days = Math.floor(diffMs / 86400000)
  return Math.max(0, days)
}

/**
 * Shared severity rules (PF6):
 * - Overspent: at least warning; if ageDays &gt; 14 → critical.
 * - If remaining &gt; 0: &gt;14 days → critical, &gt;7 → warning, else info.
 */
export function computeFloatReminderSeverity(params: {
  status: PettyCashFloatReconciliationStatus
  remaining: number
  ageDays: number
}): FloatReminderSeverity {
  const { status, remaining, ageDays } = params
  if (status === 'overspent') {
    if (ageDays > 14) return 'critical'
    return 'warning'
  }
  if (remaining > 0) {
    if (ageDays > 14) return 'critical'
    if (ageDays > 7) return 'warning'
    return 'info'
  }
  return 'info'
}

export function formatIssuedDaysAgo(ageDays: number): string {
  if (ageDays <= 0) return 'Issued today'
  if (ageDays === 1) return 'Issued 1 day ago'
  return `Issued ${ageDays} days ago`
}

/**
 * Minimal status dot (Line item panel): green matched, yellow partial,
 * red if overspent or reminder severity is critical; unmatched uses severity.
 */
export function getFloatLeadDotClassName(
  status: PettyCashFloatReconciliationStatus,
  severity: FloatReminderSeverity
): string {
  if (status === 'matched') return 'bg-green-600 dark:bg-green-500'
  if (status === 'partial') return 'bg-amber-400 dark:bg-amber-500'
  if (status === 'overspent') return 'bg-destructive'
  if (severity === 'critical') return 'bg-destructive'
  if (severity === 'warning') return 'bg-amber-400 dark:bg-amber-500'
  return 'bg-muted-foreground/45'
}

const SEVERITY_RANK: Record<FloatReminderSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

export function getOutstandingFloatReminders(params: {
  floats: PettyCashFloat[]
  floatExpenseLinks: FloatExpenseLink[]
  people: Person[]
}): OutstandingFloatReminders {
  const { floats, floatExpenseLinks, people } = params
  const personById = new Map(people.map((p) => [p.id, p]))

  const linksByFloatId = new Map<string, FloatExpenseLink[]>()
  for (const link of floatExpenseLinks) {
    const list = linksByFloatId.get(link.float_id) ?? []
    list.push(link)
    linksByFloatId.set(link.float_id, list)
  }

  let totalOutstanding = 0
  const reminders: FloatReminderRow[] = []

  for (const f of floats) {
    const links = linksByFloatId.get(f.id) ?? []
    const d = getPettyCashFloatDerived(f, links)
    if (d.status === 'matched') continue

    const ageDays = issuedDateToAgeDays(f.issued_date)
    const severity = computeFloatReminderSeverity({
      status: d.status,
      remaining: d.remaining,
      ageDays,
    })

    if (d.remaining > 0) totalOutstanding += d.remaining
    else if (d.status === 'overspent') totalOutstanding += d.matched - d.allocated

    const person = personById.get(f.person_id)
    reminders.push({
      floatId: f.id,
      personName: person?.name ?? 'Unknown',
      department: person?.department?.trim() ? person.department.trim() : 'Unassigned',
      remaining: d.remaining,
      currency: f.currency,
      issuedDate: f.issued_date,
      ageDays,
      severity,
    })
  }

  reminders.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (s !== 0) return s
    return b.ageDays - a.ageDays
  })

  return {
    totalOutstanding,
    unresolvedCount: reminders.length,
    hasCritical: reminders.some((r) => r.severity === 'critical'),
    reminders,
  }
}
