/**
 * Apply an "PO & documents" draft to an EXISTING expense in ONE transaction (the edit-side twin of
 * `createExpenseWithFinance`). The draft describes the desired end state for POs and the changes for
 * proof; this module diffs it against what is stored and runs a single statement batch:
 *
 * - POs: `draft.poAllocations` is the full desired set -> links are added, removed or re-allocated.
 * - Invoices: `unlinkInvoiceIds` removes links only (the invoice record is never edited or cleared);
 *   `invoiceMode` existing / upload then links one more invoice.
 * - Receipts: `receipt` attaches a new one; `removeReceiptIds` / `replaceReceiptFiles` change existing ones.
 *
 * Committed / remaining figures are derived from the link rows (`poMatching`), so there is nothing to
 * recompute here; the caller only has to invalidate queries (`invalidateExpenseFinanceQueries`).
 * Mismatch warnings are returned, never thrown. Files written before the transaction are removed if it fails.
 */
import {
  computePoCommitments,
  toPoCommitmentInput,
  getPoMatchWarnings,
  type PoAllocationInput,
  type PoMatchWarning,
} from '@/lib/budget/vendors/poMatching'
import { now, uuid } from '@/lib/db/client'
import {
  buildExpenseReceiptPlan,
  buildReplaceReceiptFilePlan,
  type ReceiptPlan,
} from '@/lib/db/expenseReceiptService'
import { removeProductionDocumentFile } from '@/lib/db/productionDocumentFiles'
import {
  buildDeleteExpenseReceiptStatements,
  getExpenseReceiptById,
} from '@/lib/db/repositories/expenseReceipts'
import {
  assertExpenseLinkableToPurchaseOrder,
  assertValidAllocatedAmount,
  buildCreateVendorPurchaseOrderExpenseLinkStatements,
  buildDeleteVendorInvoiceExpenseLinkStatements,
  buildDeleteVendorPurchaseOrderExpenseLinkStatements,
  buildUpdatePoExpenseLinkAllocationStatements,
  listInvoiceLinksByExpenseId,
  listPoCommitmentLinksByPurchaseOrderIds,
  listPurchaseOrderLinksByExpenseId,
} from '@/lib/db/repositories/vendorFinanceLinks'
import { getVendorPurchaseOrderById } from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  buildInvoiceLinkPart,
  isExpenseReceiptDraftEmpty,
  loadExpenseFacts,
  runStatementsAtomically,
  type ExpenseVendorFinanceDraft,
  type InvoiceLinkPart,
} from '@/lib/db/vendorFinanceDocumentService'
import type { VendorPurchaseOrder } from '@/lib/db/types'
import { moneyEquals } from '@/lib/money/roundMoney'

type Stmt = { sql: string; bindValues: unknown[] }

export type ApplyFinanceDraftParams = {
  expenseId: string
  productionCurrency: string
  draft: ExpenseVendorFinanceDraft
}

export type ApplyFinanceDraftResult = {
  /** True when anything was written. */
  changed: boolean
  /** Non-blocking mismatch warnings for the expense's resulting PO / invoice picture. */
  warnings: PoMatchWarning[]
  /** Every PO whose link set or allocation changed (caches that show its committed figure). */
  affectedPoIds: string[]
  /** Invoices linked or unlinked. */
  affectedInvoiceIds: string[]
  receiptsChanged: boolean
}

function sameAllocation(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b
  return moneyEquals(a, b)
}

/**
 * Normalise the desired PO set: a single PO that carries the whole expense amount is stored as NULL
 * ("whole expense", follows later amount edits); several POs need an explicit amount each.
 */
function normaliseAllocations(allocations: PoAllocationInput[], expenseAmount: number): PoAllocationInput[] {
  const seen = new Set<string>()
  for (const a of allocations) {
    if (seen.has(a.poId)) throw new Error('A purchase order can only be matched once per expense')
    seen.add(a.poId)
    assertValidAllocatedAmount(a.allocatedAmount)
  }
  if (allocations.length > 1 && allocations.some((a) => a.allocatedAmount == null)) {
    throw new Error('Enter an allocated amount for each purchase order when matching more than one')
  }
  if (allocations.length === 1) {
    const only = allocations[0]!
    if (only.allocatedAmount != null && sameAllocation(only.allocatedAmount, expenseAmount)) {
      return [{ poId: only.poId, allocatedAmount: null }]
    }
  }
  return allocations
}

export async function applyFinanceDraftToExpense(params: ApplyFinanceDraftParams): Promise<ApplyFinanceDraftResult> {
  const { expenseId, productionCurrency, draft } = params
  const target = await loadExpenseFacts(expenseId, productionCurrency)
  const { productionId, vendorId, expenseAmount } = target
  const ts = now()

  const desired = normaliseAllocations(draft.poAllocations, expenseAmount)
  const [poLinks, invoiceLinks] = await Promise.all([
    listPurchaseOrderLinksByExpenseId(expenseId),
    listInvoiceLinksByExpenseId(expenseId),
  ])

  const statements: Stmt[] = []
  const writtenFilePaths: string[] = []
  const affectedPoIds = new Set<string>()
  const affectedInvoiceIds = new Set<string>()

  try {
    // ── POs: diff the desired set against the stored links ────────────────
    const currentByPo = new Map(poLinks.map((l) => [l.vendor_purchase_order_id, l]))
    const desiredByPo = new Map(desired.map((a) => [a.poId, a]))
    const purchaseOrders: VendorPurchaseOrder[] = []

    for (const a of desired) {
      const po = await getVendorPurchaseOrderById(a.poId)
      if (!currentByPo.has(a.poId)) {
        if (!vendorId) throw new Error('A vendor is required to match purchase orders or invoices')
        if (!po) throw new Error('Vendor purchase order not found or deleted')
        assertExpenseLinkableToPurchaseOrder(po, { production_id: productionId, vendor_id: vendorId })
      }
      if (po) purchaseOrders.push(po)
    }
    for (const link of poLinks) {
      if (desiredByPo.has(link.vendor_purchase_order_id)) continue
      statements.push(...buildDeleteVendorPurchaseOrderExpenseLinkStatements(link.id))
      affectedPoIds.add(link.vendor_purchase_order_id)
    }
    for (const a of desired) {
      const existing = currentByPo.get(a.poId)
      if (!existing) {
        statements.push(
          ...buildCreateVendorPurchaseOrderExpenseLinkStatements(uuid(), ts, a.poId, expenseId, a.allocatedAmount)
        )
        affectedPoIds.add(a.poId)
      } else if (!sameAllocation(existing.allocated_amount, a.allocatedAmount)) {
        statements.push(...buildUpdatePoExpenseLinkAllocationStatements(existing.id, ts, a.allocatedAmount))
        affectedPoIds.add(a.poId)
      }
    }

    // ── Invoices: unlink (link row only), then link one more ──────────────
    const linkedInvoiceIds = new Map(invoiceLinks.map((l) => [l.vendor_invoice_id, l]))
    const unlinkIds = new Set(draft.unlinkInvoiceIds ?? [])
    for (const invoiceId of unlinkIds) {
      const link = linkedInvoiceIds.get(invoiceId)
      if (!link) continue
      statements.push(...buildDeleteVendorInvoiceExpenseLinkStatements(link.id))
      affectedInvoiceIds.add(invoiceId)
    }

    let invoiceForWarnings: InvoiceLinkPart['invoiceForWarnings'] = null
    const wantsInvoice =
      (draft.invoiceMode === 'existing' && draft.existingInvoiceId) ||
      (draft.invoiceMode === 'upload' && draft.uploadInvoice?.invoice_number?.trim())
    if (wantsInvoice) {
      if (
        draft.invoiceMode === 'existing' &&
        draft.existingInvoiceId &&
        linkedInvoiceIds.has(draft.existingInvoiceId) &&
        !unlinkIds.has(draft.existingInvoiceId)
      ) {
        throw new Error('Expense is already linked to this invoice')
      }
      const part = await buildInvoiceLinkPart(target, draft, ts, desired[0]?.poId ?? null)
      statements.push(...part.statements)
      writtenFilePaths.push(...part.writtenFilePaths)
      invoiceForWarnings = part.invoiceForWarnings
      if (part.invoiceId) affectedInvoiceIds.add(part.invoiceId)
    }

    // ── Receipts ──────────────────────────────────────────────────────────
    const removeIds = new Set(draft.removeReceiptIds ?? [])
    let receiptsChanged = false
    const loadOwnReceipt = async (receiptId: string) => {
      const receipt = await getExpenseReceiptById(receiptId)
      if (!receipt || receipt.expense_id !== expenseId) throw new Error('Receipt not found or deleted')
      return receipt
    }
    for (const receiptId of removeIds) {
      const receipt = await loadOwnReceipt(receiptId)
      statements.push(...buildDeleteExpenseReceiptStatements(receipt.id, ts, receipt.document_id))
      receiptsChanged = true
    }
    for (const [receiptId, file] of Object.entries(draft.replaceReceiptFiles ?? {})) {
      if (removeIds.has(receiptId)) continue
      const receipt = await loadOwnReceipt(receiptId)
      const plan: ReceiptPlan = await buildReplaceReceiptFilePlan(receipt, productionId, file, ts)
      statements.push(...plan.statements)
      writtenFilePaths.push(...plan.writtenFilePaths)
      receiptsChanged = true
    }
    if (!isExpenseReceiptDraftEmpty(draft.receipt)) {
      const plan = await buildExpenseReceiptPlan({ expenseId, productionId }, draft.receipt, ts)
      statements.push(...plan.statements)
      writtenFilePaths.push(...plan.writtenFilePaths)
      receiptsChanged = true
    }

    // ── Warnings (never block) ────────────────────────────────────────────
    let warnings: PoMatchWarning[] = []
    if (purchaseOrders.length > 0 || invoiceForWarnings) {
      const links = await listPoCommitmentLinksByPurchaseOrderIds(purchaseOrders.map((po) => po.id))
      const commitments = computePoCommitments(
        purchaseOrders.map(toPoCommitmentInput),
        links,
        { excludeExpenseId: expenseId }
      )
      warnings = getPoMatchWarnings({
        expenseAmount,
        allocations: desired,
        commitments,
        invoice: invoiceForWarnings,
      })
    }

    if (statements.length === 0) {
      return { changed: false, warnings, affectedPoIds: [], affectedInvoiceIds: [], receiptsChanged: false }
    }
    await runStatementsAtomically(statements)
    return {
      changed: true,
      warnings,
      affectedPoIds: [...affectedPoIds],
      affectedInvoiceIds: [...affectedInvoiceIds],
      receiptsChanged,
    }
  } catch (error) {
    for (const p of writtenFilePaths) await removeProductionDocumentFile(p)
    throw error
  }
}
