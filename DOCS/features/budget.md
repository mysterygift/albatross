# Budget

The chart of accounts, line items, typed expenses, floats, cost reports and budget revisions for a production, at `/budget` (**Money → Budget**). Vendors, invoices and POs are in [vendors.md](vendors.md).

## Code map
| Area | Location |
|---|---|
| Page (tabs: Budget, Cost Report, Actualisation, Floats, Compare) | `src/features/budget/page.tsx` (large; also holds Cost Report and derived-cost dialogs) |
| Log Spend, expense and line item panels | `src/features/budget/LogSpendPanel.tsx`, `ExpenseDetailPanel.tsx`, `LineItemDetailPanel.tsx` |
| Typed expense views / shared pieces | `src/features/budget/typed-expense-views/`, `expense-shared/`, `line-item-views/` |
| Actualisation (Match Spend) | `src/features/budget/actualisation/` |
| Floats UI | `FloatsTab.tsx`, `AllocateFloatDialog.tsx`, `FloatReconciliation*.tsx` |
| Revisions UI | `createBudgetRevisionActions.ts`, `liveBudgetRevisionActions.ts`, `revisionSelectorHelpers.ts`, `compareRevisions.ts` |
| Pure logic | `src/lib/budget/` (`calculations`, `reconciliation`, `chartTemplates`, `taxCredits`, `vatReclaim`, `float*`, `wrapReadiness`, `costReportPdfData`) |
| Typed expense schemas and registry | `src/lib/budget/transactions/` (expenses), `src/lib/budget/line-items/` (line items) |
| Money helpers | `src/lib/money/` (`roundMoney`, `formatMoney`, `exchangeRates`), `src/hooks/useCurrency.ts` |
| Input components | `src/components/budget/` (`MoneyAmountInput`, `PercentageInput`, `PositiveIntegerInput`, `ValidatedField`) |
| Repositories | `src/lib/db/repositories/`: `budget`, `budgetAccounts`, `budgetItemDetails`, `budgetLineItemDeletion`, `budgetDerived`, `budgetReconciliation`, `budgetRevisions`, `createTypedExpense`, `expenseTransactions`, `purchaseTransactions`, `rentalTransactions`, `depositTransactions`, `floats`, `floatReconciliation`, `productionTotals`, `costReportGroups`, `taxCredits`, `vatReclaim` |
| Services | `src/lib/db/budgetRevisionService.ts`, `applyChartTemplate.ts`, `vendorFinanceDocumentService.ts` (`createExpenseWithFinance`) |
| Tables (SQLite migrations in `src-tauri/migrations/`) | `budget_accounts` (0013), `fringe_*`/`contingency_*` (0015), `cost_report_groups*` (0016), `production_totals*` (0019), `expense_transaction_details` (0020), `budget_item_details` (0021), `budget_item_expense_links` (0022), `floats` (0052), `float_expense_links` (0053), `budget_revisions` (0054, 0057), `tax_credit_*`/`production_budget_features` (0078), `vat_reclaim_rates` (0079) |
| Tests | colocated `*.test.ts(x)`; `BudgetVersioning.integration.test.tsx`; `src/test/apf/budgetRevisionsMigration.test.ts` |

Every table also has a Postgres twin in `postgres/migrations/`; see [database.md](../database.md).

## Data model
| Entity | Notes |
|---|---|
| `budget_accounts` | Tree (`parent_account_id`, `sort_order`, `color_hex`, `archived_at`). Only `is_postable` leaves take line items and expenses; headers show roll-ups. Shared by all revisions. |
| `budget_items` (line items) | `account_id`, `estimated_cost`, `line_item_type`, `budget_revision_id`. `actual_cost` is deprecated and never used for actuals. Typed payload in `budget_item_details`. |
| `expenses` | `account_id` (null = uncoded), `amount`, `transaction_type`, `vendor_id`, `vat_*` columns. **Not** revision-scoped: one set of expenses per production. Typed payload in `expense_transaction_details` (`details_json`, one row per expense). |
| `budget_item_expense_links` | Actualisation: expense to line item with `matched_amount`; soft-deleted; revision-scoped. |
| `floats`, `float_expense_links` | Petty cash against a line item and a crew member; links expense to float. Unique active link per `(float, expense)` and at most one active float link per expense. Revision-scoped. |
| `fringe_rules`/`contingency_rules` (+ `*_scopes`) | Rate (0-1), `base_kind` budget or actual, `is_enabled`, scoped to account subtrees. Revision-scoped. |
| `production_totals` (+ accounts), `cost_report_groups` (+ accounts) | Cost Report roll-ups and groupings. Revision-scoped. |
| `budget_revisions` | See [Revisions](#budget-revisions). |
| `production_budget_features`, `tax_credit_schemes`, `expense_tax_credit_allocations`, `vat_reclaim_rates` | Per-production tax and VAT settings and per-expense tagging. |

`ExpenseTransactionType` and `LineItemType` are the same five values: `labour | purchase | rental | allow | deposit`. `budget_categories` is legacy and read-only.

## How it works

### Chart of accounts and templates
- Accounts are listed with `listAccounts`; dropdowns use `listPostableAccounts` (excludes archived and headers). Create headers with `is_postable: false`.
- New productions start with the small starter chart from `seedDefaultBudgetAccounts`. The fuller Standard chart (`DEMO_CHART_OF_ACCOUNTS` in `src/lib/db/seed/demoBudgetSeed.ts`) is applied as a template.
- **Templates** live in code: `STANDARD_CHART_TEMPLATE` (`chartTemplates.ts`, built from the demo seed) and `BBC_CHART_TEMPLATE` (`bbcChartTemplate.ts`, with employer's NI fringe rules and production totals). They hold the account codes and names; read them there, not in docs.
- **Settings → Budget accounts → Apply template...** (`ApplyChartTemplateDialog`) calls `previewChartTemplate` then `applyChartTemplate` (`src/lib/db/applyChartTemplate.ts`). `planChartTemplate` is the pure planner:
  - `merge` adds missing template accounts; `replace` also removes accounts that are not in the template and have no line items or expenses (themselves or below), and renames matches.
  - Accounts with postings and their ancestors are never removed. Code clashes land in `skipped`.
  - Accounts change in one transaction; production totals, template fringe rules and the contingency scope are then synced for the given revision.
- Hard delete is only allowed for empty accounts (`getHardDeleteEligibility`); otherwise archive.

### Line items and derived amounts
- New line items default to **Allow** with a `budget_item_details` row (`defaultAllowDetailsJsonForNewItem`). Per-type read/edit views are registered in `src/lib/budget/line-items/registry.ts`.
- Deleting a line item with matched expenses or floats goes through `deleteBudgetLineItemWithRelinks`: matches and floats are moved to a chosen target line item, matched expenses are recoded to its account, then the item is soft-deleted.
- **Everything is derived from `expenses` and `budget_items`.** `computeAccountTotals` (`calculations.ts`) sums direct budget and actual per account and rolls up children; variance is budget minus actual, % spent is actual over budget. Uncoded spend (`account_id IS NULL`) and legacy items without an account are outside the roll-ups.
- **Fringes and contingency** (`budgetDerived.ts`, `computeFringeTotals`/`computeContingencyTotals`) are display-only overlays: `base x rate` over the de-duplicated account subtrees in scope, base being budget or actual totals. They are never added to Total actual.
- Reconciliation statuses (line item: unmatched/partial/matched/overspent; expense: unallocated/partial/allocated) are computed in `reconciliation.ts` and never stored.

### Expenses and the typed-expense registry
- `src/lib/budget/transactions/registry.ts` is the single source per type: `label`, `parse(detailsJson)`, `ReadComponent`, optional `EditComponent`, `save({expenseId, details, ctx})`, `editable`, `derivesAmount`. `getTypedExpenseConfig(type)` returns `null` for untyped rows. Save handlers are thin wrappers over repositories (`saveExpenseTransactionDetails` for labour/allow, `savePurchaseTransaction`, `saveRentalTransaction`, `saveDepositTransaction`); invalidation is the caller's job (`onSaved`).
- `ExpenseDetailPanel` is the one shell for read and edit: header, mode toggle, registry lookup, `ExpenseParseErrorCard` when `details_json` fails to parse, shared `ExpenseEditorFooter`. Untyped expenses show a prompt to run the Allow migration.
- `expenses.amount` per type (`createTypedExpense.ts`, mirrored for previews in `computeDraftExpenseAmount.ts`): labour = `rate_per_day x booked_days_count`; purchase and deposit = required amount > 0; rental = `calculateRentalExpenseAmount`; allow = `provisional_amount ?? 0`.
- Legacy untyped rows (`transaction_type IS NULL`) are converted by the Budget-page modal via `src/lib/db/migrations/migrateUntypedToAllow.ts`.
- Rows can be recoded to another account (`updateExpenseAccount`); uncoded spend has a **Recode** control.

### Log Spend
- **Log Spend** opens `LogSpendPanel`: postable account, transaction type (default Allow), the registry's `EditComponent` driven through an editor ref (`submit()`), tax and VAT fields, then the **PO & documents** section.
- Save calls `createExpenseWithFinance` (`vendorFinanceDocumentService.ts`): `prepareTypedExpense` statements + tax allocations + PO links + invoice/receipt in one transaction, with a caller-generated `expenseId` so retries are idempotent. See [vendors.md](vendors.md).
- **Save & Add Another** keeps account and type and remounts the editor. Changing type with a dirty form asks for confirmation.
- **Receipt Capture** (experimental, **Budget → Receipt Capture**) is a shorter route to a purchase with a photographed receipt: [receipt-capture.md](receipt-capture.md).

### Floats and reconciliation
- A float is an allocation only: `createFloat` ties cash to one line item and one crew member (`person_id`), with its own currency. `updateFloat`/`softDeleteFloat` exist but the UI does not use them.
- **Reconcile** (`FloatReconciliationDialog`) links expenses to a float with `createFloatExpenseLinks`. Expense room = amount minus budget links minus float links (`getExpenseUnallocatedForFloatMatching`). Total matched may exceed the allocation (status `overspent`).
- Status and summaries are derived: `getPettyCashFloatDerived`, `getFloatSummaryForProduction` (joins people for department), `groupFloatsByDepartment`; reminders in `floatReminders.ts` (outstanding after 7 days).
- Floats and float links never change Total actual or `computeAccountTotals`.
- Proof coverage for matched expenses comes from `receiptStatus.ts` (see [vendors.md](vendors.md)).
- Deep links: `/budget?tab=floats`, `/budget?tab=floats&floats=outstanding` (also `tab=budget|cost_report|actualisation|compare`). The last tab is kept in `localStorage` (`budgetViewMode`).

### Budget revisions
- Revision-scoped tables: `budget_items` (+ details), `production_totals`, `cost_report_groups`, `budget_item_expense_links`, `floats`, `float_expense_links`, `fringe_rules`, `contingency_rules` (column `budget_revision_id`). Accounts, expenses and everything vendor-side are shared across revisions.
- **Invariant:** exactly one live, non-deleted revision per production (unique partial index `idx_budget_revisions_one_live_per_production`). `setLiveBudgetRevisionForProduction` flips it in one transaction. The live revision cannot be deleted. `approval` is `unapproved | pending | approved`.
- `getOrCreateLiveBudgetRevisionIdForProduction` creates **Current budget** on first use and backfills NULL `budget_revision_id` rows.
- **Repositories take a revision id.** Pass `{ revisionId }` (e.g. `listBudgetItemsByProduction(productionId, { revisionId })`); `resolveBudgetRevisionId` uses it when given and falls back to the live revision when omitted. Explicit contexts must stay explicit; only unresolved contexts fall back to live. Query keys include the revision id (for example `['budget-items', productionId, revisionId]`, `riskWatchQueryKey(productionId, revisionId)`).
- **Working revision:** `useWorkingBudgetRevision(productionId, { explicitRevisionId })` (`src/hooks/useWorkingBudgetRevision.ts`) resolves the `?revisionId=` param, else the per-production selection kept in `ProductionContext`, else live; it clears the selection if the revision no longer exists. Budget, Cost Report, Actualisation, Floats and the Dashboard budget widgets all use it.
- `createBlankBudgetRevision`, `createBudgetRevisionFromExisting` (deep copy with id remapping of the tables above) and `duplicateLiveBudgetRevisionAsDraft` (name via `buildDuplicateLiveDraftName`) are in `budgetRevisionService.ts`, with `...ForActor` variants that check edit access. The native **Budget → Duplicate live as draft** menu item is wired in `src/features/productions/budgetMenuActions.ts`.
- **Compare** tab (`compareRevisions.ts`): read-only summary of estimate, actuals, variance, derived costs, tax credits and float exposure for two revisions; delta is `compare - base`; its selectors do not change the working revision.

### Cost reports and groups
- The Cost Report tab shows the same totals as Budget in a print layout: **Chart of accounts** or **By groups**. Group totals sum the unique leaf descendants of the group's accounts (`getDescendantLeafIds`).
- **Production totals** (`productionTotals.ts`) are named roll-ups of header accounts (for example Above/Below the Line), shown as subtotals before derived costs.
- **Save as PDF** builds rows with `buildCostReportPdfData` and `src/lib/pdf/costReport`, saves a copy via a file dialog and stores it as a production document (`DOCUMENT_ENTITY_TYPES.costReportPdf`, keyed by revision id). **Export CSV** is on the Budget tab.
- Groups are created in **Settings → Budget accounts → Cost report groups**; they affect presentation only.

### Tax credits and VAT
- Enabled per production (**Settings → Production**, `TaxCreditsSettingsSection`, see [settings.md](settings.md); stored in `production_budget_features`). `setTaxCreditsEnabled` seeds default AVEC schemes on first enable (`taxCreditSeedService.ts`); data is kept when disabled.
- An expense tags qualifying amounts per scheme (`expense_tax_credit_allocations`). `computeTaxCreditForScheme` applies `max_core_budget` (ineligible above it), `cap_percent`, `max_qualifying_amount`, `min_qualifying_percent` (warning only), then `net_rate`.
- VAT: `vat_rate_percent` per expense. `vatReclaim.ts`: VAT paid = `amount x rate`; reclaimable = paid x reclaim % for the expense's type (`vat_reclaim_rates`; untyped counts as `allow`); outstanding = reclaimable minus `vat_reclaimed_amount`. Shown separately from account actuals.
- Tax and VAT writes go through `updateExpenseTaxVatAndAllocations` / `buildReplaceExpenseTaxCreditAllocationStatements`.

### Currency
- Every stored budget amount is in the production's `currency_code` (default GBP). `useCurrency().format(amount, productionCurrency)` converts for display only, using the Settings display currency and cached rates (`getRate`); it falls back to the production currency when conversion is off or offline (`conversionBanner`).
- Exceptions: floats carry their own `currency`; POs carry a currency and a locked exchange rate (see [vendors.md](vendors.md)).
- Money is rounded to 2 dp with `roundMoney` (half away from zero) in `MoneyAmountInput`, the Zod builders in `fieldValidation.ts` and on write. Field kinds: actual spend (> 0), planning (>= 0, optional), counts (positive integer), percentages (0-100, 1 dp). Use these components and builders for any new numeric field.

## Connections
- **Dashboard** ([dashboard.md](dashboard.md)): budget health (`src/lib/dashboard/budgetHealth.ts`), outstanding float reminders (links to `/budget?tab=floats&floats=outstanding`), vendor finance and Risk Watch ([vendors.md](vendors.md)).
- **Wrap production** ([wrap-production.md](wrap-production.md)): `wrapReadiness.ts` finds overspent and underspent line items and reallocation opportunities.
- **Locations / equipment / people:** purchase saves can update a location's booked status; labour links a person; floats link crew; vendors link equipment.
- **Duplicate production:** `duplicateProduction.ts` copies the chart of accounts (parents first; the starter chart is seeded only when the source has none), budget revisions with `created_from_revision_id`, budget items (account, revision, `line_item_type`) with `budget_item_details`, and expenses (account, vendor, VAT columns) with `expense_transaction_details`, remapping every id so coding survives. It does not copy floats, budget-to-expense links, fringe/contingency rules, cost-report groups, production totals or tax-credit setup (listed in `DUPLICATE_EXCLUDED_TABLES`).
- **.apf export/import:** budget tables and revisions are part of the package; see [import-export.md](../import-export.md).
- **Sync:** budget and vendor tables write outbox rows but are not in the sync-v2 registry; see [collaboration.md](../collaboration.md).

## Adding a new transaction type
1. Add the value to `ExpenseTransactionType` and `LineItemType` (`src/lib/db/types.ts`) and to the VAT reclaim type list.
2. Add Zod schema + `parse`/`toJson` in `src/lib/budget/transactions/<type>.ts` and `src/lib/budget/line-items/<type>.ts`.
3. Add `<Type>TransactionRead/Editor` in `typed-expense-views/` and `<Type>LineItemRead/Editor` in `line-item-views/`.
4. Add a repository `save<Type>Transaction` (own transaction via `runInSerializedTransaction` + `executeBatch`) and register it in both `transactions/registry.ts` and `line-items/registry.ts`.
5. Handle it in `createTypedExpense.ts` (`prepareTypedExpense` amount rule), `computeDraftExpenseAmount.ts`, `LogSpendPanel.tsx` (`TRANSACTION_TYPE_ORDER`/helper text), `PO_MATCHABLE_TRANSACTION_TYPES` if vendor-matched, and the Actualisation filters.
6. Update `.apf` import/export and demo seeds if they enumerate types.

## Gotchas
- Never use `budget_items.actual_cost` for actuals; Total actual is `sum(expenses.amount)`.
- Expenses are not revision-scoped, so actuals are identical in every revision; only estimates, links, floats and rules differ.
- Multi-statement writes use `runInSerializedTransaction` + `executeBatch` with `BEGIN`/`COMMIT` as statements inside the one batch, not separate calls (see [database.md](../database.md)).
- After revision-scoped writes invalidate keys that include the revision id, plus `riskWatchQueryKey`; account changes need both `['budget-accounts', id]` and the postable list.
- Budget-item and float links are local reconciliation data and are not outbox-synced.
- Editing a PO amount must go through `amendPurchaseOrderAmount`, never a plain update.
