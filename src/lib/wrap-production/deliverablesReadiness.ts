/**
 * Deliverables readiness for wrap production.
 * Read-only; maps deliverable status to wrap states (signed off = delivered / pending / unknown).
 * Degrades gracefully when deliverables feature is incomplete.
 */

import type { Deliverable } from '@/lib/db/types'

export type DeliverablesReadinessStatus = 'ready' | 'needs_review'

export type DeliverableWrapStatus = 'signed_off' | 'pending' | 'unknown'

export type DeliverablesReadinessSummary = {
  status: DeliverablesReadinessStatus
  signedOffCount: number
  pendingCount: number
  unknownCount: number
  totalCount: number
}

/**
 * Statuses that count as done. `delivered` is the Deliverables page's final
 * status; `ready` (packaged, not yet sent) deliberately does not count.
 * `signed_off`, `complete`, `completed` and `done` are legacy values.
 */
const DONE_STATUSES = new Set([
  'delivered',
  'signed_off',
  'signed off',
  'complete',
  'completed',
  'done',
])

/** Statuses that are known but not done yet (Deliverables page values plus legacy `pending`). */
const PENDING_STATUSES = new Set([
  'not_started',
  'not started',
  'preparing',
  'qc',
  'ready',
  'pending',
])

/** Map raw deliverable.status string to wrap status. Unrecognised values are 'unknown'. */
export function getDeliverableWrapStatus(status: string): DeliverableWrapStatus {
  const s = (status ?? '').trim().toLowerCase()
  if (DONE_STATUSES.has(s)) return 'signed_off'
  if (PENDING_STATUSES.has(s)) return 'pending'
  return 'unknown'
}

/**
 * Compute deliverables readiness.
 * Ready only when all deliverables are signed off.
 * No deliverables or any not signed off → needs_review.
 */
export function getDeliverablesReadiness(deliverables: Deliverable[]): DeliverablesReadinessSummary {
  let signedOff = 0
  let pending = 0
  let unknown = 0
  for (const d of deliverables) {
    const wrap = getDeliverableWrapStatus(d.status)
    if (wrap === 'signed_off') signedOff += 1
    else if (wrap === 'pending') pending += 1
    else unknown += 1
  }
  const total = deliverables.length
  const status: DeliverablesReadinessStatus =
    total > 0 && signedOff === total ? 'ready' : 'needs_review'

  return {
    status,
    signedOffCount: signedOff,
    pendingCount: pending,
    unknownCount: unknown,
    totalCount: total,
  }
}

export type DeliverableReviewRow = {
  deliverable: Deliverable
  wrapStatus: DeliverableWrapStatus
}

/** Rows for the deliverables review list. */
export function getDeliverableReviewRows(deliverables: Deliverable[]): DeliverableReviewRow[] {
  return deliverables.map((deliverable) => ({
    deliverable,
    wrapStatus: getDeliverableWrapStatus(deliverable.status),
  }))
}
