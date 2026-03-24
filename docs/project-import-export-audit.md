# Project import/export (`.apf`) — Phase 1 audit

**Status:** Historical Phase 1 inventory; **implementation** lives in [`src/lib/importExport/`](../src/lib/importExport/). This document remains the INCLUDE/EXCLUDE, tombstone, and FK-order reference; keep it aligned with migrations and `APF_V1_TABLE_KEYS`.

**Purpose:** Inventory production-scoped data, foreign-key ordering, tombstone rules, and file-path fields for the zip-based `.apf` interchange.

**Transaction constraint:** Any future multi-statement import transaction **must** follow [`docs/DATABASE_LAYER.md`](DATABASE_LAYER.md): `runInSerializedTransaction` + a **single** `executeBatch(db, [BEGIN, …, COMMIT])`. Do not split BEGIN/COMMIT across pooled connections.

**Reference implementation gap:** [`src/lib/db/duplicateProduction.ts`](../src/lib/db/duplicateProduction.ts) is the closest prior art for “copy everything for one production” and file re-homing under `attachments/<productionId>/`, but it **does not** load or insert many tables that exist in current migrations (e.g. `budget_accounts`, vendor invoices/POs, equipment lists, `bookings`, `checklist_items`, `call_sheets`, `cue_sheets`, `script_documents`, fringe/contingency, cost-report groups, production totals, link tables). **Do not** treat duplicate production as a complete export/import spec.

---

## 1. Tables excluded from v1 full-project interchange

| Table | Reason |
|-------|--------|
| `settings` | App-instance key/value (e.g. currency UI prefs). Not production-scoped. |
| `exchange_rates` | Cached FX data; regenerated when API enabled. Not project semantics. |
| `seed_meta` | DevTools / seed bookkeeping (`key` PK). Not production data. |
| `outbox` | Sync-oriented queue (`entity`, `entity_id`, `operation`, `payload_json`). Instance-local; exporting would replay or confuse a future sync story. See [§6](#6-risks-open-questions-follow-ups). |
| `task_templates` | Global templates, not tied to `production_id`. |
| `task_template_items` | Child of global `task_templates`. |
| `deliverable_templates` | Global templates. |
| `deliverable_template_items` | Child of global `deliverable_templates`. |

---

## 2. Tables included in v1 full-project interchange

All of the following are either keyed by `production_id` or hang off rows that are (join / detail tables). Export scope is **active rows only** for most tables, with an explicit exception for episodic parents — see [§4](#4-tombstone--export-filtering-rules).

### 2.1 Core production

| Table | PK | `production_id` | Notes |
|-------|----|-----------------|--------|
| `productions` | `id` | — | Root row for the export. Includes **`is_episodic`** (`0` / `1`); turning episodic on in-app is irreversible. |

### 2.2 Episodic foundation (schedule / ownership)

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `episodes` | `id` | `production_id` | `productions`; soft-delete via **`deleted_at`** (archived episode). |
| `shooting_blocs` | `id` | `production_id` | `productions`; optional soft-delete **`deleted_at`**; date range `start_date` / `end_date`. |

### 2.3 Units & schedule shell

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `units` | `id` | `production_id` | `productions` |
| `shoot_days` | `id` | `production_id` | `productions`, optional **`shooting_bloc_id`** → `shooting_blocs` (`ON DELETE SET NULL`) |
| `shoot_day_units` | `id` | indirect | `shoot_days`, `units` |

### 2.4 Locations, script, stripboard

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `locations` | `id` | `production_id` | `productions` |
| `scenes` | `id` | `production_id` | `productions`, `locations` (nullable), episodic: **`episode_id`** → `episodes` (nullable in schema; required for every scene when `is_episodic = 1` in app / import preflight) |
| `shots` | `id` | indirect | `scenes` |
| `location_scene` | `id` | indirect | `locations`, `scenes` |
| `stripboard_items` | `id` | indirect | `shoot_days`, `scenes` (legacy day/scene ordering; still used by schedule repo) |
| `stripboard_strips` | `id` | `production_id` | `shoot_days`, `shoot_day_units` (nullable), `scenes` (nullable), `shots` (nullable) |
| `scene_cast` | `id` | `production_id` | `scenes`, `people` |
| `shot_cast` | `id` | `production_id` | `shots`, `people` |
| `cast_availability` | `id` | `production_id` | `people` |

### 2.5 People, bookings, call sheet config

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `people` | `id` | `production_id` | `productions` |
| `bookings` | `id` | `production_id` | `people`, `shoot_days` (nullable) |
| `key_contacts` | `id` | `production_id` | `productions` |
| `call_sheets` | `id` | `production_id` | `shoot_days`, `shoot_day_units` (nullable), `documents` (`generated_document_id`, nullable) |

### 2.6 Budget: categories, chart of accounts, lines, links

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `budget_categories` | `id` | `production_id` | `productions` |
| `budget_accounts` | `id` | `production_id` | `productions`, self (`parent_account_id`, nullable) |
| `budget_items` | `id` | `production_id` | `productions`, `budget_categories` (nullable), `budget_accounts` (nullable) |
| `budget_item_details` | `id` | indirect | `budget_items` (1:1, `UNIQUE(budget_item_id)`) |
| `expenses` | `id` | `production_id` | `productions`, `budget_categories` (nullable), `budget_accounts` (nullable), `vendors` (nullable) |
| `expense_transaction_details` | `id` | indirect | `expenses` |
| `budget_item_expense_links` | `id` | `production_id` + FKs | `budget_items`, `expenses` |

### 2.7 Vendors, invoices, POs, expense links

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `vendors` | `id` | `production_id` | `productions` |
| `vendor_purchase_orders` | `id` | `production_id` | `vendors` |
| `vendor_invoices` | `id` | `production_id` | `vendors`, `vendor_purchase_orders` (`po_id`, nullable) |
| `vendor_invoice_expenses` | `id` | indirect | `vendor_invoices`, `expenses` |
| `vendor_purchase_order_expenses` | `id` | indirect | `vendor_purchase_orders`, `expenses` |

### 2.8 Equipment registry & lists

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `equipment` | `id` | `production_id` | `productions`, `shoot_days` (nullable); columns `vendor_id`, `invoice_id` are logical links to `vendors` / `vendor_invoices` (not all enforced as FK in migrations) |
| `equipment_lists` | `id` | `production_id` | `productions`, `shoot_days` (nullable) |
| `equipment_list_items` | `id` | indirect | `equipment_lists`, `equipment` |
| `equipment_terms` | `id` | `production_id` | `productions` |

### 2.9 Tasks

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `production_task_sections` | `id` | `production_id` | `productions` |
| `production_tasks` | `id` | `production_id` | `productions`, self (`parent_task_id`), `production_task_sections` (nullable), `vendor_invoices` (`vendor_invoice_id`, nullable), `equipment` (`equipment_id`, nullable) |

### 2.10 Deliverables, music, checklists

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `deliverables` | `id` | `production_id` | `productions`; episodic: optional **`episode_id`** → `episodes` |
| `technical_specs` | `id` | indirect | `deliverables` |
| `music_tracks` | `id` | `production_id` | `productions`; episodic: optional **`episode_id`** → `episodes` |
| `clearances` | `id` | `production_id` | `music_tracks` (and other `type`/`item_id` semantics per app) |
| `checklist_items` | `id` | `production_id` | `productions` |

### 2.11 Documents & script storage

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `documents` | `id` | `production_id` (nullable in schema, but production export filters by target production) | optional `entity_type` / `entity_id`; **`file_path`** — see [§5](#5-document--file-path-audit) |
| `cue_sheets` | `id` | `production_id` | `documents` (`document_id`, nullable) |
| `script_documents` | `id` | `production_id` | `documents` (`document_id`, nullable) |

### 2.12 Reporting & display layers (still canonical user data)

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `fringe_rules` | `id` | `production_id` | `productions` |
| `fringe_rule_scopes` | `id` | indirect | `fringe_rules`, `budget_accounts` |
| `contingency_rules` | `id` | `production_id` | `productions` |
| `contingency_rule_scopes` | `id` | indirect | `contingency_rules`, `budget_accounts` |
| `cost_report_groups` | `id` | `production_id` | `productions` |
| `cost_report_group_accounts` | `id` | indirect | `cost_report_groups`, `budget_accounts` |
| `production_totals` | `id` | `production_id` | `productions` |
| `production_total_accounts` | `id` | indirect | `production_totals`, `budget_accounts` |
| `production_crew_hierarchy_configs` | `id` | `production_id` | `productions` (`UNIQUE(production_id)`); no `deleted_at` column |

---

## 3. Topological import order (v1)

Inserts must respect SQLite FKs (`PRAGMA foreign_keys = ON` in [`src/lib/db/client.ts`](../src/lib/db/client.ts)). The shipped importer uses the **exact** sequence in `APF_V1_TABLE_KEYS` in [`src/lib/importExport/tableKeys.ts`](../src/lib/importExport/tableKeys.ts) (parents before children, including **`episodes`** and **`shooting_blocs`** before **`shoot_days`**, **`scenes`**, **`music_tracks`**, and **`deliverables`**).

Canonical order (copy for audits; code is source of truth):

1. `productions`  
2. `episodes`  
3. `shooting_blocs`  
4. `units`  
5. `people`  
6. `locations`  
7. `shoot_days`  
8. `budget_categories`  
9. `budget_accounts`  
10. `vendors`  
11. `key_contacts`  
12. `checklist_items`  
13. `equipment_terms`  
14. `music_tracks`  
15. `production_task_sections`  
16. `deliverables`  
17. `fringe_rules`  
18. `contingency_rules`  
19. `cost_report_groups`  
20. `production_totals`  
21. `production_crew_hierarchy_configs`  
22. `scenes`  
23. `shoot_day_units`  
24. `vendor_purchase_orders`  
25. `bookings`  
26. `cast_availability`  
27. `shots`  
28. `location_scene`  
29. `stripboard_items`  
30. `stripboard_strips`  
31. `scene_cast`  
32. `shot_cast`  
33. `budget_items`  
34. `vendor_invoices`  
35. `expenses`  
36. `technical_specs`  
37. `clearances`  
38. `budget_item_details`  
39. `expense_transaction_details`  
40. `budget_item_expense_links`  
41. `vendor_invoice_expenses`  
42. `vendor_purchase_order_expenses`  
43. `equipment`  
44. `equipment_lists`  
45. `equipment_list_items`  
46. `production_tasks` — rows sorted so **`parent_task_id`** parents insert before children  
47. `fringe_rule_scopes`  
48. `contingency_rule_scopes`  
49. `cost_report_group_accounts`  
50. `production_total_accounts`  
51. `documents` — **files** copied and `file_path` rewritten on disk (see [§5](#5-document--file-path-audit))  
52. `cue_sheets`  
53. `call_sheets`  
54. `script_documents`  

**Cycles:** None identified for **included** tables aside from **self-edges** (`budget_accounts`, `production_tasks`), handled by per-table row ordering in code.

**Awkward edges:**

- `vendor_invoices.po_id` → PO rows before invoices when `po_id` is non-null.  
- `call_sheets.generated_document_id` → target `documents` row must exist before the `call_sheets` row.  
- `documents.entity_id` may reference entities in multiple tables; with **UUID preservation**, IDs stay valid as long as those entity rows are imported. If future flows remap IDs, entity pointers need the same mapping as [`duplicateProduction.mapEntityId`](../src/lib/db/duplicateProduction.ts).

---

## 4. Tombstone / export filtering rules

### 4.1 `deleted_at` (soft delete)

Omit rows with **`deleted_at IS NOT NULL`** from export for every table that has the column, **except**:

- **`episodes`:** export **all** rows for the production (`production_id` match), including archived episodes (`deleted_at` set). Rationale: episodic **`scenes`**, **`music_tracks`**, and **`deliverables`** may still reference archived episode IDs; omitting those parent rows breaks referential closure in `data/production.json` and import preflight.
- **`shooting_blocs`:** export **all** rows for the production, including soft-deleted blocs, for the same reason (`shoot_days.shooting_bloc_id` may point at a bloc row that is no longer “active” in list UIs).

Import **preflight** (`preflightApfImport.ts`) validates: episodic packages require **`episode_id`** on every scene; every non-null **`episode_id`** / optional track & deliverable **`episode_id`** must exist on a payload **`episodes`** row (archived or not); every non-null **`shoot_days.shooting_bloc_id`** must exist on a payload **`shooting_blocs`** row for that production.

For all **other** included tables, keep the active-only rule.

**Child rows when parent is omitted:** If a child row has `deleted_at IS NULL` but its parent is soft-deleted, the child should still be **omitted** from export (and would violate FK or app invariants on import). Implement export queries with **`JOIN` to parent and parent `deleted_at IS NULL`**, matching the pattern in `duplicateProduction` (e.g. `technical_specs` joined to `deliverables`, `expense_transaction_details` joined to `expenses`).

Tables in v1 scope **without** `deleted_at` (export all active graph rows once parents pass):

- `budget_item_details`
- `expense_transaction_details`
- `vendor_invoice_expenses`
- `vendor_purchase_order_expenses`
- `equipment_list_items`
- `fringe_rule_scopes`, `contingency_rule_scopes`
- `cost_report_group_accounts`, `production_total_accounts`
- `production_crew_hierarchy_configs`

Only include these when their referenced parents are included and non-deleted.

### 4.2 `archived_at` (productions, budget_accounts)

- **`productions.archived_at`:** Not a soft-delete flag; **`deleted_at`** governs removal from lists. Policy for v1: if **`productions.deleted_at IS NULL`**, include the production row **regardless of `archived_at`** (user can archive and still export a “current” package). Adjust if product wants to exclude archived productions by default.  
- **`budget_accounts.archived_at`:** Archive is separate from `deleted_at`. Policy for v1: export accounts with **`deleted_at IS NULL`**; **include archived accounts** unless product decides otherwise (they still affect reporting trees).

### 4.3 Strip / equipment status flags

- `stripboard_strips.strip_status` (e.g. boneyard) is **data**, not a tombstone — **include** if row is not soft-deleted.  
- Equipment `status` / similar — **include** as stored.

---

## 5. Document / file-path audit

### 5.1 Primary path column

| Table | Column | Role |
|-------|--------|------|
| `documents` | `file_path` | **Canonical** app-relative path under app data (see duplicate production: `attachments/<productionId>/…`). Used when opening/revealing files from the UI. |

### 5.2 Foreign keys to `documents`

| Table | Column | Notes |
|-------|--------|------|
| `cue_sheets` | `document_id` | Generated cue sheet PDF (or similar) stored as a `documents` row. |
| `call_sheets` | `generated_document_id` | Generated call sheet output. |
| `script_documents` | `document_id` | Script upload linkage. |

**Import/export:** Bundle bytes for every exported `documents` row (active only). On import, copy into app storage (same attachment layout as duplicate production) and **rewrite `documents.file_path`**. Then insert `documents` before `cue_sheets` / `call_sheets` / `script_documents` that reference them.

### 5.3 JSON / text blobs that might embed paths (ambiguous)

These columns are **not** dedicated path columns but could theoretically contain strings that look like paths in user data or legacy payloads. **Do not assume** without scanning app writers:

- `call_sheets.overrides_json`
- `shoot_days.meal_times_json`, `shoot_days.weather_json`
- `expense_transaction_details.details_json`
- `budget_item_details.details_json`
- `production_crew_hierarchy_configs.config_json`

**Recommendation:** Phase 2 document a **short audit** (grep / runtime inspection) of what each writer stores; only add extra bundle/rewrite rules if paths are found.

### 5.4 Resolution in code today

- [`duplicateProduction.ts`](../src/lib/db/duplicateProduction.ts): reads/writes files via `BaseDirectory.AppData` with paths taken from `documents.file_path`, writes to `attachments/<newProdId>/<docId>-<fileName>`.
- [`src/lib/db/repositories/document.ts`](../src/lib/db/repositories/document.ts): CRUD on `documents`; lists filter `deleted_at IS NULL`.

---

## 6. Risks, open questions, follow-ups

1. **Import transaction size:** A single `executeBatch` with thousands of bound statements may approach SQLite / driver limits (e.g. statement length, bound parameter count). Mitigation options: chunk into multiple batches in separate transactions (loses single atomicity — product call), or bulk INSERT strategies that stay within one `execute()` per batch. Must be validated under `DATABASE_LAYER` rules.  
2. **Slug uniqueness:** `productions.slug` is unique among non-deleted productions. Importing a production that **already exists** (same `id`) vs **new row** vs **slug collision** needs an explicit product rule.  
3. **`outbox` on import:** Default should be **no outbox rows** for imported data, or a single controlled event — avoid replaying historical sync payloads.  
4. **`equipment.vendor_id` / `invoice_id`:** Not consistently declared as `REFERENCES` in migrations; still **must** point to exported vendors/invoices for referential integrity in app logic.  
5. **`clearances.item_id`:** Polymorphic by `type`; v1 export should include only rows whose parents exist and match app rules.  
6. **`created_from_template` on `productions`:** References a **global** template id; harmless to copy as metadata if templates differ on target machine.  
7. **Legacy exception:** `reserveSlugAndInsertProduction` uses split BEGIN/INSERT per `DATABASE_LAYER.md` §10 — unrelated to import/export but do not copy that pattern for import.

---

## 7. Recommended next implementation phases

| Phase | Scope |
|-------|--------|
| **2a** | Done: [`project-import-export-format-v1.md`](project-import-export-format-v1.md) + `src/lib/importExport/` scaffolding (`manifest.json`, `data/production.json`, `files/…`). |
| **2b** | Read path: enumerate rows per included table with filters in §4; serialize JSON. |
| **2c** | Write path: validate `formatVersion`; migrate older versions; `runInSerializedTransaction` + `executeBatch` insert pipeline following §3 order; copy files and rewrite `documents.file_path`. |
| **2d** | UI + Tauri save/open dialogs; file association & argv (out of scope for Phase 1). |
| **2e** | Tests: golden fixture `.apf`, round-trip on clean DB, refusal path for unsupported `formatVersion`. |

---

## 8. Document history

| Date | Change |
|------|--------|
| 2026-03-22 | Phase 1 audit from migrations `0001`–`0049` and `duplicateProduction` / `document` repository review. |
| 2026-03-24 | Episodic parity: `episodes`, `shooting_blocs`, FK columns (`episode_id`, `shooting_bloc_id`), canonical §3 order aligned with `tableKeys.ts`, tombstone exceptions for episodic parents in §4.1. |
