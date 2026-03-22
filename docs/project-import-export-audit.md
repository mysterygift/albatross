# Project import/export (`.apf`) — Phase 1 audit

**Status:** Planning / audit only (no importer, exporter, UI, or Tauri file associations in this phase).

**Purpose:** Inventory production-scoped data, foreign-key ordering, tombstone rules, and file-path fields so Phase 2+ can implement a versioned JSON interchange inside a zip-based `.apf` container.

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

All of the following are either keyed by `production_id` or hang off rows that are (join / detail tables). Export scope: **active rows only** — see [§4](#4-tombstone--export-filtering-rules).

### 2.1 Core production

| Table | PK | `production_id` | Notes |
|-------|----|-----------------|--------|
| `productions` | `id` | — | Root row for the export. |

### 2.2 Units & schedule shell

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `units` | `id` | `production_id` | `productions` |
| `shoot_days` | `id` | `production_id` | `productions` |
| `shoot_day_units` | `id` | indirect | `shoot_days`, `units` |

### 2.3 Locations, script, stripboard

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `locations` | `id` | `production_id` | `productions` |
| `scenes` | `id` | `production_id` | `productions`, `locations` (nullable) |
| `shots` | `id` | indirect | `scenes` |
| `location_scene` | `id` | indirect | `locations`, `scenes` |
| `stripboard_items` | `id` | indirect | `shoot_days`, `scenes` (legacy day/scene ordering; still used by schedule repo) |
| `stripboard_strips` | `id` | `production_id` | `shoot_days`, `shoot_day_units` (nullable), `scenes` (nullable), `shots` (nullable) |
| `scene_cast` | `id` | `production_id` | `scenes`, `people` |
| `shot_cast` | `id` | `production_id` | `shots`, `people` |
| `cast_availability` | `id` | `production_id` | `people` |

### 2.4 People, bookings, call sheet config

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `people` | `id` | `production_id` | `productions` |
| `bookings` | `id` | `production_id` | `people`, `shoot_days` (nullable) |
| `key_contacts` | `id` | `production_id` | `productions` |
| `call_sheets` | `id` | `production_id` | `shoot_days`, `shoot_day_units` (nullable), `documents` (`generated_document_id`, nullable) |

### 2.5 Budget: categories, chart of accounts, lines, links

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `budget_categories` | `id` | `production_id` | `productions` |
| `budget_accounts` | `id` | `production_id` | `productions`, self (`parent_account_id`, nullable) |
| `budget_items` | `id` | `production_id` | `productions`, `budget_categories` (nullable), `budget_accounts` (nullable) |
| `budget_item_details` | `id` | indirect | `budget_items` (1:1, `UNIQUE(budget_item_id)`) |
| `expenses` | `id` | `production_id` | `productions`, `budget_categories` (nullable), `budget_accounts` (nullable), `vendors` (nullable) |
| `expense_transaction_details` | `id` | indirect | `expenses` |
| `budget_item_expense_links` | `id` | `production_id` + FKs | `budget_items`, `expenses` |

### 2.6 Vendors, invoices, POs, expense links

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `vendors` | `id` | `production_id` | `productions` |
| `vendor_purchase_orders` | `id` | `production_id` | `vendors` |
| `vendor_invoices` | `id` | `production_id` | `vendors`, `vendor_purchase_orders` (`po_id`, nullable) |
| `vendor_invoice_expenses` | `id` | indirect | `vendor_invoices`, `expenses` |
| `vendor_purchase_order_expenses` | `id` | indirect | `vendor_purchase_orders`, `expenses` |

### 2.7 Equipment registry & lists

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `equipment` | `id` | `production_id` | `productions`, `shoot_days` (nullable); columns `vendor_id`, `invoice_id` are logical links to `vendors` / `vendor_invoices` (not all enforced as FK in migrations) |
| `equipment_lists` | `id` | `production_id` | `productions`, `shoot_days` (nullable) |
| `equipment_list_items` | `id` | indirect | `equipment_lists`, `equipment` |
| `equipment_terms` | `id` | `production_id` | `productions` |

### 2.8 Tasks

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `production_task_sections` | `id` | `production_id` | `productions` |
| `production_tasks` | `id` | `production_id` | `productions`, self (`parent_task_id`), `production_task_sections` (nullable), `vendor_invoices` (`vendor_invoice_id`, nullable), `equipment` (`equipment_id`, nullable) |

### 2.9 Deliverables, music, checklists

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `deliverables` | `id` | `production_id` | `productions` |
| `technical_specs` | `id` | indirect | `deliverables` |
| `music_tracks` | `id` | `production_id` | `productions` |
| `clearances` | `id` | `production_id` | `music_tracks` (and other `type`/`item_id` semantics per app) |
| `checklist_items` | `id` | `production_id` | `productions` |

### 2.10 Documents & script storage

| Table | PK | Scoped by | Important FKs |
|-------|----|-----------|---------------|
| `documents` | `id` | `production_id` (nullable in schema, but production export filters by target production) | optional `entity_type` / `entity_id`; **`file_path`** — see [§5](#5-document--file-path-audit) |
| `cue_sheets` | `id` | `production_id` | `documents` (`document_id`, nullable) |
| `script_documents` | `id` | `production_id` | `documents` (`document_id`, nullable) |

### 2.11 Reporting & display layers (still canonical user data)

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

## 3. Proposed topological import order (v1)

Inserts must respect SQLite FKs (`PRAGMA foreign_keys = ON` in [`src/lib/db/client.ts`](../src/lib/db/client.ts)). Below: **parents before children**. Where a table has a **self-FK**, sort rows topologically (same approach as `duplicateProduction` for `production_tasks`).

**Layer 0 — root**

1. `productions`

**Layer 1 — no dependencies on other included tables (except productions)**

2. `units`  
3. `people`  
4. `locations`  
5. `shoot_days`  
6. `budget_categories`  
7. `budget_accounts` — insert **parents before children** (`parent_account_id`)  
8. `vendors`  
9. `key_contacts`  
10. `checklist_items`  
11. `equipment_terms`  
12. `music_tracks`  
13. `production_task_sections`  
14. `deliverables`  
15. `fringe_rules`  
16. `contingency_rules`  
17. `cost_report_groups`  
18. `production_totals`  
19. `production_crew_hierarchy_configs`  

**Layer 2 — depend on layer 1**

20. `scenes` (needs `locations` if `location_id` set)  
21. `shoot_day_units` (`shoot_days`, `units`)  
22. `vendor_purchase_orders` (`vendors`)  
23. `bookings` (`people`, optional `shoot_days`)  
24. `cast_availability` (`people`)  

**Layer 3**

25. `shots` (`scenes`)  
26. `location_scene` (`locations`, `scenes`)  
27. `stripboard_items` (`shoot_days`, `scenes`)  
28. `stripboard_strips` (`shoot_days`, optional `shoot_day_units`, `scenes`, `shots`)  
29. `scene_cast` (`scenes`, `people`)  
30. `shot_cast` (`shots`, `people`)  
31. `budget_items` (`budget_categories`, optional `budget_accounts`)  
32. `vendor_invoices` (`vendors`, optional `vendor_purchase_orders` via `po_id`)  
33. `expenses` (optional `budget_categories`, `budget_accounts`, `vendors`)  
34. `technical_specs` (`deliverables`)  
35. `clearances` (`music_tracks` / `item_id` per type)  

**Layer 4**

36. `budget_item_details` (`budget_items`)  
37. `expense_transaction_details` (`expenses`)  
38. `budget_item_expense_links` (`budget_items`, `expenses`)  
39. `vendor_invoice_expenses` (`vendor_invoices`, `expenses`)  
40. `vendor_purchase_order_expenses` (`vendor_purchase_orders`, `expenses`)  
41. `equipment` (optional `shoot_days`, optional `vendors` / `vendor_invoices` by id)  
42. `equipment_lists` (optional `shoot_days`)  
43. `equipment_list_items` (`equipment_lists`, `equipment`)  
44. `production_tasks` — insert **parents before children** (`parent_task_id`); after sections, invoices, equipment for optional FKs  

**Layer 5 — scope / rollup join tables**

45. `fringe_rule_scopes` (`fringe_rules`, `budget_accounts`)  
46. `contingency_rule_scopes` (`contingency_rules`, `budget_accounts`)  
47. `cost_report_group_accounts` (`cost_report_groups`, `budget_accounts`)  
48. `production_total_accounts` (`production_totals`, `budget_accounts`)  

**Layer 6 — documents and dependents**

49. `documents` — rows for this `production_id` with `deleted_at IS NULL`; **files** copied and `file_path` rewritten on disk (see [§5](#5-document--file-path-audit))  
50. `cue_sheets` (optional `documents`)  
51. `call_sheets` (optional `documents` for `generated_document_id`)  
52. `script_documents` (optional `documents`)  

**Cycles:** None identified in the schema graph for **included** tables, aside from **self-edges** (`budget_accounts`, `production_tasks`) handled by intra-table ordering.

**Awkward edges:**

- `vendor_invoices.po_id` → insert POs before invoices when `po_id` is non-null.  
- `call_sheets.generated_document_id` → target `documents` row must exist before the `call_sheets` row.  
- `documents.entity_id` may reference entities in multiple tables; with **UUID preservation**, IDs stay valid as long as those entity rows are imported. If future flows remap IDs, entity pointers need the same mapping as [`duplicateProduction.mapEntityId`](../src/lib/db/duplicateProduction.ts).

---

## 4. Tombstone / export filtering rules

### 4.1 `deleted_at` (soft delete)

Omit rows with **`deleted_at IS NOT NULL`** from export for every table that has the column. Verified from migrations / usage patterns for included tables (not exhaustive column-by-column in app code — apply the rule uniformly unless a table explicitly documents otherwise).

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
