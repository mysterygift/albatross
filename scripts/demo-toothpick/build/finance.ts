/**
 * Finance rows: chart of accounts, budget revision, typed budget lines and expenses, vendors,
 * purchase orders (+ amendments), vendor invoices, reconciliation links, floats, VAT and rules.
 * Typed JSON is produced by the app's own serializers, amounts by its own calculators.
 */
import {
  DEMO_ATL_HEADER_CODES, DEMO_BTL_HEADER_CODES, DEMO_CHART_OF_ACCOUNTS,
} from '@/lib/db/seed/demoBudgetSeed'
import { allowLineItemDetailsToJson } from '@/lib/budget/line-items/allow'
import { depositLineItemDetailsToJson } from '@/lib/budget/line-items/deposit'
import { labourLineItemDetailsToJson } from '@/lib/budget/line-items/labour'
import { purchaseLineItemDetailsToJson } from '@/lib/budget/line-items/purchase'
import { calculateRentalSuggestedAmount, rentalLineItemDetailsToJson } from '@/lib/budget/line-items/rental'
import { allowDetailsToJson } from '@/lib/budget/transactions/allow'
import { depositDetailsToJson } from '@/lib/budget/transactions/deposit'
import { labourDetailsToJson } from '@/lib/budget/transactions/labour'
import { purchaseDetailsToJson } from '@/lib/budget/transactions/purchase'
import { calculateRentalExpenseAmount, rentalDetailsToJson } from '@/lib/budget/transactions/rental'
import { derivePoApproval } from '@/lib/budget/vendors/poStatus'
import { add, type Ctx, type DocSpec } from './ctx'
import { DEMO_BANNER, renderPdf, type PdfBlock } from '../lib/pdf'
import { roundMoney } from '../lib/util'
import { VENDORS, vendorByKey } from '../data/vendors'
import {
  BUDGET_LINES, EUR_GBP, EXPENSES, FLOATS, INVOICES, POS, SHOOT_FIRST, SHOOT_LAST,
  type BudgetLine, type ExpenseDef,
} from '../data/finance'

const GBP = 'GBP'

export function buildVendors(ctx: Ctx): void {
  for (const v of VENDORS) {
    add(ctx, 'vendors', {
      id: ctx.idOf.vendor(v.key), production_id: ctx.pid, company_name: v.company_name,
      primary_contact_full_name: v.contact, primary_contact_email: v.email, is_global: 0,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

// ─── Chart of accounts, revision, rules ──────────────────────────────────────

const isHeader = (code: string) => Number(code) % 100 === 0
const parentCode = (code: string) => (isHeader(code) ? null : String(Math.floor(Number(code) / 100) * 100).padStart(4, '0'))

export function buildBudgetFrame(ctx: Ctx): void {
  const acct = (code: string) => ctx.ids('account', code)
  DEMO_CHART_OF_ACCOUNTS.forEach(({ code, name }, i) => {
    const parent = parentCode(code)
    add(ctx, 'budget_accounts', {
      id: acct(code), production_id: ctx.pid, code, name, parent_account_id: parent ? acct(parent) : null,
      sort_order: i, is_postable: isHeader(code) ? 0 : 1, created_at: ctx.ts, updated_at: ctx.ts,
    })
  })
  const rev = ctx.ids('budgetRevision', 'working')
  add(ctx, 'budget_revisions', {
    id: rev, production_id: ctx.pid, name: 'Working Budget v1', created_from_revision_id: null, is_live: 1,
    approval: 'approved', created_at: ctx.ts, updated_at: ctx.ts,
  })
  // Production totals: ATL / BTL / Post
  const postHeaders = ['4100', '4200', '4300', '4400']
  const totals: Array<{ key: string; name: string; headers: string[] }> = [
    { key: 'atl', name: 'Above the Line', headers: DEMO_ATL_HEADER_CODES },
    { key: 'btl', name: 'Below the Line', headers: DEMO_BTL_HEADER_CODES },
    { key: 'post', name: 'Post-production', headers: postHeaders },
  ]
  totals.forEach((t, i) => {
    add(ctx, 'production_totals', {
      id: ctx.ids('total', t.key), production_id: ctx.pid, name: t.name, sort_order: i,
      budget_revision_id: rev, created_at: ctx.ts, updated_at: ctx.ts,
    })
    t.headers.forEach((h) => add(ctx, 'production_total_accounts', {
      id: ctx.ids('totalAccount', `${t.key}.${h}`), production_total_id: ctx.ids('total', t.key), account_id: acct(h),
    }))
  })
  // Cost report groups
  totals.forEach((t, i) => {
    add(ctx, 'cost_report_groups', {
      id: ctx.ids('costGroup', t.key), production_id: ctx.pid, budget_revision_id: rev, code: t.key.toUpperCase(),
      name: t.name, sort_order: i, created_at: ctx.ts, updated_at: ctx.ts,
    })
    t.headers.forEach((h) => add(ctx, 'cost_report_group_accounts', {
      id: ctx.ids('costGroupAccount', `${t.key}.${h}`), group_id: ctx.ids('costGroup', t.key), account_id: acct(h),
    }))
  })
  // Fringe (employer NI on PAYE cast) and contingency (10% of everything)
  add(ctx, 'fringe_rules', {
    id: ctx.ids('fringe', 'ni'), production_id: ctx.pid, name: 'Employer NI on PAYE cast', rate: 0.15,
    base_kind: 'budget', scope_mode: 'include_subtrees', is_enabled: 1, budget_revision_id: rev,
    created_at: ctx.ts, updated_at: ctx.ts,
  })
  add(ctx, 'fringe_rule_scopes', { id: ctx.ids('fringeScope', '1400'), rule_id: ctx.ids('fringe', 'ni'), account_id: acct('1400'), include_children: 1 })
  add(ctx, 'contingency_rules', {
    id: ctx.ids('contingency', 'ten'), production_id: ctx.pid, name: 'Contingency 10%', rate: 0.1,
    base_kind: 'budget', scope_mode: 'include_subtrees', is_enabled: 1, budget_revision_id: rev,
    created_at: ctx.ts, updated_at: ctx.ts,
  })
  for (const h of [...DEMO_ATL_HEADER_CODES, ...DEMO_BTL_HEADER_CODES, ...postHeaders]) {
    add(ctx, 'contingency_rule_scopes', { id: ctx.ids('contingencyScope', h), rule_id: ctx.ids('contingency', 'ten'), account_id: acct(h), include_children: 1 })
  }
  // VAT tracking
  add(ctx, 'production_budget_features', {
    production_id: ctx.pid, tax_credits_enabled: 0, vat_tracking_enabled: 1, default_vat_rate_percent: 20,
    created_at: ctx.ts, updated_at: ctx.ts,
  })
  for (const t of ['allow', 'deposit', 'labour', 'purchase', 'rental', 'untyped']) {
    add(ctx, 'vat_reclaim_rates', {
      id: ctx.ids('vatRate', t), production_id: ctx.pid, transaction_type: t, reclaim_percent: 100,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

// ─── Budget lines ────────────────────────────────────────────────────────────

function personId(ctx: Ctx, p?: { type: 'crew' | 'cast'; key: string }): string | null {
  return p ? ctx.idOf.person(p.type, p.key) : null
}

function lineEstimateAndDetails(ctx: Ctx, l: BudgetLine): { estimate: number; json: string } {
  switch (l.kind) {
    case 'labour': {
      const start = l.start ?? (l.rateType === 'prep_day' ? '2026-10-19' : SHOOT_FIRST)
      const end = l.end ?? (l.rateType === 'prep_day' ? '2026-10-30' : SHOOT_LAST)
      return {
        estimate: roundMoney(l.days * l.rate),
        json: labourLineItemDetailsToJson({
          person_id: personId(ctx, l.person), labour_role_label: l.role, labour_rate_type: l.rateType,
          planned_days_count: l.days, rate_per_day: l.rate, currency_code: GBP, start_date: start, end_date: end,
          unit: 'day', notes: l.notes ?? null,
        }),
      }
    }
    case 'rental': {
      const details = {
        rental_description: l.description, rental_rate_type: l.rateType, rental_rate_amount: l.rate,
        rental_start_date: l.start, rental_end_date: l.end, rental_period_override_days: l.overrideDays ?? null,
        equipment_description: l.equipment ?? null, vendor_id: l.vendor ? ctx.idOf.vendor(l.vendor) : null,
        primary_contact_override: null, notes: l.notes ?? null,
      }
      const parsed = JSON.parse(rentalLineItemDetailsToJson(details))
      const est = calculateRentalSuggestedAmount(parsed)
      if (est == null) throw new Error(`rental line ${l.key}: no suggested amount`)
      return { estimate: roundMoney(est), json: JSON.stringify(parsed) }
    }
    case 'purchase':
      return {
        estimate: l.amount,
        json: purchaseLineItemDetailsToJson({
          purchase_description: l.description, purchase_category: l.category, is_service_purchase: !!l.service,
          service_description: l.service ?? null, location_id: l.location ? ctx.idOf.location(l.location) : null,
          vendor_id: l.vendor ? ctx.idOf.vendor(l.vendor) : null, notes: l.notes ?? null, amount: l.amount,
        }),
      }
    case 'deposit':
      return {
        estimate: l.amount,
        json: depositLineItemDetailsToJson({
          deposit_description: l.description, refundable_status: l.refundable,
          vendor_id: l.vendor ? ctx.idOf.vendor(l.vendor) : null, location_id: l.location ? ctx.idOf.location(l.location) : null,
          notes: l.notes ?? null,
        }),
      }
    case 'allow':
      return {
        estimate: l.amount,
        json: allowLineItemDetailsToJson({
          allow_description: l.description, provisional_amount: l.amount, status: l.open ? 'open' : 'resolved', notes: l.notes ?? null,
        }),
      }
  }
}

export const budgetTotals = { estimated: 0 }

export function buildBudgetItems(ctx: Ctx): void {
  const rev = ctx.ids('budgetRevision', 'working')
  budgetTotals.estimated = 0
  for (const l of BUDGET_LINES) {
    const { estimate, json } = lineEstimateAndDetails(ctx, l)
    budgetTotals.estimated += estimate
    const id = ctx.ids('budgetItem', l.key)
    add(ctx, 'budget_items', {
      id, production_id: ctx.pid, category_id: null, account_id: ctx.ids('account', l.account), description: l.description,
      estimated_cost: estimate, actual_cost: 0, vendor: l.vendor ? vendorByKey(l.vendor).company_name : null,
      status: 'draft', line_item_type: l.kind, budget_revision_id: rev, created_at: ctx.ts, updated_at: ctx.ts,
    })
    add(ctx, 'budget_item_details', {
      id: ctx.ids('budgetItemDetails', l.key), budget_item_id: id, line_item_type: l.kind, details_json: json,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

// ─── Expenses ────────────────────────────────────────────────────────────────

function expenseAmountAndDetails(ctx: Ctx, e: ExpenseDef): { amount: number; json: string } {
  const vendorId = e.vendor ? ctx.idOf.vendor(e.vendor) : null
  switch (e.kind) {
    case 'deposit':
      return {
        amount: e.amount,
        json: depositDetailsToJson({
          deposit_description: e.description, refundable_status: e.refundable, amount: e.amount, vendor_id: vendorId,
          location_id: e.location ? ctx.idOf.location(e.location) : null, notes: e.notes,
        }),
      }
    case 'purchase':
      return {
        amount: e.amount,
        json: purchaseDetailsToJson({
          purchase_category: e.category, is_service_purchase: !!e.service, service_description: e.service ?? null,
          location_id: e.location ? ctx.idOf.location(e.location) : null, purchase_description: e.description,
          vendor_id: vendorId, notes: e.notes, amount: e.amount,
        }),
      }
    case 'allow':
      return {
        amount: e.amount,
        json: allowDetailsToJson({ allow_description: e.description, provisional_amount: e.amount, status: 'resolved', notes: e.notes }),
      }
    case 'rental': {
      const details = {
        rental_description: e.description, rental_rate_type: e.rateType, rental_rate_amount: e.rate,
        rental_start_date: e.start, rental_end_date: e.end, rental_period_override_days: e.overrideDays ?? null,
        equipment_description: e.equipment ?? null, vendor_id: vendorId, primary_contact_override: null, notes: e.notes,
      }
      const parsed = JSON.parse(rentalDetailsToJson(details))
      const amount = calculateRentalExpenseAmount(parsed)
      if (amount == null) throw new Error(`rental expense ${e.key}: no amount`)
      return { amount: roundMoney(amount), json: JSON.stringify(parsed) }
    }
    case 'labour':
      return {
        amount: roundMoney(e.days * e.rate),
        json: labourDetailsToJson({
          person_id: ctx.idOf.person(e.person.type, e.person.key), labour_role_label: e.role, labour_rate_type: e.rateType,
          booked_days_count: e.days, rate_per_day: e.rate, currency_code: GBP, start_date: e.start, end_date: e.end,
          unit: 'day', notes: e.notes,
        }),
      }
  }
}

export const expenseAmounts = new Map<string, number>()

export function buildExpenses(ctx: Ctx): void {
  const rev = ctx.ids('budgetRevision', 'working')
  expenseAmounts.clear()
  for (const e of EXPENSES) {
    const { amount, json } = expenseAmountAndDetails(ctx, e)
    if (e.matched != null && e.matched > amount + 0.001) throw new Error(`${e.key}: matched ${e.matched} > amount ${amount}`)
    expenseAmounts.set(e.key, amount)
    const id = ctx.ids('expense', e.key)
    add(ctx, 'expenses', {
      id, production_id: ctx.pid, category_id: null, account_id: ctx.ids('account', e.account), amount,
      date: e.date, vendor: e.vendor ? vendorByKey(e.vendor).company_name : null, notes: e.notes, expense_type: 'other',
      transaction_type: e.kind, vendor_id: e.vendor ? ctx.idOf.vendor(e.vendor) : null,
      vat_rate_percent: e.vat ?? null, vat_reclaimed_amount: e.vatReclaim?.amount ?? null,
      vat_reclaim_date: e.vatReclaim?.date ?? null, vat_reclaim_reference: e.vatReclaim?.ref ?? null,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
    add(ctx, 'expense_transaction_details', {
      id: ctx.ids('expenseDetails', e.key), expense_id: id, transaction_type: e.kind, details_json: json,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
    if (e.item && e.matched != null) {
      add(ctx, 'budget_item_expense_links', {
        id: ctx.ids('budgetLink', e.key), production_id: ctx.pid, budget_item_id: ctx.ids('budgetItem', e.item),
        expense_id: id, matched_amount: e.matched, budget_revision_id: rev, created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
  }
}

// ─── Floats ──────────────────────────────────────────────────────────────────

export function buildFloats(ctx: Ctx): void {
  const rev = ctx.ids('budgetRevision', 'working')
  for (const f of FLOATS) {
    const epoch = Date.parse(`${f.issued}T09:00:00.000Z`)
    add(ctx, 'floats', {
      id: ctx.ids('float', f.key), production_id: ctx.pid, budget_item_id: ctx.ids('budgetItem', f.item),
      person_id: ctx.idOf.person('crew', f.person), amount: f.amount, currency: GBP, issued_date: f.issued,
      notes: f.notes, budget_revision_id: rev, created_at: epoch, updated_at: epoch,
    })
    for (const l of f.links) {
      add(ctx, 'float_expense_links', {
        id: ctx.ids('floatLink', `${f.key}.${l.expense}`), float_id: ctx.ids('float', f.key),
        expense_id: ctx.ids('expense', l.expense), matched_amount: l.matched, budget_revision_id: rev,
        created_at: epoch, updated_at: epoch,
      })
    }
  }
}

// ─── Purchase orders, invoices and their documents ───────────────────────────

async function financePdf(title: string, rows: Array<[string, string]>, lines: string[]): Promise<Uint8Array> {
  const blocks: PdfBlock[] = []
  for (const [k, v] of rows) blocks.push({ kind: 'row', cols: [k, v], widths: [140, 340] })
  blocks.push({ kind: 'gap' })
  for (const l of lines) blocks.push({ kind: 'p', text: l })
  return renderPdf({ title, banner: DEMO_BANNER, blocks })
}

export async function buildPurchaseOrdersAndInvoices(ctx: Ctx): Promise<void> {
  const cur = (c?: 'EUR') => (c ? '€' : '£')
  for (const po of POS) {
    const id = ctx.ids('po', po.key)
    add(ctx, 'vendor_purchase_orders', {
      id, production_id: ctx.pid, vendor_id: ctx.idOf.vendor(po.vendor), po_number: po.number, description: po.description,
      issue_date: po.issue, due_date: po.due, amount: po.amount, status: po.status, approval: derivePoApproval(po.status),
      notes: po.notes, currency_code: po.currency ?? null, exchange_rate: po.currency ? EUR_GBP : null,
      created_at: ctx.ts, updated_at: ctx.ts,
    })
    if (po.amendment) {
      add(ctx, 'vendor_purchase_order_amendments', {
        id: ctx.ids('poAmendment', po.key), vendor_purchase_order_id: id, previous_amount: po.amendment.previous,
        new_amount: po.amount, reason: po.amendment.reason, created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
      })
    }
    const vendor = vendorByKey(po.vendor)
    const bytes = await financePdf(`Purchase order ${po.number}`, [
      ['Vendor', vendor.company_name], ['Contact', `${vendor.contact} <${vendor.email}>`], ['Issued', po.issue],
      ['Due', po.due], ['Amount', `${cur(po.currency)}${po.amount.toFixed(2)}${po.currency ? ` (locked at ${EUR_GBP} GBP per EUR)` : ''}`],
      ['Status', po.status],
    ], [po.description, po.notes])
    const doc: DocSpec = { id: ctx.ids('doc', `po.${po.key}`), entity_type: 'vendor_purchase_order', entity_id: id, file_name: `${po.number}.pdf`, mime_type: 'application/pdf', bytes }
    ctx.docs.push(doc)
  }

  for (const inv of INVOICES) {
    const id = ctx.ids('invoice', inv.key)
    add(ctx, 'vendor_invoices', {
      id, production_id: ctx.pid, vendor_id: ctx.idOf.vendor(inv.vendor), po_id: inv.po ? ctx.ids('po', inv.po) : null,
      invoice_number: inv.number, issue_date: inv.issue, due_date: inv.due, amount: inv.net, tax: inv.tax,
      currency_code: inv.currency ?? GBP, status: inv.status, notes: inv.notes, created_at: ctx.ts, updated_at: ctx.ts,
    })
    if (inv.status !== 'draft') {
      const vendor = vendorByKey(inv.vendor)
      const sym = cur(inv.currency)
      const bytes = await financePdf(`Invoice INV-${inv.number}`, [
        ['From', vendor.company_name], ['Contact', `${vendor.contact} <${vendor.email}>`], ['Issued', inv.issue],
        ['Due', inv.due], ['Net', `${sym}${inv.net.toFixed(2)}`], ['VAT', `${sym}${inv.tax.toFixed(2)}`],
        ['Total', `${sym}${(inv.net + inv.tax).toFixed(2)}`], ['PO', inv.po ? POS.find((p) => p.key === inv.po)!.number : 'None'],
      ], [inv.notes])
      ctx.docs.push({ id: ctx.ids('doc', `inv.${inv.key}`), entity_type: 'vendor_invoice', entity_id: id, file_name: `INV-${inv.number}.pdf`, mime_type: 'application/pdf', bytes })
    }
  }
  // Invoice <-> expense and PO <-> expense links
  for (const e of EXPENSES) {
    if (e.invoice) {
      add(ctx, 'vendor_invoice_expenses', {
        id: ctx.ids('invoiceExpense', e.key), vendor_invoice_id: ctx.ids('invoice', e.invoice),
        expense_id: ctx.ids('expense', e.key), created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
    if (e.po) {
      add(ctx, 'vendor_purchase_order_expenses', {
        id: ctx.ids('poExpense', e.key), vendor_purchase_order_id: ctx.ids('po', e.po), expense_id: ctx.ids('expense', e.key),
        allocated_amount: e.poAllocated ?? null, created_at: ctx.ts, updated_at: ctx.ts,
      })
    }
  }
}

/** Receipts for petty-cash expenses (documents + expense_receipts rows). */
export async function buildReceipts(ctx: Ctx): Promise<void> {
  const receipts: Array<{ expense: string; ref: string; shop: string }> = [
    { expense: 'e_pc1', ref: 'RCPT-0932', shop: 'Chorlton charity shop' },
    { expense: 'e_pc2', ref: 'RCPT-1107', shop: 'Newsagent, Oxford Road' },
    { expense: 'e_pc3', ref: 'RCPT-1109', shop: 'Tram tickets and petrol station' },
    { expense: 'e_pc4', ref: 'RCPT-1112', shop: 'Stationery shop' },
  ]
  for (const r of receipts) {
    const def = EXPENSES.find((e) => e.key === r.expense)!
    const amount = expenseAmounts.get(r.expense)!
    const docId = ctx.ids('doc', `receipt.${r.expense}`)
    const bytes = await financePdf(`Receipt ${r.ref}`, [
      ['Shop', r.shop], ['Date', def.date], ['Amount', `£${amount.toFixed(2)}`], ['Paid by', 'Cash (float)'],
    ], [def.notes])
    ctx.docs.push({ id: docId, entity_type: 'expense_receipt', entity_id: ctx.ids('expense', r.expense), file_name: `${r.ref}.pdf`, mime_type: 'application/pdf', bytes })
    add(ctx, 'expense_receipts', {
      id: ctx.ids('receipt', r.expense), expense_id: ctx.ids('expense', r.expense), document_id: docId,
      receipt_date: def.date, amount, reference: r.ref, created_at: ctx.ts, updated_at: ctx.ts,
    })
  }
}

/** Headline counts for the demo guide. */
export const financeSummary = () => ({ vendors: VENDORS.length, pos: POS.length, invoices: INVOICES.length })
