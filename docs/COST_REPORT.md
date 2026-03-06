# Cost Report — design and implementation

This document describes the Cost Report functionality: the **Cost Report view** on the Budget page and **Cost report groups** (configuration in Settings). Cost report groups are for organising accounts for reporting; they do not currently drive the layout of the Cost Report tab but are part of the same reporting story.

---

## 1. Overview

Cost Report functionality has three parts:

1. **Cost Report view** — A second tab on the Budget page (`/budget`) that shows the same budget data (chart of accounts, totals, line items) in a print-oriented layout with a Print button. It uses the same account tree and calculations as the Budget tab; no separate data model.
2. **Cost report groups** — Configurable groups of accounts (e.g. “Above the line”, “Below the line”) managed in **Settings**. They are for presentation and reporting only. The Cost Report tab can display a **“By groups”** layout: one section per group with group subtotals (see §2.6).
3. **Production totals** — User-defined rollup subtotals (e.g. “Above the line”, “Below the line”, “Subtotal before derived”) configured via “Configure production totals” on the Cost Report tab; see §2.5.

---

## 2. Cost Report view (Budget page)

### 2.1 Entry and state

- **Location:** `src/features/budget/page.tsx`. The Budget page has two tabs: **Budget** and **Cost Report** (same page, same data).
- **View mode state:** `BudgetViewMode`: `'budget' | 'cost_report'`. Persisted in `localStorage` under key `BUDGET_VIEW_MODE_KEY` (`'budgetViewMode'`) so the user’s last tab is restored.
- **Data:** The Cost Report view receives the same computed data as the Budget tab plus: **production total amounts** and **productionSubtotalBeforeDerived** (see §2.5), **cost report groups with account ids** (when layout is “By groups”), **group totals** and **visibleIdsByGroupId** for section rendering. Groups are loaded via `listCostReportGroupsWithAccountIds(productionId)` (query key `['cost-report-groups-with-accounts', productionId]`). Production totals via `listProductionTotals(productionId)`. All amounts are computed from `accountTotals` only (no direct item/expense queries).
- **Layout mode:** Toggle **“Chart of accounts”** (default) vs **“By groups”**; persisted in `localStorage` under `COST_REPORT_LAYOUT_MODE_KEY`. The “By groups” option is shown only when at least one cost report group exists.

### 2.2 Layout and behaviour

- **Header actions:** Layout toggle (Chart of accounts / By groups) when groups exist, “Configure production totals”, “Print”. All in a `no-print` block.
- **Print button:** Calls `window.print()` (unchanged; C2 will refine print layout).
- **Summary cards:** Three cards — Total estimated, Total actual (with optional “Uncoded spend: £X”), Variance. Same values and formatting as the Budget tab.
- **Chart of accounts mode:** Single hierarchical table (same as before): columns Code, Account, Budget, Actual, Variance, %. Rows are the full account tree. **Uncoded spend** row when `uncodedTotal > 0`. **Empty state:** “No accounts yet.” when no accounts and no uncoded spend.
- **By groups mode:** One section per cost report group (ordered by `sort_order` then name). Each section: uppercase section header (group name and optional code), table of the **subset** of the account tree that belongs to that group (group account ids plus their **ancestors** so the hierarchy is preserved; no re-parenting), then a **Group total** row (Budget, Actual, Variance, %). Totals are computed from **unique leaf descendants** of the group’s accounts (no double counting). After all groups, an **Uncoded spend** section when `uncodedTotal > 0`. Leaf expansion (one at a time) works the same as in Chart of accounts mode.
- **Subtotals block (after table/sections):** When production totals exist: “Subtotals” label, table of each production total (name, Budget, Actual, Variance), then **“Subtotal before derived”** row (deduped: unique leaf ids under all production totals’ header accounts; budget, actual, variance). Then **“Derived (budget overlays)”** section (Fringes, Contingency; unchanged). Then **“Total budget incl. derived”** and **Total actual (expenses only)** and **Variance vs estimated**. Derived amounts are never included in Total actual.

### 2.3 Rendering implementation

- **Component:** `CostReportView` in `page.tsx`. It receives the totals maps, items, format function, currency, and expand state; it does not fetch data.
- **Row rendering:** `renderCostReportRows(node, depth, ctx)` walks the account tree recursively. For each node it emits one `TableRow` (code, account name, budget, actual, variance, %). For a leaf account, if `expandedLeafId === account.id`, it then emits child rows for each line item (description + estimated cost) or a “No line items yet” row. Then it recurses into `node.children`. Band colours and indentation (`paddingLeft: 8 + depth * 14`) are applied per row.
- **Band colours:** From `@/lib/budget/accountBandColor`: `getAccountBandColor(account)` — uses `account.color_hex` if set, otherwise a palette derived from account code. Used for the left border (and for rollup rows, a light tint background via `hexWithAlpha(bandColor, 0.06)`).
- **Group totals (By groups mode):** For each group, **visible ids** = group account ids ∪ all ancestors (walk `parent_account_id` to root). **Leaf set** = union of `getDescendantLeafIds(accountTree, accountId)` for each group account id. Group budget/actual = sum of `accountTotals.get(leafId)` over the leaf set (missing ids skipped). Implemented in `src/lib/budget/calculations.ts` (`getDescendantLeafIds`, `getDescendantLeafIdsFromNode`). `renderCostReportRows` accepts an optional `visibleIds` set and only emits rows for nodes in that set.

### 2.4 Print styling

- **Wrapper class:** The Cost Report content is wrapped in `cost-report-print`. In `src/index.css`, `@media print` rules apply only inside this wrapper:
  - Background forced to white, text to dark (`#1a1a1a`); borders to light grey; muted and destructive text adjusted for readability.
  - `.no-print` is hidden (Print button and other interactive elements use this class).
  - Table borders collapsed for a clean print layout.
- The rest of the page (nav, other tabs, dialogs) is outside this wrapper; the user typically prints with the Cost Report tab active so only that content is printed.

### 2.5 Production totals (Cost Report only)

- **Purpose:** User-defined rollup totals for the Cost Report (e.g. “Above the line”, “Below the line”, “Production subtotal before fringes”). Reporting only; they do **not** affect accounting, posting, or derived totals.
- **Data model:** Tables `production_totals` (id, production_id, name, sort_order, timestamps, deleted_at) and `production_total_accounts` (production_total_id, account_id). Only **header** accounts (`is_postable === false`) may be attached; each total can reference multiple header accounts. Repository: `src/lib/db/repositories/productionTotals.ts`. Types: `ProductionTotal`, `ProductionTotalAccount` in `src/lib/db/types.ts`.
- **Calculation:** For each production total (header accounts), **budgetTotal** / **actualTotal** = sum of `accountTotals` over its header account ids (rollups). **“Subtotal before derived”** is deduped: unique **leaf** account ids under all production totals’ header accounts (via `getDescendantLeafIds`), then sum of `accountTotals` over that set; avoids double counting when totals overlap. No direct queries to items or expenses.
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
- **Use today:** Managed in Settings under “Cost report groups”. The Cost Report tab can show a **“By groups”** layout (one section per group with group subtotals). Query: `listCostReportGroupsWithAccountIds(productionId)` (key `['cost-report-groups-with-accounts', productionId]`). Settings mutations invalidate this key when groups change.
- **Scope:** Production-scoped; each group belongs to one production. An account can belong to **multiple groups** (many-to-many). Archived accounts in a group still contribute to group totals (historical reporting).

### 3.2 Data model

- **Tables:** Migration `0016_cost_report_groups.sql`.
  - **cost_report_groups:** `id`, `production_id`, `code` (optional, max 10 chars, unique per production when set), `name` (required, unique per production), `sort_order`, timestamps, `deleted_at` (soft delete).
  - **cost_report_group_accounts:** `id`, `group_id`, `account_id`; unique `(group_id, account_id)`. References `budget_accounts(id)` (ON DELETE CASCADE when account or group is removed).
- **Types:** `CostReportGroup`, `CostReportGroupAccount` in `src/lib/db/types.ts`.

### 3.3 Repository — `src/lib/db/repositories/costReportGroups.ts`

- **listCostReportGroupsWithAccountIds(productionId):** Returns `CostReportGroupWithAccountIds[]` (groups with `account_ids`) in one call; used by the Cost Report tab for the “By groups” layout. Ordered by `sort_order`, name.

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

### 3.6 Query keys and invalidation

- **Cost Report tab:** `['cost-report-groups-with-accounts', productionId]` — list of groups with account ids. When Settings creates/updates/deletes a cost report group or its account mappings, both `['cost-report-groups', currentProductionId]` and `['cost-report-groups-with-accounts', currentProductionId]` are invalidated so the Cost Report tab updates when the user returns to it.

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
| **Used by Cost Report tab?** | This is the Cost Report tab | Yes (Subtotals block + configure) | Yes (“By groups” layout; one section per group) |

---

## 5. Implementation notes for future work

- **Export by group:** CSV or PDF export could add sections or sheets per cost report group using the same group–account mapping.
- **Print:** The current print CSS is scoped to `.cost-report-print`. Any new report layout that should print cleanly can reuse this class or similar rules.

This document should be updated when the Cost Report tab starts using cost report groups or when the data model or repository API changes.
