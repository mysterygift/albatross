# Albatross Project File (`.apf`) — format specification v1

**Status:** Interchange contract (Phase 2) + **export** (Phase 3) + **import** (Phase 4, §12) + **in-app UI** (Phase 5, §13) + **desktop `.apf` routing** (Phase 6, §15) + **automated tests / hardening** (Phase 7–7B, §16).

**Scope source of truth:** Table INCLUDE / EXCLUDE set, tombstone rules, and FK ordering are defined in [`project-import-export-audit.md`](project-import-export-audit.md). This document defines only how that scope is **serialized on disk**.

**Transactions:** Future DB import must follow [`DATABASE_LAYER.md`](DATABASE_LAYER.md).

---

## 1. Purpose

An `.apf` file is a **ZIP archive** with a branded extension. It carries:

- A **manifest** (metadata + `formatVersion`).
- A **single JSON payload** for all production-scoped tables in the v1 INCLUDE set.
- **Bundled file bytes** for `documents` rows (and any future binary attachments), without embedding host absolute paths as the source of truth.

Consumers must detect ZIP by **content** (magic bytes `PK`), not only by `.apf`.

---

## 2. Why `data/production.json` (not one giant `data.json` at archive root)

We use **`data/production.json`** as the canonical payload path because:

- Keeps the archive root tidy (`manifest.json` + `data/` + `files/`).
- Allows future optional additions (e.g. `data/summary.json`, localized strings) without breaking v1 readers that only read the required data file.
- Matches the audit’s “single production per package” mental model.

A single combined `data.json` at the root would work but mixes concerns with `manifest.json` and is harder to extend without cluttering the root.

---

## 3. Archive layout (v1)

All paths use **forward slashes** inside the zip.

| Entry | Required | Description |
|-------|----------|-------------|
| `manifest.json` | **Yes** | Package manifest (see §4). |
| `data/production.json` | **Yes** | Table-oriented project payload (see §5). |
| `files/...` | **No** (see §6) | Bundled bytes; required only for documents that have a bundled file. |

Optional zip entries: none required. **Extra files** elsewhere in the archive (outside the required manifest + data paths) should be **ignored** by readers so the format can evolve. The `tables` object in v1 still has an **exact** key set (see §5.2); unknown table keys in a v1 payload are a validation error.

---

## 4. Manifest schema (`manifest.json`)

### 4.1 Required fields

| Field | Type | Meaning |
|-------|------|---------|
| `formatVersion` | positive integer | **Interchange** version for this file (not app semver). Must match `data/production.json` `formatVersion` until migrations rewrite both. |
| `kind` | string | Must be exactly `albatross-project-file`. |
| `exportedAt` | string | ISO-8601 timestamp when the archive was produced. |
| `production` | object | `id` (UUID string), `name` (string), optional `slug`. |

### 4.2 Optional fields

| Field | Type | Meaning |
|-------|------|---------|
| `dataEntryPath` | string | Path to JSON payload inside zip. Default: `data/production.json`. |
| `filesPrefix` | string | Prefix for bundled files. Default: `files/` (trailing slash normalized by readers). |
| `export` | object | Diagnostics only. Suggested subfields: `tableRowCounts` (map table → count), `bundledDocumentIds`, `missingDocumentFileIds` (document UUIDs whose bytes were missing on disk at export). |
| `app` | object | Support metadata: `name`, `version` (strings). |

### 4.3 `formatVersion` semantics

- Bump **`formatVersion`** when the **JSON contract** changes in a breaking way (manifest shape, payload shape, table key set, bundled path rules).
- **App semver** may change without bumping `formatVersion` if the on-disk contract is unchanged.

### 4.4 Compatibility rules

- If `formatVersion` **>** app’s `APF_MAX_SUPPORTED_FORMAT_VERSION`: **refuse import** with a clear message; **no partial import**.
- If `formatVersion` **<** app’s `APF_MIN_SUPPORTED_FORMAT_VERSION`: refuse (no migrator path).
- If `APF_MIN_SUPPORTED_FORMAT_VERSION` ≤ `formatVersion` **<** `CURRENT_APF_FORMAT_VERSION`: run the **file-level migration chain** until the payload matches current, then proceed to DB import in a later phase.

Validation and constants live in `src/lib/importExport/` (see §8).

---

## 5. Data payload (`data/production.json`)

### 5.1 Envelope

```json
{
  "formatVersion": 1,
  "tables": { }
}
```

- `formatVersion` (required): must equal `manifest.formatVersion` before migration; both are updated by each migrator step.
- `tables` (required): object whose keys are **exactly** the v1 INCLUDE table names (see audit §2). No extra keys in v1.

### 5.2 Table-oriented shape

Each key under `tables` maps to an **array of objects** (rows). Each row is a JSON object whose keys are **column names** as in SQLite (snake_case), with JSON-serializable values. This matches export/import expectations:

- **Deterministic:** full key set under `tables` is fixed for v1.
- **UUID preservation:** ids and FK columns are copied as strings (or numbers where the schema uses integers).
- **Migrations:** file-level migrators can transform `tables` in place across versions.

The canonical ordered list of table keys is `APF_V1_TABLE_KEYS` in `src/lib/importExport/tableKeys.ts` (aligned with audit INCLUDE list and import ordering notes in audit §3).

### 5.3 Rows without `deleted_at`

Child tables listed in audit §4.1 as having no `deleted_at` still appear only when their parents are exported under active-data rules.

### 5.4 `documents` rows and paths

- Rows under `tables.documents` use the same columns as SQLite (`file_path`, `file_name`, etc.).
- **`file_path` in JSON is informational** for the exporting machine; **importers must not** rely on it on the target machine.
- For every bundled document, the exporter writes bytes under **`files/documents/{documentId}/{safeFileName}`** where `safeFileName` is derived from `file_name` (see `apfSanitizeDocumentBasename` / `apfDocumentBundledZipPath` in code).
- **Missing files at export:** still emit the `documents` row if policy includes it; list its `id` in `manifest.export.missingDocumentFileIds`. **Import** (§12.5): row is kept; canonical `file_path` is set; no bytes written; **warning** returned.

#### Locked policy: document row present, bundled zip bytes absent

This is an intentional **degraded import** (not a hard failure):

- **Import succeeds** (`ImportProductionResult.ok === true`) after the DB transaction **commits**.
- The **`documents` row is inserted** with **`file_path`** set to the canonical `attachments/<productionId>/<documentId>-<basename>` target.
- **No file** is created at that path unless bytes exist in the zip at the expected `files/documents/...` entry.
- **`warnings`** includes a clear message (e.g. missing bundled bytes for that document id).
- **Rationale:** matches portability when an export listed `missingDocumentFileIds` or a hand-trimmed archive omits bytes; mirrors duplicate-production import when a source file is missing on disk. A future phase could add strict mode; v1 is explicitly **not** strict-fail here.

### 5.5 Legacy `tables.checklist_items` slice

Migration **0024** replaced the `checklist_items` table with **`production_tasks`**. The v1 JSON key **`checklist_items`** is kept in `APF_V1_TABLE_KEYS` for interchange stability. **`loadApfV1ProductionTables`** always supplies **`[]`** for that key on the current schema; task data lives under **`production_tasks`**.

No absolute host paths appear in the archive layout for bundled content.

---

## 6. Bundled files (`files/`)

- Root prefix: default `files/` (overridable via `manifest.filesPrefix`).
- Documents: **`files/documents/{documentId}/{safeFileName}`** — one directory per `documents.id` avoids basename collisions between different rows.
- **Deterministic:** path is derivable from `documents.id` + `documents.file_name` without scanning the OS path string.
- **Portable:** forward slashes only; sanitization avoids `..` and separators in the basename segment.

---

## 7. Validation architecture (scaffolding)

Implemented in TypeScript. **Import** still needs a zip reader in a later phase; **export** writes ZIP via `fflate` (`buildApfZipBytes`).

1. **`isLikelyZipPayload(bytes)`** — magic-byte check on the first bytes of a file.
2. **`validateApfArchiveLayout(entryPaths, manifest?)`** — ensures `manifest.json` and the resolved data entry exist in a **normalized** zip index (built from `unzipSync` in `readApfArchive.ts`).
3. **`parseApfManifestJson` / `parseApfV1DataFileJson`** — structural validation (Zod + explicit table-key checks).
4. **`assertApfImportableFormatVersion`** — rejects too-new / too-old `formatVersion` before migrations.
5. **`migrateApfToCurrentVersion`** — runs registered **sequential** migrators (`fromVersion` → `fromVersion+1`) until `CURRENT_APF_FORMAT_VERSION`.

**Entry point for parsed JSON:** `normalizeApfManifestAndData(manifestRaw, dataRaw)` returns a normalized package consumed by **`importProductionFromApf`** (§12).

---

## 8. Code map

| Area | Location |
|------|----------|
| Version constants | `src/lib/importExport/constants.ts` |
| v1 table key list | `src/lib/importExport/tableKeys.ts` |
| Manifest schema | `src/lib/importExport/manifest.ts` |
| Payload parsing | `src/lib/importExport/payload.ts` |
| Zip sniff | `src/lib/importExport/sniff.ts` |
| Layout validation | `src/lib/importExport/validateLayout.ts` |
| Compatibility helpers | `src/lib/importExport/compatibility.ts` |
| Migration registry | `src/lib/importExport/migrate.ts` |
| Normalize pipeline | `src/lib/importExport/pipeline.ts` |
| Document path helpers | `src/lib/importExport/documentPaths.ts` |
| Public exports | `src/lib/importExport/index.ts` |
| Export: load SQL | `src/lib/importExport/exportLoadProductionData.ts` |
| Export: payload + manifest | `src/lib/importExport/buildExportPayload.ts`, `buildExportManifest.ts` |
| Export: document bytes | `src/lib/importExport/collectApfDocumentFiles.ts` |
| Export: ZIP bytes | `src/lib/importExport/buildApfArchive.ts` (uses `fflate`) |
| Export: orchestrator | `src/lib/importExport/exportProduction.ts` |
| Import: orchestrator | `src/lib/importExport/importProduction.ts` |
| Import: unzip + parse | `src/lib/importExport/readApfArchive.ts` |
| Import: document extraction | `src/lib/importExport/extractApfDocumentsForImport.ts` |
| Import: preflight | `src/lib/importExport/preflightApfImport.ts` |
| Import: INSERT planning | `src/lib/importExport/planImportStatements.ts` |
| Import: result types | `src/lib/importExport/importTypes.ts` |
| Import/export: UI copy helpers | `src/lib/importExport/apfUserMessages.ts` |
| `.apf` save/open dialogs | `src/lib/files/apfProjectDialogs.ts` |
| Productions page actions | `src/features/productions/page.tsx` |
| Shared import follow-up (UI + queries) | `src/features/productions/apfImportFlow.ts` |
| Desktop open / argv bridge | `src/features/productions/ApfDesktopOpenBridge.tsx`, `src/app/layout.tsx` |
| Tauri: `.apf` argv queue, scope grant, single-instance | `src-tauri/src/apf_desktop.rs`, `src-tauri/src/lib.rs` |
| Vitest fixtures + DB/fs mocks | `src/test/apf/fixtures.ts`, `src/test/apf/mockImportDb.ts` |
| sql.js E2E harness (migrations + Tauri-SQL adapter) | `src/test/apf/applyMigrationsSqlJs.ts`, `sqlJsTauriAdapter.ts`, `sqlJsApfE2eContext.ts`, `apfE2eExecuteBatchMock.ts`, `apfNodeFsTestContext.ts` |
| `.apf` automated tests | `src/lib/importExport/__tests__/*.test.ts` |

---

## 11. Export implementation (Phase 3)

### 11.1 Entry point

- **`exportProductionAsApf(productionId, outputPath)`** in `src/lib/importExport/exportProduction.ts`
- `outputPath` must be an absolute path acceptable to `@tauri-apps/plugin-fs` `writeFile` (same pattern as saving to a user-picked folder elsewhere in the app).
- **Overwrite:** if the file exists, it is **replaced** in full.
- **Parent directory:** not created by the exporter; ensure the directory exists (e.g. dialog target folder).

### 11.2 Data loading

- All tables in the Phase 1 **INCLUDE** set are loaded via `loadApfV1ProductionTables` with:
  - `deleted_at IS NULL` where the column exists.
  - Joins to non-deleted parents for child tables without their own tombstone (per audit §4.1).
- **`checklist_items`:** the SQL table no longer exists after migration 0024; the exporter emits **`tables.checklist_items` as `[]`** while **`production_tasks`** carries the task graph (see §5.5).
- **Cue sheets / call sheets / script documents** omit rows whose linked `documents` row is missing or soft-deleted (avoids dangling `document_id` / `generated_document_id` in the package).
- **EXCLUDE** tables from the audit are never queried.

### 11.3 Payload and manifest

- Tables are serialized to `data/production.json` as specified in §5: canonical key order (`APF_V1_TABLE_KEYS`), rows sorted by `id`, object keys sorted recursively for stable diffs.
- `manifest.json` includes `export.tableRowCounts`, `export.bundledDocumentIds`, and `export.missingDocumentFileIds` (when non-empty).
- Before writing the zip, the exporter runs **`parseApfManifestJson`** and **`parseApfV1DataFileJson`** on deep-cloned JSON to catch contract drift early.

### 11.4 Document files

- For each exported `documents` row, bytes are read from `file_path` under **`BaseDirectory.AppData`** (same as attachment handling elsewhere).
- Zip entry path: **`files/documents/{documentId}/{safeFileName}`** (§6).
- **Missing file on disk:** the row remains in JSON; the document `id` is appended to **`missingDocumentFileIds`**; export **still succeeds** (per §5.4).
- **Invalid row** (missing `id`, `file_name`, or `file_path`): treated like a missing file (id listed when `id` present).

### 11.5 Archive

- Built with **`fflate`** `zipSync` (DEFLATE, level 6). The file may use extension **`.apf`**; contents are a normal ZIP.

---

## 12. Import implementation (Phase 4)

### 12.1 Entry point

- **`importProductionFromApf(apfPath)`** in `src/lib/importExport/importProduction.ts`
- `apfPath` must be an absolute path accepted by `@tauri-apps/plugin-fs` `readFile` (same class of paths as export `writeFile`).

### 12.2 Archive read and validation

1. Read file bytes from disk.
2. Refuse non-ZIP payloads using **`isLikelyZipPayload`** (magic `PK`); do not rely on extension.
3. **`unzipSync`** (`fflate`); corrupt archives → **`ApfZipCorruptError`**.
4. Build a normalized path index (`buildApfZipIndex`); **`validateApfArchiveLayout`** requires `manifest.json` and the resolved data entry (default `data/production.json`).
5. Parse manifest JSON → **`parseApfManifestJson`**; re-validate layout with manifest overrides (`dataEntryPath`, `filesPrefix`).
6. Parse data JSON → **`parseApfV1DataFileJson`** → **`normalizeApfManifestAndData`** (version bounds, migration chain, aligned `formatVersion`).

### 12.3 Format version

- **Too new** (`formatVersion` > `APF_MAX_SUPPORTED_FORMAT_VERSION`): **`ApfUnsupportedFormatVersionError`** — no DB or disk side effects.
- **Too old / unmigrated** (`formatVersion` < `APF_MIN_SUPPORTED_FORMAT_VERSION` or missing migrator): **`ApfUnknownFormatVersionError`** or **`ApfMigrationError`**.
- **Older but supported**: **`migrateApfToCurrentVersion`** must yield **`CURRENT_APF_FORMAT_VERSION`** before any import write.

### 12.4 Preflight (before file extraction or DB write)

- Exactly **one** row in `tables.productions`; its `id` must equal **`manifest.production.id`**.
- **Production id collision**: if any row exists in `productions` with that `id`, import fails with **`ApfImportConflictError`** (`production_id`). No merge, overwrite, or ID remap in this phase.
- **Slug collision**: if `tables.productions[0].slug` or `manifest.production.slug` resolves to a slug already used by an **active** production (`deleted_at IS NULL`), import fails with **`ApfImportConflictError`** (`slug`).

### 12.5 Bundled documents and `file_path` rewrite

- For each `tables.documents` row with `id` and `file_name`, the importer sets **`file_path`** to an app-relative path under app data:

  `attachments/<productionId>/<documentId>-<sanitizedBasename>`

  where **`sanitizedBasename`** is **`apfSanitizeDocumentBasename(file_name)`** (portable, no path separators / traversal in the basename segment).

- Bundled bytes are read from the zip at **`apfDocumentBundledZipPathForManifest(manifest, documentId, file_name)`** (honours `manifest.filesPrefix`; default matches export `files/documents/...`).
- **Missing zip entry** (e.g. exporter listed the id in `missingDocumentFileIds`, or bytes were stripped from the archive): **not a strict failure.** Import **commits** the DB row with canonical **`file_path`**, writes **no** attachment file, and appends a **warning** (see §5.4 “Locked policy”). This is **not** merge/overwrite semantics; it is a deliberate portability compromise for v1.
- **Extraction before DB commit**: bytes are written under `BaseDirectory.AppData` first. If the batched DB transaction fails, every relative path recorded during extraction is **best-effort `remove`d** so no orphaned files remain.

### 12.6 Database import

- Inserts use **dynamic `INSERT`s** from the normalized payload: columns are the intersection of each JSON row’s keys with **`PRAGMA table_info`** for that table (handles schema drift vs. older exports when new nullable columns appear).
- Table order is **`APF_V1_TABLE_KEYS`** (aligned with audit §3). **`budget_accounts`** and **`production_tasks`** rows are ordered **parents before children** for self-FKs.
- **No `outbox` rows** are created for import (local-only graph copy; audit §6).
- **Transaction**: **`runInSerializedTransaction`** + exactly one **`executeBatch(db, [BEGIN TRANSACTION, …INSERTs…, COMMIT])`** per [`DATABASE_LAYER.md`](DATABASE_LAYER.md). No per-row `execute` inside the transaction.

### 12.7 Result shape

- Success: **`ImportProductionSuccess`** (`productionId`, `productionName`, `formatVersion`, `filesRestored`, `warnings`).
- Failure: **`ImportProductionFailure`** with **`ApfError`** (or subclass) or **`ApfImportDbError`** / generic **`Error`** for unexpected I/O.

### 12.8 Scope note

- OS-level association and argv routing are implemented in **§15** (Phase 6). Importer rules in §12 are unchanged.

---

## 13. In-app UI (Phase 5)

### 13.1 Where to find it

On the **Productions** page (`src/features/productions/page.tsx`), the header toolbar includes:

- **Import project** — opens a native file picker (`.apf` filter), runs **`importProductionFromApf`**, shows progress on the button, then a success or error banner.
- **Export project** — enabled when the app has a **current production** (the one selected in the shell / production switcher). Opens a native save dialog (default name from the production title + `.apf`), runs **`exportProductionAsApf`**, then success or error feedback.

User-facing copy is normalized via **`userMessageForImportFailure`**, **`userMessageForExportFailure`**, and **`userMessageForImportSuccess`** in `src/lib/importExport/apfUserMessages.ts` so the UI does not show raw stack traces.

### 13.2 User flow (summary)

1. **Export:** Choose location → file written → confirmation (filename shown).
2. **Import:** Choose `.apf` → import runs → on success, **productions queries are invalidated**, **current production** is set to the imported id, and a success message appears (including a short note if attachment warnings were returned).

### 13.3 Dialog helpers

- `pickApfSavePath` / `pickApfFileForImport` / `normalizeApfSavePath` — `src/lib/files/apfProjectDialogs.ts` (Tauri **`plugin-dialog`**).

### 13.4 Limitations (still)

- No **merge** or **overwrite** import; duplicate id/slug still fails at the service layer with mapped messages.
- No **preview/diff** before import.
- **Desktop:** association and open-with behaviour are described in **§15** (installed app builds; dev `tauri dev` may differ from installed handlers).

---

## 15. Desktop integration (Phase 6)

### 15.1 Bundle: file association

- **`tauri.conf.json`** → `bundle.fileAssociations` registers **`.apf`** as **Albatross Project File** (with `exportedType` for macOS UTType wiring).
- **Windows / Linux:** installer metadata registers the extension for **Open with** where the Tauri bundler supports it.
- **macOS:** `exportedType.identifier` `com.albatross.app.apf` is declared; users may need to use **Open With** once, or rely on Launch Services after install.

### 15.2 How paths reach the importer

1. **Cold start:** paths from `std::env::args_os()` (after the executable) ending in **`.apf`** are queued in Rust state; the webview calls **`pop_pending_apf_open_paths`** once on load.
2. **Second instance (Windows / macOS / Linux desktop):** **`tauri-plugin-single-instance`** forwards argv to the running app, which emits frontend event **`apf-open-request`** and focuses the main window.
3. **`grant_read_access_for_apf`** extends the **fs plugin scope** for that absolute path so **`readFile`** matches OS-opened files (picker-chosen files were already scoped by the dialog plugin).

### 15.3 Frontend behaviour

- **`ApfDesktopOpenBridge`** (mounted from **`AppLayout`**) handles the queue + event, **navigates to `/productions`**, shows **“Importing project file…”**, then runs **`runApfImportWithUiFollowUp`** → same **`importProductionFromApf`** pipeline and **`apfUserMessages`** copy as the Productions **Import project** button.
- **Auto-import:** no extra confirmation step (double-click is treated as intent to import). **Duplicate paths** within ~2.5s are ignored to damp duplicate events.
- **Archived imports:** `localStorage` + **`albatross-reveal-archived-productions`** window event so the Productions table can turn on **Show archived projects** when the bridge cannot call page state directly.

### 15.4 Platform caveats

- **Linux Snap / Flatpak:** single-instance may need extra DBus permissions (see [Tauri single-instance docs](https://v2.tauri.app/plugin/single-instance/)); association registration depends on the packager.
- **macOS:** if the OS does not pass the file on the command line for a given launch path, cold-start queue may be empty — **in-app Import** remains the fallback.
- **Web / `vite` only:** no Tauri IPC → bridge no-ops; no file-queue.

### 15.5 Still out of scope

- Merge / overwrite import, preview/diff, recent-files list, drag-and-drop (unless added later on top of the same importer).

---

## 16. Automated tests (Phase 7 + Phase 7B)

Run **`npm run test`** (Vitest, Node environment). Tests use **programmatic ZIP fixtures** (`src/test/apf/fixtures.ts`) — no large binary blobs in git.

### 16.1 Fast / mocked layers (Phase 7)

- **ZIP sniff / layout:** magic-byte detection, required entries (`manifest.json`, `data/production.json`), misnamed zip paths, corrupt archive handling.
- **Payload / versions:** `formatVersion` compatibility helpers, manifest/data alignment, unknown table keys in JSON, unsupported newer `formatVersion` refusal.
- **Round-trip (parse only):** build `data/production.json` + manifest + optional `files/documents/...` bytes → `parseApfArchiveBytes` → assert production graph and bundled bytes.
- **Export orchestrator (mocked):** `exportProductionAsApf` with mocked DB loaders + `collectApfDocumentBundledEntries` + `writeFile`; output must re-parse as a valid archive.
- **Import orchestrator (mocked):** `importProductionFromApf` with mocked `readFile`, Tauri `mkdir`/`writeFile`/`remove`, and a **`select`-only DB mock** for `PRAGMA table_info` + preflight. Covers batch shape, **`file_path` rewrite**, duplicate id/slug, DB failure cleanup, partial extraction failure, and **missing bundled bytes** (degraded import) at the orchestration layer.
- **Collector:** `collectApfDocumentBundledEntries` maps host `file_path` to **`files/documents/{id}/{basename}`** zip paths (not raw host paths).

### 16.2 End-to-end integration (Phase 7B, `apf-e2e-sqljs.integration.test.ts`)

Uses **sql.js** with the real **`src-tauri/migrations/*.sql`** chain, a **Tauri-shaped `select`/`execute` adapter** (including `$1` placeholder expansion when the same index appears twice), **`vi.mock('@/lib/db/client')`** + **`vi.mock('@tauri-apps/plugin-fs')`** routing to that DB and a **real temp directory** for `BaseDirectory.AppData` and `.apf` files.

Verified behaviours:

1. **Export → wipe user data → import → verify:** production + unit + document metadata and UUIDs survive; attachment bytes exist on disk under the rewritten `file_path`; exported payload includes **`tables.checklist_items: []`** on current schema.
2. **Tombstones on the real loader:** `loadApfV1ProductionTables` against seeded SQL returns only the **active** `people` row; the soft-deleted row is omitted.
3. **Atomicity after DB failure:** forced failure on `COMMIT`; `ROLLBACK` leaves **zero** `productions` rows for that id; the extracted attachment file is **removed** (asserted by path).
4. **Missing bundled bytes (spec-locked degraded import):** archive has a `documents` row but **no** zip entry; import **succeeds** with warnings, row is present in SQLite, canonical `file_path` set, **no** file on disk.
5. **Preflight duplicate id:** second import of the same package while production exists → **`ApfImportConflictError`** (`production_id`); row count stays **1**.

### 16.3 Guarantees vs. limits

- **E2E scope:** sql.js matches SQLite semantics closely but is **not** the Tauri `plugin-sql` binary; Rust-side behaviour is still validated manually / in app QA.
- **Desktop / OS file association** and **single-instance argv** remain Tauri-only (not Vitest).

### 16.4 Testability seams

- **`resetApfImportPragmaCache()`** in `planImportStatements.ts` clears cached `PRAGMA table_info` between Vitest cases when the mocked DB shape changes.
- **`apfE2eExecuteBatchMock`** (`src/test/apf/apfE2eExecuteBatchMock.ts`) wraps `executeBatch` in the sql.js suite so one test can force a `COMMIT` failure without forking production code.

---

## 17. Document history

| Date | Change |
|------|--------|
| 2026-03-22 | Initial v1 format lock (Phase 2). |
| 2026-03-22 | Phase 3: export pipeline + doc §11 / code map updates. |
| 2026-03-22 | Phase 4: full import pipeline + doc §12 (DB batch, collisions, document rewrite, cleanup). |
| 2026-03-22 | Phase 5: in-app import/export on Productions page + doc §13. |
| 2026-03-22 | Phase 6: Tauri file association + argv / single-instance + UI bridge + doc §15. |
| 2026-03-22 | Phase 7: Vitest suite + fixtures + import/export hardening tests + doc §16. |
| 2026-03-22 | Phase 7B: sql.js E2E export/import, tombstone loader proof, stronger rollback + missing-bytes policy locked; export fix for removed `checklist_items` table; doc §16 revision. |
