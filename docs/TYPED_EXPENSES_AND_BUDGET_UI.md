## Typed Expenses & Budget UI Documentation

### 1) Current data model for typed expenses

#### 1.1 Where type and payload are stored

- **Expense type discriminator**
  - **Table**: `expenses`
  - **Column**: `transaction_type TEXT NULL`
  - **TS type**: `ExpenseTransactionType = 'labour' | 'purchase' | 'rental' | 'allow' | 'deposit'`
  - **Mapped in**: `Expense` in `src/lib/db/types.ts`
  - **Semantics**: `null` for legacy/untyped spend, one of the union strings for typed expenses.

- **Typed payload**
  - **Table**: `expense_transaction_details`
  - **Columns**:
    - `expense_id TEXT UNIQUE REFERENCES expenses(id)`
    - `transaction_type TEXT NOT NULL` (mirrors the discriminator)
    - `details_json TEXT NOT NULL` (type‑specific JSON)
  - **TS type**: `ExpenseTransactionDetails` in `src/lib/db/types.ts`
  - **Accessed via**:
    - `getExpenseWithDetails` / `ExpenseWithDetails` in `src/lib/db/repositories/expenseTransactions.ts`
    - Type‑specific parsers in `src/lib/budget/transactions/*.ts`

#### 1.2 Per‑type schemas

All schemas are Zod objects under `src/lib/budget/transactions`.

- **Labour** (`labour.ts`, `labourDetailsSchema`)
  - `person_id: string | null`
  - `labour_role_label: string` (required)
  - `labour_rate_type: 'prep_day' | 'shoot_day' | 'overtime'`
  - `booked_days_count: number | null`
  - `rate_per_day: number | null`
  - `currency_code: string | null`
  - `start_date: YYYY-MM-DD | null`
  - `end_date: YYYY-MM-DD | null`
  - `unit: string | null`
  - `notes: string | null`
  - Helpers: `parseLabourDetails`, `labourDetailsToJson`.

- **Purchase** (`purchase.ts`, `purchaseDetailsSchema`)
  - `purchase_category: string | null`
  - `is_service_purchase: boolean` (stored as `0|1` in JSON)
  - `service_description: string | null`
  - `location_id: string | null`
  - `purchase_description: string` (required)
  - `vendor_id: string | null`
  - `notes: string | null`
  - Helpers: `parsePurchaseDetails`, `purchaseDetailsToJson`.

- **Rental** (`rental.ts`, `rentalDetailsSchema`)
  - `rental_description: string` (required)
  - `rental_rate_type: 'daily' | 'weekly' | 'flat'`
  - `rental_rate_amount: number | null`
  - `rental_start_date: YYYY-MM-DD | null`
  - `rental_end_date: YYYY-MM-DD | null`
  - `rental_period_override_days: number | null`
  - `equipment_description: string | null`
  - `vendor_id: string | null`
  - `primary_contact_override: string | null`
  - `notes: string | null`
  - Helpers: `parseRentalDetails`, `rentalDetailsToJson`, `computeRentalDays`, `getEffectiveRentalDays`, `calculateRentalExpenseAmount`.

- **Allow** (`allow.ts`, `allowDetailsSchema`)
  - `allow_description: string` (required)
  - `provisional_amount: number | null`
  - `status: 'open' | 'resolved'` (default `open`)
  - `notes: string | null`
  - Helpers: `parseAllowDetails`, `allowDetailsToJson`.

- **Deposit**
  - Present as a variant in `ExpenseTransactionType` only.
  - No dedicated schema or editor; any existing deposit data is treated as opaque JSON in the UI.

#### 1.3 Shared vs type‑specific fields

- **Shared (DB level)**
  - `expenses`: `id`, `production_id`, `account_id`, `amount`, `date`, `vendor_id`, `vendor` (legacy string), `notes`, `expense_type`, timestamps, `transaction_type`.
  - `expense_transaction_details`: `id`, `expense_id`, `transaction_type`, `details_json`, timestamps.

- **Type‑specific (inside `details_json`)**
  - Labour: people, role, rate, currency, dates, unit, notes.
  - Purchase: description, category, service flag/details, vendor, location, notes.
  - Rental: description, rate model, rate, duration, vendor, contact override, notes.
  - Allow: description, provisional amount, status, notes.
  - Deposit: not defined yet.

The effective model is “an `Expense` row plus a type‑specific JSON blob keyed by `transaction_type`.”

---

### 2) Current edit/view flow on the Budget page

#### 2.1 Where “Examine” is rendered

- **File**: `src/features/budget/page.tsx`
- **Component**: `BudgetPage`
- **Triggers**:
  - Per‑expense Eye button on expense rows in the Examine Account view → sets `examinedExpenseId` (aria `Examine spend`).
  - Per‑account Eye button on account rows → sets `examinedAccountId` (aria `Examine account`).

#### 2.2 Where edit mode is entered

- The right‑hand `Sheet` contains:
  - “Examine spend” when `examinedExpenseId` is set.
  - “Examine account” when `examinedAccountId` is set.
- An Edit/View toggle button in the “Examine spend” header:
  - Reads `expense.transaction_type`.
  - Toggles one of `isEditingLabour`, `isEditingPurchase`, `isEditingRental`, `isEditingAllow`.
  - Disables itself and shows a tooltip for unsupported or untyped transactions.

#### 2.3 Responsible components

- `BudgetPage`:
  - Owns the `Sheet`, selection state, and edit flags.
  - Fetches `ExpenseWithDetails` via `getExpenseWithDetails`.
- Inline JSX inside `BudgetPage`:
  - Renders spend summary card.
  - Renders “Typed transaction details” block with per‑type branches.
- Editor components (all in `budget/page.tsx`):
  - `LabourDetailsEditor`
  - `PurchaseDetailsEditor`
  - `RentalDetailsEditor`
  - `AllowDetailsEditor`

#### 2.4 Where editing happens (layout)

- Editing is **inline inside the right‑side drawer (`Sheet`)**.
- The editor replaces the “Typed transaction details” card for the selected type.
- No additional modals or nested sheets are opened for type editing.

#### 2.5 Save/cancel mechanics

- Each editor:
  - Uses `react-hook-form` + `zodResolver`.
  - On submit:
    - Calls a type‑specific `useMutation` in `BudgetPage`.
    - That mutation calls the appropriate repo function.
    - On success:
      - Invalidates `['expense-with-details', examinedExpenseId]` and `['expenses', currentProductionId]`.
      - For purchase, also invalidates `['locations', currentProductionId]`.
      - Resets the relevant `isEditing*` flag to `false`.
  - Cancel button:
    - Calls `onCancel` to flip `isEditing*` back to `false` without persisting changes.
- Closing the sheet:
  - Clears both examined IDs and all `isEditing*` flags.

---

### 3) Save pipeline

#### 3.1 Repo functions involved

- **Common details pipeline** (`expenseTransactions.ts`):
  - `saveExpenseTransactionDetails({ expenseId, transactionType, details })`
    - Used by labour and allow editors.
    - Updates:
      - `expenses.transaction_type`
      - Upserts into `expense_transaction_details` with `details_json = JSON.stringify(details)`.

- **Purchase pipeline** (`purchaseTransactions.ts`):
  - `savePurchaseTransaction({ expenseId, details })`
  - Uses `purchaseDetailsToJson(details)` and also:
    - Updates `expenses.transaction_type = 'purchase'`.
    - Updates `expenses.vendor_id`.
    - Optionally updates `locations.booked_status` if `location_id` is present.

- **Rental pipeline** (`rentalTransactions.ts`):
  - `saveRentalTransaction({ expenseId, details })`
  - Validates rental details and computes:
    - `calculatedExpenseAmount(details)` from rate and duration.
  - Updates:
    - `expenses.transaction_type = 'rental'`.
    - `expenses.vendor_id`.
    - `expenses.amount = calculatedExpenseAmount`.
  - Upserts rental `details_json`.

- **Deposit**:
  - No dedicated pipeline yet; would currently fall back to generic JSON if used.

#### 3.2 `expenses.amount` behavior

- **Labour**:
  - Uses `saveExpenseTransactionDetails` only.
  - Does not change `expenses.amount` or `account_id`.

- **Purchase**:
  - `savePurchaseTransaction` sets type and vendor but does not derive or change `amount`.

- **Rental**:
  - `saveRentalTransaction` **derives and overwrites** `expenses.amount` based on metadata.

- **Allow**:
  - Uses `saveExpenseTransactionDetails`.
  - Does not touch `expenses.amount` or `account_id`; `provisional_amount` remains metadata only.

#### 3.3 Invalidation keys

- After successful save:
  - Always invalidates:
    - `['expense-with-details', examinedExpenseId]`
    - `['expenses', currentProductionId]`
  - Purchase additionally invalidates:
    - `['locations', currentProductionId]` due to booking side effects.

#### 3.4 Vendor linkage

- **Purchase**:
  - `vendor_id` field in purchase details drives:
    - `expenses.vendor_id` update in `savePurchaseTransaction`.

- **Rental**:
  - `vendor_id` in rental details is used for display and contact derivation.
  - `saveRentalTransaction` also ensures `expenses.vendor_id` is set from details.

- **Labour**:
  - No vendor field; tied to `person_id` only.

- **Allow**:
  - No vendor field; no vendor linkage updates performed.

#### 3.5 Transactions and atomicity

- All detail save functions use a transaction pattern:
  - `saveExpenseTransactionDetails`: `BEGIN` → update `expenses` → upsert `expense_transaction_details` → `COMMIT`.
  - `savePurchaseTransaction`: similar, plus `locations` update.
  - `saveRentalTransaction`: similar, with derived `amount`.
- This keeps the `expenses` row and `expense_transaction_details` row in sync for a given edit.

---

### 4) UI differences between types

#### 4.1 Labour

- **Read mode**:
  - Shows person, role, rate type, booked days, rate per day, currency, dates, unit, notes.
  - On parse error, shows muted error and raw JSON.

- **Edit mode**:
  - `LabourDetailsEditor` with fields for person, role, rate type, quantities, currency, dates, unit, notes.
  - Inline in drawer; standard Save/Cancel footer.

#### 4.2 Purchase

- **Read mode**:
  - Shows purchase description, category, service flag + description, location (with booked status), vendor, notes.

- **Edit mode**:
  - `PurchaseDetailsEditor`:
    - Fields: description, category, service purchase toggle + description, vendor (`VendorPicker`), location select, notes.
    - Inline in drawer; Save/Cancel footer.

#### 4.3 Rental

- **Read mode**:
  - Shows description, rate type, rate amount, computed and effective days, calculated total, equipment description, primary contact, notes.

- **Edit mode**:
  - `RentalDetailsEditor`:
    - Fields: description, rate type, rate, dates/override days, equipment, vendor/contact override, notes.
    - Inline in drawer; Save/Cancel footer.
    - Saving recomputes and persists `expenses.amount`.

#### 4.4 Allow

- **Read mode**:
  - Shows allow description, provisional amount (formatted currency or `—`), status (Open/Resolved), notes.
  - On parse error, shows muted error and raw JSON.

- **Edit mode**:
  - `AllowDetailsEditor`:
    - Fields: description (required), provisional amount (optional nonnegative, `''` → `null`), status select, notes.
    - Inline in drawer; Save/Cancel footer.
    - Saving updates `details_json` and `transaction_type` only.

#### 4.5 Deposit

- **Read mode**:
  - Falls back to generic “typed transaction” raw JSON view (no special layout).

- **Edit mode**:
  - No editor; Edit button disabled with explanatory tooltip.

#### 4.6 Inconsistencies and repeated logic

- Only rental recalculates `expenses.amount`; others rely on user‑entered amounts.
- Labour and allow use a generic details saver; purchase and rental have dedicated repos.
- Vendor linkage and location booking are only wired for purchase/rental.
- Each type re‑implements:
  - Its own Zod schema and parser.
  - A similar “show raw JSON on parse error” block.
  - A similar labeled grid layout in read mode.
  - A similar RHF + zod form shell for edit mode.

These are candidates for future shared “typed transaction card/editor” abstractions.

---

### 5) Budget row structure

#### 5.1 Row types on the Budget page

- **Account rows**:
  - Represent `BudgetAccount` nodes.
  - Internal/group accounts aggregate children.
  - Leaf accounts are where line items and expenses ultimately attach.

- **Budget line item rows**:
  - Nested under leaf accounts when expanded.
  - Represent per‑account `BudgetItem` entries.

- **Expense/spend rows**:
  - Not shown directly in the main grid.
  - Listed in the **Examine Account** sheet inside an “Expenses (N)” box, each with an Eye to examine spend.

#### 5.2 Editable vs rollup‑only

- **Editable**:
  - Budget line items (via `BudgetItemForm` dialogs).
  - Typed transaction details for expenses (via Examine Spend editors).

- **Rollup‑only**:
  - Group accounts and leaf account totals (Budget/Actual/Variance/%).
  - These are derived from items and expenses and cannot be edited directly from the grid.

#### 5.3 Representation and natural “edit expense line” location

- Leaf account rows:
  - Control panel includes “Examine account” and “Add line item”.

- Examine Account:
  - Lists expenses for that account, each with an Eye to open Examine Spend.

- Natural place for “edit expense line”:
  - In the **Examine Account** sheet, next to each expense’s Eye button, since that is already the context where expenses are listed for a given account.
  - Alternatively, nested directly under leaf account rows if an inline “Expenses” section is ever added to the main grid.

---

### 6) Existing constraints and patterns

#### 6.1 Constraints affecting a unified editor

- Type handling is currently per‑type:
  - Separate schema modules, editors, and mutations.
  - Rental is the only type that mutates `expenses.amount`.
  - Purchase/rental manage vendor and location side effects; labour/allow do not.
- Budget totals depend only on:
  - `expenses.amount` and `account_id` (via `calculations.ts`).
  - Any change to how `amount` is edited would have direct impact on totals and must be very deliberate.
- Legacy support:
  - `transaction_type` can be `null`.
  - Unified flows must support untyped and partially typed expenses.

#### 6.2 Date picker patterns

- Dates are represented as `YYYY-MM-DD` strings, validated with Zod refinements.
- Editors generally use simple text inputs rather than a shared calendar/date‑picker component.
- Any future date picker should:
  - Still produce valid `YYYY-MM-DD` strings.
  - Integrate cleanly with RHF and existing schemas.

#### 6.3 Vendor picker patterns

- `VendorPicker`:
  - Used in purchase (and indirectly in rental).
  - Controlled via RHF `Controller`, wired with `productionId`, `value`, `onChange`.
- A unified editor should:
  - Use `VendorPicker` for any vendor selection.
  - Ensure changes propagate correctly to `expenses.vendor_id` via appropriate repos.

#### 6.4 Shared form components

- Shared primitives:
  - `Label`, `Input`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `Checkbox`, `Button`, `Tabs`, etc.
  - `Controller`, `useForm`, `zodResolver`.
- Shared patterns:
  - `type FormValues = z.infer<typeof SomeEditSchema>`.
  - `useMemo` to map `details_json` → `defaultValues`.
  - Identical Save/Cancel footers across editors.

These patterns are a good foundation for extracting common “transaction editor shell” components in future refactors while keeping totals logic and DB behavior unchanged.

