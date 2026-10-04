import type { VendorInvoice } from '@/lib/db/types'

export const INVOICE_STATUS_OPTIONS: { value: VendorInvoice['status']; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'received', label: 'Received' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]
