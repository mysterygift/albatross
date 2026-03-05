# Budget feature — functionality and implementation guide

This document describes the Budget page and related data layer so it can be used for planning new features and proposing implementation.

---

## 1. Overview

- **Route:** `/budget` (see `src/app/router.tsx`).
- **Entry point:** `src/features/budget/page.tsx` — single file containing `BudgetPage` and the inline forms `BudgetItemForm` and `QuickExpenseForm`.
- **Navigation:** Linked from the app nav as “Budget” (DollarSign icon) in `src/app/navigation.ts`.
- **Context:** Requires a **current production**. If none is selected, the page shows “Select a production first.” All budget data is scoped by `production_id`.

The Budget page provides:

1. **Summary totals** — Total estimated, total actual, and variance (estimated − actual).
2. **Line-item table** — Budget items by category with estimated cost, actual cost (item + expenses for that category), and variance per row.
3. **Add line item** — Create a new budget line item (category, description, estimated/actual cost, vendor).
4. **Quick-add spend** — Record an expense (amount, date, optional category, type, vendor, notes) that rolls into “actual” and can be attributed to a budget category.
5. **Export CSV** — Download a budget report (category, description, estimated, actual, variance) plus a total row.

Currency for the production comes from `Production.currency_code`; display can be converted via Settings (see **Currency** below).

---

## 2. Data model

### 2.1 Entities and tables

| Entity           | Table              | Purpose |
|-----------------|--------------------|--------|
| **BudgetCategory** | `budget_categories` | Budget codes (e.g. ATL, BTL, POST). Created in **Settings**; optionally used when creating items and expenses. |
| **BudgetItem**   | `budget_items`     | Line items: category, description, estimated_cost, actual_cost, vendor, status. |
| **Expense**      | `expenses`         | Individual spends: amount, date, optional category_id, vendor, notes, expense_type. |

All three are soft-deleted (`deleted_at`). Types live in `src/lib/db/types.ts`; repository in `src/lib/db/repositories/budget.ts`.

### 2.2 Type definitions (relevant fields)

**BudgetCategory**

- `id`, `production_id`, `code`, `name`, `phase` (`'pre' | 'production' | 'post'`), `created_at`, `updated_at`, `deleted_at`.

**BudgetItem**

- `id`, `production_id`, `category_id` (FK to budget_categories), `description`, `estimated_cost`, `actual_cost`, `vendor`, `status` (default `'draft'`), timestamps.

**Expense**

- `id`, `production_id`, `category_id` (nullable FK to budget_categories), `amount`, `date`, `vendor`, `notes`, `expense_type` (`'petty_cash' | 'per_diem' | 'other'`), timestamps.

### 2.3 Relationships and totals

- **Actual cost for a line item (display):** `item.actual_cost` + sum of all `expenses` where `expense.category_id === item.category_id`.
- **Total estimated:** Sum of all budget items’ `estimated_cost`.
- **Total actual:** Sum of all budget items’ `actual_cost` + sum of all expenses’ `amount`.
- **Variance:** Total estimated − total actual (negative = over budget).

Expenses without a category are still included in total actual but do not attach to any line in the table.

### 2.4 Default categories

New productions get default categories via `seedDefaultBudgetCategories(productionId)` (called from production creation in `src/lib/db/repositories/production.ts`):

- ATL — Above the line (phase: pre)
- BTL — Below the line (phase: production)
- POST — Post-production (phase: post)
- OTHER — Other (phase: production)

Category **create/update/delete** is only exposed in **Settings** (`src/features/settings/page.tsx`), not on the Budget page. The Budget page only **lists** categories for dropdowns.

---

## 3. Current UI and flows

### 3.1 Page layout

1. **Conversion banner** (optional) — Shown when currency conversion is disabled or fallback; from `useCurrency().conversionBanner`.
2. **Header** — “Budget” title + actions: **Export CSV**, **Quick-add spend**, **Add line item**.
3. **Summary cards** — Three cards: Total estimated, Total actual, Variance (variance styled as destructive when negative).
4. **Table** — Columns: Category (code), Description, Estimated, Actual, Variance. Empty state: “No budget items. Add a category first (Settings or here), then add line items.” (Categories are in fact only addable in Settings.)

### 3.2 Add line item (dialog)

- **Form:** Category (required), Description (required), Estimated cost, Actual cost, Vendor (optional).
- **Validation:** Zod schema `itemSchema` (category_id and description non-empty; costs ≥ 0).
- **Submit:** `createBudgetItem` with `production_id` from context; on success invalidates `['budget-items']` and closes dialog.
- **Create only** — No edit/delete of items on the Budget page.

### 3.3 Quick-add spend (dialog)

- **Form:** Amount, Date (default today), Budget code/category (optional), Type (Other / Petty cash / Per diem), Vendor, Notes.
- **Validation:** Zod schema `expenseSchema` (amount ≥ 0, date required, expense_type enum).
- **Submit:** `createExpense`; on success invalidates `['expenses']` and `['budget-items']` and closes dialog.
- **Create only** — No list or edit/delete of individual expenses on the Budget page.

### 3.4 Export CSV

- **Content:** Header row: Category, Description, Estimated, Actual, Variance. One data row per budget item (category code, description, estimated, actual = item actual + expenses for that category, variance). Final row: empty, “TOTAL”, total estimated, total actual, variance.
- **Delivery:** `saveFileWithDialog` (from `@/lib/files`) with default path `budget-report.csv`, CSV filter, title “Save budget report”.

---

## 4. Data layer (repository)

**File:** `src/lib/db/repositories/budget.ts`

### 4.1 Categories

- `listBudgetCategoriesByProduction(productionId, phase?)` — List categories for production; optional filter by `phase`.
- `createBudgetCategory({ production_id, code, name, phase? })` — Used by Settings and by `seedDefaultBudgetCategories`.
- `updateBudgetCategory(id, { code?, name?, phase? })` — Not used by Budget page; used by Settings if at all.
- `deleteBudgetCategory(id)` — Soft delete; used by Settings.
- `seedDefaultBudgetCategories(productionId)` — Inserts default ATL/BTL/POST/OTHER; called when creating a new production.

### 4.2 Budget items

- `listBudgetItemsByProduction(productionId, categoryId?)` — List items; optional filter by category.
- `createBudgetItem({ production_id, category_id, description, estimated_cost?, actual_cost?, vendor?, status? })` — Used by Budget page.
- `updateBudgetItem(id, { description?, estimated_cost?, actual_cost?, vendor?, status? })` — Exists but **not used** on the Budget page (no edit UI).
- `deleteBudgetItem(id)` — Exists but **not used** on the Budget page.

### 4.3 Expenses

- `listExpensesByProduction(productionId, categoryId?)` — List expenses; optional filter by category.
- `createExpense({ production_id, amount, date, category_id?, vendor?, notes?, expense_type? })` — Used by Budget page quick-add.
- `deleteExpense(id)` — Exists but **not used** on the Budget page (no list/edit/delete UI for expenses).

All mutations that change stored data call `outboxPush` for the relevant table and id.

---

## 5. Currency and display

- **Production currency:** `currentProduction?.currency_code` (default GBP). All stored budget and expense values are in this currency.
- **Display:** `useCurrency()` from `@/hooks/useCurrency` provides:
  - `format(amount, productionCurrency)` — Returns `{ formatted, currency, converted }`; if conversion is enabled and rate available, values are converted to the user’s display currency.
  - `conversionBanner` — Message when conversion is disabled or in fallback.
  - `ensureRate(productionCurrency)` — Used in a Budget page `useEffect` to load exchange rate for the current production currency when conversion is enabled.

Display currency and “enable currency conversion API” are set in **Settings**; the Budget page only consumes them.

---

## 6. Dependencies

- **Productions context:** `useCurrentProduction()` — `currentProductionId`, `currentProduction` (for currency).
- **React Query:** Queries for `budget-categories`, `budget-items`, `expenses`; mutations for create item and create expense with cache invalidation as above.
- **UI:** shadcn-style components (Button, Table, Dialog, Input, Label, Select); TanStack Table for the line-item table (no sorting/filtering wired in the UI; `getFilteredRowModel` is used but no column filters are defined).
- **Forms:** `react-hook-form` + `zod` + `@hookform/resolvers/zod`.
- **File export:** `saveFileWithDialog` from `@/lib/files` (Tauri save dialog).

---

## 7. Gaps and extension points (for planning)

- **No edit/delete for budget items** — Repository has `updateBudgetItem` and `deleteBudgetItem`; the page has no row actions or edit dialog. New feature: row menu or inline edit and delete.
- **No list or management of expenses** — Expenses are created via quick-add only. No table of expenses, no edit/delete, no filter by type/date/category. New feature: Expenses tab or section with list, edit, delete, and optional filters.
- **Categories only in Settings** — Empty state says “Settings or here” but the Budget page does not create categories. Either add “Add category” on Budget or change copy to “Add a category in Settings first.”
- **No phase filtering** — Categories have `phase`; `listBudgetCategoriesByProduction` supports a `phase` argument but the Budget page does not use it. Possible feature: filter view by phase (pre/production/post).
- **No sorting or filtering in table** — TanStack Table is set up but no column sorting or global/category filter. Easy extension: add sorting and optional category/description filter.
- **Export format** — Only CSV; could add PDF or structured (e.g. JSON) for integrations.
- **Status on items** — `BudgetItem.status` exists (default `'draft'`) but is not shown or editable on the page. Could drive workflow (e.g. draft → approved) or filtering.
- **Duplicate production** — `duplicateProduction` copies budget_categories and budget_items (and expenses are production-scoped); behaviour is already consistent for “copy production” use cases.

---

## 8. Implementation checklist for new work

When adding a feature that touches the Budget page or budget data:

1. **Data:** Confirm whether it affects `budget_categories`, `budget_items`, or `expenses`; use existing repository functions or extend `src/lib/db/repositories/budget.ts` and types in `src/lib/db/types.ts`. Add migrations if schema changes.
2. **Queries:** Use React Query keys `['budget-categories', productionId]`, `['budget-items', productionId]`, `['expenses', productionId]` and invalidate them after mutations so the summary and table stay in sync.
3. **Currency:** Use `useCurrency().format(amount, productionCurrency)` for any monetary display so conversion and display currency are consistent.
4. **Production scope:** Always scope by `currentProductionId`; guard with “Select a production first” when needed.
5. **Actual cost logic:** If you add new ways to show or aggregate “actual,” keep the rule: item actual + sum of expenses for that category for the line; total actual = sum item actuals + sum all expenses.

This document should be updated when new budget-related features are added or when the data model or repository API changes.
