# Cost Report — design and implementation

This document describes the Cost Report functionality: the **Cost Report view** on the Budget page and **Cost report groups** (configuration in Settings). Cost report groups are for organising accounts for reporting; they do not currently drive the layout of the Cost Report tab but are part of the same reporting story.

---

## 1. Overview

Cost Report functionality has two parts:

1. **Cost Report view** — A second tab on the Budget page (`/budget`) that shows the same budget data (chart of accounts, totals, line items) in a print-oriented layout with a Print button. It uses the same account tree and calculations as the Budget tab; no separate data model.
2. **Cost report groups** — Configurable groups of accounts (e.g. “Above the line”, “Below the line”) managed in **Settings**. They are for presentation and reporting only: they do not affect posting, totals, or derived calculations. An account can belong to multiple groups. The **Budget Cost Report tab does not currently use these groups** to structure the view; they are available for future group-based reports or exports.

---

## 2. Cost Report view (Budget page)

### 2.1 Entry and state

- **Location:** `src/features/budget/page.tsx`. The Budget page has two tabs: **Budget** and **Cost Report** (same page, same data).
- **View mode state:** `BudgetViewMode`: `'budget' | 'cost_report'`. Persisted in `localStorage` under key `BUDGET_VIEW_MODE_KEY` (`'budgetViewMode'`) so the user’s last tab is restored.
- **Data:** The Cost Report view receives the same computed data as the Budget tab: `accountTree`, `accountTotals`, `items`, `totalEstimated`, `totalActual`, `variance`, `uncodedTotal`, `fringeTotals`, `contingencyTotals`. It also receives **production total amounts** (see §2.5) and an optional **configure** button for the Production totals modal. Production totals are loaded via `listProductionTotals(productionId)`; amounts are computed from `accountTotals` only (no direct item/expense queries).

### 2.2 Layout and behaviour

- **Header actions:** “Configure production totals” (opens modal; see §2.5) and “Print”. Both are in a `no-print` block so they are hidden when printing.
- **Print button:** Calls `window.print()`.
- **Summary cards:** Three cards — Total estimated, Total actual (with optional “Uncoded spend: £X”), Variance. Same values and formatting as the Budget tab.
- **Derived section:** When fringes or contingency exist: “Derived (budget overlays)” with Fringes (derived), Contingency (derived), and Estimated + derived. Same logic as Budget tab; derived amounts are not included in Total actual.
- **Table:** Columns — Code, Account, Budget, Actual, Variance, %. Rows are the **same hierarchical account tree** as the Budget tab (built from `buildAccountTree`), with:
  - **Header (rollup) accounts:** Bold label, rollup totals, optional left border band colour from `getAccountBandColor(account)` (and tinted background in screen view).
  - **Leaf (postable) accounts:** Code, name, and totals. **Expandable:** clicking the account name toggles a detail section showing that account’s **line items** (description + estimated cost); only one leaf can be expanded at a time (`costReportExpandedLeafId`). In print, the expanded state is not used; line item count is shown as “(N line items)” next to the name.
- **Uncoded spend row:** When `uncodedTotal > 0`, a single table row “Uncoded spend” with the uncoded amount in the Actual column.
- **Empty state:** When there are no accounts and no uncoded spend: “No accounts yet.”
- **Production totals section:** When the user has defined production totals (see §2.5), a “Production totals” block is rendered **after** the account table and **before** the Derived section. It lists each total’s name and budget rollup (sum of `accountTotals` for the total’s header accounts), then a “Production subtotal” line (sum of those rollups). Styling: slightly heavier font, right-aligned currency, light separator above the block. Reporting only; does not affect accounting or derived calculations.

### 2.3 Rendering implementation

- **Component:** `CostReportView` in `page.tsx`. It receives the totals maps, items, format function, currency, and expand state; it does not fetch data.
- **Row rendering:** `renderCostReportRows(node, depth, ctx)` walks the account tree recursively. For each node it emits one `TableRow` (code, account name, budget, actual, variance, %). For a leaf account, if `expandedLeafId === account.id`, it then emits child rows for each line item (description + estimated cost) or a “No line items yet” row. Then it recurses into `node.children`. Band colours and indentation (`paddingLeft: 8 + depth * 14`) are applied per row.
- **Band colours:** From `@/lib/budget/accountBandColor`: `getAccountBandColor(account)` — uses `account.color_hex` if set, otherwise a palette derived from account code. Used for the left border (and for rollup rows, a light tint background via `hexWithAlpha(bandColor, 0.06)`).

### 2.4 Print styling

- **Wrapper class:** The Cost Report content is wrapped in `cost-report-print`. In `src/index.css`, `@media print` rules apply only inside this wrapper:
  - Background forced to white, text to dark (`#1a1a1a`); borders to light grey; muted and destructive text adjusted for readability.
  - `.no-print` is hidden (Print button and other interactive elements use this class).
  - Table borders collapsed for a clean print layout.
- The rest of the page (nav, other tabs, dialogs) is outside this wrapper; the user typically prints with the Cost Report tab active so only that content is printed.

### 2.5 Production totals (Cost Report only)

- **Purpose:** User-defined rollup totals for the Cost Report (e.g. “Above the line”, “Below the line”, “Production subtotal before fringes”). Reporting only; they do **not** affect accounting, posting, or derived totals.
- **Data model:** Tables `production_totals` (id, production_id, name, sort_order, timestamps, deleted_at) and `production_total_accounts` (production_total_id, account_id). Only **header** accounts (`is_postable === false`) may be attached; each total can reference multiple header accounts. Repository: `src/lib/db/repositories/productionTotals.ts`. Types: `ProductionTotal`, `ProductionTotalAccount` in `src/lib/db/types.ts`.
- **Calculation:** For each production total, **budgetTotal** = sum of `accountTotals.get(accountId).budgetTotal` over its account ids; **actualTotal** = sum of `accountTotals.get(accountId).actualTotal`; **variance** = budgetTotal − actualTotal. No direct queries to items or expenses; all from the existing `accountTotals` map produced by `computeAccountTotals`.
- **Configuration:** “Configure production totals” in the Cost Report tab header opens a modal titled “Production totals”. The modal lists existing totals (Name, Edit, Delete), a “Create production total” button, and a form (Name + checklist of header accounts) for create/edit. Only header (non-postable), non-archived accounts appear in the checklist. Saving create/update replaces the total’s account mappings. Delete is soft delete (`deleted_at`). Query key: `['production-totals', productionId]`; invalidate after create/update/delete.
- **Transactions:** Create and update use `runInSerializedTransaction` + `executeBatch` (BEGIN, writes, outbox, COMMIT) per `docs/DATABASE_LAYER.md`. Delete is a single UPDATE so `db.execute` is used.

---

## 3. Cost report groups (Settings)

### 3.1 Purpose and scope

- **Purpose:** Organise accounts into named groups (e.g. “Above the line”, “Below the line”) for **presentation and reporting only**. They do not affect:
  - Posting rules (which accounts are postable),
  - Budget/actual totals or variance,
  - Derived calculations (fringes, contingency),
  - The structure of the Cost Report tab (which still follows the chart-of-accounts tree).
- **Use today:** Managed in Settings under “Cost report groups”. Intended for future use (e.g. group-based exports or alternate report layouts).
- **Scope:** Production-scoped; each group belongs to one production. An account can belong to **multiple groups** (many-to-many).

### 3.2 Data model

- **Tables:** Migration `0016_cost_report_groups.sql`.
  - **cost_report_groups:** `id`, `production_id`, `code` (optional, max 10 chars, unique per production when set), `name` (required, unique per production), `sort_order`, timestamps, `deleted_at` (soft delete).
  - **cost_report_group_accounts:** `id`, `group_id`, `account_id`; unique `(group_id, account_id)`. References `budget_accounts(id)` (ON DELETE CASCADE when account or group is removed).
- **Types:** `CostReportGroup`, `CostReportGroupAccount` in `src/lib/db/types.ts`.

### 3.3 Repository — `src/lib/db/repositories/costReportGroups.ts`

| Function | Description |
|----------|-------------|
| `listCostReportGroups(productionId)` | Returns groups with `accountCount` (CostReportGroupWithCount); ordered by sort_order, name. |
| `listGroupAccountIds(groupId)` | Returns array of account ids for a group. |
| `createCostReportGroup({ production_id, name, code?, sort_order?, accountIds? })` | Creates group and optional account mappings in a transaction. Name/code validated unique per production. |
| `updateCostReportGroup(groupId, { name?, code?, sort_order? })` | Updates group attributes; name/code uniqueness checked. |
| `setGroupAccountIds(groupId, accountIds)` | Replaces all account mappings for a group (delete + insert in transaction). |
| `deleteCostReportGroup(groupId)` | Soft-deletes group and removes all mappings in a transaction. |

- **Validation:** Name required and unique per production; code optional, trimmed, uppercased, max 10 chars, unique per production when not null. At least one scope is not required for groups (unlike derived rules).

### 3.4 Integration with chart of accounts

- **Hard delete / archive:** In `budgetAccounts.ts`, `hardDeleteAccount` and `canArchiveAccount` check `isReferencedInCostReportGroups(accountId)`. If the account is in any cost report group, hard delete is disallowed (with message “In cost report groups”); archive is still allowed. So groups do not block archiving, but they do block permanent deletion until the account is removed from all groups (or groups are deleted).

### 3.5 Settings UI

- **Card:** “Cost report groups” (only when a production is selected). Description: “Organise accounts for reporting and exports. Groups do not affect accounting totals.”
- **List:** Table with columns Name, Code, Accounts (count), Actions (Edit, Delete). Add group button opens a dialog.
- **Add group:** `CostReportGroupForm` — Name (required), Code (optional, max 10), Accounts (multi-select checkboxes; header and leaf accounts allowed). Submit calls `createCostReportGroup` with `accountIds`.
- **Edit group:** Same form with initial values; loads `listGroupAccountIds(editGroup.id)` for account selection. Submit calls `updateCostReportGroup` and `setGroupAccountIds(editGroup.id, data.accountIds)`.
- **Delete:** Confirmation then `deleteCostReportGroup(groupId)`; cache invalidated for `['cost-report-groups', currentProductionId]`.

### 3.6 Query keys

- `['cost-report-groups', productionId]` — List of groups with account count; invalidate on create/update/delete.
- `['cost-report-group-accounts', groupId]` — Account ids for a group; used when editing a group (`editGroup?.id`). Invalidate when group’s accounts change (after `setGroupAccountIds` or delete); typically the edit dialog is closed on success so refetch is less critical.

---

## 4. Summary

| Aspect | Cost Report view (Budget tab) | Production totals | Cost report groups |
|--------|--------------------------------|-------------------|--------------------|
| **Where** | Budget page, “Cost Report” tab | Cost Report tab (section + Configure modal) | Settings, “Cost report groups” card |
| **Data** | Same as Budget tab (account tree, totals, items) | Totals + account ids from `production_totals`; amounts from `accountTotals` | Own tables: groups + group–account mappings |
| **Structure** | Chart-of-accounts hierarchy | User-defined totals; each references header accounts only | User-defined groups; many-to-many with accounts |
| **Affects totals?** | No (display only) | No (reporting only) | No |
| **Print** | Yes; print-friendly layout and CSS | Shown in Cost Report print | N/A |
| **Used by Cost Report tab?** | This is the Cost Report tab | Yes (section + configure) | Not yet; reserved for future group-based reports/exports |

---

## 5. Implementation notes for future work

- **Group-based Cost Report:** To show the Cost Report organised by cost report groups instead of (or in addition to) the account tree, the Budget page would need to load `listCostReportGroups(productionId)` and optionally `listGroupAccountIds` for each group, then build a view that sections or filters the account tree by group. Totals would still come from `computeAccountTotals`; groups would only affect ordering and grouping of rows.
- **Export by group:** CSV or PDF export could add sections or sheets per cost report group using the same group–account mapping.
- **Print:** The current print CSS is scoped to `.cost-report-print`. Any new report layout that should print cleanly can reuse this class or similar rules.

This document should be updated when the Cost Report tab starts using cost report groups or when the data model or repository API changes.
