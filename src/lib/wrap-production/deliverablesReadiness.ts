/**
 * Deliverables readiness for wrap production.
 * Read-only; maps deliverable status to wrap states (signed off / pending / unknown).
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

/** Map raw deliverable.status string to wrap status. */
export function getDeliverableWrapStatus(status: string): DeliverableWrapStatus {
  const s = (status ?? '').trim().toLowerCase()
  if (s === 'signed_off' || s === 'signed off' || s === 'complete' || s === 'completed') {
    return 'signed_off'
  }
  if (s === 'pending') return 'pending'
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
