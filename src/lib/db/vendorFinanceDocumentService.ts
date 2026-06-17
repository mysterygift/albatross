/**
 * Orchestration for vendor invoice/PO file attachments and expense linking.
 */
import { BaseDirectory, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'

import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '@/lib/db/client'
import {
  buildCreateDocumentStatements,
  deleteDocument,
  listDocumentsByEntity,
} from '@/lib/db/repositories/document'
import {
  createVendorInvoiceExpenseLink,
  createVendorPurchaseOrderExpenseLink,
} from '@/lib/db/repositories/vendorFinanceLinks'
import {
  buildCreateVendorInvoiceStatements,
  getVendorInvoiceById,
  updateVendorInvoice,
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
import type { Document, VendorInvoice, VendorInvoiceStatus, VendorPurchaseOrder } from '@/lib/db/types'

const ATTACHMENTS_DIR = 'attachments'
const INVOICE_REMINDER_DEPARTMENT = 'Accounts'

type Stmt = { sql: string; bindValues: unknown[] }

export type VendorFinanceFileInput = {
  fileName: string
  bytes: Uint8Array
  mimeType?: string | null
}

function buildRelativePath(productionId: string, documentId: string, fileName: string): string {
  return `${ATTACHMENTS_DIR}/${productionId}/${documentId}-${fileName}`
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

async function writeProductionDocumentFile(
  productionId: string,
  documentId: string,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  const relativePath = buildRelativePath(productionId, documentId, fileName)
  await mkdir(`${ATTACHMENTS_DIR}/${productionId}`, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  })
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })
  return relativePath
}

async function removeProductionDocumentFile(relativePath: string): Promise<void> {
  try {
    await remove(relativePath, { baseDir: BaseDirectory.AppData })
  } catch {
    // Best-effort cleanup.
  }
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
  poId: string | null
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
}

export function isExpenseVendorFinanceDraftEmpty(draft: ExpenseVendorFinanceDraft): boolean {
  if (draft.poId) return false
  if (draft.invoiceMode === 'existing' && draft.existingInvoiceId) return false
  if (draft.invoiceMode === 'upload' && draft.uploadInvoice?.invoice_number?.trim()) return false
  return true
}

export type LinkExpenseVendorFinanceParams = {
  expenseId: string
  productionId: string
  vendorId: string
  vendorCompanyName: string
  productionCurrency: string
  draft: ExpenseVendorFinanceDraft
}

export type LinkExpenseVendorFinanceResult = {
  invoiceId?: string
  poId?: string
}

/**
 * Link a newly created expense to optional invoice and/or PO.
 * Creates a new invoice when draft.invoiceMode === 'upload'.
 */
export async function linkExpenseVendorFinance(
  params: LinkExpenseVendorFinanceParams
): Promise<LinkExpenseVendorFinanceResult> {
  const { expenseId, productionId, vendorId, vendorCompanyName, productionCurrency, draft } = params

  if (isExpenseVendorFinanceDraftEmpty(draft)) {
    return {}
  }

  let invoiceId: string | undefined

  if (draft.invoiceMode === 'upload' && draft.uploadInvoice?.invoice_number?.trim()) {
    const upload = draft.uploadInvoice
    const file =
      upload.bytes && upload.fileName
        ? {
            fileName: upload.fileName,
            bytes: upload.bytes,
            mimeType: upload.mimeType ?? null,
          }
        : null

    const { invoice } = await createVendorInvoiceWithDocument(
      {
        production_id: productionId,
        vendor_id: vendorId,
        invoice_number: upload.invoice_number.trim(),
        issue_date: upload.issue_date ?? null,
        due_date: upload.due_date ?? null,
        amount: upload.amount ?? null,
        tax: upload.tax ?? null,
        currency_code: upload.currency_code ?? productionCurrency,
        status: upload.status ?? 'received',
        notes: upload.notes ?? null,
        po_id: draft.poId ?? null,
      },
      vendorCompanyName,
      file
    )
    invoiceId = invoice.id
    await createVendorInvoiceExpenseLink(invoiceId, expenseId)
  } else if (draft.invoiceMode === 'existing' && draft.existingInvoiceId) {
    invoiceId = draft.existingInvoiceId
    await createVendorInvoiceExpenseLink(invoiceId, expenseId)
    if (draft.poId) {
      await updateVendorInvoice(invoiceId, { po_id: draft.poId })
    }
  }

  if (draft.poId) {
    await createVendorPurchaseOrderExpenseLink(draft.poId, expenseId)
    return { invoiceId, poId: draft.poId }
  }

  return { invoiceId }
}

/** Link an existing expense to an invoice (retroactive). Optionally set PO on invoice and link expense to PO. */
export async function linkExistingExpenseToInvoice(
  expenseId: string,
  invoiceId: string,
  poId?: string | null
): Promise<void> {
  await createVendorInvoiceExpenseLink(invoiceId, expenseId)
  if (poId) {
    await updateVendorInvoice(invoiceId, { po_id: poId })
    await createVendorPurchaseOrderExpenseLink(poId, expenseId)
  }
}

/** Link an existing expense to a PO (retroactive). */
export async function linkExistingExpenseToPurchaseOrder(
  expenseId: string,
  poId: string
): Promise<void> {
  await createVendorPurchaseOrderExpenseLink(poId, expenseId)
}

/** Create a new invoice with optional file and link to an existing expense. */
export async function createInvoiceAndLinkExpense(
  data: CreateVendorInvoiceData,
  vendorCompanyName: string,
  expenseId: string,
  file?: VendorFinanceFileInput | null
): Promise<VendorInvoice> {
  const { invoice } = await createVendorInvoiceWithDocument(data, vendorCompanyName, file)
  await createVendorInvoiceExpenseLink(invoice.id, expenseId)
  if (data.po_id) {
    await createVendorPurchaseOrderExpenseLink(data.po_id, expenseId)
  }
  return invoice
}
