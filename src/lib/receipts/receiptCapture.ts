/**
 * Receipt capture (experimental): pure helpers for turning a photographed receipt into a purchase
 * expense. No DB access here; see receiptCaptureService.ts for the save.
 */

import type { BudgetItem, FloatExpenseLink, Person, PettyCashFloat } from '@/lib/db/types'
import { getPettyCashFloatDerived } from '@/lib/budget/floatExpenseMatching'
import { roundMoney } from '@/lib/money/roundMoney'

export type ReceiptCaptureDraft = {
  amountText: string
  date: string
  description: string
  accountId: string | null
  vendorId: string | null
  floatId: string | null
  reference: string
  notes: string
  vatRatePercentText: string
}

export function emptyReceiptCaptureDraft(today: string): ReceiptCaptureDraft {
  return {
    amountText: '',
    date: today,
    description: '',
    accountId: null,
    vendorId: null,
    floatId: null,
    reference: '',
    notes: '',
    vatRatePercentText: '',
  }
}

/**
 * Parses a typed amount: accepts a leading currency symbol, thousands commas and a decimal point
 * (e.g. "£1,234.50"). Returns null for blank or invalid input; never negative.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/^[£$€]/, '').replace(/,/g, '').trim()
  if (!cleaned) return null
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? roundMoney(n) : null
}

/** Parses an optional VAT rate in percent (0–100). Blank is null; anything else invalid is NaN. */
export function parseVatRate(text: string): number | null {
  const t = text.trim().replace(/%$/, '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : Number.NaN
}

export type FloatOption = {
  floatId: string
  personName: string
  remaining: number
  currency: string
  /** Budget account of the float's line item; the natural account for spend from this float. */
  accountId: string | null
  label: string
}

/** One option per float, with what is left on it and the account its budget line sits on. */
export function buildFloatOptions(params: {
  floats: PettyCashFloat[]
  links: FloatExpenseLink[]
  people: Pick<Person, 'id' | 'name'>[]
  budgetItems: Pick<BudgetItem, 'id' | 'account_id'>[]
}): FloatOption[] {
  const personById = new Map(params.people.map((p) => [p.id, p]))
  const accountByItem = new Map(params.budgetItems.map((i) => [i.id, i.account_id ?? null]))
  return params.floats.map((f) => {
    const { remaining } = getPettyCashFloatDerived(
      f,
      params.links.filter((l) => l.float_id === f.id)
    )
    const personName = personById.get(f.person_id)?.name ?? 'Unknown'
    return {
      floatId: f.id,
      personName,
      remaining,
      currency: f.currency,
      accountId: accountByItem.get(f.budget_item_id) ?? null,
      label: `Float · ${personName}`,
    }
  })
}

/** First problem that blocks saving, or null. */
export function validateReceiptCapture(
  draft: ReceiptCaptureDraft,
  hasPhoto: boolean
): string | null {
  const amount = parseAmount(draft.amountText)
  if (amount == null || amount <= 0) return 'Enter the receipt total, for example 114.12.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'Choose the date on the receipt.'
  if (!draft.description.trim()) return 'Say what was bought.'
  if (!draft.accountId) return 'Choose a budget line.'
  if (Number.isNaN(parseVatRate(draft.vatRatePercentText))) return 'VAT rate must be a percentage between 0 and 100.'
  if (!hasPhoto) return 'Take a photo of the receipt, or choose a file.'
  return null
}

/** "receipt-2026-11-04-rusholme-props-dressing.jpg": readable in Documents and in exports. */
export function receiptFileName(date: string, vendorName: string | null, originalName: string, mimeType: string): string {
  const fromName = originalName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  const ext = mimeType === 'image/jpeg' ? 'jpg' : (fromName ?? mimeType.split('/')[1]?.toLowerCase() ?? 'jpg')
  const slug = (vendorName ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug ? `receipt-${date}-${slug}.${ext}` : `receipt-${date}.${ext}`
}

/** Longest edge of a stored receipt photo; enough to read small print, far smaller than a camera original. */
export const RECEIPT_MAX_EDGE_PX = 2400

/** Target size for a scaled photo of `width` × `height`, or null when it is already small enough. */
export function scaledSize(width: number, height: number, maxEdge = RECEIPT_MAX_EDGE_PX): { width: number; height: number } | null {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest <= 0) return null
  const k = maxEdge / longest
  return { width: Math.round(width * k), height: Math.round(height * k) }
}
