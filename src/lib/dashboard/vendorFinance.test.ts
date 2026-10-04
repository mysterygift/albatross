import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/repositories/vendorInvoices', () => ({ listVendorInvoicesByProduction: vi.fn() }))
vi.mock('@/lib/db/repositories/vendorPurchaseOrders', () => ({ listVendorPurchaseOrdersByProduction: vi.fn() }))

import {
  getOpenVendorPurchaseOrders,
  getVendorPurchaseOrdersAwaitingApproval,
  sumPurchaseOrdersInProductionCurrency,
} from '@/lib/dashboard/vendorFinance'
import type { VendorPurchaseOrder } from '@/lib/db/types'

const po = (over: Partial<VendorPurchaseOrder> & Pick<VendorPurchaseOrder, 'id' | 'status'>): VendorPurchaseOrder => ({
  production_id: 'p1',
  vendor_id: 'v1',
  po_number: over.id,
  description: null,
  issue_date: null,
  due_date: null,
  amount: 100,
  currency_code: null,
  exchange_rate: null,
  approval: 0,
  notes: null,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
  ...over,
})

describe('PO awaiting approval is derived from status', () => {
  it('is draft / issued only, whatever the stored approval column says', () => {
    const pos = [
      po({ id: 'draft', status: 'draft', approval: 1 }),
      po({ id: 'issued', status: 'issued' }),
      po({ id: 'approved', status: 'approved' }),
      po({ id: 'closed', status: 'closed' }),
      po({ id: 'cancelled', status: 'cancelled' }),
    ]
    expect(getVendorPurchaseOrdersAwaitingApproval(pos).map((p) => p.id)).toEqual(['draft', 'issued'])
    expect(getOpenVendorPurchaseOrders(pos).map((p) => p.id)).toEqual(['draft', 'issued', 'approved'])
  })
})

describe('sumPurchaseOrdersInProductionCurrency', () => {
  it('converts each PO via its locked rate and rounds the total', () => {
    const pos = [
      po({ id: 'a', status: 'issued', amount: 1000, currency_code: 'USD', exchange_rate: 0.79 }),
      po({ id: 'b', status: 'issued', amount: 250.1 }),
      po({ id: 'c', status: 'issued', amount: null }),
    ]
    expect(sumPurchaseOrdersInProductionCurrency(pos)).toBe(1040.1)
  })
})
