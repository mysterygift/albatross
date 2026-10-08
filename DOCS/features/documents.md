# Documents

One place to find every file a production holds: generated exports (call sheets, sides, cue sheets, budget CSVs...), entity attachments and manual uploads. Lives at Deliver → **Documents** (`/documents` hub, `/documents/:category` list).

## Code map
| Area | Location |
|---|---|
| Hub, category page, rows, search, upload dialog | `src/features/documents/` |
| Category catalogue, entity-type constants, deletability | `src/lib/documents/catalog.ts` |
| Grouping / labels (joins to shoot days, people, deliverables...) | `src/lib/documents/enrichDocuments.ts` |
| Write path (file + row in one transaction) | `src/lib/documents/persistDocument.ts` (`persistProductionDocument`, `documentsQueryKey`) |
| Pick-and-persist, byte picker | `src/lib/documents/pickAndPersistProductionDocument.ts` |
| Permanent delete | `src/lib/documents/hardDeleteDocument.ts` |
| File helpers (copy into app data, open, save-as, delete) | `src/lib/files/index.ts` |
| Repository | `src/lib/db/repositories/document.ts` |
| Table | `documents` (0001) |
| Tests | `src/lib/documents/*.test.ts` |

## Data model
`documents`: `production_id`, `entity_type`, `entity_id`, `file_name`, `file_path`, `mime_type`, soft-delete. `file_path` is relative to the app data directory. `entity_type` decides the category; `entity_id` links to the owning row (deliverable, shoot day, script version, location, expense...). Null `entity_type` means a general upload.

## How it works
- **Storage**: files live under `attachments/` in the Tauri app data directory (`BaseDirectory.AppData`). Two layouts exist: `attachments/<name>-<8 hex>.<ext>` from `pickAndSaveAttachment` (manual uploads, deliverable attachments) and `attachments/<productionId>/<documentId>-<name>` from `persistProductionDocument` (generated PDFs/CSVs). The persist path writes the file first, then inserts the row (plus outbox) in one transaction and removes the file if the insert fails.
- **Categories** (`DOCUMENT_CATEGORIES`): General files, Script & sides, Set paperwork, People & locations, Deliverables, Music & clearance, Budget & finance, Production lists. A document's category is looked up from its `entity_type`; unknown types fall back to General. To make a new export appear, add its `entity_type` to `DOCUMENT_ENTITY_TYPES`, a category's `entityTypes` and `ENTITY_TYPE_LABELS`.
- **Manual upload**: **Upload file** asks for a category, picks a file and stores it with that category's `manual_upload_*` entity type (General uses null). With sign-in enabled the row is created through `createDocumentForActor`.
- **Open**: `getFileUrl` -> `openInSystem` hands the file to the OS default app; if that fails the file is revealed in the file manager.
- **Delete**: **Delete document** shows a confirm dialog, then `hardDeleteDocument` removes the file (unless another row shares the same `file_path`) and then the row. It is permanent. Deleting an expense receipt document also deletes its `expense_receipts` row. Links from call sheets, cue sheets and sides exports are cleared by `SET NULL` foreign keys. Only General, manual uploads, Budget & finance, Music & clearance and Set paperwork documents are deletable here (`isDeletableDocument`); the rest (scripts, deliverable attachments, people and location files, production lists) show no delete button.
- **Search**: the hub's **Search** dialog filters the loaded list client-side by file name, type label and context.
- **Access**: with sign-in enabled, lists and creates go through `projectDomainService` / `projectAccessService` actor checks.

## Connections
- Producers of documents: Call Sheets, Movement Orders, Risk Assessments, Script Import and Breakdown, sides export, Budget, Equipment, Day Out of Days, Music & Archive ([music-archive.md](music-archive.md)), Deliverables ([deliverables.md](deliverables.md)).
- **Permanently deleting a production** removes the rows by cascade and deletes any file whose path starts with `attachments/`; see [productions.md](productions.md#edit-archive-delete).
- **Duplicate production** copies document rows with remapped `entity_id`; **.apf export** includes the files ([import-export.md](../import-export.md)).

## Gotchas
- Removing a deliverable attachment from the edit sheet only soft-deletes the row (`deleteDocument`); the file stays on disk. Documents -> Deliverables cannot delete it either.
- `file_path` must stay relative; `deleteAttachmentFile` refuses absolute paths and `..`.
- Some paths store the document `file_name` with the unique suffix added by `pickAndSaveAttachment`, so the displayed name can differ from the picked file.
