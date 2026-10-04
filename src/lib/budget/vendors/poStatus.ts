/**
 * PO status helpers (pure). `vendor_purchase_orders.approval` is DERIVED from `status` and never
 * user-set: approved and closed POs count as approved, draft / issued are awaiting approval.
 */
import type { PurchaseOrderStatus } from '@/lib/db/types'

/** Statuses that count as approved. */
export const PO_APPROVED_STATUSES: readonly PurchaseOrderStatus[] = ['approved', 'closed']

/** Statuses that are still awaiting approval. */
export const PO_AWAITING_APPROVAL_STATUSES: readonly PurchaseOrderStatus[] = ['draft', 'issued']

export function isPoApproved(po: { status: PurchaseOrderStatus }): boolean {
  return PO_APPROVED_STATUSES.includes(po.status)
}

export function isPoAwaitingApproval(po: { status: PurchaseOrderStatus }): boolean {
  return PO_AWAITING_APPROVAL_STATUSES.includes(po.status)
}

/** Value for the legacy `approval` column (1 / 0) derived from a status. */
export function derivePoApproval(status: PurchaseOrderStatus): 0 | 1 {
  return PO_APPROVED_STATUSES.includes(status) ? 1 : 0
}
