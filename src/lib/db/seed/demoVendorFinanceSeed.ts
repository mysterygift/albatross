/**
 * Demo production vendor finance seed: invoices, purchase orders, invoice reminder tasks,
 * and invoice/PO ↔ expense links. Used only for the singleton demo production (DEMO_SLUG).
 * Call after seedDemoBudget and seedDemoVendors so vendors and expenses (with vendor_id) exist.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 * Invoice reminder tasks are seeded directly so they arise from the seeded invoices (due_date).
 */

import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { buildCreateTaskStatements } from '../repositories/tasks'
import { IDS } from './constants'

const TABLE_INVOICES = 'vendor_invoices'
const TABLE_POS = 'vendor_purchase_orders'
const TABLE_INVOICE_EXPENSE = 'vendor_invoice_expenses'
const TABLE_PO_EXPENSE = 'vendor_purchase_order_expenses'

const INVOICE_REMINDER_DEPARTMENT = 'Accounts'

function reminderDescription(invoiceNumber: string, vendorCompanyName: string): string {
  return `Pay invoice ${invoiceNumber} — ${vendorCompanyName}`
}

/** Resolve vendor id by company name; throw if missing. */
function vendorId(map: Record<string, string>, companyName: string): string {
  const id = map[companyName]
  if (!id) throw new Error(`Demo vendor finance: unknown vendor "${companyName}"`)
  return id
}

/** Invoice seed definition (dates as day offsets from production start). */
type DemoInvoiceDef = {
  vendorCompany: string
  invoice_number: string
  issue_offset: number
  due_offset: number
  amount: number
  tax: number
  status: 'draft' | 'received' | 'approved' | 'paid' | 'overdue'
  notes: string
  po_index?: number // 1-based index into DEMO_PO_LIST
}

/** PO seed definition. */
type DemoPODef = {
  vendorCompany: string
  po_number: string
  description: string
  issue_offset: number
  due_offset: number
  amount: number
  status: 'draft' | 'issued' | 'approved' | 'closed' | 'cancelled'
  approval: number
  notes: string
}

const DEMO_INVOICE_LIST: DemoInvoiceDef[] = [
  { vendorCompany: 'Panavision London', invoice_number: 'INV-PL-2401', issue_offset: 2, due_offset: 16, amount: 12500, tax: 2500, status: 'approved', notes: 'Camera package rental – week 1', po_index: 1 },
  { vendorCompany: 'Panavision London', invoice_number: 'INV-PL-2402', issue_offset: 9, due_offset: 23, amount: 11800, tax: 2360, status: 'received', notes: 'Camera package rental – week 2 incl. accessories', po_index: 2 },
  { vendorCompany: 'Lumen Grip & Light', invoice_number: 'INV-LG-1108', issue_offset: 2, due_offset: 14, amount: 7750, tax: 1550, status: 'paid', notes: 'Lighting package rental – week 1', po_index: 3 },
  { vendorCompany: 'Lumen Grip & Light', invoice_number: 'INV-LG-1116', issue_offset: 10, due_offset: 24, amount: 8200, tax: 1640, status: 'approved', notes: 'Grip package rental and distro support', po_index: 4 },
  { vendorCompany: 'Crown Unit Catering', invoice_number: 'INV-CUC-3003', issue_offset: 5, due_offset: 12, amount: 5400, tax: 1080, status: 'overdue', notes: 'Unit catering – days 1–3', po_index: 5 },
  { vendorCompany: 'Regent Stays Hospitality', invoice_number: 'INV-RSH-4102', issue_offset: 3, due_offset: 17, amount: 5500, tax: 1100, status: 'received', notes: 'Cast accommodation – week 1', po_index: 6 },
  { vendorCompany: 'Screen Legal LLP', invoice_number: 'INV-SL-0901', issue_offset: -14, due_offset: 0, amount: 5000, tax: 1000, status: 'paid', notes: 'Legal retainer – first tranche' },
  { vendorCompany: 'Film Insure Ltd', invoice_number: 'INV-FI-1205', issue_offset: -7, due_offset: 7, amount: 21000, tax: 0, status: 'approved', notes: 'Insurance – first instalment' },
  { vendorCompany: 'City Permissions Office', invoice_number: 'INV-CPO-7781', issue_offset: 4, due_offset: 11, amount: 850, tax: 0, status: 'paid', notes: 'Town hall permit' },
  { vendorCompany: 'Costume House London', invoice_number: 'INV-CH-2204', issue_offset: 1, due_offset: 15, amount: 4000, tax: 800, status: 'received', notes: 'Principal costume hire – deposit' },
  { vendorCompany: 'The Post Yard', invoice_number: 'INV-TPY-5101', issue_offset: 45, due_offset: 59, amount: 3200, tax: 640, status: 'draft', notes: 'Edit suite rental – week 1' },
  { vendorCompany: 'DCP Lab UK', invoice_number: 'INV-DCP-9007', issue_offset: 95, due_offset: 109, amount: 3500, tax: 700, status: 'approved', notes: 'DCP creation – delivery master', po_index: 9 },
  { vendorCompany: 'CrowdLink Casting', invoice_number: 'INV-CL-3301', issue_offset: 6, due_offset: 20, amount: 3200, tax: 640, status: 'received', notes: 'Background artists – week 1' },
  { vendorCompany: 'Meridian Production Offices', invoice_number: 'INV-MPO-3401', issue_offset: -7, due_offset: 7, amount: 2800, tax: 0, status: 'paid', notes: 'Office rent – month 1' },
  { vendorCompany: 'Keystone Transport', invoice_number: 'INV-KT-2501', issue_offset: 10, due_offset: 24, amount: 3166, tax: 633, status: 'approved', notes: 'Vehicle hire – week 2' },
]

const DEMO_PO_LIST: DemoPODef[] = [
  { vendorCompany: 'Panavision London', po_number: 'PO-PL-001', description: 'Camera package – principal photography week 1', issue_offset: 1, due_offset: 2, amount: 12500, status: 'approved', approval: 1, notes: 'Approved camera rental package' },
  { vendorCompany: 'Panavision London', po_number: 'PO-PL-002', description: 'Camera package – week 2 extension', issue_offset: 8, due_offset: 9, amount: 11800, status: 'issued', approval: 0, notes: 'Awaiting final sign-off from production' },
  { vendorCompany: 'Lumen Grip & Light', po_number: 'PO-LG-001', description: 'Lighting package rental', issue_offset: 1, due_offset: 2, amount: 7750, status: 'closed', approval: 1, notes: 'Closed against delivered rental' },
  { vendorCompany: 'Lumen Grip & Light', po_number: 'PO-LG-002', description: 'Grip package rental', issue_offset: 9, due_offset: 10, amount: 8200, status: 'approved', approval: 1, notes: 'Grip support for second week' },
  { vendorCompany: 'Crown Unit Catering', po_number: 'PO-CUC-001', description: 'Unit catering block booking', issue_offset: 3, due_offset: 4, amount: 16200, status: 'approved', approval: 1, notes: 'Catering provision for main unit block' },
  { vendorCompany: 'Regent Stays Hospitality', po_number: 'PO-RSH-001', description: 'Cast hotel block', issue_offset: 2, due_offset: 3, amount: 22000, status: 'issued', approval: 0, notes: 'Awaiting approval on final rooming list' },
  { vendorCompany: 'Borough Film Locations', po_number: 'PO-BFL-001', description: 'Mint building location fee', issue_offset: 1, due_offset: 5, amount: 25000, status: 'approved', approval: 1, notes: 'Main location booking' },
  { vendorCompany: 'The Post Yard', po_number: 'PO-TPY-001', description: 'Editing suite booking', issue_offset: 40, due_offset: 44, amount: 12800, status: 'draft', approval: 0, notes: 'Draft hold on offline edit booking' },
  { vendorCompany: 'DCP Lab UK', po_number: 'PO-DCP-001', description: 'DCP and delivery materials', issue_offset: 90, due_offset: 94, amount: 3500, status: 'approved', approval: 1, notes: 'Delivery package for premiere and distributor' },
  { vendorCompany: 'Costume House London', po_number: 'PO-CH-001', description: 'Costume hire for principals', issue_offset: 1, due_offset: 2, amount: 12000, status: 'cancelled', approval: 0, notes: 'Superseded by revised costume pull' },
]

/** Invoice index (0-based) → DEMO_EXPENSES index (0-based) for invoice↔expense link. */
const DEMO_INVOICE_EXPENSE_LINKS: [number, number][] = [
  [0, 3],   // INV-PL-2401 ↔ expense 2406 (camera)
  [2, 4],   // INV-LG-1108 ↔ expense 2604 (lighting)
  [4, 7],   // INV-CUC-3003 ↔ expense 3409 (catering)
  [5, 5],   // INV-RSH-4102 ↔ expense 1502 (cast accommodation)
  [6, 0],   // INV-SL-0901 ↔ expense 2304 (legal)
  [7, 1],   // INV-FI-1205 ↔ expense 2306 (insurance)
  [8, 9],   // INV-CPO-7781 ↔ expense 3105 (permit)
  [9, 10],  // INV-CH-2204 ↔ expense 2905 (costume)
  [10, 15], // INV-TPY-5101 ↔ expense 4103 (edit suite)
  [11, 16], // INV-DCP-9007 ↔ expense 4302 (DCP)
  [13, 13], // INV-MPO-3401 ↔ expense 3404 (office rent)
  [14, 19], // INV-KT-2501 ↔ expense 2506 (vehicles)
]

/** PO index (0-based) → DEMO_EXPENSES index (0-based) for PO↔expense link. */
const DEMO_PO_EXPENSE_LINKS: [number, number][] = [
  [0, 3],  // PO-PL-001 ↔ camera expense
  [2, 4],  // PO-LG-001 ↔ lighting expense
  [4, 7],  // PO-CUC-001 ↔ catering expense
  [5, 5],  // PO-RSH-001 ↔ cast accommodation
  [8, 16], // PO-DCP-001 ↔ DCP expense
]

/**
 * Seed vendor invoices, POs, invoice reminder tasks, and invoice/PO↔expense links.
 * Only for singleton demo production. Requires vendorIdByCompanyName from seedDemoVendors
 * and expenses already seeded with vendor_id (from seedDemoBudget with that map).
 */
export async function seedDemoVendorFinance(
  productionId: string,
  startDate: string,
  ts: string,
  addDaysLocal: (yyyyMmDd: string, days: number) => string,
  vendorIdByCompanyName: Record<string, string>
): Promise<void> {
  const db = await getDb()

  const poIds: string[] = []
  const invoiceIds: string[] = []

  await runInSerializedTransaction(async () => {
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    // 1) POs (no outbox for demo seed)
    for (let i = 0; i < DEMO_PO_LIST.length; i++) {
      const po = DEMO_PO_LIST[i]!
      const id = IDS.vendorPO(i + 1)
      poIds.push(id)
      statements.push({
        sql: `INSERT INTO ${TABLE_POS} (id, production_id, vendor_id, po_number, description, issue_date, due_date, amount, status, approval, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        bindValues: [
          id,
          productionId,
          vendorId(vendorIdByCompanyName, po.vendorCompany),
          po.po_number,
          po.description,
          addDaysLocal(startDate, po.issue_offset),
          addDaysLocal(startDate, po.due_offset),
          po.amount,
          po.status,
          po.approval,
          po.notes,
          ts,
          ts,
        ],
      })
    }

    // 2) Invoices (no outbox for demo seed); link po_id where po_index set
    for (let i = 0; i < DEMO_INVOICE_LIST.length; i++) {
      const inv = DEMO_INVOICE_LIST[i]!
      const id = IDS.vendorInvoice(i + 1)
      invoiceIds.push(id)
      const poId = inv.po_index != null ? poIds[inv.po_index - 1]! : null
      statements.push({
        sql: `INSERT INTO ${TABLE_INVOICES} (id, production_id, vendor_id, po_id, invoice_number, issue_date, due_date, amount, tax, currency_code, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        bindValues: [
          id,
          productionId,
          vendorId(vendorIdByCompanyName, inv.vendorCompany),
          poId,
          inv.invoice_number,
          addDaysLocal(startDate, inv.issue_offset),
          addDaysLocal(startDate, inv.due_offset),
          inv.amount,
          inv.tax,
          'GBP',
          inv.status,
          inv.notes,
          ts,
          ts,
        ],
      })
    }

    // 3) Invoice reminder tasks (one per invoice with due_date; use buildCreateTaskStatements for schema consistency)
    let taskIdx = 0
    for (let i = 0; i < DEMO_INVOICE_LIST.length; i++) {
      const inv = DEMO_INVOICE_LIST[i]!
      const dueDate = addDaysLocal(startDate, inv.due_offset)
      const taskId = IDS.invoiceReminderTask(taskIdx + 1)
      taskIdx++
      const taskStatements = buildCreateTaskStatements(
        taskId,
        {
          production_id: productionId,
          description: reminderDescription(inv.invoice_number, inv.vendorCompany),
          due_date: dueDate,
          assigned_department: INVOICE_REMINDER_DEPARTMENT,
          vendor_invoice_id: IDS.vendorInvoice(i + 1),
          is_complete: inv.status === 'paid' ? 1 : 0,
        },
        ts
      )
      statements.push(...taskStatements)
    }

    // 4) Invoice ↔ expense links
    for (let linkIdx = 0; linkIdx < DEMO_INVOICE_EXPENSE_LINKS.length; linkIdx++) {
      const [invIdx, expIdx] = DEMO_INVOICE_EXPENSE_LINKS[linkIdx]!
      const invoiceId = IDS.vendorInvoice(invIdx + 1)
      const expenseId = IDS.expense(expIdx + 1)
      const linkId = IDS.vendorInvoiceExpenseLink(linkIdx + 1)
      statements.push({
        sql: `INSERT INTO ${TABLE_INVOICE_EXPENSE} (id, vendor_invoice_id, expense_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: [linkId, invoiceId, expenseId, ts, ts],
      })
    }

    // 5) PO ↔ expense links
    for (let linkIdx = 0; linkIdx < DEMO_PO_EXPENSE_LINKS.length; linkIdx++) {
      const [poIdx, expIdx] = DEMO_PO_EXPENSE_LINKS[linkIdx]!
      const poId = IDS.vendorPO(poIdx + 1)
      const expenseId = IDS.expense(expIdx + 1)
      const linkId = IDS.vendorPOExpenseLink(linkIdx + 1)
      statements.push({
        sql: `INSERT INTO ${TABLE_PO_EXPENSE} (id, vendor_purchase_order_id, expense_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        bindValues: [linkId, poId, expenseId, ts, ts],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
