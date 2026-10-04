/**
 * Human-readable PO amendment trail (pure). Shared by the vendor PO table's history popover.
 */
import type { VendorPurchaseOrderAmendment } from '@/lib/db/types'

type AmendmentFormat = (amount: number) => string

/** "Increased £2,000 → £5,000 · reason" / "Decreased …" / "Set to £5,000" (no previous value). */
export function describeAmendment(
  amendment: Pick<VendorPurchaseOrderAmendment, 'previous_amount' | 'new_amount' | 'reason'>,
  money: AmendmentFormat
): string {
  const { previous_amount: prev, new_amount: next, reason } = amendment
  let head: string
  if (prev == null) head = `Set to ${money(next)}`
  else head = `${next > prev ? 'Increased' : 'Decreased'} ${money(prev)} → ${money(next)}`
  return reason?.trim() ? `${head} · ${reason.trim()}` : head
}
