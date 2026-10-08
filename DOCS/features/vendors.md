# Vendors

Production vendors with their invoices, purchase orders (POs), receipts and links to spend, at `/budget/vendors` and `/budget/vendors/:vendorId` (**Money → Vendors**). Expenses themselves are covered in [budget.md](budget.md).

## Code map
| Area | Location |
|---|---|
| Pages | `src/features/budget/vendors/VendorsIndexPage.tsx`, `VendorDetailPage.tsx` |
| "PO & documents" UI | `ExpenseDocumentMatch.tsx` (controlled; Log Spend and expense sheet), `ExpenseFinanceEditor.tsx` (edit host), `PurchaseOrderCombobox`, `PoMatchSummary`, `IncreasePoDialog`, `ExistingProofList`, `PoCurrencyFields` (same folder) |
| Badges / pickers | `src/features/budget/ExpenseFinanceBadges.tsx`, `useExpenseFinanceFlags.ts`, `src/components/vendors/VendorPicker.tsx`, `GlobalVendorBadge.tsx` |
| Pure logic | `src/lib/budget/vendors/` (`poMatching`, `poPicker`, `poAmendments`, `poCurrency`, `poStatus`, `riskWatchSignals`), `src/lib/budget/receiptStatus.ts`, `expenseFinanceFlags.ts` |
| Orchestration | `src/lib/db/vendorFinanceDocumentService.ts`, `applyFinanceDraftToExpense.ts`, `expenseReceiptService.ts`, `vendorInvoiceReminderService.ts` |
| Repositories | `src/lib/db/repositories/`: `vendors`, `vendorInvoices`, `vendorPurchaseOrders`, `vendorPurchaseOrderAmendments`, `vendorFinanceLinks`, `expenseReceipts`, `vendorActivity` |
| Dashboard | `src/lib/dashboard/vendorFinance.ts`, `src/lib/budget/vendors/riskWatch.ts` |
| Tables (SQLite migration / Postgres twin) | `vendors` (0020); `vendor_invoices` (0034); `vendor_purchase_orders` (0036); `vendor_invoice_expenses` (0038); `vendor_purchase_order_expenses` (0039); `vendors.is_global` (0081 / pg 0015); `vendor_production_exclusions` (0082 / pg 0016); PO `allocated_amount` + `vendor_purchase_order_amendments` (0088 / pg 0021); `expense_receipts` (0089 / pg 0022); PO currency and derived approval (0090 / pg 0023) |
| Tests | colocated `*.test.ts(x)` in the folders above |

## Data model
| Entity | Key points |
|---|---|
| `vendors` | `production_id` is the origin production; `is_global` makes it visible in every production. Only the identity (company name, primary contact) is shared. |
| `vendor_production_exclusions` | Hides a global vendor from one production. |
| `vendor_invoices` | `invoice_number`, dates, `amount`, `tax`, `currency_code`, `status` (`draft, received, approved, paid, overdue`), optional `po_id`. Optional file via `documents`. |
| `vendor_purchase_orders` | `amount` is the **current** value excl. tax in the PO's own currency; `currency_code` and `exchange_rate` (locked on the PO; both NULL = production currency); `status` (`draft, issued, approved, closed, cancelled`); `approval` is derived from status (approved/closed = 1) and kept for export compatibility. |
| `vendor_purchase_order_amendments` | Append-only audit trail (previous, new, reason). |
| `vendor_invoice_expenses`, `vendor_purchase_order_expenses` | Many-to-many to `expenses`. `allocated_amount` on the PO link is the amount charged to the PO; NULL means the whole expense and is valid only while the expense has a single PO. |
| `expense_receipts` | `expense_id`, `document_id` (unique; a `documents` row with `entity_type = 'expense_receipt'`), optional date, amount, reference. No vendor needed. |
| `production_tasks.vendor_invoice_id` | At most one reminder task per invoice. |

Documents for invoices, POs and receipts use `documents.entity_type` of `vendor_invoice`, `vendor_purchase_order` or `expense_receipt`.

## How it works

### Vendors (global vs per-production)
- `listVendors(productionId)` returns the production's own vendors plus global ones not excluded for it.
- Promote with `promoteVendorToGlobal` (**Share across all projects**). Invoices, POs and spend always stay per-production.
- **Remove** (`removeVendorFromProject`) depends on where you are: project-only vendor, soft-deleted; global vendor on its origin production, `demoteVendorToLocal`; global vendor elsewhere, `excludeVendorFromProduction`. Removing from **All projects** soft-deletes the vendor (`softDeleteVendor`); linked spend history is kept.
- Editing a global vendor must invalidate `['vendors']` (all productions), not just `['vendors', productionId]`.

### Invoices and reminder tasks
- Always use `createInvoiceWithReminderTask`, `updateInvoiceWithReminderTask` and `archiveInvoiceWithReminderTask`. They keep one linked task in sync in one transaction: created for an invoice with a due date, completed when paid, re-opened if un-paid, soft-deleted on archive. POs never create tasks.

### Purchase orders
- Committed and remaining are **derived** from link rows by `computePoCommitments` (`poMatching.ts`); nothing is stored. A link charges `allocated_amount`, or the whole expense when NULL (`resolveLinkAmount`).
- Change a PO's value only with `amendPurchaseOrderAmount({poId, newAmount, reason?, patch?})`, which writes the amendment and PO update in one transaction. A plain `updateVendorPurchaseOrder({amount})` skips the audit trail. `suggestPoIncrease` backs **Increase PO to cover**.
- Approval is derived (`derivePoApproval`, `poStatus.ts`): `approved` or `closed` means approved; `draft`/`issued` are awaiting approval. There is no separate approval flag in the UI.
- Currency (`poCurrency.ts`, the single conversion/format helper): every PO figure (committed, remaining, warnings, dashboard and Risk Watch totals) is computed in the production currency using the PO's locked rate; amendments stay in the PO currency. Invoices are **not** converted: they carry `currency_code` only, so invoice-vs-expense comparisons use raw numbers.
- All vendor-finance money is rounded to 2 dp on write (`roundMoney`).

### Matching spend ("PO & documents")
- One controlled component, `ExpenseDocumentMatch`, drives both flows with a shared `ExpenseVendorFinanceDraft` (`emptyExpenseVendorFinanceDraft`, `validateExpenseVendorFinanceDraft`, `hasPendingFinanceChanges`):
  - **Create** (Log Spend): `createExpenseWithFinance` writes expense, details, tax allocations, PO links, invoice/receipt and files in one transaction. A caller-supplied `expenseId` makes retries idempotent.
  - **Edit** (expense detail sheet): `applyFinanceDraftToExpense` diffs the draft's full PO set against stored links (add, remove, re-allocate), unlinks invoices (link rows only), links or uploads invoices, and adds, replaces or removes receipts. One transaction; written files are removed on failure; returns `{changed, warnings, affectedPoIds, affectedInvoiceIds, receiptsChanged}`.
- `invoice.po_id` is filled only when empty, never overwritten. Unlinking never edits the invoice or PO.
- **Warn, don't block.** `getPoMatchWarnings` returns `over_po_remaining`, `invoice_amount_mismatch`, `invoice_on_different_po`, `allocation_sum_mismatch` and `allocation_missing`; they are shown in the UI and a toast but never stop a save. Hard errors are limited to data that cannot be stored: a PO or invoice of another vendor or production, matching without a vendor, several POs without an allocation each, an invalid amount, an invoice upload with no number, a receipt detail with no file.
- PO and invoice matching applies to purchase, rental and deposit spend with a vendor (`PO_MATCHABLE_TRANSACTION_TYPES`); receipts apply to every type, including vendorless petty cash.
- From the vendor detail page you can also link expenses to an invoice or PO (`vendorFinanceLinks`).

### Proof and badges
- An expense has **proof** when it has at least one receipt, or a linked invoice that has a file (`expenseHasProof`, `getExpenseProofKind` in `receiptStatus.ts`). An invoice record without a file is not proof.
- `getExpenseFinanceFlags` gives **No PO** (matchable vendor spend with no PO) and **No proof**. Both are hints; list views fetch them in one batch (`useExpenseFinanceFlags`, `listPoLinkCountsByExpenseIds`, `listReceiptStatusByExpenseIds`).
- Float reconciliation uses the same rule to show per-expense proof and a "missing receipts" summary (`summarizeFloatReceiptCoverage`).

### Dashboard and Risk Watch
- `getDashboardVendorFinanceData` feeds the Vendor finance cards (overdue and due-soon invoices, open POs, POs awaiting approval).
- `getVendorFinanceRiskItems(productionId, revisionId)` builds the Risk Watch list: overdue/due-soon invoices, POs awaiting approval, large unpaid invoices, vendors with unmatched spend (budget-line reconciliation), inactive vendors, open PO exposure, over-committed POs (critical above 10% over; cancelled POs excluded), vendor spend with no PO (only vendors with a non-cancelled PO) and spend with no proof. Pure builders live in `riskWatchSignals.ts`. Results are sorted by severity and date and capped at 20.

## Connections
- **Budget:** `expenses.vendor_id` (via `VendorPicker` in the purchase, rental and deposit editors); vendor spend and reconciliation status on the detail page; Risk Watch depends on budget-item links, so it is keyed by budget revision ([budget.md](budget.md)).
- **Tasks / Dashboard:** invoice reminder tasks appear in the Tasks list and on the Dashboard ([dashboard.md](dashboard.md)).
- **Equipment:** `IngestEquipmentFromInvoiceModal` / `equipmentInvoiceIngestionService` create or link equipment from an invoice (user-entered, no OCR); see [equipment.md](equipment.md).
- **.apf export:** `resolveVendorsForExport` exports the production's vendors plus portable (non-global) copies of global vendors it references; link tables, amendments and receipts (with file bytes) are in the package. See [import-export.md](../import-export.md). `duplicateProduction` copies only non-global vendors.
- **Sync:** every write records outbox rows, but none of these tables is in the sync-v2 registry; see [collaboration.md](../collaboration.md).

## Gotchas
- After any write to an expense's POs, invoices or receipts call `invalidateExpenseFinanceQueries`; after a PO value change call `invalidatePurchaseOrderQueries` (`invalidateVendorFinanceQueries.ts`). Also invalidate `dashboardVendorFinanceQueryKey` and `riskWatchBaseQueryKey` when invoices, POs, vendors, expenses, links, receipts or budget-item links change.
- Vendor reads/writes check sensitive-data access and support client-side field encryption (`requireSensitiveDataAccess`, `isClientEncryptionEnabled` in `vendors.ts`); use the repository, not raw SQL.
- Link writes must go through the `buildCreate...`/`buildDelete...` statement builders in `vendorFinanceLinks.ts` so outbox rows are included.
- Risk Watch queries are keyed by revision id; invalidate with the base key to hit all revisions.
- Receipt date, amount and reference are set when a receipt is added; there is no inline edit in the UI (`updateExpenseReceiptDetails` exists in the service).
- The add-proof control links one invoice at a time, although the data model and edit sheet allow several.
