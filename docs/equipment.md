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
- [12. Gaps and future work](#12-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Equipment is the production-scoped system for tracking gear (owned, purchased, rented): a **registry** of items with categories, status, vendor/invoice linkage, rental windows, and replacement value; **equipment lists** for day or department kits with **checklist state** (checked out / checked back in); **export** (PDF, CSV) and **import** (CSV with review); and **invoice-driven ingestion** so equipment can be created or linked from vendor invoices.
- **Route:** `/equipment` — single page with two main tabs: **Registry** and **Equipment Lists**.
- **Navigation:** "Equipment" in the main app nav (Film icon). See [src/app/navigation.ts](src/app/navigation.ts).
- **Context:** A **current production** must be selected. All equipment data is scoped by `production_id`.

### 2. Key features

| Feature | Description |
|--------|-------------|
| **Equipment registry** | Master list of equipment items. Fields: name, category, source (owned/purchased/rented), status, department, vendor (text + optional vendor_id), invoice_id, rental dates, serial number, replacement value, notes. Each item has a stable `item_uuid`. |
| **Return reminder tasks** | Rented equipment with a return due date gets one linked task in Tasks ("Return equipment — {name}"). Marking the item returned or clearing the due date completes/removes the task. |
| **Equipment lists** | Named lists (e.g. "Day 4 Lighting", "Main Unit Camera") with optional shoot day and department. Lists reference registry items; they do not duplicate them. |
| **Checklist state** | Each list item has **Out** and **Back in** toggles for on-set check-out/check-in. This state lives only on the list item, not on the registry. |
| **PDF export** | Export any equipment list as a printable checklist (production name, list name, department, shoot day, timestamp; table with OUT/IN checkboxes, name, category, serial, UUID, notes). |
| **CSV export** | Export a list as CSV with stable columns (item_uuid, name, category, department, source_type, vendor, rental dates, serial_number, notes, status, replacement_value). |
| **CSV import** | Import CSV into a list. Rows are matched to the registry by `item_uuid` only. Rows with missing or unknown UUID are flagged as **new**; user must confirm creation before new equipment is added. No silent creation. |
| **Invoice-driven ingestion** | From **Budget → Vendors →** a vendor’s **Invoices** table, use **Add equipment from invoice** (Package icon) on an invoice. Add one or more rows; for each row choose **Create new** (prefilled with vendor_id and invoice_id), **Link to existing** (set vendor_id/invoice_id on an existing item), or **Skip**. Rented items created this way remain eligible for return reminders. |

### 3. Fundamental workflows

**Managing the registry**

1. Go to **Equipment** and open the **Registry** tab.
2. Use filters (category, source, department, status) and search (name, UUID, serial) to find items.
3. **Add equipment** to create a new item; optionally set vendor, rental dates, and return due date (which creates a return reminder task).
4. Edit or archive items from the table. Archiving soft-deletes the item and its linked reminder task.

**Using equipment lists**

1. Open the **Equipment Lists** tab.
2. **New list** to create a list (name, optional shoot day, optional department, notes).
3. Open a list to see its items. **Add from registry** to attach existing equipment (no duplication).
4. Use **Out** / **Back in** on each row for checklist state. Reorder with up/down; remove items from the list (registry unchanged).
5. **Export PDF** for a printable checklist; **Export CSV** to save the list as CSV; **Import CSV** to add rows (with match/new review and optional new-equipment creation).

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
| **Schedule (shoot days)** | Lists can optionally be tied to a shoot day. Shoot day dropdowns use `listShootDaysByProduction`. Equipment registry has optional `shoot_day_id` (legacy; lists are the primary day-facing construct). |
| **Shot list** | **Equipment terms** (e.g. LENS, SUPPORT) are used on the shot list for lens/support fields; stored in `equipment_terms` and managed via `equipment-terms` repository. They are separate from the equipment registry. |
| **Budget** | Rental/purchase expenses and vendor spend are in the budget; equipment links to vendors/invoices for provenance but does not drive budget totals. |
| **Duplicate production** | **Equipment terms** are copied when duplicating a production. The **equipment** table and **equipment_lists** are **not** copied; the new production starts with an empty registry and no lists. |

---

## Part II — Developer guide

### 5. Architecture and file layout

| Path | Purpose |
|------|---------|
| [src/features/equipment/page.tsx](src/features/equipment/page.tsx) | Single Equipment page: Registry tab (filters, table, add/edit/archive, reminder indicator) and Equipment Lists tab (list index, list detail, add from registry, checklist, reorder, PDF/CSV export and import, create-from-CSV dialog). |
| [src/lib/db/repositories/equipment.ts](src/lib/db/repositories/equipment.ts) | Equipment registry CRUD: list by production, get by id, create, update, soft-delete; buildCreateEquipmentStatements / buildUpdateEquipmentStatements for transactional use. |
| [src/lib/db/repositories/equipmentLists.ts](src/lib/db/repositories/equipmentLists.ts) | Equipment lists and list items: list lists by production, get list by id, create/update/delete list; list items by list, add item, update item, remove item, getMaxSortOrderForList, reorderEquipmentListItems. |
| [src/lib/db/repositories/equipment-terms.ts](src/lib/db/repositories/equipment-terms.ts) | Equipment terms (LENS, SUPPORT etc.) for shot list; list by production and type, upsert. Not the same as the equipment registry. |
| [src/lib/db/equipmentReturnReminderService.ts](src/lib/db/equipmentReturnReminderService.ts) | Orchestration: createEquipmentWithReminderTask, updateEquipmentWithReminderTask, archiveEquipmentWithReminderTask. Creates/updates/deletes the single linked production_task when equipment is reminder-eligible (rented + return_due_date + status !== returned). |
| [src/lib/db/equipmentInvoiceIngestionService.ts](src/lib/db/equipmentInvoiceIngestionService.ts) | Invoice-driven ingestion: createEquipmentFromInvoiceContext (create with vendor_id/invoice_id via createEquipmentWithReminderTask), linkExistingEquipmentToInvoice (updateEquipment vendor_id/invoice_id). |
| [src/lib/equipment/csv.ts](src/lib/equipment/csv.ts) | CSV for lists: exportEquipmentListToCsv, parseEquipmentListCsv, matchParsedRowsToRegistry (by item_uuid), csvRowToCreateEquipmentData, normalizers. |
| [src/lib/pdf/equipmentListPdf.ts](src/lib/pdf/equipmentListPdf.ts) | PDF checklist: generateEquipmentListPdf (pdf-lib, A4 portrait, header + table with OUT/IN checkboxes). Read-only. |
| [src/features/budget/vendors/IngestEquipmentFromInvoiceModal.tsx](src/features/budget/vendors/IngestEquipmentFromInvoiceModal.tsx) | Modal from vendor invoice: rows with action create/link/skip; create uses prefilled form and createEquipmentFromInvoiceContext; link uses equipment picker and linkExistingEquipmentToInvoice. |
| [src/features/budget/vendors/VendorDetailPage.tsx](src/features/budget/vendors/VendorDetailPage.tsx) | Renders invoice table and passes onAddEquipment to open IngestEquipmentFromInvoiceModal. |

### 6. Data model

**Equipment (registry)** — `equipment` table

- `id`, `production_id`, `name`, `source_type` ('owned'|'purchased'|'rented'), `vendor` (text), `shoot_day_id`, `notes`, `item_uuid` (unique per production), `category`, `status`, `department`, `vendor_id`, `invoice_id`, `rental_start_date`, `return_due_date`, `returned_at`, `replacement_value`, `serial_number`, soft-delete timestamps.
- Unique index: `(production_id, item_uuid)`.

**EquipmentList** — `equipment_lists` table

- `id`, `production_id`, `shoot_day_id` (optional), `name`, `department`, `notes`, soft-delete timestamps.

**EquipmentListItem** — `equipment_list_items` table

- `id`, `equipment_list_id`, `equipment_id` (FK to equipment), `sort_order`, `checked_out` (0/1), `checked_back_in` (0/1), `notes`, timestamps. No soft-delete; hard delete on remove.

**ProductionTask (Tasks)** — link to equipment

- `production_tasks.equipment_id` references `equipment(id)` ON DELETE SET NULL. Unique partial index so at most one active task per equipment item. Used for return reminders.

**EquipmentTerm** — `equipment_terms` table

- Used by shot list (LENS, SUPPORT types). Separate from the equipment registry; see [src/lib/db/repositories/equipment-terms.ts](src/lib/db/repositories/equipment-terms.ts).

Types and constants: [src/lib/db/types.ts](src/lib/db/types.ts) — `Equipment`, `EquipmentList`, `EquipmentListItem`, `EquipmentCategory`, `EQUIPMENT_CATEGORY_VALUES`, `EquipmentStatus`, `EQUIPMENT_STATUS_VALUES`, `EquipmentTerm`.

### 7. Repositories and services

**equipment.ts**

- `listEquipmentByProduction(productionId)`, `getEquipmentById(equipmentId)`, `createEquipment(data)`, `updateEquipment(id, patch)`, `softDeleteEquipment(id)`.
- `CreateEquipmentData` includes `vendor_id`, `invoice_id`; used by reminder service and invoice ingestion.
- `buildCreateEquipmentStatements` / `buildUpdateEquipmentStatements` for use in transactions (e.g. with task creation).

**equipmentLists.ts**

- Lists: `listEquipmentListsByProduction`, `getEquipmentListById`, `createEquipmentList`, `updateEquipmentList`, `deleteEquipmentList` (soft).
- Items: `listEquipmentListItems` (ordered by sort_order), `addEquipmentItemToList`, `updateEquipmentListItem`, `removeEquipmentItemFromList`, `getMaxSortOrderForList`, `reorderEquipmentListItems`.
- Writes use outbox where applicable; reorder uses runInSerializedTransaction + executeBatch.

**equipmentReturnReminderService.ts**

- `isReminderEligible(equipment)`: rented + return_due_date + status !== 'returned'.
- `createEquipmentWithReminderTask(data)`: if eligible, creates equipment and task in one transaction; else creates equipment only.
- `updateEquipmentWithReminderTask(id, patch, current)`: updates equipment and creates/updates/completes/deletes linked task as needed.
- `archiveEquipmentWithReminderTask(id)`: soft-deletes equipment and linked task in one transaction.

**equipmentInvoiceIngestionService.ts**

- `createEquipmentFromInvoiceContext(productionId, vendorId, invoiceId, row)`: builds CreateEquipmentData with vendor_id and invoice_id, calls createEquipmentWithReminderTask.
- `linkExistingEquipmentToInvoice(equipmentId, vendorId, invoiceId)`: updateEquipment with vendor_id and invoice_id only.

**equipment/csv.ts**

- Export: `exportEquipmentListToCsv(listItems, equipmentById)` — registry data per item; notes from list item or equipment.
- Import: `parseEquipmentListCsv(csvText)` → `{ rows, errors }`; `matchParsedRowsToRegistry(rows, productionEquipment)` → `{ matched, new }` by item_uuid only.
- `csvRowToCreateEquipmentData(row, productionId)` for creating new equipment from CSV new rows (used with createEquipmentWithReminderTask in UI).

### 8. Key flows

- **Create equipment (registry):** Equipment page → create mutation → createEquipmentWithReminderTask. If rented with return_due_date, a production_task is created in the same transaction.
- **Update/archive equipment:** updateEquipmentWithReminderTask / archiveEquipmentWithReminderTask keep the linked task in sync.
- **List CRUD:** equipmentLists repo; list items reference equipment by equipment_id. Checklist state (checked_out, checked_back_in) only on list items.
- **PDF export:** generateEquipmentListPdf(list, listItems, equipmentById, productionName, shootDayLabel) → Uint8Array; UI triggers save via saveFileWithDialog.
- **CSV export:** exportEquipmentListToCsv(items, equipmentById) → string; save via saveFileWithDialog.
- **CSV import:** Parse file → matchParsedRowsToRegistry; review modal shows matched vs new; for new, user confirms via CreateEquipmentFromCsvRowDialog (createEquipmentWithReminderTask); then add matched + created to list (skip already-on-list).
- **Invoice ingestion:** Vendor detail → invoice row Package button → IngestEquipmentFromInvoiceModal; create rows use createEquipmentFromInvoiceContext; link rows use linkExistingEquipmentToInvoice.

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
| `['equipment-terms', productionId, type]` | Shot list equipment terms (LENS, SUPPORT); invalidated when terms change. |

---

## Part III — Reference

### 10. Database migrations

| Migration | Content |
|-----------|---------|
| 0044_equipment_registry.sql | Equipment table: production_id, name, source_type, vendor, shoot_day_id, notes, item_uuid, category, status, department, vendor_id, invoice_id, rental dates, returned_at, replacement_value, serial_number; unique (production_id, item_uuid). |
| 0045_production_tasks_equipment_id.sql | Adds production_tasks.equipment_id FK to equipment; unique partial index for one task per equipment. |
| 0046_equipment_lists.sql | equipment_lists (production_id, shoot_day_id, name, department, notes); equipment_list_items (equipment_list_id, equipment_id, sort_order, checked_out, checked_back_in, notes). |

Equipment terms (shot list) live in an earlier migration (0006_shots_rich_props_equipment_terms.sql).

### 11. Router and navigation

- **Route:** `/equipment` → `EquipmentPage` ([src/app/router.tsx](src/app/router.tsx)).
- **Nav:** Top-level "Equipment" (Film icon) in [src/app/navigation.ts](src/app/navigation.ts).

### 12. Gaps and future work

- **Duplicate production:** Equipment and equipment lists are not copied when duplicating a production; only equipment_terms are. Copying registry/lists could be added later.
- **OCR / invoice line items:** Invoice-driven ingestion is manual (user-entered rows). If invoice line items exist in the future, the ingestion flow could be adapted to use them as candidates.
- **Barcode/scanner:** No barcode or scanner workflows yet.
- **Fuzzy matching:** CSV and invoice flows do not match by name; matching is by item_uuid (registry) or explicit link (invoice).
- **PDF/CSV:** No invoice-specific PDF export or bulk registry CSV import; list-focused only.

---

*This document reflects the equipment system as implemented through the E7 (invoice-driven ingestion) stage. For vendor/invoice data model and reminder tasks, see [vendors.md](vendors.md) and the Tasks (Readiness) docs.*
