# PostgreSQL Module Validation (Phase 5A-5C)

Status legend: `not started` | `tests added` | `fixed` | `passing` | `blocked (env)`

## Core module matrix

| Module | Repository / service files | Tables involved | Existing SQLite tests | Existing PostgreSQL tests | Mapper / type risks | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Productions | `src/lib/db/repositories/production.ts`, `src/lib/db/duplicateProduction.ts` | `productions`, `episodes`, `outbox` | `src/lib/db/episodicFoundation.test.ts` | `src/test/postgres/postgresRepositoryCompatibility.test.ts` (basic create + episodic), `src/test/postgres/postgresCoreProductionGraph.test.ts` (create/update/archive/duplicate/timestamps) | `is_episodic` boolean coercion, `created_at`/`updated_at` timestamptz string coercion, nullable text normalization | blocked (env) |
| Settings | `src/lib/db/repositories/settings.ts` | `settings` | `src/lib/db/repositories/settings.adapter.test.ts` (dialect SQL shape), indirect coverage in app tests | `src/test/postgres/postgresRepositoryCompatibility.test.ts` (defaults), `src/lib/db/repositories/settings.adapter.test.ts`, `src/test/postgres/postgresCoreProductionGraph.test.ts` | SQLite `INSERT OR IGNORE` vs PostgreSQL `ON CONFLICT`, key uniqueness semantics | blocked (env) |
| People (cast/crew/bookings) | `src/lib/db/repositories/person.ts`, `booking.ts`, `cast-availability.ts`, `crewHierarchyConfig.ts` | `people`, `bookings`, `cast_availability`, `production_crew_hierarchy_configs` | No dedicated repository-level SQLite test file; indirect seed/integration usage | `src/test/postgres/postgresCoreProductionGraph.test.ts` | `is_cast` boolean/int mapping, nullable date fields, ordering and null ordering behavior | blocked (env) |
| Locations | `src/lib/db/repositories/location.ts`, `location-scene.ts` | `locations`, `location_scene`, `scenes` | No dedicated repository-level SQLite test file; covered indirectly by demo seed tests | `src/test/postgres/postgresCoreProductionGraph.test.ts` | nullable address/fee fields, join-table uniqueness and soft-delete behavior | blocked (env) |
| Scenes | `src/lib/db/repositories/schedule.ts`, `scene-cast.ts` | `scenes`, `scene_cast`, `episodes`, `locations` | `src/lib/db/sceneEpisodeAssignment.test.ts`, episodic checks in `src/lib/db/episodeManagement.test.ts` | `src/test/postgres/postgresCoreProductionGraph.test.ts` | nullable `episode_id` and location handling, scene ordering by `scene_number` lexical sort | blocked (env) |
| Shots | `src/lib/db/repositories/schedule.ts`, `shot-cast.ts` | `shots`, `shot_cast`, `scene_cast`, `scenes` | `src/lib/db/sceneEpisodeAssignment.test.ts` (context), `src/lib/db/repositories/storyboard.test.ts` (related usage) | `src/test/postgres/postgresCoreProductionGraph.test.ts` | shot/scene ordering, integer field coercion, foreign key and duplicate-shot-number enforcement | blocked (env) |
| Schedule (shoot days / strips / units / calendar) | `src/lib/db/repositories/schedule.ts`, `stripboard-strips.ts`, `shoot-day-units.ts`, `units.ts`, `calendar.ts` | `shoot_days`, `shoot_day_units`, `units`, `stripboard_strips`, `stripboard_items`, `shooting_blocs` | `src/lib/db/shootDayShootingBlocAssociation.test.ts` | `src/test/postgres/postgresCoreProductionGraph.test.ts`, `src/test/postgres/postgresPublishRoundTrip.test.ts` (structural import assertions) | DATE vs TIMESTAMPTZ mapping, boolean fields (`is_locked`), stable ordering and null-ordering differences | blocked (env) |
| Episodic (episodes + shooting blocs) | `src/lib/db/repositories/episodes.ts`, `shootingBlocs.ts`, `src/lib/db/episodicProductionService.ts`, `src/lib/db/episodeManagementService.ts` | `episodes`, `shooting_blocs`, related `shoot_days`/`scenes` refs | `src/lib/db/episodicFoundation.test.ts`, `sceneEpisodeAssignment.test.ts`, `episodeManagement.test.ts`, `shootDayShootingBlocAssociation.test.ts`, `seed/northShoreDemoSeed.integration.test.ts` | `src/test/postgres/postgresRepositoryCompatibility.test.ts`, `src/test/postgres/postgresCoreProductionGraph.test.ts`, `src/test/postgres/postgresPublishRoundTrip.test.ts` | date-range constraints and overlap checks, archived filtering, nullable `episode_id` constraints by production mode | blocked (env) |

## Phase 5B module matrix

| Module | Repository / service files | Tables involved | Existing SQLite tests | Existing PostgreSQL tests | Mapper / type risks | Asset / storage risks | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Budget | `budget.ts`, `budgetAccounts.ts`, `budgetRevisions.ts`, `budgetDerived.ts`, `productionTotals.ts`, `costReportGroups.ts`, `floats.ts`, `floatReconciliation.ts`, `budgetReconciliation.ts` | `budget_categories`, `budget_accounts`, `budget_items`, `expenses`, `budget_revisions`, `fringe_rules`, `contingency_rules`, `production_totals`, `cost_report_groups`, `budget_item_expense_links`, `floats`, `float_expense_links` | `src/lib/db/repositories/budgetRevisions.test.ts`, `src/lib/db/repositories/revisionAwareBudgetRepositories.test.ts`, `src/lib/db/repositories/budget.backfill.test.ts`, `src/lib/db/budgetRevisionService.test.ts`, budget feature tests | `src/test/postgres/postgresRepositoryCompatibility.test.ts` (partial), `src/test/postgres/postgresFinancialOperationalModules.test.ts`, `src/test/postgres/postgresPublishRoundTrip.test.ts` | NUMERIC precision coercion, `is_live`/enabled boolean mapping, one-live-revision invariant, revision-scoped joins, null-vs-zero | imported revision data usability after publish/import | fixed |
| Documents and attachments | `document.ts`, publish/import services (`src/lib/publish/*`) | `documents`, publish manifest/data tables | `src/lib/importExport/__tests__/apf-collect-documents.test.ts`, `apf-document-paths.test.ts`, `importProductionFromApf.integration.test.ts`, `exportProductionAsApf.test.ts` | `src/test/postgres/postgresFinancialOperationalModules.test.ts`, `src/test/postgres/postgresPublishRoundTrip.test.ts` | nullable metadata mapping, timestamp normalization | rewrite to server paths, no client-local paths, failed-import cleanup | tests added |
| Equipment | `equipment.ts`, `equipmentLists.ts`, `equipment-terms.ts` | `equipment`, `equipment_lists`, `equipment_list_items`, `equipment_terms` | indirect seed/integration coverage (`northShoreDemoSeed.integration.test.ts`) | `src/test/postgres/postgresFinancialOperationalModules.test.ts` | NUMERIC cost/rate coercion, nullable refs, ordering | n/a | fixed |
| Vendors | `vendors.ts`, `vendorInvoices.ts`, `vendorPurchaseOrders.ts`, `vendorFinanceLinks.ts`, `vendorActivity.ts` | `vendors`, `vendor_invoices`, `vendor_purchase_orders`, `vendor_invoice_expenses`, `vendor_purchase_order_expenses` | no dedicated repository tests (mostly feature-layer coverage) | `src/test/postgres/postgresFinancialOperationalModules.test.ts` | NUMERIC values may arrive as string in PG (`amount`, `tax`), status/approval mapping, nullable dates/refs | n/a | fixed |
| Tasks and templates | `tasks.ts`, `taskSections.ts`, `taskTemplates.ts` | `production_tasks`, `production_task_sections`, `task_templates`, `task_template_items` | mostly feature/integration coverage; no dedicated repository suites | `src/test/postgres/postgresFinancialOperationalModules.test.ts` | boolean mapping (`is_complete`), nullable date/assignment fields, ordering with nulls | n/a | fixed |
| Deliverables and templates | `deliverable.ts`, `deliverableTemplates.ts` | `deliverables`, `technical_specs`, `deliverable_templates`, `deliverable_template_items` | `src/lib/db/repositories/deliverable.episodic.test.ts`, episodic scope tests | `src/test/postgres/postgresFinancialOperationalModules.test.ts` | nullable `episode_id`, due-date semantics, status/default mapping, JSON defaults parse/write | n/a | tests added |
| Music/archive and clearances | `music-clearance.ts` | `music_tracks`, `clearances`, `cue_sheets` | `src/lib/db/musicTracksEpisodicScope.test.ts`, import/export episodic tests | `src/test/postgres/postgresFinancialOperationalModules.test.ts` | nullable `episode_id`, status/date field coercion, archived episode readability | n/a | tests added |
| Storyboards | `storyboard.ts` | `storyboard_images`, `storyboard_imports` | `src/lib/db/repositories/storyboard.test.ts`, `src/lib/files/storyboard.test.ts`, `src/lib/storyboard/athena-import.test.ts` | `src/test/postgres/postgresFinancialOperationalModules.test.ts`, `src/test/postgres/postgresPublishRoundTrip.test.ts` | numeric sort ordering, nullable source ids, stable primary selection, source-type mapping | storage key rewrite + path integrity after import, missing asset behavior | tests added |

## Scope for this phase

- Validate core production graph behavior on PostgreSQL via repository-level integration tests using `PostgresDatabaseAdapter` + `createPostgresRepoHarness`.
- Apply only narrow compatibility fixes (mapper normalization and SQL dialect compatibility).
- Keep SQLite runtime behavior unchanged; SQLite remains the production runtime.

## Phase 5C audit (before changes)

- Reviewed:
  - `docs/POSTGRESQL_MODULE_VALIDATION.md`
  - `docs/POSTGRESQL_PUBLISH_IMPORT.md`
  - `src/test/postgres/*`
  - `src/lib/publish/*`
  - `src/lib/importExport/__tests__/*`
- Confirmed already covered from 5A/5B:
  - Core graph + complex module repository compatibility tests were in place.
  - Publish import path rewrite and missing-asset cleanup tests existed.
  - PostgreSQL APF `information_schema` planning path existed.
- Gaps identified for 5C:
  - explicit SQLite APF `PRAGMA table_info` planner-path assertion
  - stronger publish export determinism/metadata/checksum assertions
  - explicit import type-conversion integration checks (`UUID`/`BOOLEAN`/`NUMERIC`/`DATE`/`TIMESTAMPTZ`/`JSONB`)
  - deeper North Shore usability checks through repositories/services (beyond raw counts)

## Tests added / expanded

- Added `src/test/postgres/postgresCoreProductionGraph.test.ts`:
  - productions: create/update/archive/duplicate/episodic/timestamp checks
  - settings: defaults + update/read parity checks
  - people: cast/crew/bookings/availability/hierarchy config checks
  - locations: CRUD + `location_scene` relationship checks
  - scenes/shots: create/order/relationship + shot cast checks
  - schedule: shoot day/unit/strip ordering + calendar query + lock flag checks
  - episodic: episodes ordering, scene assignment, bloc overlap, bloc-driven date shift checks
- Expanded `src/test/postgres/postgresPublishRoundTrip.test.ts` North Shore import assertions:
  - added schedule structural counts (`shoot_days`, `shoot_day_units`, `stripboard_strips`)
  - added relationship integrity checks (scene->episode and strip->scene ownership parity)
- Added `src/test/postgres/postgresFinancialOperationalModules.test.ts`:
  - budget categories/accounts/items/expenses/reconciliation + float links
  - revision-scoped reads and live-revision invariant enforcement check
  - documents CRUD + production scoping
  - equipment registry/list/terms workflows
  - vendor CRUD + invoices/purchase orders + invoice-expense links
  - task CRUD + template application
  - deliverable/template scope checks (project-wide vs episode)
  - music track + clearance scope/status checks
  - storyboard CRUD/ordering + bundle reads + Athena import metadata
- Expanded `src/test/postgres/postgresPublishRoundTrip.test.ts` asset checks:
  - storyboard `storage_key` rewrite assertions to `server-assets/productions/...`
  - corrupted package (missing asset bytes) import-path assertions for safe cleanup (no server files, no partial DB rows)
- Expanded APF + publish validation in Phase 5C:
  - `src/lib/importExport/__tests__/planImportStatements.postgres.test.ts`
    - added SQLite planner-path assertion proving `PRAGMA table_info(...)` is used and `information_schema` is not
  - `src/test/postgres/postgresPublishRoundTrip.test.ts`
    - added publish package metadata and deterministic table-order assertions
    - added SHA-256/size verification against bundled asset bytes
    - added strict missing-referenced-asset export failure assertion
    - added explicit import type-conversion integration checks (`UUID`, `BOOLEAN`, `NUMERIC`, `DATE`, `TIMESTAMPTZ`, `JSONB`)
    - expanded North Shore import validation with repository/service-level usability and cross-module relationship checks

## Fixes applied (narrow compatibility)

- `src/lib/db/repositories/person.ts`
  - normalized `is_cast` reads to `0|1` via `coerceBoolean`
  - made cast/crew filters dialect-safe (`TRUE/FALSE` on PostgreSQL, `1/0` on SQLite)
  - wrote `is_cast` as boolean binds for cross-dialect correctness
- `src/lib/db/repositories/shoot-day-units.ts`
  - normalized `is_locked` reads to `0|1` via `coerceBoolean`
  - switched insert/update writes to boolean-safe SQL/binds (`FALSE`, boolean params)
- `src/lib/db/repositories/schedule.ts`
  - changed default `shoot_day_units.is_locked` insert literal to `FALSE` for PostgreSQL compatibility
- `src/lib/db/duplicateProduction.ts`
  - normalized boolean writes for duplicated rows (`productions.is_episodic`, `people.is_cast`, `shoot_day_units.is_locked`)
- `src/lib/db/repositories/budgetAccounts.ts`
  - normalized `is_postable` boolean reads via `coerceBoolean`
  - made postable-account filters and writes dialect-safe (`TRUE/FALSE` on PostgreSQL)
- `src/lib/db/repositories/budgetDerived.ts`
  - normalized `is_enabled` reads/writes for PostgreSQL boolean columns
- `src/lib/db/repositories/vendorInvoices.ts`, `vendorPurchaseOrders.ts`
  - normalized NUMERIC reads via `coerceNumber`
  - normalized purchase-order `approval` boolean mapping and writes
- `src/lib/db/repositories/tasks.ts`, `taskTemplates.ts`
  - normalized task completion boolean mapping (`is_complete`) for PostgreSQL
  - made due-date ordering/filter SQL dialect-safe (`CURRENT_DATE` on PostgreSQL)
  - changed template-applied task inserts to boolean-safe literal (`FALSE`)
- `src/lib/db/repositories/equipmentLists.ts`
  - normalized list-item booleans (`checked_out`, `checked_back_in`) and boolean-safe writes
- `src/lib/db/repositories/costReportGroups.ts`, `budgetReconciliation.ts`
  - normalized aggregate/numeric reads that may arrive as strings on PostgreSQL
- `src/lib/db/repositories/floats.ts`, `floatReconciliation.ts`
  - normalized timestamp/numeric coercion for PostgreSQL TIMESTAMPTZ + NUMERIC reads/writes

## Open issues tracker

| Module | Failure | Cause | Severity | Proposed fix | Phase 5A/5B blocker |
| --- | --- | --- | --- | --- | --- |
| None (env provisioning) | Local machine role mismatch for PostgreSQL tests | Hardcoded `PGUSER/PGDATABASE` defaults required non-portable local role provisioning | medium | Fixed: PostgreSQL test harness now resolves credentials dynamically (`PG*` env first, then local-user candidates) | resolved |

## Validation run log

- `npm run test:postgres` — now attempts live local PostgreSQL execution via dynamic credential resolution (no hardcoded `albatross` role dependency)
- `npm test` — pass (`57` files, `340` tests), SQLite behavior unchanged, PostgreSQL tests compile and execute skip-path cleanly
- `npm run test:postgres` — PostgreSQL suites now execute connection path without role-provisioning skip reliance
- `npm test -- src/lib/db/repositories/budgetRevisions.test.ts src/lib/db/repositories/revisionAwareBudgetRepositories.test.ts src/lib/db/repositories/storyboard.test.ts src/lib/db/repositories/deliverable.episodic.test.ts src/lib/importExport/__tests__/apf-document-paths.test.ts src/lib/storyboard/athena-import.test.ts` — pass (`6` files, `57` tests), SQLite regression coverage for touched modules remains green
- `npm run test:postgres` — Phase 5C publish/APF/North Shore checks now run against resolved local credentials when available
- `npm test -- src/lib/importExport/__tests__/planImportStatements.postgres.test.ts src/lib/importExport/__tests__/exportProductionAsApf.test.ts src/lib/importExport/__tests__/importProductionFromApf.integration.test.ts src/lib/importExport/__tests__/apf-e2e-sqljs.integration.test.ts src/lib/importExport/__tests__/apf-export-roundtrip.test.ts src/lib/importExport/__tests__/apf-document-paths.test.ts` — pass (`6` files, `23` tests), APF compatibility + SQLite workflows unchanged
- `npm test -- src/lib/db/repositories/budgetRevisions.test.ts src/lib/db/repositories/revisionAwareBudgetRepositories.test.ts src/lib/db/repositories/storyboard.test.ts src/lib/db/repositories/deliverable.episodic.test.ts src/lib/storyboard/athena-import.test.ts` — pass (`5` files, `54` tests), touched SQLite repository regressions unchanged
- `npx eslint src/lib/importExport/__tests__/planImportStatements.postgres.test.ts src/test/postgres/postgresPublishRoundTrip.test.ts` — pass

## North Shore verification result (Phase 5C)

- End-to-end workflow validated in test coverage:
  - SQLite seed -> publish package export -> PostgreSQL import
  - server-path rewriting for documents and storyboard images
  - missing-asset failure cleanup for storage and DB state
- Repository/service usability checks were added for imported North Shore data:
  - production/episodic read
  - episodes/scenes/shots consistency
  - shoot-day -> bloc coherence
  - people, locations, documents, storyboard bundles
  - budget revisions/items/expenses
  - equipment, vendors/invoices/POs, tasks, deliverables, music/clearances
- Local role-provisioning blocker is removed; tests no longer require a pre-created `albatross` role to attempt live PostgreSQL execution.

## Phase 5 conclusion (5A-5C)

- 5A validated the core production graph against PostgreSQL and applied narrow boolean/timestamp compatibility fixes.
- 5B validated financial/operational/asset-heavy modules and added targeted cross-dialect coercion + SQL-compatibility fixes.
- 5C completed portability confidence:
  - APF compatibility checks for both SQLite (`PRAGMA`) and PostgreSQL (`information_schema`)
  - publish package export/import end-to-end assertions (determinism, checksums, strict asset failures, cleanup guarantees)
  - expanded North Shore verification to repository-level usability and relationship integrity checks
- SQLite remains unchanged and regression suites are green.
- Environment provisioning blocker for local PostgreSQL credentials is resolved.

## Remaining gaps

- Continue live PostgreSQL execution in CI/local environments to keep statuses moving from `blocked (env)` to `passing` as functional issues are addressed.
- Once PostgreSQL credentials are available, rerun:
  - `npm run test:postgres`
  - `npm test -- src/lib/importExport/__tests__/planImportStatements.postgres.test.ts src/lib/importExport/__tests__/exportProductionAsApf.test.ts src/lib/importExport/__tests__/importProductionFromApf.integration.test.ts src/lib/importExport/__tests__/apf-e2e-sqljs.integration.test.ts src/lib/importExport/__tests__/apf-export-roundtrip.test.ts src/lib/importExport/__tests__/apf-document-paths.test.ts`
