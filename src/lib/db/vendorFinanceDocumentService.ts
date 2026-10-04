/**
 * Orchestration for vendor invoice/PO file attachments and expense linking.
 */
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '@/lib/db/client'
import {
  buildExpenseReceiptPlan,
  isExpenseReceiptDraftEmpty,
  RECEIPT_FILE_REQUIRED_MESSAGE,
  type ExpenseReceiptDraft,
  type ReceiptPlan,
} from '@/lib/db/expenseReceiptService'
import { coerceNumber } from '@/lib/db/sqlValueCoercion'
import {
  removeProductionDocumentFile,
  writeProductionDocumentFile,
} from '@/lib/db/productionDocumentFiles'
import {
  buildCreateDocumentStatements,
  deleteDocument,
  listDocumentsByEntity,
} from '@/lib/db/repositories/document'
import {
  assertExpenseLinkableToInvoice,
  assertExpenseLinkableToPurchaseOrder,
  assertValidAllocatedAmount,
  buildCreateVendorInvoiceExpenseLinkStatements,
  buildCreateVendorPurchaseOrderExpenseLinkStatements,
  listPoCommitmentLinksByPurchaseOrderIds,
} from '@/lib/db/repositories/vendorFinanceLinks'
import {
  buildCreateVendorInvoiceStatements,
  buildUpdateVendorInvoiceStatements,
  getVendorInvoiceById,
  type CreateVendorInvoiceData,
} from '@/lib/db/repositories/vendorInvoices'
import {
  buildCreateVendorPurchaseOrderStatements,
  getVendorPurchaseOrderById,
} from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  buildCreateTaskStatements,
  type CreateTaskData,
} from '@/lib/db/repositories/tasks'
import {
  prepareTypedExpense,
  rowToExpense,
  type CreateTypedExpenseParams,
} from '@/lib/db/repositories/createTypedExpense'
import {
  computePoCommitments,
  toPoCommitmentInput,
  getPoMatchWarnings,
  type PoAllocationInput,
  type PoMatchWarning,
} from '@/lib/budget/vendors/poMatching'
import type {
  Document,
  Expense,
  VendorInvoice,
  VendorInvoiceStatus,
  VendorPurchaseOrder,
} from '@/lib/db/types'
import { moneyEquals } from '@/lib/money/roundMoney'

const INVOICE_REMINDER_DEPARTMENT = 'Accounts'

type Stmt = { sql: string; bindValues: unknown[] }

export { isExpenseReceiptDraftEmpty }
export type { ExpenseReceiptDraft }

export type VendorFinanceFileInput = {
  fileName: string
  bytes: Uint8Array
  mimeType?: string | null
}

function reminderDescription(invoiceNumber: string, vendorCompanyName: string): string {
  return `Pay invoice ${invoiceNumber} — ${vendorCompanyName}`
}

function buildInvoiceCreateStatements(
  invoiceId: string,
  ts: string,
  data: CreateVendorInvoiceData,
  vendorCompanyName: string
): Stmt[] {
  const statements = [...buildCreateVendorInvoiceStatements(invoiceId, ts, data)]
  if (data.due_date?.trim()) {
    const taskId = uuid()
    const taskData: CreateTaskData = {
      production_id: data.production_id,
      description: reminderDescription(data.invoice_number, vendorCompanyName),
      due_date: data.due_date,
      assigned_department: INVOICE_REMINDER_DEPARTMENT,
      vendor_invoice_id: invoiceId,
      is_complete: data.status === 'paid' ? 1 : 0,
    }
    statements.push(...buildCreateTaskStatements(taskId, taskData, ts))
  }
  return statements
}

function buildDocumentStatements(
  documentId: string,
  ts: string,
  productionId: string,
  entityType: string,
  entityId: string,
  file: VendorFinanceFileInput,
  relativePath: string
): Stmt[] {
  return buildCreateDocumentStatements(documentId, ts, {
    production_id: productionId,
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.fileName,
    file_path: relativePath,
    mime_type: file.mimeType ?? null,
  })
}

/** Soft-delete any existing documents attached to an invoice or PO (at most one expected). */
async function replaceEntityDocuments(entityType: string, entityId: string): Promise<void> {
  const existing = await listDocumentsByEntity(entityType, entityId)
  for (const doc of existing) {
    await deleteDocument(doc.id)
  }
}

export type CreateVendorInvoiceWithDocumentResult = {
  invoice: VendorInvoice
  document?: Document
}

/**
 * Create a vendor invoice and optionally attach a file in one transaction.
 */
export async function createVendorInvoiceWithDocument(
  data: CreateVendorInvoiceData,
  vendorCompanyName: string,
  file?: VendorFinanceFileInput | null
): Promise<CreateVendorInvoiceWithDocumentResult> {
  const invoiceId = uuid()
  const ts = now()
  const documentId = file ? uuid() : null
  let relativePath: string | null = null

  if (file && documentId) {
    relativePath = await writeProductionDocumentFile(
      data.production_id,
      documentId,
      file.fileName,
      file.bytes
    )
  }

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildInvoiceCreateStatements(invoiceId, ts, data, vendorCompanyName),
  ]

  if (file && documentId && relativePath) {
    statements.push(
      ...buildDocumentStatements(
        documentId,
        ts,
        data.production_id,
        DOCUMENT_ENTITY_TYPES.vendorInvoice,
        invoiceId,
        file,
        relativePath
      )
    )
  }

  statements.push({ sql: 'COMMIT', bindValues: [] })

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, statements)
    })
  } catch (error) {
    if (relativePath) await removeProductionDocumentFile(relativePath)
    throw error
  }

  const invoice = await getVendorInvoiceById(invoiceId)
  if (!invoice) throw new Error('Vendor invoice not found after create')

  if (documentId) {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [documentId]
    )
    const document = rows[0]
      ? {
          id: rows[0].id as string,
          production_id: rows[0].production_id as string | null,
          entity_type: rows[0].entity_type as string | null,
          entity_id: rows[0].entity_id as string | null,
          file_name: rows[0].file_name as string,
          file_path: rows[0].file_path as string,
          mime_type: rows[0].mime_type as string | null,
          created_at: rows[0].created_at as string,
          updated_at: rows[0].updated_at as string,
          deleted_at: (rows[0].deleted_at as string | null) ?? null,
        }
      : undefined
    return { invoice, document }
  }

  return { invoice }
}

export type CreateVendorPurchaseOrderWithDocumentResult = {
  purchaseOrder: VendorPurchaseOrder
  document?: Document
}

/**
 * Create a vendor purchase order and optionally attach a file in one transaction.
 */
export async function createVendorPurchaseOrderWithDocument(
  data: Parameters<typeof buildCreateVendorPurchaseOrderStatements>[2],
  file?: VendorFinanceFileInput | null
): Promise<CreateVendorPurchaseOrderWithDocumentResult> {
  const poId = uuid()
  const ts = now()
  const documentId = file ? uuid() : null
  let relativePath: string | null = null

  if (file && documentId) {
    relativePath = await writeProductionDocumentFile(
      data.production_id,
      documentId,
      file.fileName,
      file.bytes
    )
  }

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateVendorPurchaseOrderStatements(poId, ts, data),
  ]

  if (file && documentId && relativePath) {
    statements.push(
      ...buildDocumentStatements(
        documentId,
        ts,
        data.production_id,
        DOCUMENT_ENTITY_TYPES.vendorPurchaseOrder,
        poId,
        file,
        relativePath
      )
    )
  }

  statements.push({ sql: 'COMMIT', bindValues: [] })

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, statements)
    })
  } catch (error) {
    if (relativePath) await removeProductionDocumentFile(relativePath)
    throw error
  }

  const purchaseOrder = await getVendorPurchaseOrderById(poId)
  if (!purchaseOrder) throw new Error('Vendor purchase order not found after create')

  if (documentId) {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`,
      [documentId]
    )
    const document = rows[0]
      ? {
          id: rows[0].id as string,
          production_id: rows[0].production_id as string | null,
          entity_type: rows[0].entity_type as string | null,
          entity_id: rows[0].entity_id as string | null,
          file_name: rows[0].file_name as string,
          file_path: rows[0].file_path as string,
          mime_type: rows[0].mime_type as string | null,
          created_at: rows[0].created_at as string,
          updated_at: rows[0].updated_at as string,
          deleted_at: (rows[0].deleted_at as string | null) ?? null,
        }
      : undefined
    return { purchaseOrder, document }
  }

  return { purchaseOrder }
}

/** Attach or replace the document on an existing vendor invoice. */
export async function attachDocumentToVendorInvoice(
  invoiceId: string,
  file: VendorFinanceFileInput
): Promise<Document> {
  const invoice = await getVendorInvoiceById(invoiceId)
  if (!invoice) throw new Error('Vendor invoice not found or deleted')

  await replaceEntityDocuments(DOCUMENT_ENTITY_TYPES.vendorInvoice, invoiceId)

  const documentId = uuid()
  const ts = now()
  const relativePath = await writeProductionDocumentFile(
    invoice.production_id,
    documentId,
    file.fileName,
    file.bytes
  )

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildDocumentStatements(
      documentId,
      ts,
      invoice.production_id,
      DOCUMENT_ENTITY_TYPES.vendorInvoice,
      invoiceId,
      file,
      relativePath
    ),
    { sql: 'COMMIT', bindValues: [] },
  ]

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, statements)
    })
  } catch (error) {
    await removeProductionDocumentFile(relativePath)
    throw error
  }

  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`,
    [documentId]
  )
  if (!rows[0]) throw new Error('Document not found after attach')
  return {
    id: rows[0].id as string,
    production_id: rows[0].production_id as string | null,
    entity_type: rows[0].entity_type as string | null,
    entity_id: rows[0].entity_id as string | null,
    file_name: rows[0].file_name as string,
    file_path: rows[0].file_path as string,
    mime_type: rows[0].mime_type as string | null,
    created_at: rows[0].created_at as string,
    updated_at: rows[0].updated_at as string,
    deleted_at: (rows[0].deleted_at as string | null) ?? null,
  }
}

/** Attach or replace the document on an existing vendor purchase order. */
export async function attachDocumentToVendorPurchaseOrder(
  poId: string,
  file: VendorFinanceFileInput
): Promise<Document> {
  const po = await getVendorPurchaseOrderById(poId)
  if (!po) throw new Error('Vendor purchase order not found or deleted')

  await replaceEntityDocuments(DOCUMENT_ENTITY_TYPES.vendorPurchaseOrder, poId)

  const documentId = uuid()
  const ts = now()
  const relativePath = await writeProductionDocumentFile(
    po.production_id,
    documentId,
    file.fileName,
    file.bytes
  )

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildDocumentStatements(
      documentId,
      ts,
      po.production_id,
      DOCUMENT_ENTITY_TYPES.vendorPurchaseOrder,
      poId,
      file,
      relativePath
    ),
    { sql: 'COMMIT', bindValues: [] },
  ]

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, statements)
    })
  } catch (error) {
    await removeProductionDocumentFile(relativePath)
    throw error
  }

  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`,
    [documentId]
  )
  if (!rows[0]) throw new Error('Document not found after attach')
  return {
    id: rows[0].id as string,
    production_id: rows[0].production_id as string | null,
    entity_type: rows[0].entity_type as string | null,
    entity_id: rows[0].entity_id as string | null,
    file_name: rows[0].file_name as string,
    file_path: rows[0].file_path as string,
    mime_type: rows[0].mime_type as string | null,
    created_at: rows[0].created_at as string,
    updated_at: rows[0].updated_at as string,
    deleted_at: (rows[0].deleted_at as string | null) ?? null,
  }
}

export type ExpenseVendorFinanceDraft = {
  /**
   * POs the expense is matched to. Empty = none. A single entry may leave `allocatedAmount` null
   * (= whole expense); with several POs every entry needs an explicit allocation.
   */
  poAllocations: PoAllocationInput[]
  invoiceMode: 'none' | 'existing' | 'upload'
  existingInvoiceId: string | null
  uploadInvoice: {
    invoice_number: string
    issue_date?: string | null
    due_date?: string | null
    amount?: number | null
    tax?: number | null
    currency_code?: string | null
    status?: VendorInvoiceStatus
    notes?: string | null
    fileName?: string
    bytes?: Uint8Array
    mimeType?: string | null
  } | null
  /**
   * Receipt proof (P2 UI). A non-null value means the Receipt option is selected even if still empty;
   * `isExpenseReceiptDraftEmpty` decides whether there is anything to store.
   * NOTE: not part of `isExpenseVendorFinanceDraftEmpty`, which only covers PO / invoice matching.
   */
  receipt?: ExpenseReceiptDraft | null
  /**
   * Edit-only (`applyFinanceDraftToExpense`); ignored when creating. Invoices linked to the expense
   * whose link should be removed (the invoice record itself is left untouched).
   */
  unlinkInvoiceIds?: string[]
  /** Edit-only: receipts to remove (soft-deletes the receipt row and its file's document). */
  removeReceiptIds?: string[]
  /** Edit-only: receipt id -> replacement file (metadata kept). Ignored for a receipt also being removed. */
  replaceReceiptFiles?: Record<string, VendorFinanceFileInput>
}

export const emptyExpenseVendorFinanceDraft = (): ExpenseVendorFinanceDraft => ({
  poAllocations: [],
  invoiceMode: 'none',
  existingInvoiceId: null,
  uploadInvoice: null,
  receipt: null,
})

export function isExpenseVendorFinanceDraftEmpty(draft: ExpenseVendorFinanceDraft): boolean {
  if (draft.poAllocations.length > 0) return false
  if (draft.invoiceMode === 'existing' && draft.existingInvoiceId) return false
  if (draft.invoiceMode === 'upload' && draft.uploadInvoice?.invoice_number?.trim()) return false
  return true
}

/**
 * Edit mode: does `draft` differ from what is stored? `storedAllocations` are the expense's current PO
 * links (NULL = whole expense). A single PO whose allocation equals the whole expense counts as unchanged.
 */
export function hasPendingFinanceChanges(
  draft: ExpenseVendorFinanceDraft,
  storedAllocations: PoAllocationInput[],
  expenseAmount: number
): boolean {
  if (draft.invoiceMode !== 'none') return true
  if ((draft.unlinkInvoiceIds?.length ?? 0) > 0) return true
  if ((draft.removeReceiptIds?.length ?? 0) > 0) return true
  if (Object.keys(draft.replaceReceiptFiles ?? {}).length > 0) return true
  if (draft.receipt) return true
  if (draft.poAllocations.length !== storedAllocations.length) return true
  const stored = new Map(storedAllocations.map((a) => [a.poId, a.allocatedAmount]))
  const resolve = (amount: number | null | undefined, single: boolean) =>
    amount == null || (single && moneyEquals(amount, expenseAmount)) ? null : amount
  const single = draft.poAllocations.length === 1
  return draft.poAllocations.some((a) => {
    if (!stored.has(a.poId)) return true
    const was = resolve(stored.get(a.poId), single)
    const next = resolve(a.allocatedAmount, single)
    return was == null || next == null ? was !== next : !moneyEquals(was, next)
  })
}

/**
 * First problem that blocks saving a finance draft (missing invoice number / pick / receipt file /
 * per-PO allocation), or null. Mismatch warnings are NOT errors; they never block.
 */
export function validateExpenseVendorFinanceDraft(draft: ExpenseVendorFinanceDraft): string | null {
  if (draft.receipt && !isExpenseReceiptDraftEmpty(draft.receipt) && !(draft.receipt.bytes && draft.receipt.fileName)) {
    return RECEIPT_FILE_REQUIRED_MESSAGE
  }
  if (draft.invoiceMode === 'upload' && !draft.uploadInvoice?.invoice_number?.trim()) {
    return 'Invoice number is required when uploading a new invoice'
  }
  if (draft.invoiceMode === 'existing' && !draft.existingInvoiceId) {
    return 'Select an existing invoice or choose a different invoice option'
  }
  if (draft.poAllocations.length > 1 && draft.poAllocations.some((a) => a.allocatedAmount == null)) {
    return 'Enter how much of this spend goes to each purchase order'
  }
  return null
}

export type LinkExpenseVendorFinanceResult = {
  invoiceId?: string
  /** First matched PO (kept for single-PO callers). */
  poId?: string
  poIds: string[]
  /** Non-blocking mismatch warnings (over PO remaining, invoice mismatch, ...). */
  warnings: PoMatchWarning[]
}

export type ExpenseFinanceTarget = {
  expenseId: string
  productionId: string
  /** Vendor on the expense; null for vendor-less spend (PO/invoice matching then throws). */
  vendorId: string | null
  expenseAmount: number
  vendorCompanyName: string
  productionCurrency: string
}

type FinancePlan = {
  /** Statements to run inside the caller's transaction (no BEGIN/COMMIT). */
  statements: Stmt[]
  /** Files already written to disk; the caller removes them if the transaction fails. */
  writtenFilePaths: string[]
  result: LinkExpenseVendorFinanceResult
}

const EMPTY_PLAN = (): FinancePlan => ({
  statements: [],
  writtenFilePaths: [],
  result: { poIds: [], warnings: [] },
})

type InvoiceForWarnings = NonNullable<Parameters<typeof getPoMatchWarnings>[0]['invoice']>

export type InvoiceLinkPart = {
  statements: Stmt[]
  writtenFilePaths: string[]
  invoiceId?: string
  invoiceForWarnings: InvoiceForWarnings | null
}

/**
 * Statements that link the expense to an invoice: a NEW invoice (+ reminder task + document, file
 * written now) or an EXISTING one. `invoice.po_id` is only ever filled in when empty, never overwritten.
 * Shared by the create / link flow (`buildExpenseFinancePlan`) and `applyFinanceDraftToExpense`.
 */
export async function buildInvoiceLinkPart(
  target: ExpenseFinanceTarget,
  draft: ExpenseVendorFinanceDraft,
  ts: string,
  primaryPoId: string | null
): Promise<InvoiceLinkPart> {
  const { expenseId, productionId, vendorId } = target
  if (!vendorId) throw new Error('A vendor is required to match purchase orders or invoices')
  const statements: Stmt[] = []
  const writtenFilePaths: string[] = []
  let invoiceId: string | undefined
  let invoiceForWarnings: InvoiceForWarnings | null = null

  if (draft.invoiceMode === 'upload' && draft.uploadInvoice?.invoice_number?.trim()) {
    const upload = draft.uploadInvoice
    const newInvoiceId = uuid()
    invoiceId = newInvoiceId
    const invoiceData: CreateVendorInvoiceData = {
      production_id: productionId,
      vendor_id: vendorId,
      invoice_number: upload.invoice_number.trim(),
      issue_date: upload.issue_date ?? null,
      due_date: upload.due_date ?? null,
      amount: upload.amount ?? null,
      tax: upload.tax ?? null,
      currency_code: upload.currency_code ?? target.productionCurrency,
      status: upload.status ?? 'received',
      notes: upload.notes ?? null,
      po_id: primaryPoId,
    }
    statements.push(...buildInvoiceCreateStatements(newInvoiceId, ts, invoiceData, target.vendorCompanyName))

    if (upload.bytes && upload.fileName) {
      const documentId = uuid()
      const relativePath = await writeProductionDocumentFile(
        productionId,
        documentId,
        upload.fileName,
        upload.bytes
      )
      writtenFilePaths.push(relativePath)
      statements.push(
        ...buildDocumentStatements(
          documentId,
          ts,
          productionId,
          DOCUMENT_ENTITY_TYPES.vendorInvoice,
          newInvoiceId,
          { fileName: upload.fileName, bytes: upload.bytes, mimeType: upload.mimeType ?? null },
          relativePath
        )
      )
    }
    statements.push(...buildCreateVendorInvoiceExpenseLinkStatements(uuid(), ts, newInvoiceId, expenseId))
    invoiceForWarnings = {
      id: newInvoiceId,
      invoiceNumber: invoiceData.invoice_number,
      amount: invoiceData.amount ?? null,
      poId: primaryPoId,
    }
  } else if (draft.invoiceMode === 'existing' && draft.existingInvoiceId) {
    const invoice = await getVendorInvoiceById(draft.existingInvoiceId)
    if (!invoice) throw new Error('Vendor invoice not found or deleted')
    assertExpenseLinkableToInvoice(invoice, { production_id: productionId, vendor_id: vendorId })
    invoiceId = invoice.id
    statements.push(...buildCreateVendorInvoiceExpenseLinkStatements(uuid(), ts, invoice.id, expenseId))
    // Never overwrite an existing invoice.po_id; only fill it in when empty.
    if (invoice.po_id == null && primaryPoId) {
      statements.push(...buildUpdateVendorInvoiceStatements(invoice.id, ts, { po_id: primaryPoId }))
    }
    invoiceForWarnings = {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      poId: invoice.po_id ?? primaryPoId,
    }
  }
  return { statements, writtenFilePaths, invoiceId, invoiceForWarnings }
}

/**
 * Validate a finance draft for a NEW expense and build the statements that link it to POs and an
 * invoice (creating the invoice + its document when uploading). Executes NOTHING except writing the
 * uploaded invoice file; the caller runs the statements in one transaction and removes
 * `writtenFilePaths` if that fails. (Changing an existing expense's links is
 * `applyFinanceDraftToExpense`.)
 *
 * Rules:
 * - PO + invoice matching requires a vendor; every PO / invoice must be the expense's vendor + production.
 * - Several POs need an explicit allocation each (null only means "whole expense" for a single PO).
 * - `invoice.po_id` is only set when the invoice has none (new invoices get the first PO);
 *   an invoice that already sits on another PO is left alone and surfaced as a warning.
 */
async function buildExpenseFinancePlan(target: ExpenseFinanceTarget, draft: ExpenseVendorFinanceDraft, ts: string): Promise<FinancePlan> {
  if (isExpenseVendorFinanceDraftEmpty(draft)) return EMPTY_PLAN()

  const { expenseId, productionId, vendorId, expenseAmount } = target
  if (!vendorId) {
    throw new Error('A vendor is required to match purchase orders or invoices')
  }

  // ── Validate PO allocations ─────────────────────────────────────────────
  const allocations = draft.poAllocations
  const poIdSet = new Set<string>()
  for (const a of allocations) {
    if (poIdSet.has(a.poId)) throw new Error('A purchase order can only be matched once per expense')
    poIdSet.add(a.poId)
    assertValidAllocatedAmount(a.allocatedAmount)
  }
  if (allocations.length > 1 && allocations.some((a) => a.allocatedAmount == null)) {
    throw new Error('Enter an allocated amount for each purchase order when matching more than one')
  }

  const purchaseOrders: VendorPurchaseOrder[] = []
  for (const a of allocations) {
    const po = await getVendorPurchaseOrderById(a.poId)
    if (!po) throw new Error('Vendor purchase order not found or deleted')
    assertExpenseLinkableToPurchaseOrder(po, { production_id: productionId, vendor_id: vendorId })
    purchaseOrders.push(po)
  }
  const primaryPoId = allocations[0]?.poId ?? null

  const statements: Stmt[] = []
  const writtenFilePaths: string[] = []

  try {
    // ── Invoice ───────────────────────────────────────────────────────────
    const invoicePart = await buildInvoiceLinkPart(target, draft, ts, primaryPoId)
    statements.push(...invoicePart.statements)
    writtenFilePaths.push(...invoicePart.writtenFilePaths)

    // ── PO links ──────────────────────────────────────────────────────────
    for (const a of allocations) {
      statements.push(
        ...buildCreateVendorPurchaseOrderExpenseLinkStatements(uuid(), ts, a.poId, expenseId, a.allocatedAmount)
      )
    }

    // ── Warnings (never block) ────────────────────────────────────────────
    const links = await listPoCommitmentLinksByPurchaseOrderIds(purchaseOrders.map((po) => po.id))
    const commitments = computePoCommitments(
      purchaseOrders.map(toPoCommitmentInput),
      links,
      { excludeExpenseId: expenseId }
    )
    const warnings = getPoMatchWarnings({
      expenseAmount,
      allocations,
      commitments,
      invoice: invoicePart.invoiceForWarnings,
    })

    return {
      statements,
      writtenFilePaths,
      result: {
        invoiceId: invoicePart.invoiceId,
        poId: primaryPoId ?? undefined,
        poIds: allocations.map((a) => a.poId),
        warnings,
      },
    }
  } catch (error) {
    for (const p of writtenFilePaths) await removeProductionDocumentFile(p)
    throw error
  }
}

export async function runStatementsAtomically(statements: Stmt[]): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

export type CreateExpenseWithFinanceParams = CreateTypedExpenseParams & {
  vendorCompanyName: string
  productionCurrency: string
  /** PO / invoice matching; `draft` (inherited) is the typed-expense detail draft. */
  finance: ExpenseVendorFinanceDraft
}

export type CreateExpenseWithFinanceResult = LinkExpenseVendorFinanceResult & {
  expense: Expense
  /** True when `expenseId` already existed (a retry after a successful save); nothing was written. */
  alreadyCreated: boolean
}

/**
 * Create a typed expense AND its PO links / invoice link / uploaded invoice document in ONE
 * transaction: either everything is saved or nothing is. Composes the statement builders
 * (prepareTypedExpense + buildExpenseFinancePlan) instead of awaiting separate writes.
 *
 * Retry safety: pass a stable `expenseId` (generate once per form session). A failed attempt writes
 * nothing, so a retry cannot duplicate the expense; if the id already exists (the save succeeded
 * but the UI never saw it) the existing expense is returned with `alreadyCreated: true`.
 * Uploaded files written before the transaction are removed if it fails.
 */
export async function createExpenseWithFinance(
  params: CreateExpenseWithFinanceParams
): Promise<CreateExpenseWithFinanceResult> {
  const { vendorCompanyName, productionCurrency, finance, ...expenseParams } = params

  const existing = await findExpenseById(expenseParams.expenseId)
  if (existing) return { expense: existing, alreadyCreated: true, poIds: [], warnings: [] }

  const prepared = await prepareTypedExpense(expenseParams)
  const { expense } = prepared

  const plan = await buildExpenseFinancePlan(
    {
      expenseId: expense.id,
      productionId: expense.production_id,
      vendorId: expense.vendor_id,
      expenseAmount: expense.amount,
      vendorCompanyName,
      productionCurrency,
    },
    finance,
    now()
  )
  const ts = now()
  let receiptPlan: ReceiptPlan
  try {
    receiptPlan = await buildExpenseReceiptPlan(
      { expenseId: expense.id, productionId: expense.production_id },
      finance.receipt,
      ts
    )
  } catch (error) {
    for (const p of plan.writtenFilePaths) await removeProductionDocumentFile(p)
    throw error
  }
  const writtenFilePaths = [...plan.writtenFilePaths, ...receiptPlan.writtenFilePaths]

  try {
    let raced = false
    await runInSerializedTransaction(async () => {
      // Re-check inside the serialized slot: a double submit with the same id must not insert twice.
      if (await findExpenseById(expense.id)) {
        raced = true
        return
      }
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN', bindValues: [] },
        ...prepared.statements,
        ...plan.statements,
        ...receiptPlan.statements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
    if (raced) {
      for (const p of writtenFilePaths) await removeProductionDocumentFile(p)
      const winner = await findExpenseById(expense.id)
      return { expense: winner ?? expense, alreadyCreated: true, poIds: [], warnings: [] }
    }
  } catch (error) {
    for (const p of writtenFilePaths) await removeProductionDocumentFile(p)
    throw error
  }

  return { ...plan.result, expense, alreadyCreated: false }
}

async function findExpenseById(expenseId: string | undefined): Promise<Expense | null> {
  if (!expenseId) return null
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM expenses WHERE id = $1`, [
    expenseId,
  ])
  return rows[0] ? rowToExpense(rows[0]) : null
}

/** Live expense facts (+ vendor name) needed to plan finance statements for an existing expense. */
export async function loadExpenseFacts(
  expenseId: string,
  productionCurrency: string
): Promise<ExpenseFinanceTarget> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT e.production_id, e.vendor_id, e.amount, v.company_name
     FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
     WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [expenseId]
  )
  const row = rows[0]
  if (!row) throw new Error('Expense not found or deleted')
  return {
    expenseId,
    productionId: row.production_id as string,
    vendorId: (row.vendor_id as string | null) ?? null,
    expenseAmount: coerceNumber(row.amount, 0),
    vendorCompanyName: (row.company_name as string | null) ?? '',
    productionCurrency,
  }
}
