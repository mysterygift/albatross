import type { RiskWatchItem } from '@/lib/budget/vendors/riskWatch'
import type { ProductionTask } from '@/lib/db/types'

export type AttentionItem = {
  id: string
  label: string
  href: string
  severity: 'critical' | 'warning'
}

export const ATTENTION_ITEM_LIMIT = 3

type DeliverableLike = { id: string; name: string; due_date: string | null; status: string }

/**
 * Picks the highest-signal items from data the dashboard already loads.
 * Priority: critical risks, overdue deliverables, incomplete required tasks, other risks.
 */
export function buildAttentionItems({
  requiredTasks,
  riskItems,
  deliverables,
  today,
  limit = ATTENTION_ITEM_LIMIT,
}: {
  requiredTasks: Pick<ProductionTask, 'id' | 'description'>[]
  riskItems: Pick<RiskWatchItem, 'id' | 'severity' | 'title' | 'href'>[]
  deliverables: DeliverableLike[]
  today: string
  limit?: number
}): AttentionItem[] {
  const critical: AttentionItem[] = riskItems
    .filter((r) => r.severity === 'critical')
    .map((r) => ({ id: `risk-${r.id}`, label: r.title, href: r.href ?? '/budget/vendors', severity: 'critical' }))
  const overdue: AttentionItem[] = deliverables
    .filter((d) => d.due_date && d.due_date < today && d.status !== 'delivered')
    .map((d) => ({ id: `deliverable-${d.id}`, label: `Overdue deliverable: ${d.name}`, href: '/deliverables', severity: 'critical' }))
  const tasks: AttentionItem[] = requiredTasks.map((t) => ({
    id: `task-${t.id}`,
    label: `Required task: ${t.description}`,
    href: '/tasks',
    severity: 'warning',
  }))
  const otherRisks: AttentionItem[] = riskItems
    .filter((r) => r.severity !== 'critical')
    .map((r) => ({ id: `risk-${r.id}`, label: r.title, href: r.href ?? '/budget/vendors', severity: 'warning' }))
  return [...critical, ...overdue, ...tasks, ...otherRisks].slice(0, limit)
}
