# Budget expense editing – summary of recent fixes and remaining gaps

This document summarises the work done to address issues with budget line items, the Examine Account sheet, and editing expenses on the Budget page. It is intended to support team strategy and follow-up fixes rather than to prescribe implementation.

---

## 1. Original issues

1. **Demo budget line items not visible in Examine Account**  
   When opening “Examine account” for a leaf account (e.g. 1101), the sheet showed only **Expenses**. Demo-seeded **budget line items** did not appear, so it looked empty for accounts that had line items but no expenses.

2. **Untyped expenses not editable**  
   For expenses with no `transaction_type` (e.g. demo “Writer – first payment” on 1102), the Expense Detail Panel showed “This spend does not yet use a typed transaction format” and **no Edit button**. Users could not change amount, date, vendor, or notes.

3. **Desire to show both line items and expenses in Examine Account**  
   The goal was for the Examine Account sheet to list both budget line items and expenses for that account, so users could see and access both.

---

## 2. What was implemented

### 2.1 Examine Account sheet – Line items section

- **Where:** `src/features/budget/page.tsx` (Examine Account branch of the right-hand sheet).
- **Change:** A **“Line items (N)”** section was added **above** the existing “Expenses (N)” section.
- **Behaviour:**  
  - `lineItemsForAccount = items.filter((i) => i.account_id === examinedAccountId)` so the sheet uses the same budget items as the expanded Budget table.  
  - Each line item is shown with description, optional vendor, and estimated cost.  
  - No edit/examine actions were added for line items in this sheet; they remain view-only there.
- **Result:** Accounts like 1101 now show their demo line items in the sheet. Expenses still appear below (or “No expenses posted…” when there are none).

### 2.2 Editing untyped expenses (amount, date, vendor, notes)

- **Repository:** `src/lib/db/repositories/budget.ts`  
  - New **`updateExpense(expenseId, { amount?, date?, vendor?, notes? })`**.  
  - Updates only those fields on the `expenses` row. Does not touch `account_id`, `transaction_type`, or `expense_transaction_details`.

- **UI:**  
  - **`UntypedExpenseEditor`** in `src/features/budget/expense-shared/UntypedExpenseEditor.tsx`: form with Amount, Date, Vendor (optional), Notes (optional), Save/Cancel.  
  - **ExpenseDetailPanel** (`src/features/budget/ExpenseDetailPanel.tsx`):  
    - New optional prop **`onUpdateExpenseRequest`** with signature  
      `(data: { expenseId, amount, date, vendor, notes }) => Promise<void>`.  
    - **Edit** is now shown for **untyped** expenses when `onUpdateExpenseRequest` is provided (in addition to typed expenses that have a registry config with `editable: true`).  
    - In edit mode, if the expense has no typed config, the panel renders `UntypedExpenseEditor`; on Save it calls `onUpdateExpenseRequest` then `onSaved()` (so cache invalidation runs as for typed saves).

- **Budget page:**  
  - Imports `updateExpense`, defines `handleUpdateExpenseRequest` that calls `updateExpense` with the payload, and passes **`onUpdateExpenseRequest={handleUpdateExpenseRequest}`** into `ExpenseDetailPanel`.

- **Result:** Users can open an untyped expense (e.g. “Writer – first payment”), click Edit, change amount/date/vendor/notes, Save; values persist and the panel returns to read mode. **Transaction type cannot be set or changed in this editor** (see gaps below).

### 2.3 Debug / temporary code

- A temporary `useEffect` that logged budget line items vs accounts (for the “demo line items not appearing” investigation) was **removed** from `page.tsx`.

---

## 3. What was not changed

- **Quick-add spend:** No changes were made to the Quick-add expense flow. It still creates expenses with the same shape as before (e.g. `account_id`, amount, date, vendor, notes). It does **not** set `transaction_type` or create `expense_transaction_details` rows.
- **Typed expense registry / Expense Detail Panel for typed expenses:** Behaviour for labour, purchase, rental, allow (and read-only deposit) is unchanged. Editing typed expenses still goes through the registry’s EditComponent and save handlers.
- **Budget calculations, totals, rollups, Cost Report:** No changes.
- **Line item editing:** No new way to edit **budget line items** from the Examine Account sheet; only the list was added. Line items are still edited from the Budget table (expand account, inline add/edit) or Add line item dialog.

---

## 4. Remaining gaps (for team to address)

1. **No way to set or change transaction type on an expense**  
   - The untyped expense editor only updates amount, date, vendor, notes.  
   - There is no UI to:  
     - Set `transaction_type` on an existing expense (e.g. “Make this a Labour expense”), or  
     - Create `expense_transaction_details` and link them to the expense.  
   - Strategy options might include: a “Set type” / “Convert to typed” action in the Expense Detail Panel (e.g. choose Labour/Purchase/Rental/Allow and then open the corresponding typed editor), or extending the untyped editor to allow choosing a type and then saving via the registry’s save handler for that type.

2. **Quick-add expense “no longer fit for purpose” for typed expenses**  
   - Users cannot create an expense **with** a type (labour, purchase, rental, allow) from Quick-add.  
   - Quick-add only creates a “plain” expense row; making it typed would require either:  
     - Extending Quick-add to optionally choose a transaction type and show a type-specific form (or a short form that then opens the typed editor in the sheet), or  
     - A separate “Add typed spend” flow that creates the expense and the corresponding `expense_transaction_details` in one go, or  
     - Keeping Quick-add for quick untyped entry and adding a separate entry point for “Add labour/purchase/rental/allow expense” that goes straight to the typed editor.

3. **Examine Account – line items are view-only**  
   - Line items in the Examine Account sheet are not examinable or editable from that sheet. Editing still happens in the Budget table. If the product goal is to “examine/edit everything from the sheet”, the team may want an action on each line item (e.g. open a line-item edit context or reuse the existing inline/add flow).

---

## 5. Files touched (reference)

| Area | Files |
|------|--------|
| Examine Account sheet (line items + expenses) | `src/features/budget/page.tsx` |
| Update expense row | `src/lib/db/repositories/budget.ts` (`updateExpense`) |
| Untyped editor component | `src/features/budget/expense-shared/UntypedExpenseEditor.tsx`, `expense-shared/index.ts` |
| Expense Detail Panel (Edit for untyped, `onUpdateExpenseRequest`) | `src/features/budget/ExpenseDetailPanel.tsx` |
| Budget page (wire `updateExpense`, pass `onUpdateExpenseRequest`) | `src/features/budget/page.tsx` |

---

## 6. Suggested next steps for strategy

- Decide how new expenses should get a type: extend Quick-add, add “Add typed spend”, or “create untyped then convert in panel”.
- Decide how existing untyped expenses should get a type: “Set type” / “Convert to typed” in the Expense Detail Panel (then save via registry) vs. other flows.
- Align with existing docs: `docs/TYPED_EXPENSES_AND_BUDGET_UI.md`, `docs/typed-expense-registry-and-editor.md`, and any data-model docs for `expenses` and `expense_transaction_details`.
