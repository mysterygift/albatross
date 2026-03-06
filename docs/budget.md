# Budget

This document is both a **user guide** (how to use the Budget feature) and a **developer guide** (data model, repositories, and implementation). It consolidates the former budget, typed-expense, and cost-report documentation.

---

## Table of contents

**Part I — User guide**

- [1. Overview](#1-overview)
- [2. Budget tab](#2-budget-tab)
- [3. Log Spend](#3-log-spend)
- [4. Examine Account and Examine Spend](#4-examine-account-and-examine-spend)
- [5. Cost Report tab](#5-cost-report-tab)
- [6. Settings](#6-settings)
- [7. Actualisation and Match Spend](#7-actualisation-and-match-spend)

**Part II — Developer guide**

- [7. Data model](#7-data-model)
- [8. Repositories and persistence](#8-repositories-and-persistence)
- [9. Typed expenses (registry and UI)](#9-typed-expenses-registry-and-ui)
- [10. Calculations](#10-calculations)
- [11. Query keys and invalidation](#11-query-keys-and-invalidation)
- [12. Currency and display](#12-currency-and-display)
- [13. Implementation checklist](#13-implementation-checklist)

**Part III — Reference and evolution**

- [14. Cost Report (reference)](#14-cost-report-reference)
- [15. Gaps and future work](#15-gaps-and-future-work)
- [16. History / changes](#16-history--changes)

---

## Part I — User guide

### 1. Overview

- **Route:** `/budget` (see `src/app/router.tsx`).
- **Entry point:** `src/features/budget/page.tsx` — `BudgetPage` plus dialogs and the right-hand sheet (Examine Account, Examine Spend, Log Spend).
- **Navigation:** “Budget” (DollarSign icon) in the app nav (`src/app/navigation.ts`).
- **Context:** A **current production** must be selected. If none is selected, the page shows “Select a production first.” All budget data is scoped by `production_id`.

The Budget page provides:

1. **Chart of Accounts** — Hierarchical account tree. Only **postable (leaf)** accounts receive budget items and expenses; header accounts show rollup totals only.
2. **Summary totals** — Total estimated, total actual (from expenses), and variance. Optional **derived** section: Fringes, Contingency (budget-side overlays; not included in Total actual).
3. **Hierarchical table** — Accounts with expand/collapse; per-account Budget, Actual, Variance, % Spent; line items under leaf accounts; “Add line item” per leaf.
4. **Add line item** — Create a budget line item (account, description, estimated/actual cost, vendor). Inline add from a leaf row.
5. **Log Spend** — Create typed spend: choose account and transaction type (Labour, Purchase, Rental, Allow, Deposit), fill the type-specific form, Save or “Save & Add Another.”
6. **Uncoded spend** — Expandable section for expenses with no account; **Recode** assigns an account.
7. **Legacy uncoded budget items** — Read-only list of items with no account (excluded from rollups until recoded/backfilled).
8. **Manage derived costs** — Fringes and Contingency rules (percentage overlays scoped to account subtrees).
9. **Export CSV** — Line-item report; when derived totals exist, adds FRINGES, CONTINGENCY, TOTAL + DERIVED. Total actual remains sum(expenses) only.

Currency comes from the production’s `currency_code`; display conversion is configured in Settings.

---

### 2. Budget tab

- **Conversion banner** (optional) — Shown when currency conversion is disabled or in fallback.
- **Header actions:** Manage derived costs, Export CSV, **Log Spend**, Add line item.
- **Summary cards:** Total estimated, Total actual (expenses only), Variance. When uncoded spend > 0, “Uncoded spend: £X” under Total actual.
- **Derived section** (when fringes or contingency total > 0) — Fringes (derived), Contingency (derived), Estimated + derived. Derived amounts are not included in Total actual.
- **Hierarchical table** — Columns: Code, Account / Description, Budget, Actual, Variance, % Spent, Actions. Account rows expand/collapse; leaf rows show “Add line item.” Expanding a leaf shows its line items. Header rows show rollup totals.
- **Uncoded spend** — Expandable row when uncoded total > 0; list of expenses without account and a **Recode** dropdown to assign an account.
- **Legacy uncoded budget items** — Read-only section for items with `account_id IS NULL`.
- **Empty state** — “No accounts yet. Add a line item or log spend to get started.” when the tree is empty and there is no uncoded/legacy data.

**Add line item (dialog and inline)**  
Form: Account (required; postable only), Description (required), Estimated cost, Actual cost, Vendor (optional). Inline form uses the current leaf account. Submit creates the line item and closes the dialog or clears the inline target. There is no edit/delete for line items on the Budget page.

**Recode uncoded spend**  
Expenses with no account appear in the Uncoded spend section. Use the Recode dropdown to assign a postable account; the expense then contributes to that account’s actuals.

---

### 3. Log Spend

**Log Spend** is the main way to create new spend. It opens a right-hand sheet (panel) where you choose an account and a transaction type, then fill the type-specific form.

1. Click **Log Spend** in the Budget tab header.
2. **Account** — Select a postable account (the budget line you are logging spend against). The selected account is shown in a summary card below the dropdown.
3. **Transaction type** — Choose Labour, Purchase, Rental, Allow, or Deposit. Short helper text explains each type. Changing type after entering data will prompt to discard the current form values.
4. **Details** — A type-specific form appears (e.g. Labour: person, role, rate type, days, rate per day, dates; Purchase: description, purchase type (Service / Physical goods), amount, category, vendor, location, notes; Rental: description, rate type, rate, dates, equipment, vendor; Allow: description, provisional amount, status, notes). **Deposit** shows “Deposit creation is not yet available” — use another type for now.
5. **Save** — Persists the expense and typed details, closes the panel, and refreshes the Budget page so the new spend appears. **Save & Add Another** — Saves, keeps the panel open, keeps the same account and type, and clears the form so you can enter another transaction (useful for logging several items to the same account).
6. **Cancel** — Closes the panel without saving.

Validation errors (e.g. “Purchase amount is required and must be greater than 0”, “Rental amount cannot be calculated…”) appear above the footer. The Save button is disabled until account and type are selected and the form is valid for types that have an editor.

---

### 4. Examine Account and Examine Spend

- **Examine account** — Click the eye icon on an account row. A right-hand sheet opens showing that account’s **line items** (description, estimated cost) and **expenses** (date, amount, with an eye to examine spend). Line items are view-only in this sheet; editing is done from the Budget table or Add line item.
- **Examine spend** — From the Examine Account sheet, click the eye on an expense row. The sheet switches to **Expense details**: amount, date, account, transaction type, vendor, notes, and the type-specific details (or “This spend does not yet use a typed transaction format” for untyped expenses).
- **Edit** — For typed expenses (Labour, Purchase, Rental, Allow) an Edit button appears in the header. Click to switch to edit mode: the same type-specific editor used in Log Spend appears inline. Save persists via the registry’s save handler and returns to read mode. For **untyped** expenses, Edit is available when the app supports it: you can change amount, date, vendor, and notes (transaction type cannot be set here). **Deposit** and unknown types do not show Edit (tooltip explains).
- **Cancel / View** — In edit mode, Cancel or View returns to read mode without saving.

---

### 5. Cost Report tab

The Budget page has two tabs: **Budget** and **Cost Report**. The Cost Report tab shows the same data in a print-oriented layout.

- **Summary cards** — Same three cards (Total estimated, Total actual, Variance) as the Budget tab.
- **Layout** — Toggle **Chart of accounts** (default) or **By groups** (if you have cost report groups). Chart of accounts shows the full account tree in one table. By groups shows one section per group with a table of accounts in that group and a group total row.
- **Configure production totals** — Opens a modal to define custom rollup subtotals (e.g. “Above the line”, “Below the line”) by attaching header accounts. These appear in a Subtotals block below the table (Subtotal before derived, then Derived, then Total budget incl. derived and Total actual).
- **Print** — Print button uses the browser print dialog. Print-friendly CSS is applied (e.g. white background, `.no-print` hidden).

---

### 6. Settings

- **Cost report groups** — Card “Cost report groups”: create and edit groups (name, optional code, list of accounts). Groups are for presentation and reporting only (e.g. “By groups” layout on the Cost Report tab). They do not affect posting or totals.
- **Legacy categories** — Read-only panel for budget categories (ATL, BTL, POST, OTHER). New items and expenses use the chart of accounts; categories are only for legacy item display and backfill.

---

### 7. Actualisation and Match Spend

The Budget page has three tabs: **Budget**, **Cost Report**, and **Match Expenses**. The **Match Expenses** tab (value `actualisation`) renders the Actualisation workspace from `src/features/budget/actualisation/page.tsx`. Its purpose is to reconcile expenses to budget line items by creating and managing **links** between an expense and one or more line items, with **matched amounts** (partial allocation). It does not change `expenses.amount` or `budget_items.estimated_cost`; those remain the source of truth.

**Reconciliation summary card**

- Counts for line items: matched, partially matched, unmatched, overspent.
- Counts for expenses: allocated, partially allocated, unallocated.
- Totals: total remaining estimate (line items), total unallocated spend (expenses).

**Filters**

- **Type** — All, Labour, Purchase, Rental, Allow, Deposit, Untyped.
- **Line item status** — All, Unmatched, Partially matched, Matched, Overspent.
- **Expense status** — All, Unallocated, Partially allocated, Allocated.
- **Clear filters** appears when any filter is active. If both columns are empty with filters active, the page shows: “No line items or expenses match the current filters.”

**Two-column workspace**

- **Left: Budget line items** — Table: code, description, estimated cost, type, match status badge, remaining estimate. Remaining estimate is emphasised; when negative (overspent) it uses destructive styling. Click a row to select it; the selected row has a mint highlight and left border.
- **Right: Expenses** — Table: date, description, amount, type, allocation status badge, unallocated amount. When an expense is partially allocated, the unallocated amount is emphasised. Click to select; selected row uses the same mint highlight and left border. When an expense is selected, a **Match Spend** button appears; clicking it opens the Match Spend modal.

**Linked records panels (read-only)**

- When a **line item** is selected, a card **Linked expenses** lists expenses linked to that line item (description, type badge, account code, matched amount). Empty state: “No linked expenses yet.”
- When an **expense** is selected, a card **Linked line items** lists line items linked to that expense (description, type badge, account code, matched amount). Empty state: “No linked line items yet.”

**Match Spend modal**

- **Opens when:** An expense is selected and the user clicks **Match Spend**.
- **Header:** Title “Match Spend”, description “Allocate this expense to one or more budget line items.”
- **Expense summary card:** Shows the selected expense: description, date, account (code · name), amount, type badge, allocation status badge, allocated total, unallocated amount (from existing links).
- **Candidate line items** — Line items on the **same account** as the selected expense. Each row shows: description, type badge, estimated / matched / remaining, match status. Optional hints (e.g. “Same type as this expense”, “Already partially matched”, “Overspent”) help guide without restricting. Use the checkbox to select one or more; when selected, an allocation amount input appears. The total “allocating now” cannot exceed the expense’s current unallocated amount. Overspend of a line item (matched total &gt; estimated cost) is allowed; a warning icon and tooltip explain but do not block.
- **Allocation summary** — Live summary: expense amount, previously allocated, allocating now, remaining unallocated after save.
- **Existing allocations** — Current links for this expense. Each row: description, type, matched amount, estimated, remaining. **Edit** opens inline amount editing (validated so the expense’s total allocated does not exceed its amount; other links are taken into account). **Remove** asks “Remove this match?” and on confirm soft-deletes the link. Edit and Remove only affect the link; the expense and line item records are unchanged. Overspend of a line item is allowed with a warning.
- **Footer:** **Cancel** (closes the modal), **Save** (enabled when new allocations are valid). On **Save** for new links: creates links, closes the modal, keeps the same expense selected, and shows a brief success message “Spend matched.” On **Edit** or **Remove**: the modal stays open, data refreshes, and a success message “Allocation updated.” or “Match removed.” is shown.

**Empty states in the modal**

- No candidate line items: “No budget line items are available under this account yet.” Secondary note: “Create or classify line items in the Budget page to match this spend.”
- No existing allocations: “This expense has not been matched yet.”

---

## Part II — Developer guide

### 7. Data model

#### 7.1 Entities and tables

| Entity | Table | Purpose |
|--------|--------|--------|
| **BudgetCategory** | `budget_categories` | Legacy-only. Read-only in Settings. New items/expenses use `category_id: null`. |
| **BudgetAccount** | `budget_accounts` | Chart of accounts: code, name, parent_account_id, sort_order, is_postable. Only postable (leaf) accounts receive items/expenses. |
| **BudgetItem** | `budget_items` | Line items: account_id (nullable for legacy), category_id (nullable), description, estimated_cost, actual_cost (deprecated for actuals), vendor, status. |
| **Expense** | `expenses` | Spends: account_id (nullable for uncoded), amount, date, vendor_id, vendor (legacy string), notes, expense_type, **transaction_type** (null or labour/purchase/rental/allow/deposit). |
| **ExpenseTransactionDetails** | `expense_transaction_details` | Typed payload: expense_id (unique), transaction_type, details_json. One row per expense when typed. |
| **FringeRule / FringeRuleScope** | `fringe_rules`, `fringe_rule_scopes` | Derived fringes: rate, base_kind, scopes. |
| **ContingencyRule / ContingencyRuleScope** | `contingency_rules`, `contingency_rule_scopes` | Derived contingency. |
| **ProductionTotal / ProductionTotalAccount** | `production_totals`, `production_total_accounts` | User-defined rollup subtotals (Cost Report). Header accounts only. |
| **CostReportGroup / CostReportGroupAccount** | `cost_report_groups`, `cost_report_group_accounts` | Groups of accounts for reporting (Settings; “By groups” layout). |
| **BudgetItemExpenseLink** | `budget_item_expense_links` | Links a budget line item to an expense with `matched_amount`; supports partial allocation; soft-deleted via `deleted_at`. Used by Actualisation / Match Spend. |

Types: `src/lib/db/types.ts`. Repositories: `budget.ts`, `budgetAccounts.ts`, `budgetDerived.ts`, `budgetReconciliation.ts`, `expenseTransactions.ts`, `purchaseTransactions.ts`, `rentalTransactions.ts`, `createTypedExpense.ts`, `productionTotals.ts`, `costReportGroups.ts`.

#### 7.2 Typed expenses: transaction_type and details

- **Discriminator:** `expenses.transaction_type` — `ExpenseTransactionType = 'labour' | 'purchase' | 'rental' | 'allow' | 'deposit'` or null (legacy/untyped).
- **Payload:** `expense_transaction_details` — `expense_id` (unique), `transaction_type`, `details_json` (type-specific JSON). Fetched with the expense via `getExpenseWithDetails` in `expenseTransactions.ts`. Parsed by type in `src/lib/budget/transactions/*.ts` (e.g. `parseLabourDetails`, `parsePurchaseDetails`).

**Per-type schemas (Zod, in `src/lib/budget/transactions`):**

- **Labour** — person_id, labour_role_label (required), labour_rate_type, booked_days_count, rate_per_day, currency_code, start_date, end_date, unit, notes.
- **Purchase** — purchase_description (required), purchase_category, is_service_purchase, service_description, location_id, vendor_id, notes, **amount** (required for creation; expenses.amount is the actual).
- **Rental** — rental_description (required), rental_rate_type, rental_rate_amount, rental_start_date/end_date, rental_period_override_days, equipment_description, vendor_id, primary_contact_override, notes. Amount is derived from rate and duration.
- **Allow** — allow_description (required), provisional_amount, status (open/resolved), notes.
- **Deposit** — No full schema or editor yet; creation UI shows “Deposit creation is not yet available.”

#### 7.3 Relationships and totals

**Actuals are derived from expenses only.** Do not use `budget_item.actual_cost` for Total Actual or per-account actual.

- **Per-account:** Direct budget = sum of `budget_items.estimated_cost` for that account; direct actual = sum of `expenses.amount` for that account. Header accounts roll up children via `computeAccountTotals` in `src/lib/budget/calculations.ts`.
- **Total estimated** — Sum of all budget items’ estimated_cost.
- **Total actual** — Sum of all expenses’ amount.
- **Variance** — Total estimated − total actual. % Spent = actual / budget when budget > 0.
- **Uncoded spend** — Sum of expenses where `account_id IS NULL`; recode assigns an account.
- **Legacy items** — `account_id IS NULL`; excluded from account rollups and derived bases until recoded or backfilled.

#### 7.4 Chart of accounts

- **Postable account** — `is_postable === true`. Only these can have budget items and expenses. Use `listPostableAccounts(productionId)` for Log Spend and Add line item dropdowns.
- **Header / rollup** — `is_postable === false`. Display rollup totals only; cannot receive items or expenses. When creating a header, it must be created with `is_postable: false`.
- **Archived** — Excluded from `listPostableAccounts`; still in `listAccounts` for rollups.

#### 7.5 Derived rules (fringes, contingency)

Rules have name, rate (decimal 0–1), base_kind (budget | actual), scope_mode, is_enabled. Scopes define which account subtrees form the base. `computeFringeTotals` / `computeContingencyTotals` in `calculations.ts` compute display-only amounts; legacy items are excluded from the base.

#### 7.6 Reconciliation (links and derived status)

- **Links:** Table `budget_item_expense_links`: `id`, `production_id`, `budget_item_id`, `expense_id`, `matched_amount`, timestamps, `deleted_at`. One expense can link to many line items; one line item to many expenses. These amounts are not normalised elsewhere; `expenses.amount` and `budget_items.estimated_cost` remain the source of truth.
- **Derived statuses (not stored):** For line items: unmatched / partial / matched / overspent (from `sum(matched_amount)` vs `estimated_cost`). For expenses: unallocated / partial / allocated (from `sum(matched_amount)` vs `expense.amount`). Computed in `src/lib/budget/reconciliation.ts`.

---

### 8. Repositories and persistence

- **budget.ts** — Categories (list, seed); budget items (list, createBudgetItem, update, delete, backfill); expenses (listExpensesByProduction, createExpense, updateExpense, updateExpenseAccount, deleteExpense). Outbox pushed for create/update/delete.
- **budgetAccounts.ts** — listAccounts, listPostableAccounts, getAccountById, createAccount, updateAccountName, updateAccountSortOrder, archive, unarchive, hardDelete; seedDefaultBudgetAccounts. Postable dropdowns use listPostableAccounts.
- **budgetReconciliation.ts** — List links by production, by budget item, by expense; `createBudgetItemExpenseLink` (single); `createBudgetItemExpenseLinks` (bulk, atomic: validates expense and items exist and belong to production, total new allocation ≤ expense unallocated, no duplicate budget item in one call; uses runInSerializedTransaction + executeBatch); `updateBudgetItemExpenseLink` (validates new total allocated ≤ expense.amount using current DB state); `deleteBudgetItemExpenseLink` (soft delete). Reconciliation links are not synced; no outbox rows.
- **budgetDerived.ts** — Fringe and contingency rules + scopes; create/update/delete/toggle. Uses runInSerializedTransaction + executeBatch when rule/scopes change.
- **expenseTransactions.ts** — getExpenseWithDetails (expense + vendor + account + transaction_details); saveExpenseTransactionDetails (update expenses.transaction_type, upsert expense_transaction_details). Used by labour and allow. runInSerializedTransaction + executeBatch.
- **purchaseTransactions.ts** — savePurchaseTransaction (update expense type + vendor_id, upsert details, optional location booked_status + outbox for location update).
- **rentalTransactions.ts** — saveRentalTransaction (validates details, computes amount via calculateRentalExpenseAmount, update expense type + vendor_id + amount, upsert details).
- **createTypedExpense.ts** — **Creation pipeline:** single entry point for Log Spend. Validates account (postable, same production). Per type: parse draft with type schema, compute amount (labour: rate×days; purchase: required > 0; rental: calculateRentalExpenseAmount; allow: provisional_amount ?? 0; deposit: 0), build details_json, vendor_id where applicable. One atomic transaction: runInSerializedTransaction + executeBatch(BEGIN, INSERT expense, INSERT expense_transaction_details ON CONFLICT DO UPDATE, optional location update + location outbox for purchase, expense outbox, COMMIT). No separate BEGIN/COMMIT calls (per DATABASE_LAYER.md).
- **productionTotals.ts** — Production totals and production_total_accounts; create/update/delete with runInSerializedTransaction + executeBatch.
- **costReportGroups.ts** — Cost report groups and group–account mappings; list, create, update, setGroupAccountIds, delete. Used by Cost Report “By groups” and Settings.

---

### 9. Typed expenses (registry and UI)

- **Registry** — `src/lib/budget/transactions/registry.ts`: `getTypedExpenseConfig(type)`, `typedExpenseRegistry`. Each type has: type, label, parse(detailsJson), ReadComponent, EditComponent (optional), save({ expenseId, details, ctx }), editable, derivesAmount (optional). See **docs/typed-expense-registry-and-editor.md** for full registry structure.
- **ExpenseDetailPanel** — `src/features/budget/ExpenseDetailPanel.tsx`. Shared shell: header (amount, date, account, transaction type, vendor, notes), mode read | edit, Edit/View toggle. Resolves config from registry; read path: parse details_json, render ReadComponent or ExpenseParseErrorCard; edit path: render EditComponent with shared ExpenseEditorFooter. For untyped expenses, renders UntypedExpenseEditor when onUpdateExpenseRequest is provided. Save calls config.save (or onUpdateExpenseRequest for untyped); parent invalidates queries and calls onSaved().
- **Type-specific views** — `src/features/budget/typed-expense-views/`: LabourTransactionRead, LabourTransactionEditor; PurchaseTransactionRead, PurchaseTransactionEditor; RentalTransactionRead, RentalTransactionEditor; AllowTransactionRead, AllowTransactionEditor; DepositTransactionRead (no editor). Shared: `expense-shared/` (ExpenseDetailHeader, ExpenseEditorFooter, UntypedExpenseEditor, etc.).
- **Creation flow** — LogSpendPanel opens from “Log Spend” button. User selects account (postable) and transaction type. Panel renders config.EditComponent (when type has one) with expenseId="create", detailsJson from draft, hideFooter, editorRef. On Save click, panel calls editorRef.current.submit(); editor validates and calls onSave(details). Panel’s handleEditorSave calls createMutation.mutate({ productionId, accountId, transactionType, draft: details, date: today }). createTypedExpense runs; on success panel invalidates ['expenses', productionId], ['expense-with-details', data.id], and for allow ['allow-expense-details', productionId]. Save & Add Another: same mutation, onSuccess keeps panel open, clears draft for that type, increments formKey to remount editor. Type-switch: if current type has a form, confirm “Switching type will discard the current form values. Continue?” before changing.

**Amount behaviour:** Labour: amount = rate_per_day × booked_days_count (or 0). Purchase: amount required > 0 from draft. Rental: amount = calculateRentalExpenseAmount(details). Allow: amount = provisional_amount ?? 0. Deposit: 0.

---

### 10. Calculations

All in `src/lib/budget/calculations.ts`:

- `buildAccountTree(accounts)` — Returns AccountTreeNode[] (hierarchy).
- `computeAccountTotals(accounts, items, expenses)` — Map<accountId, AccountTotals> (budgetTotal, actualTotal, variance, percentSpent); rollups from leaves up; actuals from expenses only.
- `uncodedSpendTotal(expenses)`, `uncodedExpensesList(expenses)` — Expenses with account_id IS NULL.
- `legacyBudgetItemsList(items)` — Items with account_id IS NULL.
- `computeFringeTotals`, `computeContingencyTotals` — Per-rule amounts from scopes and totals map.
- `getDescendantLeafIds` / `getDescendantLeafIdsFromNode` — For production totals and cost report group totals (unique leaf set under header/group accounts).

**Reconciliation helpers** (`src/lib/budget/reconciliation.ts`): `sumMatchedAmountForBudgetItem`, `sumAllocatedAmountForExpense`, `getBudgetItemRemainingEstimate`, `getExpenseUnallocatedAmount`, `getBudgetItemMatchStatus`, `getExpenseAllocationStatus`, `getReconciliationSummary`. Used by Actualisation UI and for future completion checks; derived status is not persisted.

---

### 11. Query keys and invalidation

Production-scoped keys:

- `['budget-categories', productionId]`
- `['budget-accounts', productionId]` — Full account list. Invalidate with postable when accounts change.
- `['budgetAccounts', productionId, 'postable']` or similar — Postable accounts (Log Spend, Add line item). Invalidate with budget-accounts when accounts change.
- `['budget-items', productionId]`
- `['expenses', productionId]` — Invalidate on create/update expense, recode, typed save, createTypedExpense.
- `['expense-with-details', expenseId]` — Invalidate on typed save for that expense; invalidate on createTypedExpense for new expense id so detail view is fresh when opened.
- `['allow-expense-details', productionId]` — Invalidate when an allow is created or its details change.
- `['fringe-rules', productionId]`, `['contingency-rules', productionId]` — Invalidate on rule create/update/delete/toggle only.
- `['production-totals', productionId]`
- `['cost-report-groups', productionId]`, `['cost-report-groups-with-accounts', productionId]` — Invalidate when groups or mappings change in Settings.
- `['locations', productionId]` — Invalidate after purchase save when location booked_status is updated.
- `['budget-item-expense-links', productionId]` — All non-deleted links for the production. Invalidate on create/update/delete link (bulk or single).
- `['budget-item-expense-links-for-expense', expenseId]` — Links for one expense. Invalidate when that expense’s links change.
- `['budget-item-expense-links-for-item', budgetItemId]` — Links for one line item. Invalidate when that item’s links change.

After create/update/delete in the Match Spend modal, invalidate the production list plus the relevant for-expense and for-item keys so the reconciliation summary, tables, and linked panels refresh.

---

### 12. Currency and display

- **Production currency:** `currentProduction?.currency_code` (default GBP).
- **useCurrency()** (`@/hooks/useCurrency`): `format(amount, productionCurrency)` returns `{ formatted, currency, converted }`; `conversionBanner`; `ensureRate(productionCurrency)` for loading exchange rate. Display currency and conversion API are set in Settings.

---

### 13. Implementation checklist

When adding or changing budget-related features:

1. **Data** — Use existing repositories and types; add migrations only if schema changes. Types in `src/lib/db/types.ts`.
2. **Queries** — Production-scoped keys; invalidate the same key after mutations. Account changes: invalidate both account list and postable list.
3. **Currency** — Use `useCurrency().format(amount, productionCurrency)` for monetary display.
4. **Production scope** — Guard with “Select a production first” when needed.
5. **Actuals** — Actuals come from **expenses only**. Do not use budget_item.actual_cost for totals. Derived (fringes, contingency) are budget-side overlays only.
6. **Leaf-only posting** — Only postable accounts receive items/expenses; use listPostableAccounts for dropdowns.
7. **Transactions** — Multi-statement writes: runInSerializedTransaction + executeBatch(BEGIN, …, COMMIT). See docs/DATABASE_LAYER.md.

---

## Part III — Reference and evolution

### 14. Cost Report (reference)

- **View state** — BudgetViewMode 'budget' | 'cost_report' in localStorage ('budgetViewMode'). Cost Report tab uses same data as Budget tab plus production totals and cost report groups (for “By groups” layout).
- **Layout mode** — Chart of accounts (default) vs By groups; persisted in localStorage. By groups: one section per group (header + table of accounts in group + ancestors, group total row). Group totals = sum of accountTotals over unique leaf descendants of group accounts.
- **Production totals** — Tables production_totals, production_total_accounts. Only header accounts; each total references one or more header accounts. “Configure production totals” modal: create/edit/delete totals, attach header accounts. Subtotals block shows each total and “Subtotal before derived” (deduped leaf set), then Derived, then Total budget incl. derived and Total actual.
- **Print** — Content wrapped in `.cost-report-print`; `@media print` in index.css hides `.no-print`, forces print-friendly colours.
- **Cost report groups** — Settings: create/edit/delete groups; each group has name, optional code, and account ids (many-to-many). Cost Report “By groups” layout uses listCostReportGroupsWithAccountIds. Invalidate cost-report-groups and cost-report-groups-with-accounts when groups change.

---

### 15. Gaps and future work

- **No edit/delete for budget line items** — updateBudgetItem/deleteBudgetItem exist but the page has no edit/delete UI for line items.
- **No full expense list** — No table of all expenses with filters (type, date); expenses are created via Log Spend and recoded from uncoded section; editing is via Examine Spend.
- **Deposit creation** — Deposit has no creation UI in Log Spend (“Deposit creation is not yet available”); read-only in Expense Detail Panel.
- **Line items in Examine Account** — Line items are view-only in the sheet; editing is from the Budget table or Add line item.
- **Set/change transaction type on existing expense** — No UI to convert an untyped expense to typed (e.g. “Make this a Labour expense”) or to create expense_transaction_details for it.
- **Other** — No phase filtering; no column sorting in account table; export is CSV only; BudgetItem.status not shown/editable; duplicate production behaviour for derived rules may need to be defined.
- **Match Spend** — No audit tables for link changes; no project-completion safeguards; no automatic or fuzzy matching yet.

---

### 16. History / changes

- **Quick-add replaced by Log Spend** — The old “Quick-add spend” dialog created plain expenses (no transaction_type or expense_transaction_details). It has been replaced in the UI by **Log Spend**, which creates typed spend via createTypedExpense (expense row + details row + outbox in one transaction). The legacy QuickExpenseForm still exists in code but is not shown in the header.
- **Typed creation** — createTypedExpense supports labour, purchase, rental, allow, deposit (deposit with amount 0 and empty details; no Deposit editor yet). Purchase requires amount > 0; rental amount is derived; labour amount = rate×days; allow uses provisional_amount.
- **Untyped expense editing** — updateExpense(expenseId, { amount, date, vendor, notes }) and UntypedExpenseEditor allow editing amount, date, vendor, notes for expenses with no transaction_type. onUpdateExpenseRequest is passed from Budget page to ExpenseDetailPanel.
- **Examine Account** — Sheet shows both line items (view-only) and expenses (with Examine spend). Expense Detail Panel uses registry + typed-expense-views (LabourTransactionEditor, etc.) for read/edit; Deposit and untyped have no or limited edit.
- **Registry** — Single source of truth per type (label, parse, ReadComponent, EditComponent, save, editable). See typed-expense-registry-and-editor.md.
- **Actualisation and Match Spend** — The **Match Expenses** tab and Match Spend modal were added to support reconciling expenses to line items via `budget_item_expense_links`. Users can create, edit, and remove links with matched amounts. Derived statuses (unmatched, partial, matched, overspent for line items; unallocated, partial, allocated for expenses) are computed in `src/lib/budget/reconciliation.ts` and not stored.
