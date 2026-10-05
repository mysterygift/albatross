import { describe, expect, it } from 'vitest'
import type { FloatExpenseLink, PettyCashFloat } from '@/lib/db/types'
import {
  buildFloatOptions,
  emptyReceiptCaptureDraft,
  parseAmount,
  parseVatRate,
  receiptFileName,
  scaledSize,
  validateReceiptCapture,
} from './receiptCapture'

describe('parseAmount', () => {
  it('reads totals as typed from a receipt', () => {
    expect(parseAmount('114.12')).toBe(114.12)
    expect(parseAmount('£1,234.5')).toBe(1234.5)
    expect(parseAmount(' 38 ')).toBe(38)
    expect(parseAmount('.5')).toBe(0.5)
  })
  it('rejects blanks, negatives and junk', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-4')).toBeNull()
    expect(parseAmount('12.345')).toBeNull()
    expect(parseAmount('twelve')).toBeNull()
  })
})

describe('parseVatRate', () => {
  it('is null when blank, NaN when out of range', () => {
    expect(parseVatRate('')).toBeNull()
    expect(parseVatRate('20')).toBe(20)
    expect(parseVatRate('20%')).toBe(20)
    expect(parseVatRate('120')).toBeNaN()
  })
})

describe('validateReceiptCapture', () => {
  const ok = {
    ...emptyReceiptCaptureDraft('2026-11-04'),
    amountText: '114.12',
    description: 'Beer mats and pint glasses',
    accountId: 'acc-3009',
  }
  it('passes a complete capture', () => {
    expect(validateReceiptCapture(ok, true)).toBeNull()
  })
  it('names the first missing piece', () => {
    expect(validateReceiptCapture({ ...ok, amountText: '' }, true)).toMatch(/total/)
    expect(validateReceiptCapture({ ...ok, description: ' ' }, true)).toMatch(/bought/)
    expect(validateReceiptCapture({ ...ok, accountId: null }, true)).toMatch(/budget line/)
    expect(validateReceiptCapture({ ...ok, vatRatePercentText: '200' }, true)).toMatch(/VAT/)
    expect(validateReceiptCapture(ok, false)).toMatch(/photo/)
  })
})

describe('receiptFileName', () => {
  it('names the file by date and vendor', () => {
    expect(receiptFileName('2026-11-04', 'Rusholme Props & Dressing', 'IMG_0412.HEIC', 'image/jpeg')).toBe(
      'receipt-2026-11-04-rusholme-props-dressing.jpg'
    )
    expect(receiptFileName('2026-11-04', null, 'scan.pdf', 'application/pdf')).toBe('receipt-2026-11-04.pdf')
    expect(receiptFileName('2026-11-04', 'Café Nero', 'photo.png', 'image/png')).toBe('receipt-2026-11-04-cafe-nero.png')
  })
})

describe('scaledSize', () => {
  it('scales the longest edge down and leaves small photos alone', () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 2400, height: 1800 })
    expect(scaledSize(3024, 4032)).toEqual({ width: 1800, height: 2400 })
    expect(scaledSize(1200, 900)).toBeNull()
  })
})

describe('buildFloatOptions', () => {
  it("shows what is left on each float and the float's budget line", () => {
    const float = (id: string, person: string, item: string, amount: number): PettyCashFloat => ({
      id,
      production_id: 'p',
      budget_revision_id: 'r',
      budget_item_id: item,
      person_id: person,
      amount,
      currency: 'GBP',
      issued_date: '2026-10-20',
      notes: null,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
    })
    const link = (floatId: string, matched: number): FloatExpenseLink => ({
      id: `l-${floatId}-${matched}`,
      budget_revision_id: 'r',
      float_id: floatId,
      expense_id: `e-${matched}`,
      matched_amount: matched,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
    })
    const options = buildFloatOptions({
      floats: [float('f1', 'lakshmi', 'item-props', 400), float('f2', 'kasia', 'item-office', 300)],
      links: [link('f1', 112.48)],
      people: [
        { id: 'lakshmi', name: 'Lakshmi Iyer' },
        { id: 'kasia', name: 'Katarzyna Nowak' },
      ],
      budgetItems: [{ id: 'item-props', account_id: 'acc-3009' }],
    })
    expect(options).toEqual([
      expect.objectContaining({ floatId: 'f1', remaining: 287.52, accountId: 'acc-3009', label: 'Float · Lakshmi Iyer' }),
      expect.objectContaining({ floatId: 'f2', remaining: 300, accountId: null, label: 'Float · Katarzyna Nowak' }),
    ])
  })
})
