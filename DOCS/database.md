# Database

How the data layer works: SQLite access and transaction rules, migrations, repositories, the schema map, and the checklist for adding a column.

The desktop app stores everything in a local SQLite file (`albatross.db`, app data directory) through the Tauri SQL plugin. The file is encrypted with SQLCipher and only opened after sign-in; see [security.md](security.md). The optional Postgres server has its own schema; see [collaboration.md](collaboration.md).

## Code map

| Area | Location |
|---|---|
| Connection, `getDb()`, `executeBatch`, `now()`, `uuid()` | `src/lib/db/client.ts` |
| Adapter interface and implementations | `src/lib/db/databaseAdapter.ts`, `sqliteDatabaseAdapter.ts`, `postgresDatabaseAdapter.ts` |
| Optimistic concurrency error | `src/lib/db/concurrency.ts` |
| Repositories (one per entity or domain) | `src/lib/db/repositories/` |
| Domain row types | `src/lib/db/types.ts` |
| Orchestration services (script sections, budget revisions, sides, ...) | `src/lib/db/*Service.ts` |
| Migrations (SQL) and registration | `src-tauri/migrations/`, `src-tauri/src/lib.rs` |
| One-off TypeScript data migrations/backfills | `src/lib/db/migrations/` |
| Outbox, perf logger | `src/lib/db/outbox.ts`, `perf.ts` |
| Demo/seed data | `src/lib/db/seed/` |
| Duplicate production | `src/lib/db/duplicateProduction.ts` |
| Postgres schema | `postgres/schema/baseline.sql`, `postgres/migrations/` |

## SQLite access and transactions

`SQLiteDatabaseAdapter.load` opens the database, runs migrations, then sets `foreign_keys = ON`, `busy_timeout = 8000`, `journal_mode = WAL`, `synchronous = NORMAL`. `getDb()` throws `DatabaseLockedError` while the SQLCipher file is locked; `closeDb()` runs on logout. Placeholders are `$1, $2, ...` everywhere.

**The pool pitfall.** The Tauri SQL plugin uses a connection pool, so consecutive `db.execute()` calls can run on different connections. A `BEGIN` on one connection with the `COMMIT` on another leaves a transaction open, holds the write lock and surfaces later as `database is locked` or "writes that silently never commit".

What the adapter does for you:

- **Serialised writes.** Every `execute()` goes through a re-entrant global queue (`runSerializedExecute`), so two writes never run concurrently. `select()` is not queued.
- **Retry.** Lock errors (`SQLITE_BUSY`) are retried 3 times with 50/150/350 ms backoff, for both `execute` and `select`.
- **Re-entrancy.** A nested `runInSerializedTransaction` runs inline. Re-queuing would deadlock behind the outer task (regression test: `src/lib/db/clientSerializedTransaction.test.ts`).

Serialising does **not** make a multi-statement transaction safe. The rules:

| Situation | Do |
|---|---|
| One write | `db.execute(...)`. It is queued automatically. |
| Several writes that must commit together | `runInSerializedTransaction(async () => { ... executeBatch(db, [BEGIN, ...writes, COMMIT]) })` |
| Outbox rows for the same change | Add them to the same batch with `outboxStatementForRow(s)`; never a separate `outboxPush` after a batch write. |
| Bulk inserts or "ensure defaults" | One multi-row `INSERT` (or `INSERT OR IGNORE`) instead of a loop of single-row executes. |
| A read that must not interleave with writes | Run it inside the same `runInSerializedTransaction` (see `verifyCascades` in `seed/demoProductionSeed.ts`). |

`executeBatch` renumbers `$n` placeholders, joins the statements and sends **one** `execute()`, so the whole block runs on one connection. **Never** split `BEGIN`, the writes and `COMMIT` across separate `execute()` calls. `adapter.executeTransaction` is the stricter alternative (a Rust command, `execute_sqlite_transaction`, using a real sqlx transaction with rollback); today only sync v2 uses it (`src/lib/server/syncV2/localStore.ts`).

Reference implementations: `moveShootDayToDate` in `repositories/schedule.ts`, `duplicateProduction.ts`, `seed/demoCrewSeed.ts`.

## Adapters

`DatabaseAdapter` (`databaseAdapter.ts`) is the minimal surface repositories use: `execute`, `select`, `executeBatch`, optional `executeTransaction`, `runInSerializedTransaction`, plus a `dialect` tag.

| Adapter | Used by |
|---|---|
| `SQLiteDatabaseAdapter` | The app at runtime (`getDb()`). |
| `PostgresDatabaseAdapter` | Postgres parity/integration tests (`src/test/postgres/`, `npm run test:postgres`) (the same repository code runs against Postgres). Pool-based, optional schema name via `search_path`. |
| sql.js stand-in | Vitest suites that apply the real migrations in memory (`src/test/apf/`). Tests can inject any adapter with `setDbAdapterForTests`. |

`projectDataSource.ts` is a different concern: `getEffectiveDataSourceForProduction` returns `local_sqlite` or `remote_server` for a production (remote only for beta direct-remote links). Keep SQL dialect-neutral where code is shared with Postgres: `$n` placeholders, no SQLite-only functions. Details in [collaboration.md](collaboration.md).

## Migrations

SQLite migrations are plain SQL files in `src-tauri/migrations/` named `NNNN_<entity>_<descriptor>.sql` (currently `0001` to `0108`). Each is registered in `src-tauri/src/lib.rs`, in the `migrations` vec in `run()`:

```rust
Migration { version: 105, description: "crew_availability_cascade",
  sql: include_str!("../migrations/0105_crew_availability_cascade.sql"), kind: MigrationKind::Up },
```

A file that is not registered never runs ("no such column"). `src/test/apf/rustMigrationRegistration.test.ts` fails if any `.sql` file is missing from `lib.rs`, or if the `version` values are not exactly 1..N in file order. So the file prefix, the `version`, and the registration order must all agree, with no gaps.

To add one:

1. Create `src-tauri/migrations/<next>_<entity>_<descriptor>.sql` (for a nullable column a single `ALTER TABLE ... ADD COLUMN`).
2. Append the `Migration` entry to `lib.rs` with the same number.
3. Restart the desktop app. Migrations run when the database opens (`run_sqlite_migrations`, or inside `load_sqlite_with_passphrase` for an encrypted file, so they run with the key applied).
4. Mirror it in Postgres if the table is shared (see below).

Rules: migrations are forward-only and are never edited after release; the schema is the sum of all files (some tables were renamed or columns dropped later, e.g. `0083_scenes_drop_heading`). SQLite cannot drop constraints, so FK changes rebuild the table (see `0004_fk_cascade_refactor.sql`). Data fixes that need the encryption key or app logic are TypeScript backfills in `src/lib/db/migrations/`, run at sign-in (`loginOrchestration.ts`, `setupCommitService.ts`), not SQL.

Postgres: `postgres/schema/baseline.sql` is the full baseline and `postgres/migrations/` holds later numbered migrations. `src/test/postgres/postgresSchemaParity.test.ts` fails when a SQLite table is missing from the baseline. Ownership and workflow are in [collaboration.md](collaboration.md).

## Repositories

`src/lib/db/repositories/` holds all SQL for an entity; UI code never calls `getDb()` for entity data. Conventions (see `location.ts` for a compact example):

- **Row types** live in `src/lib/db/types.ts`. Most are `{...} & SoftDeletable` (`created_at`, `updated_at`, `deleted_at`).
- **Mapper.** A `rowToX(r: Record<string, unknown>)` function casts every column explicitly (`r.x as string | null`). `SELECT *` rows must pass through it; SQLite booleans are `0/1` (`coerceBoolean` in `sqlValueCoercion.ts`).
- **IDs and timestamps.** `uuid()` and `now()` (ISO 8601) from `client.ts`. Set `created_at`/`updated_at` on insert, `updated_at` on every update.
- **Insert and update.** `createX` lists columns and `$n` values in the same order; `updateX` builds `SET` from an `allowed` list and skips `undefined`. Coerce empty string/`NaN` to `null` for numeric columns.
- **Soft delete.** Delete sets `deleted_at` (and `updated_at`); reads filter `deleted_at IS NULL`. Hard deletes are only for permanent production delete (`permanentlyDeleteProduction`), demo reset and join rows; FK `ON DELETE CASCADE` removes children. Some tables have no `deleted_at` (join/derived rows, settings, caches).
- **Outbox.** Writes record `(entity, entity_id, operation, payload_json)` in the `outbox` table (`outboxPush`, or the statement helpers inside a batch). It is a change log written for later sync; `duplicateProduction` deliberately skips it.
- **Production scoping.** Nearly every table has `production_id`; every list query filters on it. Child tables without it (e.g. `shots`, `takes`) are reached through their parent.
- **Episode scoping.** In episodic productions, `scenes`, `deliverables`, `music_tracks`, `script_versions` and `script_sections` carry a nullable `episode_id`: `NULL` is production-wide, a value is one episode. Archiving an episode soft-deletes it. Listing functions take an explicit filter (e.g. `listDeliverablesByProduction` `filter: 'all' | 'project_wide' | 'episode'`).
- **Budget revision scoping.** Budget rows (`budget_items`, `fringe_rules`, `contingency_rules`, `production_totals`, `cost_report_groups`, `floats` and links) carry `budget_revision_id`. Resolve it with `resolveBudgetRevisionId` / `getLiveBudgetRevisionForProduction` in `repositories/budgetRevisions.ts`; copying a revision is `budgetRevisionService.ts`. Exactly one live revision per production.
- **Sensitive fields.** `people`, `locations`, `vendors` and `clients` store some columns encrypted with a companion `*_sort_key`. Repositories call `requireSensitiveDataAccess()` and the field encrypt/decrypt helpers. Registry: `src/lib/security/sensitiveTables.ts`; behaviour in [security.md](security.md).
- **Services** (`src/lib/db/*Service.ts`) coordinate several repositories in one serialised transaction (script sections, sides export, vendor finance documents). Put cross-entity logic there, not in a repository.

## Perf helpers

`src/lib/db/perf.ts` records timing for every `execute`/`select`, retries and lock errors in dev builds only (`import.meta.env.DEV`). The DB Perf HUD (`src/components/dev/DevPerfHud.tsx`) and "Log to console" read it; toggle in Settings → Developer. Use it to verify a change does not add round-trips or lock errors.

## Seed and demo data

`src/lib/db/seed/` builds the demo productions: **Mint Heist** (`DEMO_SLUG`) and an episodic **North Shore** (`DEMO_EPISODIC_SLUG`), both in `constants.ts`. `ensureDemoData()` / `resetDemoData()` in `demoProductionSeed.ts` insert or rebuild them (Settings → Developer); `createProductionFromTemplate.ts` uses the same seeders for the Demo and Default templates. Seeders use the transaction rules above and multi-row inserts. `seed_meta` records seed version/time; `defaultTaskTemplateSeed.ts` and the VAT/tax-credit seed services provide defaults. When you add a table that demo data should populate, add a seeder and call it from `runFullSeed`.

## Schema map

121 tables after migration `0108`, derived by applying all migrations. Almost all rows are production-scoped with `id` (UUID text) and the three timestamps; only notable details are listed.

**Productions and episodes**

| Table | Purpose |
|---|---|
| `productions` | A production: slug, currency, episodic flag, wrapped/archived, client, delivery date, code |
| `episodes` | Episodes of an episodic production (`sort_order`) |
| `shooting_blocs` | Named date ranges that group shoot days |
| `clients` | Instance-wide clients (not production-scoped; encrypted) |
| `units` | Production units (e.g. main, second unit) |
| `key_contacts` | Production key contacts by department |
| `production_crew_hierarchy_configs` | Per-production crew hierarchy JSON |

**Schedule and stripboard**

| Table | Purpose |
|---|---|
| `shoot_days` | Shoot days with call/wrap, weather, logistics, movement pins, bloc link |
| `shoot_day_units` | A unit working on a shoot day; holds `movement_order_json` |
| `stripboard_strips` | Stripboard strips (scene/shot/other) placed on days or the boneyard |
| `stripboard_items` | Older per-day scene ordering, still read by `repositories/schedule.ts` |
| `scenes` | Script scenes (number, INT/EXT, day/night, eighths, location, duration, episode) |
| `shots` | Shots within a scene (shot list, estimates) |
| `shot_cast`, `scene_cast` | Cast on a shot / in a scene |
| `storyboard_images`, `storyboard_imports` | Storyboard frames and their import batches |

**Script**

| Table | Purpose |
|---|---|
| `script_versions` | Imported script revisions (locked pages, previous version link) |
| `script_pages`, `script_elements`, `script_documents` | Parsed pages, screenplay elements, raw imported text |
| `script_sections`, `script_section_ranges`, `script_section_characters` | Script Sections: shootable page ranges and their characters |
| `shot_script_sections` | Shots linked to the sections they cover |
| `shoot_day_sides_exports` | Generated sides per day/unit |
| `script_revision_items` | Per-item outcomes when carrying work across script revisions |
| `breakdown_elements`, `breakdown_tags` | Script Breakdown elements and word-level tags |
| `slates`, `takes`, `script_supervisor_scene_progress`, `script_supervisor_day_logs` | Script Supervisor logging |
| `tramlines`, `tramline_segments`, `script_annotations`, `script_annotation_takes`, `continuity_media` | Lining, annotations, continuity photos |
| `production_script_supervisor_settings` | Slating system per production |

**People and bookings**

| Table | Purpose |
|---|---|
| `people` | Cast and crew (`is_cast`), contact, agent, role (encrypted fields) |
| `bookings` | Person booked over a date range / shoot day; optional `shoot_day_unit_id` (0107) calls them to one unit, null = whole day |
| `cast_availability`, `crew_availability` | Availability windows |
| `crew_day_hours`, `crew_hours_person_settings`, `production_crew_hours_settings` | Overtime: hours, per-person exemption, rules |

**Locations**: `locations` (address, what3words, parking, contact; encrypted), `location_scene` (location to scene links), `floor_plans` and `floor_plan_setups` (drawings of a location's spaces and the camera/actor positions per scene or shot; [Floor Plans](features/floor-plans.md)).

**Equipment**: `equipment` (items, rental/return, invoice link), `equipment_lists`, `equipment_list_items` (checkout lists), `equipment_terms` (shot/prop vocab).

**Budget and vendors**

| Table | Purpose |
|---|---|
| `budget_revisions` | Budget versions; one live; approval state |
| `budget_accounts`, `budget_categories` | Chart of accounts (hierarchical); legacy categories |
| `budget_items`, `budget_item_details`, `budget_item_expense_links` | Line items, typed details, matched expenses |
| `fringe_rules`, `fringe_rule_scopes`, `contingency_rules`, `contingency_rule_scopes` | Derived percentage rules and account scopes |
| `production_totals`, `production_total_accounts`, `cost_report_groups`, `cost_report_group_accounts` | Totals and cost-report groupings |
| `expenses`, `expense_transaction_details`, `expense_receipts`, `expense_tax_credit_allocations` | Actuals, typed details, receipts, tax-credit allocation |
| `floats`, `float_expense_links` | Cash floats and reconciliation |
| `tax_credit_schemes`, `vat_reclaim_rates`, `production_budget_features` | Tax credit/VAT config and feature flags |
| `vendors`, `vendor_production_exclusions` | Vendors (can be global) and per-production hiding |
| `vendor_invoices`, `vendor_invoice_expenses` | Invoices and expense links |
| `vendor_purchase_orders`, `vendor_purchase_order_expenses`, `vendor_purchase_order_amendments` | POs, allocations, amendments |
| `exchange_rates` | Currency rates |

**Call sheets and movement orders**: `call_sheets` (per day/unit with `overrides_json` and generated document). Movement orders are stored on `shoot_day_units.movement_order_json` and `shoot_days` pin columns.

**Documents, deliverables, music**

| Table | Purpose |
|---|---|
| `documents` | File attachments (`entity_type` + `entity_id`, `file_path`) |
| `deliverables`, `technical_specs` | Deliverables and their specs |
| `deliverable_templates`, `deliverable_template_items` | Reusable deliverable sets |
| `music_tracks`, `clearances`, `cue_sheets` | Music & Archive |

**Tasks**: `production_tasks` (parent/section/vendor invoice/equipment links), `production_task_sections`, `task_templates`, `task_template_items`.

**Risk assessments**: `risk_assessments`, `risk_assessment_hazards`, `risk_assessment_units`, `hazard_templates`.

**Auth and security**: `users` (local accounts, key wrapping material), `sessions`, `project_memberships` (access per production), `audit_logs` (auth and access events). See [security.md](security.md).

**Server and sync (client side)**: `server_connections`, `linked_projects`, `publish_jobs`, `server_outbox_pending`, and the sync v2 tables `sync_client_identity`, `sync_project_state`, `sync_mutation_batches`, `sync_mutations`, `sync_row_state`, `sync_conflicts`, `sync_apply_guard`. See [collaboration.md](collaboration.md).

**Settings, meta, cache**: `settings` (key/value), `seed_meta`, `outbox`, `api_cache` (external API responses).

## Add a column to an entity

Worked example: `what3words` on `locations` (migration `0033_locations_w3w.sql`).

1. **Migration.** `src-tauri/migrations/NNNN_locations_w3w.sql`: `ALTER TABLE locations ADD COLUMN what3words TEXT;`. Nullable or with a default; SQLite cannot add a `NOT NULL` column without one.
2. **Register** it in `src-tauri/src/lib.rs` (next `version`). Restart the app.
3. **Type.** Add the field to the entity in `src/lib/db/types.ts`.
4. **Repository** (`repositories/location.ts`): mapper (`rowToLocation`), the `XInsert` type, the `INSERT` column list and values (same order), and the `allowed` list in `updateX`.
5. **Sensitive data.** If the field is personal or confidential on `people`, `locations`, `vendors` or `clients`, add it to `SENSITIVE_TABLES` and the matching `*_PROTECTED_FIELDS`/encrypt/decrypt helpers; otherwise it is stored in clear ([security.md](security.md)).
6. **Form.** Zod schema, `defaultValues` and a field in the feature page (`src/features/<feature>/`); add a table column if it should show in the list.
7. **Export/import.** Export reads `SELECT *` and import inserts only columns that exist in the target, so plain columns travel automatically. Check any hand-written export SQL, redaction or `pruneOrphanedRows` rules, and see [import-export.md](import-export.md) for format-version rules (needed for new tables, not plain columns).
8. **`duplicateProduction.ts`.** It copies rows with explicit column lists; add the column to that table's `INSERT` and the source-row mapping (or to `DUPLICATE_EXCLUDED_COLUMNS` with a reason); `duplicateProduction.coverage.test.ts` fails otherwise.
9. **Postgres parity.** Add the same column to a new `postgres/migrations/` file and to `postgres/schema/baseline.sql`; `postgresSchemaParity.test.ts` compares table coverage. If sync v2 replicates the table, review `src/lib/server/syncV2/registry.ts` ([collaboration.md](collaboration.md)).
10. **Seed and tests.** Update demo seeders if the field should be populated, and any repository tests that assert full rows.

Gotchas: `INSERT` columns and values must stay in the same order; numeric inputs submit `""` and must be coerced to `null`; forgetting step 2 gives "no such column" at runtime (the registration test catches this in CI).

A new table needs more: the migration, registration, a type and repository, the parity baseline, `APF_V*_TABLE_KEYS` plus export/import and `duplicateProduction` ([import-export.md](import-export.md)), and a production-scoped FK with `ON DELETE CASCADE` so deleting a production removes it.
