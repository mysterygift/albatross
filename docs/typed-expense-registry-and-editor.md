# Typed Expense Registry and Unified Editor Architecture

This document describes the unified typed-expense editing architecture on the Budget page. For data model, save pipelines, and creation flow, see [budget.md](budget.md).

## Overview

- **Registry** (`src/lib/budget/transactions/registry.ts`): Single source of truth per transaction type (label, parser, read component, edit component, save handler, editable flag).
- **ExpenseDetailPanel** (`src/features/budget/ExpenseDetailPanel.tsx`): Shared shell that renders header, resolves type from the registry, and delegates to type-specific read or edit views.
- **Shared subcomponents** (`src/features/budget/expense-shared/`): Reusable header, vendor summary, meta grid, typed section wrapper, parse-error card, editor footer.
- **Type-specific views** (`src/features/budget/typed-expense-views/`): One read and one edit component per type (Labour, Purchase, Rental, Allow, Deposit).

## Registry Structure

Each transaction type is registered with:

- **type**: Discriminator string (`labour` | `purchase` | `rental` | `allow` | `deposit`).
- **label**: Display name (e.g. "Labour", "Purchase").
- **parse(detailsJson)**: Returns `{ ok: true, value }` or `{ ok: false, error }`. Used for read view and to detect parse failures.
- **ReadComponent**: React component for read-only display of parsed details.
- **EditComponent**: Optional; present when the type is editable.
- **save({ expenseId, details, ctx })**: Async function that delegates to the correct repository (e.g. `saveExpenseTransactionDetails`, `savePurchaseTransaction`, `saveRentalTransaction`). Business rules stay in repos.
- **editable**: Whether the Edit button is shown and EditComponent is used.
- **derivesAmount** (optional): True for rental; panel/docs can use this for clarity. Actual amount sync is in the repo.

Use `getTypedExpenseConfig(transaction_type)` to get config or `null` for untyped/unknown types.

## How Each Type Plugs In

- **Labour**: Parser from `labour.ts`; read/edit components in `typed-expense-views`; save calls `saveExpenseTransactionDetails` with type `'labour'`.
- **Purchase**: Parser from `purchase.ts`; save calls `savePurchaseTransaction` (handles vendor and location side effects).
- **Rental**: Parser from `rental.ts`; save calls `saveRentalTransaction` (derives and writes `expenses.amount`).
- **Allow**: Parser from `allow.ts`; save calls `saveExpenseTransactionDetails` with type `'allow'`.
- **Deposit**: Parser from `deposit.ts`; read/edit components in `typed-expense-views`; save calls `saveDepositTransaction` (updates `expenses.amount`, `vendor_id`, `notes`, and details JSON).

## ExpenseDetailPanel Responsibilities

- Receives `ExpenseWithDetails`, loading state, and callbacks (`onClose`, `onSaved`).
- Renders **shared header**: amount, date, transaction type label (from registry), account code/name, vendor summary, expense type, notes (using shared subcomponents).
- Owns **mode** `'read' | 'edit'` and the Edit/View toggle. Toggle is only enabled when the registry config has `editable: true` and an EditComponent.
- Looks up **config** via `getTypedExpenseConfig(expense.transaction_type)`.
- **Read path**: If no `transaction_details`, show "This spend does not yet use a typed transaction format." If details exist, run config.parse; on failure show `ExpenseParseErrorCard` (consistent message + raw JSON); on success render config.ReadComponent with parsed value and shared context (format, vendor, etc.).
- **Edit path**: Renders config.EditComponent inside the typed section with shared `ExpenseEditorFooter`. On submit, calls config.save; on success calls `onSaved()` (parent invalidates queries and can close edit mode).
- Loading and save error UI are handled in one place.

## Save Handlers and Invalidation

- Save handlers in the registry are thin: they call the existing repo functions. Invalidation is **not** inside the registry; the parent (BudgetPage) passes `onSaved` and performs `queryClient.invalidateQueries` for `['expense-with-details', id]`, `['expenses', productionId]`, and for purchase also `['locations', productionId]`.
- Save context passed to each save handler can include `productionId` (and any other needed IDs) so repos remain stateless and correct.

## Parse Failure Handling

- If `transaction_details` exists but `config.parse(details_json)` returns `ok: false`, the panel always renders `ExpenseParseErrorCard` with the same styling and the raw `details_json`, and does not render the type ReadComponent. This is consistent across all types.

## Non-editable and Untyped Cases

- **Untyped** (`transaction_type == null`): `getTypedExpenseConfig` returns null. Panel shows shared header and the "does not yet use a typed transaction format" message; Edit button is disabled with tooltip.
- **Non-editable types** (if any type has `editable: false`): Read view is shown; Edit button is disabled with tooltip "Editing is not yet available for this transaction type."

## Row-Level Editing Boundaries

- Only **typed expense lines** (opened via Examine Account → expense row → Expense details sheet) and **budget line items** (existing dialogs) are editable.
- Header/rollup accounts, calculated totals, production totals, and derived totals are never editable; no new edit affordances are added to them.
