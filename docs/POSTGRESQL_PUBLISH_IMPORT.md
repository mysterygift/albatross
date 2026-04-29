# PostgreSQL Publish/Import Pipeline (Phase 4)

## Format decision

- Chosen format: **APF-style ZIP package with a dedicated publish manifest/payload**, not a one-off SQL dump.
- Package kind: `albatross-production-publish-package`
- Current format version: `1`
- Package contents:
  - `manifest.json`
  - `data/publish-production.json`
  - `files/assets/...` bundled document/storyboard bytes

## Export scope

Phase 4 publish export includes production-owned rows required for North Shore usability, including:

- productions, episodes, shooting blocs
- scenes, shots, scene/shot cast, stripboard, shoot days/units
- people, bookings, cast availability, locations
- budget categories/accounts/items, **budget revisions**, totals, cost-report groups, fringe/contingency scopes
- expenses, transaction detail/link tables, **floats** + float links
- vendors, invoices/POs, vendor-expense links
- documents, cue sheets, call sheets, script documents
- storyboard imports/images metadata
- equipment + lists/items, task sections/tasks, deliverables, music/clearances

Export table order is explicit and deterministic for import planning.

## ID strategy

- Strategy: **preserve IDs** (UUIDs) from SQLite package to PostgreSQL.
- Import preflight blocks production ID collisions before any write.
- Row IDs remain stable across data rows and asset manifests.

## Type conversion rules

Import applies explicit conversion per PostgreSQL column metadata (`information_schema.columns`):

- UUID columns: normalized string UUIDs (empty string => `NULL`)
- BOOLEAN columns: SQLite `0/1` and string booleans converted to `true/false`
- NUMERIC columns: values written as string-safe numeric input to avoid precision loss
- TIMESTAMPTZ/DATE columns: ISO/date text preserved explicitly
- JSONB columns: JSON strings parsed to objects, objects passed through

## Attachment and storyboard asset handling

- Export bundles both:
  - document files from `documents.file_path`
  - storyboard image files from `storyboard_images.storage_key`
- Manifest records per asset:
  - source row/table
  - archive path
  - filename
  - SHA-256 checksum
  - byte size
- Missing referenced assets are treated as export failure in strict mode (default).

## Server storage layout

Imported assets are written to deterministic server keys:

- documents: `server-assets/productions/<productionId>/documents/<documentId>-<safeFileName>`
- storyboard images: `server-assets/productions/<productionId>/storyboards/<imageId>-<safeFileName>`

Database rows are rewritten during import to these server paths so no local client path survives.

## Atomicity and failure behavior

- Database rows are imported via adapter batch transaction (`BEGIN ... COMMIT`) and rollback on failure.
- Assets are written before DB import; any DB failure triggers asset cleanup.
- Asset write failures abort before DB import.
- Import returns structured errors by category:
  - `validation`
  - `missing_assets`
  - `type_conversion`
  - `constraint`
  - `storage`
  - `acl`

## Service boundary

Phase 4 adds explicit service boundaries:

- `exportProductionForServerPublish(productionId, outputPath)`
- `importPublishPackageFileToPostgres({ packagePath, postgresAdapter, serverAssetRoot, ... })`

The import boundary supports optional post-import admin assignment callback:

- `onAssignAdministrator({ productionId, userId })`

This keeps ACL wiring explicit for server environments without coupling it to SQLite runtime.

## Running tests

- PostgreSQL publish round-trip:
  - `npm run test -- src/test/postgres/postgresPublishRoundTrip.test.ts`
- Existing PostgreSQL compatibility:
  - `npm run test:postgres`
- Existing SQLite APF regressions:
  - `npm run test -- src/lib/importExport/__tests__/importProductionFromApf.integration.test.ts src/lib/importExport/__tests__/apf-e2e-sqljs.integration.test.ts`
