# Import and export (`.apf`)

An Albatross Project File (`.apf`) is a ZIP that carries one production, with its attachments, between installs. The code is in [`src/lib/importExport/`](../src/lib/importExport/).

The UI is **Productions → Import project** and **Export project** (the current production), plus double-clicking a `.apf` file. Import is all-or-nothing and never merges or overwrites.

## Code map

| Area | Location |
|---|---|
| Constants, versions | `constants.ts` (`CURRENT_APF_FORMAT_VERSION`, min/max supported) |
| Table list and order | `tableKeys.ts` (`APF_V1_TABLE_KEYS`) |
| Export | `exportProduction.ts`, `exportLoadProductionData.ts`, `resolveVendorsForExport.ts`, `pruneOrphanedRows.ts`, `collectApfDocumentFiles.ts`, `collectApfStoryboardFiles.ts`, `buildExportPayload.ts`, `buildExportManifest.ts`, `buildApfArchive.ts` |
| Read and validate | `readApfArchive.ts`, `sniff.ts`, `validateLayout.ts`, `manifest.ts`, `payload.ts`, `compatibility.ts`, `migrate.ts`, `pipeline.ts` |
| Import | `importProduction.ts`, `preflightApfImport.ts`, `extractApfDocumentsForImport.ts`, `extractApfStoryboardImagesForImport.ts`, `planImportStatements.ts` |
| Errors, user text | `errors.ts`, `apfUserMessages.ts` |
| UI | `src/features/productions/` (`useApfActions.ts`, `apfImportFlow.ts`, `ApfDesktopOpenBridge.tsx`), dialogs in `src/lib/files/apfProjectDialogs.ts` |
| Desktop routing | `src-tauri/src/apf_desktop.rs`, `fileAssociations` in `src-tauri/tauri.conf.json` |
| Tests | `src/lib/importExport/__tests__/`, `src/test/apf/` (fixtures, sql.js harness) |

## File layout

| Entry | Required | Content |
|---|---|---|
| `manifest.json` | Yes | `formatVersion`, `kind: "albatross-project-file"`, `exportedAt`, `production` (`id`, `name`, `slug?`), optional `dataEntryPath`, `filesPrefix`, `app`, and `export` diagnostics (`tableRowCounts`, `bundledDocumentIds`, `missingDocumentFileIds`, `bundledStoryboardImageIds`, `missingStoryboardImageIds`) |
| `data/production.json` | Yes | `{ formatVersion, tables }`: one array of row objects per table key, sorted by `id`, object keys sorted, so exports are deterministic |
| `files/documents/<documentId>/<fileName>` | No | Bytes for each `documents` row. The file name is sanitised to a single segment (no separators, 200 characters at most) |
| `files/storyboards/<imageId>/<fileName>` | No | Bytes for each `storyboard_images` row, sanitised the same way |

Readers detect ZIP by the `PK` magic bytes, not the extension, and ignore other entries. The `tables` object must contain exactly the known keys: a missing key or an unknown key is a validation error (missing keys from older files are injected as empty arrays first). Rows are stored as database columns, and the importer inserts only the columns that exist in the target schema, so extra keys from newer builds and missing keys from older ones are both tolerated.

## Versioning

`CURRENT_APF_FORMAT_VERSION` is 12 and the importable range is 1 to 12. Manifest and data versions must match.

- **Newer than this build:** refused before any database work (`UNSUPPORTED_FORMAT_VERSION`).
- **Older:** `migrateApfToCurrentVersion` applies one registered migrator per step (`APF_FILE_MIGRATIONS`, `v → v+1`) to the in-memory payload. A gap in the chain is an error (`MIGRATION_MISSING`).

| Step | Change |
|---|---|
| 1→2 | Episodes, shooting blocs, `is_episodic`, `client_id`, `delivery_date` |
| 2→3 | `budget_revisions`, `floats`, `float_expense_links` (revisions are synthesised from budget rows that reference one) |
| 3→4 | `scenes.heading` dropped into `title` |
| 4→5 | `vendor_purchase_order_amendments`, `allocated_amount` |
| 5→6 | `expense_receipts` |
| 6→7 | PO `currency_code` / `exchange_rate`; `approval` derived from `status` |
| 7→8 | Risk assessments and hazard templates |
| 8→9 | Script sections, sides and script supervisor tables |
| 9→10 | Script breakdown (`breakdown_elements`, `breakdown_tags`) |
| 10→11 | Storyboards (`storyboard_imports`, `storyboard_images` and their image files), `vendor_production_exclusions`, overtime (`production_crew_hours_settings`, `crew_hours_person_settings`, `crew_day_hours`) |
| 11→12 | Floor plans (`floor_plans`, `floor_plan_setups`) |

Tables with no migrator (`production_budget_features`, `tax_credit_schemes`, `vat_reclaim_rates`, `crew_availability`, `expense_tax_credit_allocations`) are covered by `injectMissingApfTableKeys`, which gives older files an empty array.

## What is exported

97 tables (`APF_V1_TABLE_KEYS` is the 68 original keys, then the 19 `APF_V9_TABLE_KEYS`, 2 `APF_V10_TABLE_KEYS`, 6 `APF_V11_TABLE_KEYS` and 2 `APF_V12_TABLE_KEYS`), loaded by `loadApfV1ProductionTables`. Grouped:

| Group | Tables |
|---|---|
| Production and structure | `productions`, `episodes`, `shooting_blocs`, `units`, `shoot_days`, `shoot_day_units`, `production_crew_hierarchy_configs` |
| Script and schedule | `scenes`, `shots`, `location_scene`, `stripboard_items`, `stripboard_strips`, `scene_cast`, `shot_cast`, `script_documents`, all v9 script tables (`script_versions` … `script_revision_items`), `breakdown_elements`, `breakdown_tags`, `storyboard_imports`, `storyboard_images`, `floor_plans`, `floor_plan_setups` |
| People and places | `people`, `locations`, `bookings`, `cast_availability`, `crew_availability`, `key_contacts`, overtime: `production_crew_hours_settings`, `crew_hours_person_settings`, `crew_day_hours` |
| Budget | `budget_categories`, `budget_accounts`, `budget_revisions`, `budget_items`, `budget_item_details`, `expenses`, `expense_transaction_details`, `expense_tax_credit_allocations`, `expense_receipts`, `budget_item_expense_links`, `floats`, `float_expense_links`, fringe, contingency, cost-report and production-total rules and their scope tables, `production_budget_features`, `tax_credit_schemes`, `vat_reclaim_rates` |
| Vendors | `vendors`, `vendor_production_exclusions`, `vendor_purchase_orders`, `vendor_purchase_order_amendments`, `vendor_purchase_order_expenses`, `vendor_invoices`, `vendor_invoice_expenses` |
| Equipment, tasks, delivery | `equipment`, `equipment_lists`, `equipment_list_items`, `equipment_terms`, `production_task_sections`, `production_tasks`, `deliverables`, `technical_specs`, `music_tracks`, `clearances`, `checklist_items`, `cue_sheets`, `call_sheets` |
| Risk | `hazard_templates`, `risk_assessments`, `risk_assessment_units`, `risk_assessment_hazards` |
| Files | `documents` |

**Not exported** (instance-level, or not yet handled): `settings`, `clients` (a production's `client_id` is cleared on import if that client does not exist on the target), users, sessions and memberships, templates (`task_templates`, `deliverable_templates` and their items), `exchange_rates`, and the outbox, sync, publish and server-link tables. `src/test/apf/exportCoverage.test.ts` lists every production-scoped table that is deliberately left out.

### Row selection (tombstones)

- Rows with `deleted_at` set are omitted. Join and detail tables are included only when their parent is live (SQL joins in `exportLoadProductionData.ts`).
- **Exceptions:** `episodes` and `shooting_blocs` export every row, including archived and soft-deleted ones, because scenes, tracks, deliverables and shoot days can still reference them.
- `productions.archived_at` and `budget_accounts.archived_at` are not tombstones; those rows are exported.
- `pruneOrphanedApfRows` runs last. It walks the tables in order and, mirroring the foreign-key actions, drops a row whose required parent was left out and clears an optional link to one. The rules are the `PARENT_LINKS` map and cover the v9 to v11 tables.
- **Vendors:** production vendors plus a local copy of each global vendor the production's expenses, invoices or purchase orders reference (`is_global` set to 0), so the file is self-contained.
- **Storyboards:** live `storyboard_images` and `storyboard_imports`. Image bytes are bundled from `storage_key`; a missing file keeps its row and goes in `manifest.export.missingStoryboardImageIds`.
- **Vendor exclusions:** a row hides a global vendor from this production. Global vendors travel as local copies only when referenced, so an exclusion whose vendor is not in the package is dropped by `pruneOrphanedApfRows`; one for a vendor in the package is kept and keeps it hidden.
- **Overtime:** the production settings row, per-person exemptions and live logged hours. The settings tables have no `id` or `deleted_at`.
- **Floor plans:** live plans and setups. Prune drops a plan whose location is not in the package (a deleted location) and a setup whose plan, scene or shot is not.
- **Documents:** every live `documents` row for the production. Rows whose file cannot be read stay in the JSON and their ids go in `manifest.export.missingDocumentFileIds`; export does not fail.

## Import

`importProductionFromApf(path)` needs the data key when field encryption is on (`requireSensitiveDataAccess`, so the user must be signed in) and returns `{ ok: true, ... }` or `{ ok: false, error }`; it does not throw.

1. Grant fs read scope for OS-supplied paths (`grant_read_access_for_apf`), read the file.
2. `parseApfArchiveBytes`: ZIP magic, unzip, check required entries, parse and validate the manifest, check the version, inject missing keys, validate `tables`, migrate to current.
3. `preflightApfImportDb` (reads the database, writes nothing):
   - exactly one `productions` row, matching `manifest.production.id`;
   - no live `productions` row with that `id` (a soft-deleted one is replaced), and no live production with the same `slug` (`IMPORT_CONFLICT`);
   - `client_id` cleared if the client does not exist;
   - episode and bloc consistency: an episodic production needs a valid `episode_id` on every scene; a non-episodic one must have none; track and deliverable `episode_id` and `shoot_days.shooting_bloc_id` must point at rows in the payload (`IMPORT_PREFLIGHT`).
4. Re-encrypt `people`, `locations` and `vendors` with the importer's DEK when field encryption is on.
5. `extractApfDocumentsForImport` writes each bundled file to `attachments/<productionId>/<documentId>-<fileName>` under app data and rewrites `documents.file_path` to that app-relative path. A document with no bytes in the archive keeps its row and path, and the result carries a warning.
5b. `extractApfStoryboardImagesForImport` does the same for storyboard images: each `storage_key` is rewritten to `storyboards/<productionId>/shots/<shotId>/imported/<imageId>-<fileName>` (a key from the file is never trusted) and the bytes written there. A missing image keeps its row and adds a warning.
6. `planApfImportStatements` builds one `INSERT` per row in `APF_V1_TABLE_KEYS` order, filtered to the columns in the live schema (via `PRAGMA table_info`; `information_schema` on Postgres). Self-referencing tables are ordered row by row first: `production_tasks`, `budget_accounts`, `budget_revisions`, `script_versions`, `tramlines`, `script_annotations`, `breakdown_tags`. A parent link that is missing from the payload, or part of a cycle, is set to `NULL`.
7. One `executeBatch([BEGIN, ...inserts, COMMIT])` inside `runInSerializedTransaction`, as required by [database.md](database.md#sqlite-access-and-transactions).
8. On any failure the written attachment files are deleted and no rows remain. Errors map to the codes in `errors.ts` (`NOT_ZIP_PAYLOAD`, `ZIP_CORRUPT`, `ARCHIVE_LAYOUT`, `INVALID_MANIFEST`, `INVALID_DATA`, `IMPORT_IO`, `IMPORT_DB`, and those above); `apfUserMessages.ts` turns them into UI text.

**Ids are preserved**, not remapped. Foreign keys and `documents.entity_id` stay valid with no mapping table, so a package cannot be imported while a live production with the same id exists. A soft-deleted copy does not block it: the importer deletes that row (its children cascade) in the same transaction and removes its attachment and storyboard files that the new import did not rewrite.

Foreign keys are enforced during import (`PRAGMA foreign_keys = ON`), so table order is load-bearing.

## Desktop open-with

- `tauri.conf.json` declares the `apf` extension as "Albatross Project File" (`com.albatross.apf`, role Editor).
- **Cold start:** `lib.rs` collects `.apf` arguments from `std::env::args_os()` into `ApfOpenQueue`.
- **Already running:** `tauri_plugin_single_instance` calls `on_second_instance`, which emits `apf-open-request` with the paths and focuses the window (Windows, macOS, Linux).
- `ApfDesktopOpenBridge` (mounted in `app/layout.tsx` after the sign-in gate, so a cold-start file waits for sign-in) pops the queue and listens for the event. It imports the first path only, navigates to Productions, ignores the same path within 2.5 seconds and shows a toast.
- Both this and the manual button run `runApfImportWithUiFollowUp`. An imported production that is archived is revealed through the archived filter; otherwise it becomes the current production.

## Security notes

- `.apf` files are plain ZIPs. People, locations and vendors are decrypted on export, so contact details are in plaintext in the file. Treat exports as sensitive; see [security.md](security.md#what-is-encrypted-where).
- Export for a signed-in user goes through `exportProductionAsApfForActor` (view access). Import does not check project access; it adds the signed-in importer as `administrator` of the imported production so a non-admin can see it.

## Relationship to other features

- **Duplicate production** (`src/lib/db/duplicateProduction.ts`) is a separate hand-written copier, not built on `.apf`. It assigns new ids and a new slug, copies a smaller set of tables (every column of each) and re-homes files under the new production id. Tables it skips are named, with reasons, in `DUPLICATE_EXCLUDED_TABLES`, and `src/lib/db/duplicateProduction.coverage.test.ts` fails when a production-scoped table or column is added without being copied or excluded. Adding a table to `.apf` does not add it to duplication; update both when a feature should survive both.
- **Server publish** reuses `loadApfV1ProductionTables` (`src/lib/publish/loadPublishProductionData.ts`) and adds extra tables. A change to the export loader changes publish. See [collaboration.md](collaboration.md#publish).

## Add a table to export and import

1. Create the table with a migration (see [database.md](database.md)). Give it `ON DELETE CASCADE` or `SET NULL` foreign keys so production delete and prune stay correct.
2. Add the key to `tableKeys.ts` in FK-safe position, parents before children. For a new format version, add a `APF_Vn_TABLE_KEYS` group, spread it into `APF_V1_TABLE_KEYS`, and bump `CURRENT_APF_FORMAT_VERSION` and `APF_MAX_SUPPORTED_FORMAT_VERSION` together.
3. Add a migrator `n-1 → n` in `migrate.ts` that defaults the new key to `[]` (and any column defaults), and register it in `APF_FILE_MIGRATIONS`.
4. Add the query to `loadApfV1ProductionTables`: filter by `production_id`, `deleted_at IS NULL`, and join to live parents for detail tables. The function throws at runtime if a key is missing from the result, and `ApfV1Tables` fails type-checking.
5. If the table has foreign keys to other exported tables, add its entry to `PARENT_LINKS` in `pruneOrphanedRows.ts`. If it references itself, add its ordering to `orderRowsForTable` in `planImportStatements.ts`.
6. If it stores a document id, make sure `documents` precedes it in the key order (the document row must exist first). If the table holds PII fields from `sensitiveTables.ts`, decrypt on export and encrypt in `importProduction.ts`.
7. Add a sample row to the round-trip test in `__tests__/apf-e2e-sqljs.integration.test.ts` and, if you added a migrator, a case in `apf-payload-pipeline.test.ts`.
8. Decide whether `duplicateProduction.ts` and server publish should include it.

`src/test/apf/exportCoverage.test.ts` fails when a table with a `production_id` column is neither in `APF_V1_TABLE_KEYS` nor on its reviewed exclusion list, so step 2 cannot be forgotten. `src/test/apf/productionDeleteCascade.test.ts` checks that production and person deletes cascade, and `rustMigrationRegistration.test.ts` checks that every migration file is registered in `lib.rs`.
