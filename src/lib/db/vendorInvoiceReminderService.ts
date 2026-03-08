/**
 * Invoice reminder task orchestration.
 *
 * Vendor invoices with a due_date get a single production task reminder. The task is created/updated
 * in sync with invoice lifecycle. No separate reminders table; we use production_tasks with
 * vendor_invoice_id link.
 *
 * Rules (documented for consistency):
 * - Invoice with due_date → create linked task (description "Pay invoice INV-X — VendorName", department Accounts, due_date).
 * - Invoice status becomes paid → mark linked task complete (is_complete = 1).
 * - Invoice status changes from paid back to unpaid → re-open task (is_complete = 0).
 * - Invoice due_date removed → keep task, clear task due_date.
 * - Invoice archived → soft-delete linked task in the same transaction.
 * - One invoice → at most one active reminder task (enforced by DB unique index on vendor_invoice_id).
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import {
  buildCreateVendorInvoiceStatements,
  buildSoftDeleteVendorInvoiceStatements,
  buildUpdateVendorInvoiceStatements,
  getVendorInvoiceById,
  type CreateVendorInvoiceData,
  type UpdateVendorInvoicePatch,
} from './repositories/vendorInvoices'
import {
  buildCreateTaskStatements,
  buildSoftDeleteTaskStatements,
  buildUpdateTaskStatements,
  getTaskByVendorInvoiceId,
  type CreateTaskData,
  type UpdateTaskPatch,
} from './repositories/tasks'
import type { VendorInvoice } from './types'

const INVOICE_REMINDER_DEPARTMENT = 'Accounts'

function reminderDescription(invoiceNumber: string, vendorCompanyName: string): string {
  return `Pay invoice ${invoiceNumber} — ${vendorCompanyName}`
}

/**
 * Create an invoice and, if it has a due_date, a linked reminder task in one transaction.
 */
export async function createInvoiceWithReminderTask(
  data: CreateVendorInvoiceData,
  vendorCompanyName: string
): Promise<VendorInvoice> {
  const id = uuid()
  const ts = now()

  if (!data.due_date?.trim()) {
    const { createVendorInvoice } = await import('./repositories/vendorInvoices')
    return createVendorInvoice(data)
  }

  const taskId = uuid()
  const taskData: CreateTaskData = {
    production_id: data.production_id,
    description: reminderDescription(data.invoice_number, vendorCompanyName),
    due_date: data.due_date,
    assigned_department: INVOICE_REMINDER_DEPARTMENT,
    vendor_invoice_id: id,
    is_complete: data.status === 'paid' ? 1 : 0,
  }

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateVendorInvoiceStatements(id, ts, data),
    ...buildCreateTaskStatements(taskId, taskData, ts),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  const created = await getVendorInvoiceById(id)
  if (!created) throw new Error('Vendor invoice not found after create')
  return created
}

/**
 * Update an invoice and its linked reminder task in one transaction when both need changes.
 * - If invoice_number or vendor name changes, task description is updated.
 * - If due_date changes, task due_date is updated.
 * - If status becomes paid, task is marked complete; if status changes from paid to unpaid, task is re-opened.
 * - If due_date is removed, task due_date is cleared (task kept).
 */
export async function updateInvoiceWithReminderTask(
  invoiceId: string,
  patch: UpdateVendorInvoicePatch,
  currentInvoice: VendorInvoice,
  vendorCompanyName: string
): Promise<VendorInvoice> {
  const task = await getTaskByVendorInvoiceId(invoiceId)
  const ts = now()

  const invoiceStatements = buildUpdateVendorInvoiceStatements(invoiceId, ts, patch)
  if (invoiceStatements.length === 0 && !task) {
    const { updateVendorInvoice } = await import('./repositories/vendorInvoices')
    return updateVendorInvoice(invoiceId, patch)
  }
  if (invoiceStatements.length === 0 && task) {
    const taskPatch = buildReminderTaskPatch(currentInvoice, patch, vendorCompanyName, task)
    if (taskPatch === null) {
      const { updateVendorInvoice } = await import('./repositories/vendorInvoices')
      return updateVendorInvoice(invoiceId, patch)
    }
    const taskStatements = buildUpdateTaskStatements(task.id, taskPatch, ts)
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN', bindValues: [] },
        ...taskStatements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
    const { getVendorInvoiceById: getInv } = await import('./repositories/vendorInvoices')
    const updated = await getInv(invoiceId)
    if (!updated) throw new Error(`Vendor invoice not found: ${invoiceId}`)
    return updated
  }

  const newDueDate = patch.due_date !== undefined ? patch.due_date : currentInvoice.due_date
  const newInvoiceNumber = patch.invoice_number ?? currentInvoice.invoice_number
  const newTaskId = uuid()
  const createTaskForUpdate =
    !task && (newDueDate?.trim())
      ? buildCreateTaskStatements(newTaskId, {
          production_id: currentInvoice.production_id,
          description: reminderDescription(newInvoiceNumber, vendorCompanyName),
          due_date: newDueDate,
          assigned_department: INVOICE_REMINDER_DEPARTMENT,
          vendor_invoice_id: invoiceId,
        }, ts)
      : []
  const taskPatch = task ? buildReminderTaskPatch(currentInvoice, patch, vendorCompanyName, task) : null
  const updateTaskStatements = task && taskPatch ? buildUpdateTaskStatements(task.id, taskPatch, ts) : []

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...invoiceStatements,
    ...updateTaskStatements,
    ...createTaskForUpdate,
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  const updated = await getVendorInvoiceById(invoiceId)
  if (!updated) throw new Error(`Vendor invoice not found: ${invoiceId}`)
  return updated
}

function buildReminderTaskPatch(
  current: VendorInvoice,
  patch: UpdateVendorInvoicePatch,
  vendorCompanyName: string,
  _task: { id: string }
): UpdateTaskPatch | null {
  const descriptionChanged =
    patch.invoice_number !== undefined && patch.invoice_number !== current.invoice_number
  const dueDateChanged = patch.due_date !== undefined
  const statusChanged = patch.status !== undefined && patch.status !== current.status
  const newStatus = patch.status ?? current.status
  const newInvoiceNumber = patch.invoice_number ?? current.invoice_number
  const newDueDate = patch.due_date !== undefined ? patch.due_date : current.due_date

  const taskPatch: UpdateTaskPatch = {}
  if (descriptionChanged) {
    taskPatch.description = reminderDescription(newInvoiceNumber, vendorCompanyName)
  }
  if (dueDateChanged) {
    taskPatch.due_date = newDueDate ?? null
  }
  if (statusChanged) {
    taskPatch.is_complete = newStatus === 'paid' ? 1 : 0
  }
  if (Object.keys(taskPatch).length === 0) return null
  return taskPatch
}

/**
 * Archive an invoice and its linked reminder task in one transaction.
 */
export async function archiveInvoiceWithReminderTask(invoiceId: string): Promise<void> {
  const task = await getTaskByVendorInvoiceId(invoiceId)
  const ts = now()

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildSoftDeleteVendorInvoiceStatements(invoiceId, ts),
    ...(task ? buildSoftDeleteTaskStatements(task.id, ts) : []),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}
