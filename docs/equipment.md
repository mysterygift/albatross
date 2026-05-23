# Equipment

This document is both a **user guide** (how to use the Equipment features) and a **developer guide** (data model, repositories, services, and integrations). It describes the production-scoped equipment system: registry, lists and checklists, PDF/CSV export and import, return reminders, and invoice-driven ingestion.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Key features](#2-key-features)
- [3. Fundamental workflows](#3-fundamental-workflows)
- [4. Relationships to other parts of the app](#4-relationships-to-other-parts-of-the-app)

**Part II — Developer guide**

- [5. Architecture and file layout](#5-architecture-and-file-layout)
- [6. Data model](#6-data-model)
- [7. Repositories and services](#7-repositories-and-services)
- [8. Key flows](#8-key-flows)
- [9. Query keys and invalidation](#9-query-keys-and-invalidation)

**Part III — Reference**

- [10. Database migrations](#10-database-migrations)
- [11. Router and navigation](#11-router-and-navigation)
- [12. UI polish (P1) and conventions](#12-ui-polish-p1-and-conventions)
- [13. Gaps and future work](#13-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Equipment is the production-scoped system for tracking gear (owned, purchased, rented): a **registry** of items with **quantity** (count of identical units), categories, status, department (aligned to Crew Hierarchy), vendor/invoice linkage, rental windows, and replacement value; **equipment lists** for day or department kits with **checklist state** (checked out / checked back in); **export** (PDF, CSV) and **import** (CSV with review); and **invoice-driven ingestion** so equipment can be created or linked from vendor invoices.
- **Route:** `/equipment` — single page with two main tabs: **Registry** and **Equipment Lists**.
- **Navigation:** "Equipment" in the main app nav (Film icon). See [src/app/navigation.ts](src/app/navigation.ts).
- **Context:** A **current production** must be selected. All equipment data is scoped by `production_id`.

### 2. Key features

| Feature | Description |
|--------|-------------|
| **Equipment registry** | Master list of equipment items. Fields: name, **quantity** (count of identical units, default 1), category, source (owned/purchased/rented), status, department, vendor (text + optional vendor_id), invoice_id, rental dates, serial number, replacement value, notes. Each item has a stable `item_uuid`. **Import CSV** bulk-imports from a user file with column mapping (name, quantity, serial, replacement value). |
| **Return reminder tasks** | Rented equipment with a return due date gets one linked task in Tasks ("Return equipment — {name}"). Marking the item returned or clearing the due date completes/removes the task. |
| **Equipment lists** | Named lists (e.g. "Day 4 Lighting", "Main Unit Camera") with optional shoot day and department. Lists reference registry items; they do not duplicate them. |
| **Checklist state** | Each list item has **OUT** and **IN** toggles for on-set check-out/check-in. This state lives only on the list item, not on the registry. Rows are highlighted when checked; the checklist table is scrollable for long lists. |
| **PDF export** | Export any equipment list as a printable checklist (production name, list name, department, shoot day, timestamp; table with OUT/IN checkboxes, name, category, serial, UUID, notes). |
| **CSV export** | Export a list as CSV with stable columns (item_uuid, name, category, department, source_type, vendor, rental dates, serial_number, notes, status, replacement_value). |
| **CSV import** | Import CSV into a list. Rows are matched to the registry by `item_uuid` only. Rows with missing or unknown UUID are flagged as **new**; user must confirm creation before new equipment is added. No silent creation. |
| **Invoice-driven ingestion** | From **Budget → Vendors →** a vendor’s **Invoices** table, use **Add equipment from invoice** (Package icon) on an invoice. Add one or more rows; for each row choose **Create new** (prefilled with vendor_id and invoice_id), **Link to existing** (set vendor_id/invoice_id on an existing item), or **Skip**. Rented items created this way remain eligible for return reminders. |

### 3. Fundamental workflows

**Managing the registry**

1. Go to **Equipment** and open the **Registry** tab.
2. Use filters (category, source, department, status) and search (name, UUID, serial) to find items. **Department** options come from the production’s **Crew Hierarchy** (same as Crew Manager); list and equipment department are aligned to that source of truth.
3. **Add Equipment** (top right) to create a new item. Set **Quantity** (number of identical units; default 1, minimum 1) for items like "8× Sandbags" or "6× V-Lock Batteries". Optionally set vendor, rental dates, and return due date (which creates a return reminder task).
4. The registry table shows: Name, **Qty** (quantity, right-aligned), Category, Department, Source, Status, Vendor, Rental Window (combined start/return dates), Replacement Value (right-aligned), and Actions. Category, source, and status use readable labels (e.g. Camera Accessories, Rented, Planned). Items linked to an invoice show **(Invoice INV-xxx)** under the vendor name.
5. Edit or archive items from the table. Archiving soft-deletes the item and its linked reminder task.
6. **Import CSV** (next to Add Equipment) opens a system file picker, then a column-mapping step with a preview of the first five rows. Map CSV columns to **Name** (required), **Quantity**, **Serial number**, and **Replacement value**. Confirm to bulk-create items (category Other, source Owned, status Planned; quantity defaults to 1 if unmapped). If you map **Serial number**, rows that match an existing item by **both** name and serial update that item; otherwise new items are created.
7. Empty state: "Add equipment to your production registry." with an **Add Equipment** button.

**Using equipment lists**

1. Open the **Equipment Lists** tab.
2. **New Equipment List** (top right) to create a list. Set name, optional **shoot day**, optional **department** (from the same Crew Hierarchy options as the registry), and notes. If you select a department that matches registry items, you can tick **Generate from department** to add all matching equipment to the new list (no silent creation; you confirm by creating).
3. Open a list to see its items. **Add from registry** to attach existing equipment (no duplication).
4. Use **OUT** / **IN** on each row for checklist state (larger check targets; rows highlight when checked). Reorder with up/down; remove items from the list (registry unchanged).
5. **Export PDF** and **Export CSV** are grouped in the list view; **Import CSV** to add rows (with match/new review and optional new-equipment creation).
6. Empty state: "No equipment lists yet." / "Create a list for a shoot day or department kit." with a **New Equipment List** button.

**Linking equipment to an invoice**

1. Go to **Budget → Vendors** and open a vendor.
2. In **Invoices**, click the Package icon on an invoice (**Add equipment from invoice**).
3. Add rows; for each row choose Create new, Link to existing (pick from production equipment), or Skip.
4. Apply to create/link; new items are tied to that invoice and vendor. Rented items with return due date get return reminders.

### 4. Relationships to other parts of the app

| Area | Relationship |
|------|---------------|
| **Tasks (Readiness)** | Rented equipment with `return_due_date` has a single linked task (`equipment_id`). Completing the task (or marking equipment returned) is reflected in both places. |
| **Vendors / Invoices** | Equipment can have `vendor_id` and `invoice_id`. Invoice ingestion creates or links equipment from **Vendor detail → Invoices** (Package action). Vendors and invoices are not modified by equipment flows. |
| **Crew Hierarchy** | Equipment and list **department** options come from the production’s effective crew hierarchy (Settings → Crew structure or default). Return reminder tasks map equipment department to task assigned department via the hierarchy. No separate equipment-only department list. |
| **Schedule (shoot days)** | Lists can optionally be tied to a shoot day. Shoot day dropdowns use `listShootDaysByProduction`. Equipment registry has optional `shoot_day_id` (legacy; lists are the primary day-facing construct). |
| **Shot list** | **Equipment terms** (e.g. LENS, SUPPORT) are used on the shot list for lens/support fields; stored in `equipment_terms` and managed via `equipment-terms` repository. They are separate from the equipment registry. |
| **Budget** | Rental/purchase expenses and vendor spend are in the budget; equipment links to vendors/invoices for provenance but does not drive budget totals. |
| **Duplicate production** | **Equipment terms** are copied when duplicating a production. The **equipment** table and **equipment_lists** are **not** copied; the new production starts with an empty registry and no lists. |

---

## Part II — Developer guide

### 5. Architecture and file layout

| Path | Purpose |
|------|---------|
| [src/features/equipment/page.tsx](src/features/equipment/page.tsx) | Single Equipment page: Registry tab (filters, table with readable labels and vendor/invoice provenance, add/edit/archive, **registry CSV import**, reminder indicator) and Equipment Lists tab (list index, list detail, create with optional “generate from department”, add from registry, checklist with OUT/IN and row highlighting, reorder, PDF/CSV export and import, create-from-CSV dialog). |
| [src/features/equipment/ImportEquipmentRegistryCsvDialog.tsx](src/features/equipment/ImportEquipmentRegistryCsvDialog.tsx) | Registry CSV import: column mapping modal, confirm step, bulk create/update via `createEquipmentWithReminderTask` / `updateEquipmentWithReminderTask`. |
| [src/features/equipment/formatEquipmentLabel.ts](src/features/equipment/formatEquipmentLabel.ts) | Display helpers: `formatEquipmentLabel(value)` for generic enum-style values; `formatEquipmentCategoryLabel(category)` for canonical equipment categories (e.g. DIT / Video Village, Storage / Cases). Category labels are the single source of truth for UI. |
| [src/lib/db/repositories/equipment.ts](src/lib/db/repositories/equipment.ts) | Equipment registry CRUD: list by production, get by id, create, update, soft-delete; buildCreateEquipmentStatements / buildUpdateEquipmentStatements for transactional use. |
| [src/lib/db/repositories/equipmentLists.ts](src/lib/db/repositories/equipmentLists.ts) | Equipment lists and list items: list lists by production, get list by id, create/update/delete list; list items by list, add item, update item, remove item, getMaxSortOrderForList, reorderEquipmentListItems. |
| [src/lib/db/repositories/equipment-terms.ts](src/lib/db/repositories/equipment-terms.ts) | Equipment terms (LENS, SUPPORT etc.) for shot list; list by production and type, upsert. Not the same as the equipment registry. |
| [src/lib/db/equipmentReturnReminderService.ts](src/lib/db/equipmentReturnReminderService.ts) | Orchestration: createEquipmentWithReminderTask, updateEquipmentWithReminderTask, archiveEquipmentWithReminderTask. Creates/updates/deletes the single linked production_task when equipment is reminder-eligible (rented + return_due_date + status !== returned). |
| [src/lib/db/equipmentInvoiceIngestionService.ts](src/lib/db/equipmentInvoiceIngestionService.ts) | Invoice-driven ingestion: createEquipmentFromInvoiceContext (create with vendor_id/invoice_id via createEquipmentWithReminderTask), linkExistingEquipmentToInvoice (updateEquipment vendor_id/invoice_id). |
| [src/lib/equipment/csv.ts](src/lib/equipment/csv.ts) | CSV: list export/import (fixed headers, match by item_uuid); registry import (parseCsvRaw, applyColumnMapping, matchRegistryImportRows by name+serial, registryRowToCreateData / registryRowToUpdatePatch). |
| [src/lib/pdf/equipmentListPdf.ts](src/lib/pdf/equipmentListPdf.ts) | PDF checklist: generateEquipmentListPdf (pdf-lib, A4 portrait, header + table with OUT/IN checkboxes). Read-only. |
| [src/features/budget/vendors/IngestEquipmentFromInvoiceModal.tsx](src/features/budget/vendors/IngestEquipmentFromInvoiceModal.tsx) | Modal from vendor invoice: rows with action create/link/skip; create uses prefilled form and createEquipmentFromInvoiceContext; link uses equipment picker and linkExistingEquipmentToInvoice. |
| [src/features/budget/vendors/VendorDetailPage.tsx](src/features/budget/vendors/VendorDetailPage.tsx) | Renders invoice table and passes onAddEquipment to open IngestEquipmentFromInvoiceModal. |
| [src/lib/db/seed/demoEquipmentSeed.ts](src/lib/db/seed/demoEquipmentSeed.ts) | **Demo seed (D1):** ~120 registry items (camera, lenses, lighting, grip, sound, DIT, production), return reminder tasks for rented items, and 5 equipment lists tied to shoot days with checklist state. Runs only for singleton demo production after seedDemoVendorFinance. Links to existing demo vendors/invoices (Panavision London, Lumen Grip & Light, Signal Sound, Keystone Transport). |

### 6. Data model

**Equipment (registry)** — `equipment` table

- `id`, `production_id`, `name`, **`quantity`** (integer, default 1, ≥1), `source_type` ('owned'|'purchased'|'rented'), `vendor` (text), `shoot_day_id`, `notes`, `item_uuid` (unique per production), `category`, `status`, `department`, `vendor_id`, `invoice_id`, `rental_start_date`, `return_due_date`, `returned_at`, `replacement_value`, `serial_number`, soft-delete timestamps.
- **Quantity** is the count of identical units (e.g. 8× Sandbags). Default 1; validation enforces ≥1 in app and DB (CHECK). Omitted in create flows defaults to 1.
- **Category** uses canonical values (e.g. `camera`, `lenses`, `camera_accessories`, `wireless_systems`, `dit_video_village`, `production_logistics`, `storage_cases`); see `EQUIPMENT_CATEGORY_VALUES` and `EQUIPMENT_CATEGORY_LEGACY_MAP` in types. Display via `formatEquipmentCategoryLabel`.
- **Department** is aligned to the production’s **Crew Hierarchy**: equipment and list department options come from `getResolvedCrewDepartmentNames(effectiveHierarchy)`. Stored as crew department name; reminder tasks map to task `assigned_department` via `getResolvedTaskDepartmentsForCrewDepartment`.
- Unique index: `(production_id, item_uuid)`.

**EquipmentList** — `equipment_lists` table

- `id`, `production_id`, `shoot_day_id` (optional), `name`, `department`, `notes`, soft-delete timestamps.

**EquipmentListItem** — `equipment_list_items` table

- `id`, `equipment_list_id`, `equipment_id` (FK to equipment), `sort_order`, `quantity` (integer ≥ 1, default 1 — units to pack on this list), `checked_out` (0/1), `checked_back_in` (0/1), `notes`, timestamps. No soft-delete; hard delete on remove.

**ProductionTask (Tasks)** — link to equipment

- `production_tasks.equipment_id` references `equipment(id)` ON DELETE SET NULL. Unique partial index so at most one active task per equipment item. Used for return reminders.

**EquipmentTerm** — `equipment_terms` table

- Used by shot list (LENS, SUPPORT types). Separate from the equipment registry; see [src/lib/db/repositories/equipment-terms.ts](src/lib/db/repositories/equipment-terms.ts).

Types and constants: [src/lib/db/types.ts](src/lib/db/types.ts) — `Equipment`, `EquipmentList`, `EquipmentListItem`, `EquipmentCategory`, `EQUIPMENT_CATEGORY_VALUES`, `EquipmentStatus`, `EQUIPMENT_STATUS_VALUES`, `EquipmentTerm`.

### 7. Repositories and services

**equipment.ts**

- `listEquipmentByProduction(productionId)`, `getEquipmentById(equipmentId)`, `createEquipment(data)`, `updateEquipment(id, patch)`, `softDeleteEquipment(id)`.
- **Quantity:** `CreateEquipmentData` and create/update APIs accept optional `quantity`; default 1 when omitted. `rowToEquipment` normalises invalid/missing quantity to 1. DB enforces `quantity >= 1`.
- `CreateEquipmentData` includes `vendor_id`, `invoice_id`; used by reminder service and invoice ingestion.
- `buildCreateEquipmentStatements` / `buildUpdateEquipmentStatements` for use in transactions (e.g. with task creation).

**equipmentLists.ts**

- Lists: `listEquipmentListsByProduction`, `getEquipmentListById`, `createEquipmentList`, `updateEquipmentList`, `deleteEquipmentList` (soft).
- Items: `listEquipmentListItems` (ordered by sort_order), `addEquipmentItemToList` (optional `quantity`, default 1), `updateEquipmentListItem` (including `quantity` patch), `removeEquipmentItemFromList`, `getMaxSortOrderForList`, `reorderEquipmentListItems`.
- Writes use outbox where applicable; reorder uses runInSerializedTransaction + executeBatch.

**equipmentReturnReminderService.ts**

- `isReminderEligible(equipment)`: rented + return_due_date + status !== 'returned'.
- `createEquipmentWithReminderTask(data)`: if eligible, creates equipment and task in one transaction; else creates equipment only. Task `assigned_department` is derived from equipment department via the production’s **effective crew hierarchy** (`getResolvedTaskDepartmentsForCrewDepartment`); fallback "Production".
- `updateEquipmentWithReminderTask(id, patch, current)`: updates equipment and creates/updates/completes/deletes linked task as needed. Uses same hierarchy for task department mapping.
- `archiveEquipmentWithReminderTask(id)`: soft-deletes equipment and linked task in one transaction.

**equipmentInvoiceIngestionService.ts**

- `createEquipmentFromInvoiceContext(productionId, vendorId, invoiceId, row)`: builds CreateEquipmentData with vendor_id and invoice_id, calls createEquipmentWithReminderTask.
- `linkExistingEquipmentToInvoice(equipmentId, vendorId, invoiceId)`: updateEquipment with vendor_id and invoice_id only.

**equipment/csv.ts**

- Export: `exportEquipmentListToCsv(listItems, equipmentById)` — registry data per item (includes category); list-item `quantity` in final column; notes from list item or equipment.
- Import: `parseEquipmentListCsv(csvText)` → `{ rows, errors }`; `matchParsedRowsToRegistry(rows, productionEquipment)` → `{ matched, new }` by item_uuid only. Optional `quantity` column defaults to 1 when missing.
- `csvRowToCreateEquipmentData(row, productionId)` for creating new equipment from CSV new rows (used with createEquipmentWithReminderTask in UI). Category normalised via `normalizeCategory` (legacy map + canonical list); department via `normalizeDepartment` (legacy → crew name). New equipment gets quantity default 1.

### 8. Key flows

- **Create equipment (registry):** Equipment page → create mutation → createEquipmentWithReminderTask. If rented with return_due_date, a production_task is created in the same transaction.
- **Update/archive equipment:** updateEquipmentWithReminderTask / archiveEquipmentWithReminderTask keep the linked task in sync.
- **List CRUD:** equipmentLists repo; list items reference equipment by equipment_id. Checklist state (checked_out, checked_back_in) only on list items.
- **PDF export:** generateEquipmentListPdf(list, listItems, equipmentById, productionName, shootDayLabel) → Uint8Array; UI triggers save via saveFileWithDialog.
- **CSV export:** exportEquipmentListToCsv(items, equipmentById) → string; save via saveFileWithDialog.
- **CSV import (list):** Parse file → matchParsedRowsToRegistry; review modal shows matched vs new; for new, user confirms via CreateEquipmentFromCsvRowDialog (createEquipmentWithReminderTask); then add matched + created to list (skip already-on-list).
- **CSV import (registry):** `pickCsvFileForImport` → `readTextFile` → `parseCsvRaw` → column mapping UI → `applyColumnMapping` → `matchRegistryImportRows` (name+serial when serial mapped) → bulk `createEquipmentWithReminderTask` / `updateEquipmentWithReminderTask`.
- **Invoice ingestion:** Vendor detail → invoice row Package button → IngestEquipmentFromInvoiceModal; create rows use createEquipmentFromInvoiceContext; link rows use linkExistingEquipmentToInvoice.
- **Demo seed (D1):** For the singleton demo production only, `seedDemoEquipment` runs after `seedDemoVendorFinance`. It inserts ~120 equipment items (realistic TV drama/commercial kit), creates return reminder tasks for rented items with `return_due_date`, and creates 5 equipment lists (e.g. Camera Package – Shoot Day 1, Lighting Package – Night Exterior) with 15–30 items each and sample OUT/IN checklist state. Selected list rows include explicit pack quantities (e.g. V-Lock batteries ×3, Quasar tubes ×6 over registry stock) so over-stock warnings are visible in demo lists. Equipment links to existing demo vendors (Panavision London, Lumen Grip & Light, Signal Sound Services, Keystone Transport) and invoices where applicable. PDF and CSV export from these lists produce meaningful data.

### 9. Query keys and invalidation

| Key | Invalidation |
|-----|---------------|
| `['equipment', productionId]` | After create/update/archive equipment; after CSV import new items; after invoice ingestion create/link. |
| `['tasks', productionId]` | After create/update/archive equipment (reminder task changes). |
| `['equipmentLists', productionId]` | After create/update/delete list. |
| `['equipmentList', listId]` | After update list. |
| `['equipmentListItems', listId]` | After add/update/remove/reorder items; after CSV import add to list. |
| `['shootDays', productionId]` | Used by list forms; invalidated by schedule changes elsewhere. |
| `['vendors', productionId]` | Used by equipment form vendor picker. |
| `['vendorInvoices', productionId]` | Used on Equipment page to resolve invoice numbers for Vendor column when equipment has `invoice_id`. |
| `['equipment-terms', productionId, type]` | Shot list equipment terms (LENS, SUPPORT); invalidated when terms change. |

---

## Part III — Reference

### 10. Database migrations

| Migration | Content |
|-----------|---------|
| 0044_equipment_registry.sql | Equipment table: production_id, name, source_type, vendor, shoot_day_id, notes, item_uuid, category, status, department, vendor_id, invoice_id, rental dates, returned_at, replacement_value, serial_number; unique (production_id, item_uuid). |
| 0045_production_tasks_equipment_id.sql | Adds production_tasks.equipment_id FK to equipment; unique partial index for one task per equipment. |
| 0046_equipment_lists.sql | equipment_lists (production_id, shoot_day_id, name, department, notes); equipment_list_items (equipment_list_id, equipment_id, sort_order, checked_out, checked_back_in, notes). |
| 0047_equipment_quantity.sql | Adds `quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1)` to equipment. Existing rows backfilled to 1. |
| 0048_equipment_category_normalisation.sql | Updates equipment.category from legacy values to canonical grouped categories (e.g. camera_body→camera, lens→lenses, wireless_video/wireless_fiz→wireless_systems, dit/monitor→dit_video_village). |
| 0049_equipment_department_crew_alignment.sql | Normalises equipment.department and equipment_lists.department to crew hierarchy names (e.g. Electrical→Lighting, DIT/Video→Camera); unknown values set to NULL. |
| 0072_equipment_list_item_quantity.sql (Tauri) / 0009 (Postgres) | Adds `quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1)` to `equipment_list_items`. List-item quantity = units to pack on the kit. |

Equipment terms (shot list) live in an earlier migration (0006_shots_rich_props_equipment_terms.sql).

### 11. Router and navigation

- **Route:** `/equipment` → `EquipmentPage` ([src/app/router.tsx](src/app/router.tsx)).
- **Nav:** Top-level "Equipment" (Film icon) in [src/app/navigation.ts](src/app/navigation.ts).

### 12. UI polish (P1) and conventions

- **Display labels:** Category uses `formatEquipmentCategoryLabel` (canonical labels, e.g. "DIT / Video Village", "Storage / Cases"). Source and status use `formatEquipmentLabel`. Stored values are machine-friendly (snake_case); labels are for display only.
- **Registry table:** Column order is Name, **Qty** (quantity, right-aligned), Category, Department, Source, Status, Vendor, Rental Window, Replacement Value, Actions. Quantity and replacement value are right-aligned; missing values render as "—". Rental window combines start and return dates in one column.
- **Quantity (user):** Add/Edit equipment form has a **Quantity** field (integer, min 1, default 1). Use it for items that represent multiple identical units (e.g. 8× Sandbags, 6× V-Lock Batteries). Validation rejects zero or negative values.
- **Status pills:** Equipment status uses small colour-coded pills: Planned (muted), Active (accent), Returned (neutral), Lost (destructive), Damaged (warning style). Readable in dark theme.
- **Vendor/invoice provenance:** When an item has `invoice_id`, the Vendor column shows the vendor name and a second line "(Invoice INV-xxx)" so invoice-driven items are clearly identifiable.
- **List workflows:** Creating or editing a list supports optional shoot day and **department** (from Crew Hierarchy dropdown). When creating a list, if the user selects a department that matches registry items, a **Generate from department** option appears; if checked, the new list is created and all equipment with that department are added (user confirms by creating). No silent auto-creation.
- **Checklist UI:** Columns are labelled OUT and IN; check targets are larger; rows are highlighted when OUT and/or IN are checked; the checklist table is scrollable for long lists.
- **Empty states and actions:** Registry empty state offers "Add equipment to your production registry." with an Add Equipment button; lists empty state offers "No equipment lists yet." and "Create a list for a shoot day or department kit." with a New Equipment List button. Add Equipment and New Equipment List live top-right in their tabs; PDF and CSV export are grouped in list detail view.

### 13. Gaps and future work

- **Duplicate production:** Equipment and equipment lists are not copied when duplicating a production; only equipment_terms are. Copying registry/lists could be added later.
- **OCR / invoice line items:** Invoice-driven ingestion is manual (user-entered rows). If invoice line items exist in the future, the ingestion flow could be adapted to use them as candidates.
- **Barcode/scanner:** No barcode or scanner workflows yet.
- **Fuzzy matching:** List CSV import matches by `item_uuid` only; registry CSV import matches by name + serial when serial is mapped. Invoice flows use explicit link.
- **PDF/CSV:** No invoice-specific PDF export; registry CSV import is supported on the Registry tab.

---

*This document reflects the equipment system through quantity support, category normalisation, department–crew alignment, invoice-driven ingestion, and Equipment Polish P1. For vendor/invoice data model and reminder tasks, see [vendors.md](vendors.md) and the Tasks (Readiness) docs. For Crew Hierarchy, see [crew-manager.md](crew-manager.md).*
