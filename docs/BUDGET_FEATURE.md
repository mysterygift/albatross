# Budget feature — functionality and implementation guide

This document describes the Budget page and related data layer so it can be used for planning new features and proposing implementation.

---

## 1. Overview

- **Route:** `/budget` (see `src/app/router.tsx`).
- **Entry point:** `src/features/budget/page.tsx` — single file containing `BudgetPage`, inline forms (`BudgetItemForm`, `QuickExpenseForm`, `DerivedRuleForm`), and `ManageDerivedCostsDialog`.
- **Navigation:** Linked from the app nav as “Budget” (DollarSign icon) in `src/app/navigation.ts`.
- **Context:** Requires a **current production**. If none is selected, the page shows “Select a production first.” All budget data is scoped by `production_id`.

The Budget page provides:

1. **Chart of Accounts** — Hierarchical account tree (from `budget_accounts`). **Leaf-only posting:** only postable (leaf) accounts receive budget items and expenses; header accounts show rollup totals only.
2. **Summary totals** — Total estimated, total actual, and variance (estimated − actual). Optional **derived** section: Fringes (derived), Contingency (derived), and Estimated + derived (budget-side overlays only; not included in Total actual).
3. **Hierarchical table** — Accounts with expand/collapse; per-account Budget, Actual (expense-based), Variance, % Spent; line items under leaf accounts; inline “Add line item” per leaf.
4. **Add line item** — Create a budget line item with **account** (required, postable only), description, estimated/actual cost, vendor. Also **inline add** from a leaf account row.
5. **Quick-add spend** — Record an expense with **account** (required, postable), amount, date, type, vendor, notes; rolls into actuals for that account.
6. **Uncoded spend** — Expandable section for expenses with `account_id IS NULL`; **recode** assigns an account so the expense contributes to that account’s actual.
7. **Legacy uncoded budget items** — Read-only section for items with `account_id IS NULL` (excluded from rollups and derived bases until recoded/backfilled).
8. **Manage derived costs** — Dialog with Fringes and Contingency tabs: configurable percentage rules scoped to account subtrees; derived amounts are computed from account totals and shown as budget overlays.
9. **Export CSV** — Line-item report plus total row; when derived totals exist, adds FRINGES (derived), CONTINGENCY (derived), and TOTAL + DERIVED. Total actual remains sum(expenses) only.

Currency for the production comes from `Production.currency_code`; display can be converted via Settings (see **Currency** below).

---

## 2. Data model

### 2.1 Entities and tables

| Entity              | Table                    | Purpose |
|---------------------|--------------------------|--------|
| **BudgetCategory**  | `budget_categories`       | **Legacy-only.** Budget codes (e.g. ATL, BTL, POST). Not part of the primary budgeting flow; retained for older projects, legacy item display, and backfill. Read-only in Settings (no add/edit/delete). New items and expenses always set `category_id` to NULL. |
| **BudgetAccount**   | `budget_accounts`        | Chart of accounts: code, name, parent_account_id, sort_order, is_postable. Hierarchical; only postable (leaf) accounts receive items/expenses. |
| **BudgetItem**      | `budget_items`           | Line items: account_id (nullable for legacy), category_id (nullable), description, estimated_cost, actual_cost, vendor, status. |
| **Expense**         | `expenses`               | Individual spends: account_id (nullable for uncoded), category_id (nullable), amount, date, vendor, notes, expense_type. |
| **FringeRule**      | `fringe_rules`           | Derived layer: name, rate (decimal), base_kind, scope_mode, is_enabled. Soft-deleted. |
| **FringeRuleScope** | `fringe_rule_scopes`     | Rule → account_id (scope roots); include_children. Defines which account subtrees form the base. |
| **ContingencyRule** | `contingency_rules`     | Same shape as FringeRule; derived contingency percentage. |
| **ContingencyRuleScope** | `contingency_rule_scopes` | Same as FringeRuleScope for contingency rules. |

Categories, accounts, items, expenses, and rule tables are soft-deleted where applicable (`deleted_at`). Types live in `src/lib/db/types.ts`. Repositories: `src/lib/db/repositories/budget.ts`, `src/lib/db/repositories/budgetAccounts.ts`, `src/lib/db/repositories/budgetDerived.ts`.

### 2.2 Type definitions (relevant fields)

**BudgetCategory**

- `id`, `production_id`, `code`, `name`, `phase` (`'pre' | 'production' | 'post'`), `created_at`, `updated_at`, `deleted_at`.

**BudgetAccount**

- `id`, `production_id`, `code`, `name`, `parent_account_id` (nullable), `sort_order`, `is_postable`, `archived_at` (nullable), timestamps. Leaf accounts have `is_postable === true` and may have budget items and expenses; non-postable accounts are headers for rollup only. Archived accounts remain in `listAccounts()` for correct rollups but are excluded from `listPostableAccounts()` so no new posting.

**BudgetItem**

- `id`, `production_id`, `category_id` (nullable; legacy), `account_id` (nullable; chart of accounts; required for new items), `description`, `estimated_cost`, `actual_cost` (deprecated for actuals; treated as committed), `vendor`, `status` (default `'draft'`), timestamps.

**Expense**

- `id`, `production_id`, `category_id` (nullable; legacy), `account_id` (nullable; chart of accounts; uncoded when NULL), `amount`, `date`, `vendor`, `notes`, `expense_type` (`'petty_cash' | 'per_diem' | 'other'`), timestamps.

**FringeRule / ContingencyRule**

- `id`, `production_id`, `name`, `rate` (decimal, e.g. 0.18 = 18%), `base_kind` (`'budget' | 'actual'`), `scope_mode`, `is_enabled`, timestamps, `deleted_at`. Scopes link rules to account ids (subtrees) via join tables.

### 2.3 Relationships and totals

**Actuals are derived from expenses only.** The field `budget_item.actual_cost` is deprecated for actual calculations and must not be used for Total Actual or per-row Actual; it may be repurposed as “committed” in future.

- **Per-account rollups:** For each account, direct budget = sum of `budget_items.estimated_cost` where `account_id === account.id`; direct actual = sum of `expenses.amount` where `account_id === account.id`. Header accounts roll up children (post-order); see `computeAccountTotals` in `src/lib/budget/calculations.ts`. Legacy items (`account_id IS NULL`) are **not** included in any account’s direct or rollup totals.
- **Per-row actual (display):** If `item.account_id` is set: sum of `expenses.amount` where `expense.account_id === item.account_id`. Else (legacy): sum of `expenses.amount` where `expense.category_id === item.category_id`.
- **Total estimated:** Sum of all budget items’ `estimated_cost`.
- **Total actual:** Sum of all expenses’ `amount` (do not add `budget_item.actual_cost`).
- **Variance:** Total estimated − total actual (negative = over budget). Per-account variance and **% Spent** (actual / budget when budget > 0) are shown in the table.
- **Uncoded spend:** Sum of `expenses.amount` where `expense.account_id IS NULL`; displayed in an expandable section with recode-to-account.

### 2.4 Legacy budget items and computed bases

**Legacy budget items** are rows in `budget_items` where `account_id IS NULL` (and typically `category_id` is set). They are displayed in a read-only “Legacy uncoded budget items” section on the Budget page.

**Rule for Stage 5 and beyond:** Legacy items are **not** included in account rollup totals or in any “budget base” used for derived calculations (e.g. fringes, contingency) until they are recoded (assigned an account) or backfilled via `backfillAccountIdsFromLegacyCategories`. If future features need legacy items to participate in such bases, the options are: (1) require recode/backfill first, or (2) include them via a synthetic “Legacy budget” pseudo-account or extended backfill. Document the chosen rule in the feature that consumes the base.

### 2.5 Budget categories (legacy-only)

**Budget categories are frozen from the primary flow.** They exist in the DB and are used only for legacy item display and backfill. New budget items and new expenses are created with `category_id: null` and `account_id` set (chart of accounts).

New productions get default categories via `seedDefaultBudgetCategories(productionId)` (called from production creation in `src/lib/db/repositories/production.ts`): ATL, BTL, POST, OTHER. **Settings** shows a read-only “Legacy categories (read-only)” panel (no add/edit/delete). The Budget page lists categories only for labelling legacy items (`account_id IS NULL`).

### 2.6 Chart of accounts

- **Table:** `budget_accounts` (migration 0013). Repository: `src/lib/db/repositories/budgetAccounts.ts`.
- **Hierarchy:** `parent_account_id`; roots have `parent_account_id IS NULL`. Tree built by `buildAccountTree(accounts)` in `src/lib/budget/calculations.ts`.
- **Leaf-only posting:** Only accounts with `is_postable === true` may have budget items or expenses. Header accounts display rollup totals only. Dropdowns for “Add line item” and “Quick-add spend” use `listPostableAccounts(productionId)`.
- **Default accounts:** New productions get a default chart via `seedDefaultBudgetAccounts(productionId)` in production create (see `budgetAccounts.ts`).

### 2.7 Derived rules (fringes, contingency)

- **Tables:** `fringe_rules`, `fringe_rule_scopes`, `contingency_rules`, `contingency_rule_scopes` (migration 0015). Repository: `src/lib/db/repositories/budgetDerived.ts`.
- **Rules:** Name, rate (decimal 0–1), base_kind (`budget` or `actual`), scope_mode (`include_subtrees`), is_enabled. Scopes define which account ids (and their subtrees) form the base. Only enabled, non-deleted rules are applied.
- **Calculation:** `computeFringeTotals` / `computeContingencyTotals` in `src/lib/budget/calculations.ts` expand scopes to account sets, sum base totals from `computeAccountTotals`, and multiply by rate. Derived amounts are **display-only** (no writes to budget_items). Legacy items are excluded from rollups and thus from any derived base.
- **Optional seed:** On new production create, one default Contingency rule (10%, scoped to all root accounts) may be seeded; see `production.ts`.

### 2.8 Cost report groups (presentation/reporting only)

- **Tables:** `cost_report_groups`, `cost_report_group_accounts` (migration 0016). Repository: `src/lib/db/repositories/costReportGroups.ts`.
- **Purpose:** Presentation and reporting only. Groups organise accounts (e.g. “Above the line”, “Below the line”) for reports and exports. They **do not** affect posting rules, totals, or derived calculations.
- **Many-to-many:** An account can belong to multiple groups. Header or leaf accounts may be mapped. Managed in **Settings** (Cost report groups card); not used on the Budget page for calculations.

---

## 3. Current UI and flows

### 3.1 Page layout

1. **Conversion banner** (optional) — Shown when currency conversion is disabled or fallback; from `useCurrency().conversionBanner`.
2. **Header** — “Budget” title + actions: **Manage derived costs**, **Export CSV**, **Quick-add spend**, **Add line item**.
3. **Summary cards** — Three cards: Total estimated, Total actual (expenses only), Variance. When uncoded spend > 0, “Uncoded spend: £X” under Total actual.
4. **Derived section** (when fringes or contingency total > 0) — “Derived (budget overlays)”: Fringes (derived), Contingency (derived), Estimated + derived. Derived amounts are not included in Total actual.
5. **Hierarchical table** — Columns: Code, Account / Description, Budget, Actual, Variance, % Spent, Actions. Rows are account nodes (expand/collapse); leaf rows show an “Add line item” button. Expanding a leaf shows its line items. Header rows show rollup totals.
6. **Uncoded spend** — Expandable row when uncoded total > 0; expanding lists expenses without account with a **Recode** dropdown to assign an account.
7. **Legacy uncoded budget items** — Section listing items with `account_id IS NULL` (read-only).
8. **Empty state** — “No accounts yet. Add a line item or quick-add spend to get started.” when tree is empty and no uncoded/legacy.

### 3.2 Add line item (dialog and inline)

- **Form:** Account (required; postable accounts only), Description (required), Estimated cost, Actual cost, Vendor (optional). Inline form omits account (uses current leaf).
- **Validation:** Zod schema `itemSchema` / `inlineItemSchema` (account_id and description non-empty; costs ≥ 0).
- **Submit:** `createBudgetItem` with `production_id`, `account_id`, `category_id: null`; on success invalidates `['budget-items']` and closes dialog or clears inline target.
- **Create only** — No edit/delete of items on the Budget page.

### 3.3 Quick-add spend (dialog)

- **Form:** Account (required; postable), Amount, Date (default today), Type (Other / Petty cash / Per diem), Vendor, Notes.
- **Validation:** Zod schema `expenseSchema` (account_id, amount ≥ 0, date required, expense_type enum).
- **Submit:** `createExpense` with `account_id`; on success invalidates `['expenses']` and `['budget-items']` and closes dialog.
- **Recode:** Uncoded expenses can be assigned an account via `updateExpenseAccount(expenseId, newAccountId)`; invalidates `['expenses']`.

### 3.4 Manage derived costs (dialog)

- **Trigger:** “Manage derived costs” button in header.
- **Tabs:** Fringes, Contingency. Each tab: list of rules (name, rate %, enabled checkbox), Edit/Delete, “Add rule”.
- **Rule form:** Name, Rate (%) — stored as decimal 0–1, Scope accounts (multi-select; “Selecting a header account includes all child accounts”). Validation: at least one scope, rate > 0 (max 100% in repo).
- **Persistence:** `createFringeRule` / `updateFringeRule` / `deleteFringeRule` (soft) / `setFringeRuleEnabled`; same for contingency. On success invalidate `['fringe-rules', productionId]` or `['contingency-rules', productionId]` only (not budget-items/expenses).

### 3.5 Export CSV

- **Content:** Header row: Account / Category, Description, Estimated, Actual, Variance. One data row per budget item (account or category label, description, estimated, actual = expense-based for that account/category, variance). Row: “TOTAL”, total estimated, total actual, variance. **When derived totals exist:** extra rows “FRINGES (derived)”, “CONTINGENCY (derived)”, “TOTAL + DERIVED” (estimated + derived, total actual, variance). Total actual remains sum(expenses) only; derived are budget-side overlays.
- **Delivery:** `saveFileWithDialog` (from `@/lib/files`) with default path `budget-report.csv`, CSV filter, title “Save budget report”.

---

## 4. Data layer (repository and calculations)

### 4.1 Budget repository — `src/lib/db/repositories/budget.ts`

**Categories**

- `listBudgetCategoriesByProduction(productionId, phase?)` — List categories; optional filter by `phase`.
- `createBudgetCategory`, `updateBudgetCategory`, `deleteBudgetCategory` — Used by Settings and seed.
- `seedDefaultBudgetCategories(productionId)` — Inserts default ATL/BTL/POST/OTHER; called when creating a new production.

**Budget items**

- `listBudgetItemsByProduction(productionId, categoryId?)` — List items; optional filter by category.
- `createBudgetItem({ production_id, account_id, category_id?, description, estimated_cost?, actual_cost?, vendor?, status? })` — Used by Budget page (account_id required for new items; category_id null).
- `updateBudgetItem`, `deleteBudgetItem` — Exist but not used on the Budget page (no edit/delete UI).
- `backfillAccountIdsFromLegacyCategories(productionId)` — Sets `account_id` on items/expenses where `account_id IS NULL` and category matches legacy fallback accounts. Budget page runs once per session per production (guarded effect).

**Expenses**

- `listExpensesByProduction(productionId, categoryId?)` — List expenses.
- `createExpense({ production_id, account_id, category_id?, amount, date, vendor?, notes?, expense_type? })` — Used by quick-add (account_id required).
- `updateExpenseAccount(expenseId, newAccountId)` — Used for recoding uncoded spend.
- `deleteExpense(id)` — Exists but not used on the Budget page.

**Legacy backfill**

- **`ensureLegacyFallbackAccounts(productionId)`** (in `budgetAccounts.ts`) — Idempotent. Ensures four leaf accounts (1001, 2001, 9001, 9701) for ATL/BTL/POST/OTHER legacy mapping. Returns their ids.
- **`backfillAccountIdsFromLegacyCategories`** — In a transaction, sets `account_id` on items/expenses where NULL and category matches; never overwrites existing `account_id`. Does not push outbox. Other mutations call `outboxPush` for the relevant table and id.

### 4.2 Budget accounts — `src/lib/db/repositories/budgetAccounts.ts`

- `listAccounts(productionId)` — All non-deleted accounts (includes archived); used for tree and rollups. Order: sort_order, code.
- `listPostableAccounts(productionId)` — Non-archived, postable (leaf) accounts only; used for Add line item and Quick-add spend dropdowns.
- `getAccountById(id)` — Single account (includes archived).
- `createAccount({ production_id, code, name, parent_account_id?, sort_order?, is_postable? })` — Code unique per production; parent must exist and be non-postable.
- `updateAccountName(accountId, name)`, `updateAccountSortOrder(accountId, sort_order)` — Safe updates.
- `archiveAccount(accountId)` — Sets `archived_at`; disallowed if account has children or is in derived rule scopes.
- `unarchiveAccount(accountId)` — Clears `archived_at`.
- `hardDeleteAccount(accountId)` — Soft-delete only when no children, no budget_items/expenses, not in rule scopes or cost report groups.
- `seedDefaultBudgetAccounts(productionId)` — Default chart of accounts; called when creating a new production.

### 4.3 Derived rules — `src/lib/db/repositories/budgetDerived.ts`

- **Fringes:** `listFringeRules(productionId)` (returns rules with `scope_account_ids`), `createFringeRule`, `updateFringeRule`, `deleteFringeRule` (soft), `setFringeRuleEnabled`.
- **Contingency:** `listContingencyRules(productionId)`, `createContingencyRule`, `updateContingencyRule`, `deleteContingencyRule` (soft), `setContingencyRuleEnabled`.
- Create/update use `runInSerializedTransaction` when rule + scopes change. Rate validated 0 < rate ≤ 1. At least one scope required. Outbox pushed for rule and scope tables.

### 4.4 Calculations — `src/lib/budget/calculations.ts`

- `buildAccountTree(accounts)` — Returns `AccountTreeNode[]` (roots have `parent_account_id === null`).
- `computeAccountTotals(accounts, items, expenses)` — Returns `Map<accountId, AccountTotals>` (budgetTotal, actualTotal, variance, percentSpent); rollups from leaves up; actuals from expenses only; legacy items excluded from account totals.
- `uncodedSpendTotal(expenses)`, `uncodedExpensesList(expenses)` — Expenses with `account_id IS NULL`.
- `legacyBudgetItemsList(items)` — Items with `account_id IS NULL`.
- `resolveScopeAccountIds(ruleScopes, accountTree)` — Expands scope roots to full subtree; returns deduplicated `Set<string>` (overlapping scopes not double-counted).
- `computeRuleBaseTotal(scopeAccountIds, totalsMap, baseKind)` — Sums budget or actual from totals map for scope ids; missing accounts treated as zero.
- `computeFringeTotals(fringeRules, totalsMap, tree)`, `computeContingencyTotals(contingencyRules, totalsMap, tree)` — Per-rule amount and total; only enabled rules.

---

## 5. Query keys (production-scoped)

- `['budget-categories', productionId]` — Categories (Settings and legacy display).
- `['budget-accounts', productionId]` — Full account list (tree).
- `['budgetAccounts', productionId, 'postable']` — Postable accounts only (dropdowns). When accounts change, invalidate **both** account keys.
- `['budget-items', productionId]` — Budget items.
- `['expenses', productionId]` — Expenses.
- `['fringe-rules', productionId]` — Fringe rules with scopes; invalidate on rule create/update/delete/toggle only (not budget-items/expenses).
- `['contingency-rules', productionId]` — Contingency rules with scopes; same invalidation as fringe-rules.

---

## 6. Currency and display

- **Production currency:** `currentProduction?.currency_code` (default GBP). All stored budget and expense values are in this currency.
- **Display:** `useCurrency()` from `@/hooks/useCurrency` provides:
  - `format(amount, productionCurrency)` — Returns `{ formatted, currency, converted }`; if conversion is enabled and rate available, values are converted to the user’s display currency.
  - `conversionBanner` — Message when conversion is disabled or in fallback.
  - `ensureRate(productionCurrency)` — Used in a Budget page `useEffect` to load exchange rate for the current production currency when conversion is enabled.

Display currency and “enable currency conversion API” are set in **Settings**; the Budget page only consumes them.

---

## 7. Dependencies

- **Productions context:** `useCurrentProduction()` — `currentProductionId`, `currentProduction` (for currency).
- **React Query:** Queries for `budget-categories`, `budget-accounts`, `budgetAccounts` (postable), `budget-items`, `expenses`, `fringe-rules`, `contingency-rules`; mutations with cache invalidation as in §5.
- **UI:** shadcn-style components (Button, Table, Dialog, Input, Label, Select, Tabs, Checkbox); hierarchical table with expand/collapse (no TanStack Table for tree).
- **Forms:** `react-hook-form` + `zod` + `@hookform/resolvers/zod`.
- **File export:** `saveFileWithDialog` from `@/lib/files` (Tauri save dialog).

---

## 8. Gaps and extension points (for planning)

- **No edit/delete for budget items** — Repository has `updateBudgetItem` and `deleteBudgetItem`; the page has no row actions or edit dialog. New feature: row menu or inline edit and delete.
- **No list or management of expenses** — Expenses are created via quick-add and recoded from uncoded section; no full table of expenses, no edit/delete, no filter by type/date. New feature: Expenses tab or section with list, edit, delete, filters.
- **Categories only in Settings** — Budget categories are managed in Settings; the Budget page uses the chart of accounts (postable accounts) for line items and spend. Legacy items still show category codes.
- **No phase filtering** — Categories have `phase`; the Budget page does not filter by phase. Possible feature: filter view by phase (pre/production/post).
- **No column sorting in account table** — Tree is expand/collapse only. Extension: sort leaf rows by budget/actual/variance or code.
- **Export format** — Only CSV; could add PDF or structured (e.g. JSON) for integrations.
- **Status on items** — `BudgetItem.status` exists (default `'draft'`) but is not shown or editable. Could drive workflow or filtering.
- **Duplicate production** — `duplicateProduction` copies budget_categories and budget_items (and expenses are production-scoped); chart of accounts and derived rules are seeded or recreated per production create; duplication behaviour for derived rules may need to be added if “copy production” should include fringes/contingency.

---

## 9. Implementation checklist for new work

When adding a feature that touches the Budget page or budget data:

1. **Data:** Confirm whether it affects `budget_categories`, `budget_accounts`, `budget_items`, `expenses`, or derived rule tables. Use existing repositories (`budget.ts`, `budgetAccounts.ts`, `budgetDerived.ts`) or extend them; types in `src/lib/db/types.ts`. Add migrations if schema changes.
2. **Queries:** All budget data is production-scoped. Use keys from §5 and invalidate the **same scoped key** after mutations. For account changes invalidate both `['budget-accounts', productionId]` and `['budgetAccounts', productionId, 'postable']`. For derived rule changes invalidate only `['fringe-rules', productionId]` and/or `['contingency-rules', productionId]` (do not invalidate budget-items/expenses).
3. **Currency:** Use `useCurrency().format(amount, productionCurrency)` for any monetary display.
4. **Production scope:** Always scope by `currentProductionId`; guard with “Select a production first” when needed.
5. **Actuals source:** Actuals are derived from **expenses only**. Do not use `budget_item.actual_cost` for Total Actual or per-row Actual. Per-account actual = sum of expenses for that account; total actual = sum of all expenses’ `amount`. Derived totals (fringes, contingency) are budget-side overlays and must not be included in Total actual.
6. **Leaf-only posting:** Only postable accounts may receive budget items or expenses; use `listPostableAccounts` for dropdowns. Legacy items (`account_id IS NULL`) are excluded from rollups and derived bases until recoded or backfilled.

This document should be updated when new budget-related features are added or when the data model or repository API changes.
