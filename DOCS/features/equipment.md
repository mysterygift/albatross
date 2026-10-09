# Equipment

Production-scoped gear tracking: a registry of items, packing lists with OUT/IN checklists, PDF/CSV export and import, return reminder tasks for rentals and creation from vendor invoices. UI: **Equipment** (`/equipment`), two tabs: **Registry** and **Equipment Lists**.

## Code map
| Area | Location |
|---|---|
| Page | `src/features/equipment/page.tsx` (both tabs, list detail, list CSV import dialogs), `ImportEquipmentRegistryCsvDialog.tsx`, `BulkEditEquipmentDialog.tsx`, `AddFromRegistryDialog.tsx`, `EquipmentFieldSelects.tsx` (category/source/status/department selects shared by the single and bulk editors), `formatEquipmentLabel.ts` |
| Services | `src/lib/db/equipmentReturnReminderService.ts`, `src/lib/db/equipmentInvoiceIngestionService.ts` |
| CSV | `src/lib/equipment/csv.ts` (list export/import, registry import), `listQuantity.ts` (over-stock check) |
| Registry helpers | `src/lib/equipment/registryFilter.ts` (search and filters shared by the Registry tab and the picker), `bulkEdit.ts` (bulk-editable fields, mixed detection, patch building), `registryPicker.ts` (picker selection to list additions) |
| PDF | `src/lib/pdf/equipmentListPdf.ts` (shared `layoutKit.ts`) |
| Repositories | `src/lib/db/repositories/equipment.ts`, `equipmentLists.ts`, `equipment-terms.ts` |
| Invoice entry point | `src/features/budget/vendors/IngestEquipmentFromInvoiceModal.tsx`, opened from `VendorDetailPage.tsx` |
| Tables | `equipment` (0044, `quantity` 0047, categories 0048, departments 0049), `equipment_lists` and `equipment_list_items` (0046, item `quantity` 0072), `production_tasks.equipment_id` (0045), `equipment_terms` (0006). Postgres baseline plus `0009_equipment_list_item_quantity` |
| Tests | `src/lib/equipment/*.test.ts`, `src/lib/db/bulkEquipmentOperations.test.ts`, `src/features/equipment/*.test.tsx`, `src/lib/pdf/equipmentListPdf.test.ts`, `src/lib/db/seed/demoEquipmentSeed.test.ts` |

## Data model
- `equipment`: `name`, `quantity` (identical units, `CHECK >= 1`), `source_type` (`owned | purchased | rented`), `category` (canonical values in `EQUIPMENT_CATEGORY_VALUES`), `status` (`planned | active | returned | lost | damaged`), `department`, `vendor` (text) plus `vendor_id` and `invoice_id`, `rental_start_date`, `return_due_date`, `returned_at`, `replacement_value`, `serial_number`, `notes`, `shoot_day_id` (legacy, lists are the day-facing construct). `item_uuid` is stable and unique per production; it is the match key for list CSV import. Soft-deleted.
- `equipment_lists`: `name`, optional `shoot_day_id` (`SET NULL`) and `department`, `notes`. Soft-deleted.
- `equipment_list_items`: `equipment_id`, `sort_order`, per-list `quantity` (units to pack), `checked_out`, `checked_back_in`, `notes`. Hard-deleted when removed from a list; cascades with the list or equipment. Checklist state lives here, never on the registry.
- `production_tasks.equipment_id` links the return reminder; a unique partial index allows one active task per item.
- `equipment_terms` (LENS, SUPPORT, ...) feed the shot list pickers and are unrelated to the registry.
- `department` values are crew department names from the production's effective crew hierarchy ([crew-manager.md](crew-manager.md)); there is no equipment-only department list. Legacy categories and departments are normalised by migrations and by `normalizeCategory` / `normalizeDepartment` in `csv.ts`.

## How it works
### Registry
Filters (category, source, department, status) and search (name, UUID, serial). Create, edit and archive go through the reminder service so the linked task stays consistent. Category and status are stored as snake_case and shown with `formatEquipmentCategoryLabel` / `formatEquipmentLabel`. Items with an `invoice_id` show the invoice number under the vendor.

**Bulk edit**: a checkbox column selects rows (header box = every filtered row; selection survives filter changes and drops archived items). **Edit selected** opens the single-item form for one item, otherwise `BulkEditEquipmentDialog`. Only ticked fields go into the patch (`buildBulkEquipmentPatch`); `name` and `serial_number` are not in `BULK_EDITABLE_FIELDS`, so a selection can never be given a shared name or serial. Setting a linked vendor clears the legacy text vendor, and vice versa. `bulkUpdateEquipmentWithReminderTasks` runs `updateEquipmentWithReminderTask` per item (one transaction each), collects failures without stopping, and the page reports which items failed.

### Return reminders
`isReminderEligible`: `source_type = 'rented'`, a `return_due_date`, and status not `returned`. `createEquipmentWithReminderTask`, `updateEquipmentWithReminderTask` and `archiveEquipmentWithReminderTask` write the equipment row and its single task ("Return equipment - {name}") in one transaction: create when eligible, update when the date or name changes, complete or delete when the item is returned, cleared or archived. The task's `assigned_department` comes from the hierarchy's task labels for the item's department (`getResolvedTaskDepartmentsForCrewDepartment`), falling back to Production. Always use these functions, not the bare repository calls, for anything that can change eligibility.

### Lists and checklists
Lists reference registry rows. **New Equipment List** can optionally add every item whose department matches. **Add from registry** (`AddFromRegistryDialog`) searches and filters the whole registry, keeps ticks across filter changes, and takes a quantity per item; `addEquipmentItemsToList` appends them in registry order and skips anything already on the list. OUT/IN toggles, reorder (`reorderEquipmentListItems` in a serialized transaction) and remove only touch `equipment_list_items`. A list quantity above the registry quantity is flagged as over-stock (`isListQuantityOverRegistry`).

### Export and import
- **PDF**: `generateEquipmentListPdf` builds a checklist (production, list, department, shoot day, issue stamp, rows with OUT/IN boxes, name, category, serial, short UUID, quantity, notes). Paper size is chosen in the list view (`PAPER_SIZES` in `layoutKit.ts`).
- **List CSV export**: fixed columns in `EQUIPMENT_LIST_CSV_HEADERS` (item_uuid, name, category, department, source_type, vendor, dates, serial_number, notes, status, replacement_value, quantity).
- **List CSV import**: `parseEquipmentListCsv` requires the core headers; `matchParsedRowsToRegistry` matches by `item_uuid` only. Unmatched rows are shown for review and created only after the user confirms each (`csvRowToCreateEquipmentData` then the reminder service). Matched and created items not already on the list are appended.
- **Registry CSV import** (Registry tab): pick a file, map columns (Name required; Quantity, Serial number, Replacement value optional) with a five-row preview; `matchRegistryImportRows` updates an existing item only when both name and serial match, otherwise creates one (category Other, source Owned, status Planned, quantity 1 if unmapped).

### Invoice-driven ingestion
In **Budget → Vendors**, a vendor's **Invoices** table has an **Add equipment from invoice** action. Each row is **Create new** (`createEquipmentFromInvoiceContext`: prefilled `vendor_id`/`invoice_id`, goes through the reminder service), **Link to existing** (`linkExistingEquipmentToInvoice`: sets the two ids only) or **Skip**. Rows are typed by the user; nothing is parsed from the invoice.

## Connections
- **Tasks**: reminder tasks as above. **Vendors/Invoices**: `vendor_id`, `invoice_id` for provenance only; equipment never changes budget totals.
- **Shot list**: `equipment_terms` (managed by `equipment-terms.ts`).
- **Duplicate production** copies `equipment_terms` only; `equipment` and lists are not copied. **.apf export** includes equipment, lists and list items (`src/lib/importExport/exportLoadProductionData.ts`). See [import-export.md](../import-export.md).
- **Demo seed**: `src/lib/db/seed/demoEquipmentSeed.ts` fills the demo production with about 120 items, reminder tasks and five lists.

## Gotchas
- `equipment_list_items` has no `deleted_at`; removal is a hard delete.
- Archiving an item soft-deletes it and its reminder task but leaves its list items; the PDF prints those rows as "Item no longer in the registry".
- Renaming a crew department does not rewrite `equipment.department`.
