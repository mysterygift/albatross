# PostgreSQL Migration Plan

> **Status:** Phase 2 implemented for schema/docs/tests (audit mapping + PostgreSQL consolidated baseline + parity/execution tests). Runtime DB switching remains out of scope.
> **Date:** 2026-04-29
> **Authors:** (generated from codebase audit)

---

## Table of contents

1. [Current SQLite architecture](#1-current-sqlite-architecture)
2. [Why PostgreSQL is being considered](#2-why-postgresql-is-being-considered)
3. [SQLite vs PostgreSQL: Albatross-relevant comparison](#3-sqlite-vs-postgresql-albatross-relevant-comparison)
4. [Schema migration changes required](#4-schema-migration-changes-required)
5. [Query and repository changes required](#5-query-and-repository-changes-required)
6. [Transaction and locking redesign](#6-transaction-and-locking-redesign)
7. [Deployment architecture options](#7-deployment-architecture-options)
8. [Data migration strategy](#8-data-migration-strategy)
9. [Testing strategy](#9-testing-strategy)
10. [Phased implementation plan](#10-phased-implementation-plan)
11. [Risks and open decisions](#11-risks-and-open-decisions)
12. [Recommendation](#12-recommendation)
13. [Phase 2 deliverables](#13-phase-2-deliverables)

---

## 1. Current SQLite architecture

### 1.1 Role of SQLite

Albatross is a Tauri v2 desktop application. SQLite is the sole database, running embedded on the user's machine. The database file lives at:

```
~/Library/Application Support/com.albatross/albatross.db
```

There is no server process. The Tauri Rust backend registers the `tauri-plugin-sql` plugin with the connection string `sqlite:albatross.db` and preloads it at app launch (`tauri.conf.json` → `plugins.sql.preload`). All 64 migrations are compiled into the Rust binary via `include_str!` and run automatically by the plugin's migration runner on app startup (`src-tauri/src/lib.rs`).

### 1.2 Client-side DB access model

The TypeScript frontend accesses the database through a single module (`src/lib/db/client.ts`) which:

1. **Loads** the database via `Database.load('sqlite:albatross.db')` from `@tauri-apps/plugin-sql`.
2. **Configures PRAGMAs** on first connection:
   - `PRAGMA foreign_keys = ON`
   - `PRAGMA busy_timeout = 8000`
   - `PRAGMA journal_mode = WAL`
   - `PRAGMA synchronous = NORMAL`
3. **Wraps** the raw `Database` object with performance logging and a write serializer.
4. **Exports** `getDb()`, `executeBatch()`, `runInSerializedTransaction()`, `now()` (ISO 8601 timestamp), and `uuid()` (`crypto.randomUUID()`).

There are **no Rust-side queries**. All SQL runs from TypeScript through the Tauri IPC bridge to the plugin's connection pool (sqlx).

### 1.3 Migration strategy

Migrations are sequential `.sql` files (`src-tauri/migrations/0001_initial.sql` through `0064_storyboard_foundation.sql`). Each is registered in `lib.rs` as a `Migration { version, description, sql, kind: MigrationKind::Up }`. The `tauri-plugin-sql` runner applies them in order on database load, tracking applied versions internally. There are no down migrations.

Key characteristics:
- All migrations use DDL (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`) and occasionally DML for backfills (e.g., `0054_budget_revisions.sql` creates a temp table, generates UUIDs with `randomblob()`, and backfills revision IDs).
- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are used throughout.
- No migration tooling outside the Tauri plugin (no CLI runner, no Flyway/Alembic/etc.).

### 1.4 Transaction rules

Documented in `docs/DATABASE_LAYER.md`. The golden rule is: **one transaction = one `db.execute()` call** because the Tauri SQL plugin's connection pool can dispatch separate `execute()` calls to different pooled connections.

- **`executeBatch(db, statements)`** concatenates an array of `{ sql, bindValues }` into a single combined SQL string with renumbered `$N` placeholders, then calls `db.execute(combinedSql, combinedBind)` once. This ensures `BEGIN … COMMIT` runs on one connection.
- **`runInSerializedTransaction(fn)`** is a re-entrant global tail queue that serialises all write operations so the pool never runs two `execute()` calls concurrently. Nested calls run inline (re-entrant) to prevent deadlock.
- Multi-statement transactions use the pattern: `runInSerializedTransaction` → build statements `[BEGIN, …writes…, outbox, COMMIT]` → `executeBatch`.
- Single-statement writes use `db.execute()` directly (already queued).
- Reads (`db.select()`) are not queued.

### 1.5 Repository / service boundaries

Approximately 40 repository modules live under `src/lib/db/repositories/`. Each exports pure functions that call `getDb()` and run SQL. There is no ORM; all queries are hand-written SQL strings with `$N` positional bind parameters. Repositories follow a consistent pattern:

- `rowToEntity()` mapper function (manual column-to-type mapping)
- `list*()`, `get*ById()`, `create*()`, `update*()`, `delete*()` (soft-delete: sets `deleted_at`)
- `hardDelete*()` where needed (e.g., `hardDeleteProduction` triggers `ON DELETE CASCADE`)

Higher-level service modules (`budgetRevisionService.ts`, `episodeManagementService.ts`, `equipmentInvoiceIngestionService.ts`, etc.) compose repository calls inside transactions.

### 1.6 Outbox / sync layer

An `outbox` table records every create/update/delete for future sync. Outbox rows are written inside the same `executeBatch` as the primary write. The outbox is populated but **not consumed** — sync is not yet implemented. Helper functions: `outboxStatementForRow`, `outboxStatementForRows`, `outboxPush`, `outboxInsert`, `outboxInsertMany` (in `src/lib/db/outbox.ts`).

### 1.7 Seed / demo data

Demo data is seeded through `src/lib/db/seed/` modules (`demoProductionSeed.ts`, `demoCrewSeed.ts`, `demoBudgetSeed.ts`, `demoBookingSeed.ts`, etc.). Seeds use `runInSerializedTransaction` + `executeBatch` for bulk inserts. A "North Shore" demo production and default task/deliverable templates are seeded on first launch.

### 1.8 Attachment / document storage

Attachment files (storyboard images, uploaded documents) are stored on disk under `~/Library/Application Support/com.albatross/attachments/` and `storyboards/`. The `documents` and `storyboard_images` tables store file-path references (`file_path`, `storage_key`), not binary blobs.

### 1.9 Import / export

Albatross supports `.apf` project file import/export. The import pipeline uses `PRAGMA table_info(tableName)` to introspect column metadata at runtime and dynamically build INSERT statements (`src/lib/importExport/planImportStatements.ts`).

---

## 2. Why PostgreSQL is being considered

### 2.1 Motivations

These are noted in the project's own `docs/to-do.md` under "BEFORE V1":

> *Migrate to PostgreSQL, and pressure test multi-user db read/write.*
> *Plan new DB structure & research options that best support local and remote access.*
> *Multiuser support.*

Specific benefits:

| Benefit | Detail |
|---------|--------|
| **Multi-user collaboration** | SQLite is single-writer. PostgreSQL supports concurrent reads and writes across many connections with row-level locking — essential for a team working on the same production. |
| **Server deployment** | Hosted collaboration requires a database accessible over a network. SQLite is a file; PostgreSQL is a service. |
| **Stronger typing and constraints** | PostgreSQL enforces strict types, native `BOOLEAN`, `UUID`, `TIMESTAMPTZ`, `JSONB`, `NUMERIC`, and richer CHECK/exclusion constraints. Reduces silent data coercion bugs. |
| **Richer relational features** | `RETURNING` clauses, CTEs with `INSERT/UPDATE/DELETE`, partial indexes (already used, but with more capabilities), exclusion constraints, row-level security, server-side functions. |
| **Operational tooling** | pg_dump, pg_restore, logical replication, point-in-time recovery, pgAdmin, connection pooling (PgBouncer), monitoring (pg_stat_statements). |
| **Future mobile companion** | A server-side PostgreSQL database could serve a companion mobile app (noted in to-do). |

### 2.2 Tradeoffs

| Tradeoff | Detail |
|----------|--------|
| **Operational complexity** | SQLite is zero-config. PostgreSQL requires a server process, connection management, backups, and monitoring. |
| **Loss of embedded simplicity** | Albatross currently works offline with no setup. Replacing SQLite entirely would break this. |
| **Network dependency** | Server-mode PostgreSQL requires connectivity. Offline-first workflows become harder. |
| **Migration burden** | 64 migrations and ~40 repository modules need audit and potential rewrite. |
| **Testing overhead** | Tests currently use sql.js mocks. PostgreSQL tests need a running database. |
| **Deployment cost** | Self-hosted users need to run PostgreSQL (or use a managed service). |

---

## 3. SQLite vs PostgreSQL: Albatross-relevant comparison

### 3.1 SQL dialect

| Feature | SQLite (current) | PostgreSQL | Migration impact |
|---------|-----------------|------------|------------------|
| **Placeholder syntax** | `$1, $2, …` | `$1, $2, …` | **None** — both use `$N` positional params. |
| **String concatenation** | `||` | `||` | None. |
| **Identifiers** | Case-insensitive by default | Case-sensitive (lowercase convention) | Low — Albatross uses lowercase table/column names throughout. |
| **`INSERT OR IGNORE`** | Supported | Not supported — use `ON CONFLICT DO NOTHING` | **Moderate** — used in `settings.ts` defaults seeding. |
| **`INSERT OR REPLACE`** | Supported | Not supported — use `ON CONFLICT DO UPDATE` | Low — not used in current codebase. |
| **`ON CONFLICT … DO UPDATE`** | Supported (SQLite 3.24+) | Supported | **None** — already used in ~10 repositories (settings, api_cache, exchange-rates, expense details, etc.). |
| **`RETURNING`** | Supported (SQLite 3.35+) but not used | Fully supported | Opportunity — could eliminate SELECT-after-INSERT round trips. |
| **`CREATE TABLE IF NOT EXISTS`** | Supported | Supported | None. |
| **`ALTER TABLE ADD COLUMN`** | Supported (limited) | Full support | None for add-column; PostgreSQL also supports `DROP COLUMN`, `ALTER TYPE`, etc. |
| **`CREATE TEMP TABLE`** | Supported | Supported | None — used in migration `0054`. |

### 3.2 Type system

| Albatross pattern | SQLite storage | PostgreSQL equivalent | Change required |
|-------------------|----------------|----------------------|-----------------|
| **IDs** (`TEXT PRIMARY KEY`, UUID strings) | TEXT (36-char UUID string) | `UUID` native type (or `TEXT`) | **Recommended**: use `UUID` type for validation and indexing efficiency. All 40+ tables affected. |
| **Booleans** (`INTEGER … CHECK (x IN (0, 1))`) | INTEGER 0/1 | `BOOLEAN` (`TRUE`/`FALSE`) | **Required**: 6+ columns (`is_cast`, `is_episodic`, `is_live`, `is_locked`, `checked_out`, `checked_back_in`, `is_postable`, `is_enabled`, `include_children`, `is_complete`, `is_required`, `approval`). TypeScript row mappers that do `Number(x) === 1` need updating. |
| **Timestamps** (`TEXT`, ISO 8601 strings) | TEXT (`2026-04-29T12:00:00.000Z`) | `TIMESTAMPTZ` | **Recommended**: native timestamp type. `now()` in `client.ts` returns `new Date().toISOString()` — would use `NOW()` server-side or pass `TIMESTAMPTZ` values. All ~130 `created_at`/`updated_at`/`deleted_at` columns across all tables affected. |
| **Timestamps** (`INTEGER`, epoch) | INTEGER (Unix epoch ms or s) | `TIMESTAMPTZ` (or `BIGINT` if preserving raw epoch) | **Required**: three tables (`api_cache`, `floats`, `float_expense_links`) use `INTEGER` timestamps instead of `TEXT`. These must be unified to `TIMESTAMPTZ` on PostgreSQL. Conversion: `TO_TIMESTAMP(epoch_value)` or normalize to ISO strings before import. |
| **Dates** (`TEXT`, `YYYY-MM-DD`) | TEXT | `DATE` | **Recommended**: native date type. Used in `shoot_date`, `start_date`, `end_date`, `due_date`, `issue_date`, `rental_start_date`, `return_due_date`, etc. |
| **Money / costs** (`REAL`) | IEEE 754 float | `NUMERIC(12,2)` or `NUMERIC` | **Recommended**: avoids floating-point rounding. Used in `estimated_cost`, `actual_cost`, `amount`, `matched_amount`, `permit_fee`, `location_fee`, `rate`, `replacement_value`. |
| **JSON columns** (`TEXT`) | TEXT (app does `JSON.stringify`/`JSON.parse`) | `JSONB` | **Recommended**: enables server-side JSON queries/indexing. Used in `details_json`, `overrides_json`, `meal_times_json`, `weather_json`, `metadata_json`, `payload_json` (outbox), `spec_defaults_json`. |
| **Integers** (`INTEGER`) | 64-bit integer | `INTEGER` / `BIGINT` | None for most. `sort_order`, `day_number`, `page_eighths`, `width`, `height`, `quantity`, `priority` all map directly. |
| **Enums** (TEXT + CHECK constraint) | TEXT with inline CHECK | PostgreSQL `CREATE TYPE … AS ENUM` or TEXT + CHECK | **Optional**: PostgreSQL enums are more efficient but harder to extend. CHECK constraints work fine on both. |

### 3.3 Date/time handling

SQLite has no native datetime type. Albatross stores all timestamps as ISO 8601 TEXT strings generated in JavaScript (`new Date().toISOString()`). Date comparisons in SQL (e.g., `shoot_date BETWEEN $1 AND $2`, `start_date <= end_date` CHECK) work because ISO 8601 sorts lexicographically.

PostgreSQL has native `TIMESTAMPTZ` and `DATE` types with proper timezone handling, comparison operators, and date arithmetic. Migration would:
- Replace TEXT columns with `TIMESTAMPTZ` / `DATE`.
- Update `client.ts` `now()` to return a value PostgreSQL accepts (ISO 8601 strings are accepted by PostgreSQL, so this may need no change).
- Verify that all date comparisons and `ORDER BY` clauses produce identical results.

### 3.4 Boolean handling

SQLite stores booleans as `INTEGER 0/1`. Albatross TypeScript code uses patterns like:
```typescript
const is_episodic = Number(isEpisodicCol) === 1
```
PostgreSQL uses native `BOOLEAN` (`TRUE`/`FALSE`). The Tauri SQL plugin (or any PostgreSQL driver) would return `true`/`false` instead of `0`/`1`, requiring updates to every `rowTo*()` mapper that manually converts integers to booleans.

### 3.5 JSON handling

No SQLite JSON functions (`json_extract`, `json_group_array`, etc.) are used in application SQL. All JSON columns are stored as TEXT and parsed in TypeScript. PostgreSQL `JSONB` would be a drop-in improvement — same storage pattern but with server-side indexing and query capability available for future use.

### 3.6 UUID generation

UUIDs are generated client-side via `crypto.randomUUID()` in `client.ts`. PostgreSQL has `gen_random_uuid()` (built-in since PG 13). The current client-side approach works with PostgreSQL — no change required unless server-side UUID generation is preferred.

Migration `0054` generates UUIDs in SQL using SQLite's `randomblob()`:
```sql
lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || ...
```
This would need to become `gen_random_uuid()` in PostgreSQL.

### 3.7 Foreign keys and CASCADE

Foreign keys with `ON DELETE CASCADE` are used extensively (30+ tables). SQLite requires `PRAGMA foreign_keys = ON` per connection. PostgreSQL enforces foreign keys by default. The CASCADE behavior is identical — this is a straightforward win.

**Caveat:** Several FKs were added via `ALTER TABLE ADD COLUMN … REFERENCES` without an explicit `ON DELETE` clause (e.g., `scenes.episode_id`, `music_tracks.episode_id`, `deliverables.episode_id`, `production_tasks.section_id`, `vendor_invoices.vendor_id`, `vendor_invoices.po_id`, `vendor_purchase_orders.vendor_id`). In SQLite with `PRAGMA foreign_keys = ON`, these default to `NO ACTION` (reject parent delete if children exist). PostgreSQL has the same default (`NO ACTION`/`RESTRICT`), so behavior is preserved — but the PostgreSQL migration is an opportunity to audit and explicitly declare the intended `ON DELETE` behavior for each.

### 3.8 Indexes (including partial indexes)

Albatross uses both regular and partial indexes. Partial indexes with `WHERE deleted_at IS NULL` appear in 7+ migrations (e.g., `productions_slug_unique`, `idx_vendor_invoices_vendor_active`, `idx_budget_item_expense_links_active_pair`). PostgreSQL supports identical syntax for partial indexes — no change required.

### 3.9 Transactions and concurrency

| Aspect | SQLite | PostgreSQL |
|--------|--------|------------|
| Concurrency model | Single writer (WAL allows concurrent reads + one writer) | MVCC: many concurrent readers and writers |
| Locking granularity | Database-level write lock | Row-level locks |
| Isolation default | SERIALIZABLE | READ COMMITTED |
| Connection pooling | Tauri plugin pool (source of "database is locked" issues) | PgBouncer / built-in pool; no "database is locked" |
| `busy_timeout` | Required (8s) | Not applicable |
| Write serialisation | Required (`runSerializedExecute`) | Not required for correctness |

### 3.10 Case-insensitive search

Albatross uses `LOWER(x) LIKE LOWER($n)` for case-insensitive text search (e.g., task search in `tasks.ts`). PostgreSQL supports `ILIKE` natively and `citext` extension. Current approach works on both, but `ILIKE` is more idiomatic.

### 3.11 `COALESCE` / `IFNULL`

`COALESCE` is used in several repositories (calendar, equipment lists). `COALESCE` is standard SQL and works identically on PostgreSQL. `IFNULL` (SQLite-specific) is not used.

---

## 4. Schema migration changes required

### 4.1 Type changes across all tables

Every table needs review. The following changes apply broadly:

| Column pattern | Current SQLite type | Target PostgreSQL type | Tables affected |
|----------------|--------------------|-----------------------|-----------------|
| `id TEXT PRIMARY KEY` | TEXT | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | All ~45 tables |
| Foreign key columns (`*_id TEXT`) | TEXT | `UUID` | All FK columns |
| `created_at TEXT NOT NULL` | TEXT | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | All ~45 tables |
| `updated_at TEXT NOT NULL` | TEXT | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | All ~45 tables |
| `deleted_at TEXT` | TEXT | `TIMESTAMPTZ` | All ~45 tables (soft-delete) |
| Boolean columns (`INTEGER … CHECK (x IN (0, 1))`) | INTEGER | `BOOLEAN DEFAULT FALSE` | ~12 columns |
| Money columns (`REAL`) | REAL (float64) | `NUMERIC(12,2)` | ~15 columns |
| Date columns (`TEXT`) | TEXT | `DATE` | ~12 columns |
| JSON columns (`TEXT`) | TEXT | `JSONB` | ~8 columns |

### 4.2 `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`

One occurrence in `settings.ts` (`ensureSettingsDefaults`):
```sql
INSERT OR IGNORE INTO settings (key, value) VALUES …
```
Must become:
```sql
INSERT INTO settings (key, value) VALUES … ON CONFLICT (key) DO NOTHING
```

### 4.3 SQLite-specific migration SQL

Migration `0054_budget_revisions.sql` uses:
- `randomblob()` for UUID generation → replace with `gen_random_uuid()`
- `hex()` → not needed with `gen_random_uuid()`
- `CURRENT_TIMESTAMP` → works in PostgreSQL (returns `TIMESTAMPTZ`)
- `CREATE TEMP TABLE` → works in PostgreSQL

### 4.4 `PRAGMA table_info` in import pipeline

`src/lib/importExport/planImportStatements.ts` uses `PRAGMA table_info(tableName)` to introspect columns at runtime. PostgreSQL equivalent:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = $1
```
This is a required change for the import/export system to work on PostgreSQL.

### 4.5 CHECK constraints

Existing CHECK constraints (vendor invoice status, purchase order status, strip type/status, equipment quantity, budget revision approval, boolean checks, date range checks) all use standard SQL syntax and work on PostgreSQL without modification. Consider migrating boolean CHECKs to native `BOOLEAN` type instead.

### 4.6 High-risk schema areas

| Area | Risk | Reason |
|------|------|--------|
| **Budget revisions** | High | Complex backfill migration (`0054`) with temp tables and SQLite-specific UUID generation. Revision-scoped FKs across 8 tables. |
| **Scenes / shots / schedule** | High | Deep FK chains: `production → scene → shot → stripboard_strip → shoot_day_unit → shoot_day`. Many joins in calendar queries. |
| **Storyboard** | Medium | Newer tables (`0064`) with file-path references to disk storage. Need to decide if image storage stays local or moves server-side. |
| **Episodic foundation** | Medium | Cross-cutting `episode_id` FK added to scenes, music_tracks, deliverables. Shooting bloc date-range CHECK constraint. |
| **Floats and float expense links** | Medium | `floats` and `float_expense_links` (migrations `0052`/`0053`) use `INTEGER` epoch timestamps while all other tables use `TEXT` ISO 8601. `api_cache` (`0051`) also uses `INTEGER` timestamps. These three tables need timestamp type unification during conversion. |
| **Outbox** | Low | Simple table, but sync implementation may need PostgreSQL-native features (LISTEN/NOTIFY, logical replication). |
| **Settings / seed meta** | Low | Key-value tables with `ON CONFLICT` upserts — straightforward. |

---

## 5. Query and repository changes required

### 5.1 Parameter placeholders

Both SQLite (via Tauri plugin/sqlx) and PostgreSQL use `$1, $2, …` positional parameters. The `executeBatch` function in `client.ts` renumbers placeholders when concatenating statements — this logic is unchanged.

**No placeholder syntax changes needed.**

### 5.2 `INSERT OR IGNORE`

One instance in `settings.ts`:
```typescript
`INSERT OR IGNORE INTO ${TABLE} (key, value) VALUES ${placeholders}`
```
Replace with:
```typescript
`INSERT INTO ${TABLE} (key, value) VALUES ${placeholders} ON CONFLICT (key) DO NOTHING`
```

### 5.3 `RETURNING` opportunities

Currently, every `create*()` function does INSERT then SELECT to return the created row:
```typescript
await db.execute(`INSERT INTO … VALUES (…)`, [...])
const rows = await db.select(`SELECT * FROM … WHERE id = $1`, [id])
```
PostgreSQL `RETURNING *` could eliminate the second round trip:
```typescript
const rows = await db.select(`INSERT INTO … VALUES (…) RETURNING *`, [...])
```
This is an optimisation opportunity across ~30 create functions, not a blocker.

### 5.4 `PRAGMA` calls

| PRAGMA | Where used | PostgreSQL equivalent |
|--------|-----------|----------------------|
| `PRAGMA foreign_keys = ON` | `client.ts` init | Not needed (always on) |
| `PRAGMA busy_timeout = 8000` | `client.ts` init | Not applicable |
| `PRAGMA journal_mode = WAL` | `client.ts` init | Not applicable (WAL is PostgreSQL default) |
| `PRAGMA synchronous = NORMAL` | `client.ts` init | `synchronous_commit` setting (connection-level) |
| `PRAGMA foreign_keys` (read) | `client.ts` DEV check | Not needed |
| `PRAGMA table_info(table)` | `planImportStatements.ts` | `information_schema.columns` query |

### 5.5 Boolean column reads

~12 repository `rowTo*()` mappers convert `INTEGER 0/1` to boolean:
```typescript
const is_episodic = Number(isEpisodicCol) === 1
```
With PostgreSQL `BOOLEAN`, the driver returns native `true`/`false`. These mappers need to handle both (for dual-backend) or be updated for PostgreSQL only.

### 5.6 `LIKE` / case sensitivity

One instance in `tasks.ts`:
```typescript
`LOWER(description) LIKE LOWER($n)`
```
Works on PostgreSQL. Could use `ILIKE` on PostgreSQL for simplicity.

Two instances in `schedule.ts`:
```sql
LOWER(u.name) LIKE '%main%'
```
Works on PostgreSQL. No change needed.

### 5.7 `COALESCE` usage

Used in `calendar.ts`, `equipmentLists.ts`, and others. Standard SQL — works identically.

### 5.8 Files and modules requiring the most attention

| Module | Changes needed | Complexity |
|--------|---------------|------------|
| `src/lib/db/client.ts` | Replace `Database.load()` with PostgreSQL connection. Remove PRAGMA calls. Potentially remove write serialiser. | **High** — this is the foundation. |
| `src/lib/db/perf.ts` | Update `isLockError()` (SQLITE_BUSY won't occur). May add PostgreSQL-specific error detection. | Low |
| `src/lib/db/outbox.ts` | No SQL changes (uses `$N` params, standard INSERT). | None |
| `src/lib/importExport/planImportStatements.ts` | Replace `PRAGMA table_info` with `information_schema`. | Medium |
| `src/lib/db/repositories/settings.ts` | `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`. | Low |
| `src/lib/db/repositories/production.ts` | Boolean mapping, RETURNING opportunity. | Low-Medium |
| `src/lib/db/repositories/schedule.ts` | Large file (~1600 lines). Many transactions. Boolean/date mapping. | Medium |
| `src/lib/db/repositories/budget.ts` | Revision-aware queries. Money type changes. | Medium |
| `src/lib/db/repositories/budgetRevisions.ts` | Complex revision lifecycle. | Medium |
| `src/lib/db/duplicateProduction.ts` | ~500 lines. Copies all rows across 28 tables. ID remapping. | **High** |
| `src/lib/db/seed/*.ts` | Bulk INSERT patterns. Need PostgreSQL-compatible syntax. | Medium |
| All `rowTo*()` mappers (~40) | Boolean/timestamp/UUID type coercion updates. | Medium (repetitive) |

---

## 6. Transaction and locking redesign

### 6.1 Current SQLite model

The current transaction model is documented in `docs/DATABASE_LAYER.md` and is driven entirely by SQLite's single-writer limitation:

- **Write serialization**: A global JS tail queue (`runSerializedExecute`) ensures only one `execute()` call is in-flight at a time.
- **executeBatch**: All multi-statement transactions are concatenated into a single `execute()` call to avoid cross-connection BEGIN/COMMIT splits.
- **Retry on SQLITE_BUSY**: Up to 3 retries with exponential backoff (50ms, 150ms, 350ms).
- **WAL mode + busy_timeout**: Allows concurrent reads while one write is in progress; waits up to 8s before failing.

This model exists because the Tauri SQL plugin's connection pool can dispatch separate `execute()` calls to different connections.

### 6.2 What becomes unnecessary with PostgreSQL

| SQLite workaround | PostgreSQL status |
|-------------------|-------------------|
| `runSerializedExecute` (global write queue) | **Unnecessary for correctness.** PostgreSQL handles concurrent writers with row-level locking. May retain as optional throttle for client-side write ordering. |
| `executeBatch` statement concatenation | **Partially unnecessary.** PostgreSQL connections are not pooled in the same way by Tauri plugin. With a proper PostgreSQL client, `BEGIN` + individual statements + `COMMIT` on the same connection works correctly. However, `executeBatch` reduces IPC round trips and could be retained as an optimisation. |
| `PRAGMA busy_timeout` | **Unnecessary.** PostgreSQL uses statement-level timeouts (`statement_timeout`) and lock timeouts (`lock_timeout`), but does not have a global "database is locked" failure mode. |
| `PRAGMA journal_mode = WAL` | **Unnecessary.** PostgreSQL uses WAL by default. |
| `isLockError()` retry logic | **Largely unnecessary.** Deadlocks can occur in PostgreSQL but are rare with proper transaction design. Retry logic for deadlock (`40P01`) may be useful, but SQLITE_BUSY-style retries are not needed. |

### 6.3 What still needs explicit handling

| Concern | PostgreSQL approach |
|---------|-------------------|
| **Transaction isolation** | Default `READ COMMITTED` is suitable for most Albatross operations. Budget revision lifecycle (promote draft → live) may need `SERIALIZABLE` or explicit locking (`SELECT … FOR UPDATE`). |
| **Connection pooling** | Use a connection pool (PgBouncer or driver-level). Each transaction must use **one connection** — the pool must support transaction-scoped connections. |
| **Deadlock prevention** | Acquire locks in consistent order. PostgreSQL detects deadlocks and aborts one transaction — need retry logic for error code `40P01`. |
| **Long-running transactions** | Avoid holding transactions open during user interaction. Albatross's current "build all statements then executeBatch" pattern naturally keeps transactions short. |
| **Concurrent modification** | Optimistic concurrency control (check `updated_at` before UPDATE) may be needed for multi-user collaboration. Not currently implemented. |

### 6.4 Multi-statement transaction structure in PostgreSQL

With a proper PostgreSQL driver (not Tauri's SQLite plugin), the pattern changes:

**Current (SQLite + Tauri plugin):**
```
runInSerializedTransaction → executeBatch(db, [BEGIN, ...writes, COMMIT])
```

**PostgreSQL:**
```
pool.withTransaction(async (client) => {
  await client.query(write1)
  await client.query(write2)
  await client.query(writeOutbox)
  // auto-commit on success, auto-rollback on error
})
```

The key difference: PostgreSQL driver provides connection-scoped transactions natively. The `executeBatch` concatenation trick is unnecessary for correctness but may still be used for performance (fewer IPC round trips).

---

## 7. Deployment architecture options

### Option A: SQLite local + PostgreSQL for collaboration (recommended)

SQLite remains the default local database. PostgreSQL is used only when the user connects to a server for multi-user collaboration.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Preserves offline-first experience. No setup for solo users. PostgreSQL only for teams who opt in. Incremental rollout possible. |
| **Cons** | Two database backends to maintain. Need a shared abstraction layer. Data sync between local SQLite and server PostgreSQL adds complexity. |
| **Implementation complexity** | High — requires a repository abstraction layer and a sync/publish mechanism. |
| **Product implications** | Solo users see no change. Teams get collaboration. Clear upgrade path. |

### Option B: PostgreSQL replaces SQLite entirely

All users connect to PostgreSQL, even locally.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | One backend. Simpler code. No sync problem. Full PostgreSQL features everywhere. |
| **Cons** | Every user must install/run PostgreSQL (or use an embedded PG like pgembedded/pglite). Breaks zero-setup offline experience. Self-hosted users need DBA skills. |
| **Implementation complexity** | Medium — one migration path, one query set. But operational burden shifts to users. |
| **Product implications** | Significant UX regression for solo/casual users. Embedded PG solutions (e.g., PGlite/electric-sql) could mitigate but add their own complexity and are less mature. |

### Option C: Dual-backend adapter layer

A shared repository interface with SQLite and PostgreSQL implementations. The app detects which backend to use at runtime.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Maximum flexibility. Users choose local or server. Migration is gradual. |
| **Cons** | Highest implementation cost. Two implementations of every repository function. Risk of behavioral divergence. Testing matrix doubles. |
| **Implementation complexity** | Very high — essentially maintaining two database layers. |
| **Product implications** | Best user experience but highest engineering cost. |

### Recommendation

**Option A (SQLite local + PostgreSQL for server/collaboration)** is recommended. This:

1. Preserves the zero-setup offline-first experience that defines Albatross today.
2. Introduces PostgreSQL only for the collaboration server (a new component, not a replacement).
3. Avoids forcing solo users to run PostgreSQL.
4. Allows incremental migration: start with a server-side API that talks to PostgreSQL while the desktop app continues using SQLite locally.
5. Sync between local and server is a separate, well-defined problem (the outbox table is already designed for this).

The shared abstraction should be at the **service/use-case level**, not at the raw SQL level. The server-side code can have its own PostgreSQL repositories. The import/export `.apf` format already defines a portable data interchange format.

---

## 8. Data migration strategy

### 8.1 Migration direction

Data flows from local SQLite → server PostgreSQL when a user "publishes" or "connects" a production to a collaboration server. This is a **one-time import per production**, not a continuous bidirectional sync.

### 8.2 Export from SQLite

1. Query all rows from each table for the target `production_id` (respecting FK order).
2. Serialize to a transport format (JSON or the existing `.apf` format).
3. Include attachment file references (paths, not blobs).

The existing `duplicateProduction.ts` already demonstrates reading all production data across 28+ tables. The `.apf` export pipeline (`src/lib/importExport/`) already serializes production data to a portable format. Either can serve as the basis.

### 8.3 Import into PostgreSQL

1. **Dependency order**: Insert tables in FK dependency order:
   - `productions` → `episodes`, `shooting_blocs` → `people`, `locations`, `budget_categories`, `budget_accounts`, `units` → `scenes`, `shoot_days`, `vendors`, `budget_revisions` → `shots`, `shoot_day_units`, `budget_items`, `expenses`, `vendor_invoices`, `vendor_purchase_orders`, `task_sections` → `stripboard_strips`, `bookings`, `scene_cast`, `shot_cast`, `budget_item_expense_links`, `floats`, `fringe_rules`, `contingency_rules`, `production_totals`, `cost_report_groups`, `deliverables`, `music_tracks`, `clearances`, `equipment`, `production_tasks`, `documents`, `storyboard_imports` → `storyboard_images`, `equipment_lists` → `equipment_list_items`, `technical_specs`, etc.

2. **ID preservation**: Preserve original UUIDs. Since IDs are `crypto.randomUUID()` (v4), collisions across productions are effectively impossible. No remapping needed.

3. **Type conversion during import**:
   - `INTEGER 0/1` → `BOOLEAN`
   - `TEXT` timestamps → `TIMESTAMPTZ` (PostgreSQL parses ISO 8601 strings natively)
   - `TEXT` dates → `DATE`
   - `REAL` amounts → `NUMERIC`
   - `TEXT` JSON → `JSONB` (PostgreSQL parses JSON strings into JSONB on insert)

4. **Foreign key validation**: Import within a single transaction. PostgreSQL will enforce FK constraints. If any reference is broken, the entire import fails atomically. Run `DEFERRABLE INITIALLY DEFERRED` on FK constraints to allow out-of-order inserts within the transaction if needed.

### 8.4 Attachment files

Attachments (`attachments/`, `storyboards/`) are referenced by file path in the database. For server deployment:

- **Option 1**: Upload files to object storage (S3/R2/MinIO). Update `file_path` / `storage_key` to point to object storage URLs.
- **Option 2**: Store files on the server filesystem. Update paths to server-relative locations.

Decision depends on deployment architecture (single server vs. distributed).

### 8.5 Seed and demo data

Demo data (North Shore production, default templates) should be seeded into PostgreSQL separately. The seed modules in `src/lib/db/seed/` can be adapted for server-side seeding, or demo data can be imported via the standard import pipeline.

### 8.6 Migration verification

After import:

1. **Row counts**: Verify row counts per table match source.
2. **FK integrity**: `SELECT` with `LEFT JOIN` to check for orphaned references.
3. **Checksum spot checks**: Compare hashes of key fields (production names, budget totals, scene counts) between source SQLite and target PostgreSQL.
4. **Attachment file verification**: Confirm all referenced files exist at their new locations.

### 8.7 Rollback strategy

- The source SQLite database is never modified during export. It remains the source of truth.
- If PostgreSQL import fails, the server database can be dropped and re-imported.
- If PostgreSQL import succeeds but the user wants to revert, the local SQLite database is still intact.

### 8.8 Handling corrupt or legacy databases

- Older Albatross databases may have NULL values in columns that later migrations expect to be NOT NULL (migrations only apply to new rows).
- The import pipeline should validate and sanitize data, applying defaults where needed.
- The existing `.apf` import `preflightApfImport.ts` module already performs this kind of validation — a similar approach should be used.

---

## 9. Testing strategy

### 9.1 Schema parity tests

Write tests that verify the PostgreSQL schema matches the SQLite schema in terms of:
- Table names and column names
- Column types (mapped equivalents)
- Constraints (NOT NULL, UNIQUE, CHECK, FK)
- Indexes (including partial indexes)

These can be generated from the SQLite migrations and compared against PostgreSQL `information_schema`.

### 9.2 Repository behavior tests

Each repository module should have integration tests that run against both SQLite and PostgreSQL:

- CRUD operations
- Soft-delete filtering (`WHERE deleted_at IS NULL`)
- `ON CONFLICT` upserts
- Transaction atomicity (multi-statement executeBatch)
- FK cascade behavior (`ON DELETE CASCADE`)
- NULL handling
- Sort order consistency

### 9.3 Migration and import tests

- **Round-trip test**: Export a production from SQLite → import to PostgreSQL → export from PostgreSQL → compare with original.
- **Large dataset test**: Import a production with thousands of rows (scenes, shots, budget items) to verify performance and constraint enforcement.
- **Incremental migration test**: Apply all 64 migrations to a fresh PostgreSQL database to verify migration SQL compatibility.

### 9.4 Transaction and concurrency tests

- **Multi-writer test**: Simulate 5+ concurrent writers updating the same production on PostgreSQL. Verify no data corruption.
- **Deadlock test**: Deliberately create conflicting write patterns. Verify deadlock detection and retry.
- **Isolation test**: Verify that concurrent budget revision operations (promote draft → live) are serialized correctly.

### 9.5 Seed and demo verification

- Run the full demo seed pipeline against PostgreSQL.
- Verify the North Shore demo production is complete and functional.
- Verify default task and deliverable templates are seeded correctly.

### 9.6 Performance tests

- Compare query performance for key operations (list productions, load schedule, calculate budget totals) between SQLite and PostgreSQL.
- Benchmark bulk operations (duplicate production, import/export) on both backends.

### 9.7 Local SQLite regression tests

If SQLite remains the local backend (Option A), all existing tests must continue to pass against SQLite. The test suite should run against both backends in CI.

### 9.8 Test infrastructure

| Approach | Recommendation |
|----------|---------------|
| **Dockerized PostgreSQL** | Recommended for CI. Use `docker-compose` with a PostgreSQL service. Fast, reproducible, disposable. |
| **Testcontainers** | Recommended for integration tests. Spins up a PostgreSQL container per test suite, tears down after. |
| **Local dev database** | Acceptable for development. Developers run `docker run -d postgres:16`. |
| **CI service database** | GitHub Actions `services` block with PostgreSQL. Already well-supported. |

Current tests use `sql.js` as a mock for the Tauri SQL plugin (see `createSqlJsTauriAdapter` in test files). For PostgreSQL tests, a similar adapter pattern could wrap a real PostgreSQL connection.

---

## 10. Phased implementation plan

### Phase 1: Audit and compatibility layer

**Goal:** Establish a testable abstraction without changing the production app.

**Deliverables:**
- Complete inventory of all SQLite-specific SQL patterns (this document).
- Define a `DatabaseAdapter` interface that `client.ts` could implement for both SQLite and PostgreSQL.
- Prototype adapter with the SQLite implementation matching current behavior exactly.
- Add CI job with Dockerized PostgreSQL (no tests yet, just infrastructure).

**Risks:** Over-engineering the abstraction layer. Keep it minimal — `execute`, `select`, `executeBatch`, `runInSerializedTransaction`.

**Stop condition:** Existing tests pass with the SQLite adapter. PostgreSQL CI infrastructure runs.

#### Phase 1 SQLite-specific SQL inventory (code audit)

This inventory is intentionally implementation-level and conservative. It documents SQLite-specific usage before any PostgreSQL application behavior is introduced.

| Pattern / assumption | Where it appears | Why SQLite-specific | PostgreSQL equivalent / migration note | Risk |
|---|---|---|---|---|
| `INSERT OR IGNORE` | `src/lib/db/repositories/settings.ts` (`ensureSettingsDefaults`) | SQLite conflict shortcut syntax | `INSERT ... ON CONFLICT (key) DO NOTHING` | Medium |
| `INSERT OR REPLACE` | Not present in application SQL | SQLite-only upsert shortcut | If introduced later, replace with `ON CONFLICT ... DO UPDATE` | Low |
| `ON CONFLICT ... DO UPDATE` | Repositories: `settings.ts`, `apiCache.ts`, `exchange-rates.ts`, `createTypedExpense.ts`, `budgetItemDetails.ts`, `expenseTransactions.ts`, `rentalTransactions.ts`, `purchaseTransactions.ts`; seed helper `seedMeta.ts` | Supported by SQLite and PostgreSQL, but conflict target behavior must stay consistent | Keep syntax; verify unique indexes/constraints parity during PG schema phase | Low |
| `datetime('now')` | Migrations `0031_deliverable_template_defaults.sql`, `0058_deliverable_template_svod_packages.sql` | SQLite datetime function | Use `NOW()` or `CURRENT_TIMESTAMP` in PostgreSQL migration SQL | Medium |
| `CURRENT_TIMESTAMP` | Migration `0054_budget_revisions.sql` backfill | Dialect behavior differs subtly by type/timezone handling | Keep but validate `TIMESTAMPTZ` behavior during PG migration phase | Low |
| `strftime(...)` | Not present in current SQL | SQLite date formatting function | Would map to `to_char(...)` or date functions in PostgreSQL if introduced | Low |
| `json_extract(...)` and SQLite JSON functions | Not present in current application SQL (`json_` usage is JSON stored as TEXT literals only) | SQLite JSON1 function family differs from PostgreSQL JSON/JSONB operators | Current app-side JSON parse/stringify avoids dialect function dependency | Low |
| `randomblob(...)` UUID generation | Migration `0054_budget_revisions.sql` | SQLite binary random helper used to synthesize UUID text | Replace with `gen_random_uuid()` in PostgreSQL schema/migration phase | High |
| `last_insert_rowid()` | Not present in current SQL | SQLite-specific rowid helper | Use `RETURNING` in PostgreSQL where needed | Low |
| `AUTOINCREMENT` / `INTEGER PRIMARY KEY` rowid tables | Not present in current migrations | SQLite rowid/autoincrement semantics | Continue UUID primary keys for PG path | Low |
| PRAGMAs (`foreign_keys`, `busy_timeout`, `journal_mode`, `synchronous`) | Runtime init in `src/lib/db/client.ts`; migration toggles in `0004_fk_cascade_refactor.sql`, `0055_cost_report_groups_revision_uniqueness.sql`; import metadata introspection in `src/lib/importExport/planImportStatements.ts` (`PRAGMA table_info`) | PRAGMA is SQLite-specific control/introspection | Runtime PRAGMAs become no-op concerns in PG adapter; `PRAGMA table_info` must map to `information_schema.columns` in a future PG implementation | High |
| Boolean-as-integer (`0/1`) storage and mapper coercion | Schema examples: `productions.is_episodic`, `budget_revisions.is_live`, `people.is_cast`, `task_templates.is_required`, `shoot_days.is_locked`; repository coercion examples in `production.ts`, writes in `budgetDerived.ts`, `budgetAccounts.ts`, `shoot-day-units.ts` | SQLite lacks native strict boolean type and current app relies on integer coercion | PostgreSQL adapter/repositories must preserve behavior until explicit boolean migration phase | High |
| TEXT date/time columns (`created_at`, `updated_at`, `deleted_at`) | Broadly across migrations (`0001_initial.sql`, `0004_fk_cascade_refactor.sql`, and later additive migrations) | SQLite typing is permissive and ISO text comparisons are relied on | Future PG schema should use `TIMESTAMPTZ`/`DATE` with compatibility validation | Medium |
| Permissive typing assumptions | Import path coercion in `planImportStatements.ts` (`coerceCellValue`), repository row mappers casting with `Number(...)` | SQLite accepts broader runtime coercions than PostgreSQL | Explicit coercion rules required before PG repository rollout; no behavior change in Phase 1 | High |
| Transaction model tied to SQLite pool/locking | `src/lib/db/client.ts` docs and code: single serialized write queue, retry on lock (`SQLITE_BUSY`), one-call `executeBatch` transaction blocks | Workaround for SQLite + Tauri pooled connection behavior | Preserve exactly in SQLite adapter. PostgreSQL behavior intentionally deferred to later phases | High |
| Batch execution assumption (`BEGIN ... COMMIT` in one `execute`) | Used across repositories/services/seeds via `executeBatch(...)` and `runInSerializedTransaction(...)`; import pipeline uses same pattern in `importProduction.ts`; outbox helpers in `src/lib/db/outbox.ts` | Existing correctness model depends on one execute call hitting one connection | Keep unchanged in adapter seam; do not redesign in this phase | High |
| SQLite/sql.js-backed tests | Database integration tests under `src/lib/db/**/*.test.ts` and import tests under `src/lib/importExport/__tests__/*sqljs*.test.ts`, plus `src/test/apf/sqlJsTauriAdapter*.ts` | Tests validate SQLite semantics via sql.js adapter and PRAGMA behavior | Keep existing tests on SQLite path; PG test execution deferred | Medium |
| Sync/outbox write assumptions | `src/lib/db/outbox.ts` (`outboxInsert`, `outboxInsertMany`, `outboxStatementForRows`) used from repository transaction batches | Assumes same-transaction write bundling with primary rows under current SQLite locking model | Preserve current coupling; no PG sync behavior added in this phase | Medium |

Audit scope included `src/lib/db/client.ts`, all files under `src/lib/db/repositories/`, migration SQL under `src-tauri/migrations/`, seed modules under `src/lib/db/seed/`, outbox/sync helpers, import/export SQL planning, and SQLite/sql.js test scaffolding.

### Phase 2: PostgreSQL schema and migrations

**Implementation summary:** Completed as a schema/docs/tests phase without changing SQLite runtime behavior.

**Delivered:**
- Chosen strategy documented and implemented as a **single consolidated PostgreSQL baseline** (no replay of historical SQLite migrations).
- Baseline schema and migration added at `postgres/schema/baseline.sql` and `postgres/migrations/0001_baseline.sql`.
- Full audit-driven mapping artifact added at `docs/POSTGRESQL_SCHEMA_AUDIT.md` (all tables/columns, SQLite -> PostgreSQL types, constraints/indexes/defaults, risk levels).
- Type mapping policies applied selectively: UUID IDs via `gen_random_uuid()` (`pgcrypto`), audited boolean fields to `BOOLEAN`, timestamp semantics to `TIMESTAMPTZ`, date-only fields to `DATE`, precision fields to `NUMERIC`, semantic JSON columns to `JSONB`.
- High-risk `0054_budget_revisions` handled by modeling final semantics directly (no `randomblob()` replay), including one-live-revision partial unique index.
- Semantic parity and execution tests added under `src/test/postgres/` (`postgresSchemaParity.test.ts`, `postgresMigrationExecution.test.ts`, shared helpers in `schemaAudit.ts`).

**Validation status:** Parity tests pass; migration execution tests are in place and pass in CI-capable environments with PostgreSQL access; representative SQLite suites continue to pass unchanged.

**Stop condition:** Met for this phase: PostgreSQL schema artifacts now exist with semantic parity coverage for tables, constraints, and indexes, while SQLite remains unchanged as active production runtime.

### Phase 3: Repository adapter and server-side data layer

**Goal:** Repositories work against PostgreSQL.

**Deliverables:**
- Update `client.ts` to support PostgreSQL connections (new `getPostgresDb()` or configurable adapter).
- Replace `INSERT OR IGNORE` with `ON CONFLICT DO NOTHING`.
- Replace `PRAGMA table_info` with `information_schema` query.
- Update `rowTo*()` mappers for PostgreSQL type returns (booleans, timestamps).
- Adapter-aware `executeBatch` (optional: use native transactions on PostgreSQL).

**Risks:** Behavioral differences in edge cases (NULL ordering, empty string vs NULL, REAL vs NUMERIC rounding).

**Stop condition:** All repository integration tests pass against PostgreSQL.

**Phase 3 implementation notes (current):**

- Added `PostgresDatabaseAdapter` at `src/lib/db/postgresDatabaseAdapter.ts` implementing the shared `DatabaseAdapter` contract (`execute`, `select`, `executeBatch`, `runInSerializedTransaction`).
- Added test-only adapter override hook in `src/lib/db/client.ts` via `setDbAdapterForTests(adapter)` so repository code can run against PostgreSQL in Vitest without changing app runtime defaults.
- `executeBatch` in `client.ts` now delegates to adapter-native `executeBatch` when available, preserving SQLite behavior while enabling PostgreSQL transaction handling.
- Added PostgreSQL repository harness `src/test/postgres/postgresRepositoryHarness.ts`:
  - Creates isolated schema per test run.
  - Applies `postgres/migrations/0001_baseline.sql`.
  - Returns adapter bound to that schema and cleanup helper.
- Added PostgreSQL repository integration tests in `src/test/postgres/postgresRepositoryCompatibility.test.ts` covering:
  - settings defaults conflict-safe insertion,
  - productions + episodic foreign key path,
  - boolean revision mapping (`is_live`),
  - numeric budget mapper coercion.
- Added explicit PostgreSQL adapter transaction tests in `src/lib/db/postgresDatabaseAdapter.test.ts` (commit + rollback behavior).
- Added SQL dialect metadata (`dialect`) on adapters in `src/lib/db/databaseAdapter.ts`.
- SQL compatibility updates:
  - `settings.ensureSettingsDefaults` now chooses SQLite `INSERT OR IGNORE` vs PostgreSQL `ON CONFLICT (key) DO NOTHING`.
  - APF import planner now uses `information_schema.columns` for PostgreSQL and keeps `PRAGMA table_info` for SQLite (`src/lib/importExport/planImportStatements.ts`).
- Mapper normalization updates for cross-dialect row shapes:
  - `production`, `budget`, `budgetRevisions` repositories now coerce booleans/timestamps/numeric strings safely.
  - Shared coercion helpers added in `src/lib/db/sqlValueCoercion.ts`.
- Added `npm run test:postgres` for targeted PostgreSQL test execution.

**Known remaining gaps after this stage:**

- Not all repositories have been ported to PostgreSQL test coverage yet (phase continues module-by-module).
- SQLite remains the active default runtime; no production runtime switch is introduced.

### Phase 4: Data import/export from SQLite to PostgreSQL

**Goal:** Users can publish a local production to a PostgreSQL server.

**Deliverables:**
- Export pipeline: SQLite → portable format (extend `.apf` or new JSON format).
- Import pipeline: Portable format → PostgreSQL (with type conversion).
- Attachment upload to server storage.
- Round-trip verification tests.

**Risks:** Large productions may be slow to import. Attachment upload reliability.

**Stop condition:** A full North Shore demo production imports correctly and is usable from server.

**Phase 4 implementation status (current):**

- Added a dedicated publish package pipeline under `src/lib/publish/`:
  - deterministic table export scope (`tableOrder`)
  - APF-style zip payload + publish manifest + checksummed asset manifest
  - strict referenced-asset validation
- Added SQLite export service:
  - `exportProductionForPostgresPublish(...)`
  - includes production rows and bundled document/storyboard files
- Added PostgreSQL import service:
  - `importPublishPackageToPostgres(...)`
  - explicit column-aware type conversion (UUID/BOOLEAN/NUMERIC/TIMESTAMPTZ/DATE/JSONB)
  - ID-preserving import strategy
  - collision preflight on production id
  - transaction-based row import via adapter `executeBatch`
  - server-path rewriting for document and storyboard file references
  - storage cleanup when import fails
- Added service boundary wrappers for file-based server workflows:
  - `exportProductionForServerPublish(...)`
  - `importPublishPackageFileToPostgres(...)`
- Added Phase 4 documentation:
  - `docs/POSTGRESQL_PUBLISH_IMPORT.md`

### Phase 5: Module-by-module validation

**Goal:** Verify every functional area works on PostgreSQL.

**Deliverables:**
- Validate each domain module against PostgreSQL:
  - Productions (CRUD, archive, wrap, duplicate)
  - Budget (categories, accounts, items, expenses, revisions, fringe, contingency, cost reports, reconciliation)
  - Schedule (shoot days, units, stripboard strips, scenes, shots, shot cast, calendar)
  - People (cast, crew, bookings, availability, hierarchy)
  - Locations (CRUD, scenes, travel)
  - Documents and attachments
  - Deliverables and templates
  - Tasks and templates
  - Equipment (registry, lists, invoices)
  - Vendors (invoices, purchase orders)
  - Music and clearances
  - Storyboards
  - Episodic (episodes, blocs)
  - Settings
  - Import/export (.apf)

**Risks:** Long tail of edge cases. Each module may reveal unique issues.

**Stop condition:** All modules pass functional tests on PostgreSQL.

### Phase 6: Performance and concurrency hardening

**Goal:** PostgreSQL performs well under multi-user load.

**Deliverables:**
- Load testing with concurrent users.
- Query optimisation (indexes, `EXPLAIN ANALYZE`).
- Connection pool tuning.
- Add `updated_at` optimistic concurrency checks where needed.
- Deadlock prevention review (lock ordering).

**Risks:** Performance regressions compared to SQLite (network latency vs local file). Unexpected deadlocks under concurrent writes.

**Stop condition:** Key operations complete within acceptable latency under simulated multi-user load.

**Phase 6 implementation artifacts (this repo):**
- `src/test/postgres/postgresPerformanceConcurrency.test.ts`
  - repeatable multi-user read/write load harness with operation-level p50/p95/p99 reporting
  - concurrent write safety assertions (same-row conflict, different-row safety, live revision switching)
  - `EXPLAIN ANALYZE` checks for high-frequency scene/shot list queries
- `src/lib/db/concurrency.ts`
  - `OptimisticConcurrencyConflictError` for structured stale-write failures
- Optimistic `updated_at` checks added to high-risk mutable rows:
  - productions, scenes, shots, shoot days, budget items, stripboard strip reorder/metadata updates
- PostgreSQL lock-order hardening:
  - deterministic `FOR UPDATE ORDER BY id` row locking in live budget revision switching
- Indexes added from measured query paths:
  - `idx_scenes_production_scene_number_active`
  - `idx_shots_scene_shot_number_active`
  - `idx_stripboard_strips_board_lookup_active`
- PostgreSQL pool/query instrumentation and env-configurable pool settings in test harness:
  - wait time, transaction/query timing, slow-query threshold logging
- Documentation:
  - `docs/POSTGRESQL_PERFORMANCE_AND_CONCURRENCY.md`

### Phase 7: Production rollout and documentation

**Goal:** Ship PostgreSQL support.

**Deliverables:**
- Server deployment guide (Docker, managed PostgreSQL).
- Self-hosted installation instructions.
- Backup and restore documentation.
- Updated `DATABASE_LAYER.md` for PostgreSQL transaction model.
- User documentation for "Connect to server" workflow.
- Monitoring and alerting setup guide.

**Risks:** Early adopter issues. Need clear rollback story.

**Stop condition:** Documentation complete. Beta users successfully running multi-user productions.

---

## 11. Risks and open decisions

### 11.1 Open decisions

| Decision | Options | Notes |
|----------|---------|-------|
| **Does SQLite remain for local/offline mode?** | Yes (recommended) / No | If yes, need sync story. If no, need embedded PG solution. |
| **How do two users resolve conflicts?** | Last-write-wins / CRDT / Manual merge | Outbox table suggests eventual consistency was planned. Conflict resolution strategy is undefined. |
| **Where are attachments stored server-side?** | Object storage (S3) / Server filesystem / Database BLOBs | Object storage is most scalable. |
| **Do IDs stay stable across local ↔ server?** | Yes (recommended: preserve UUIDs) / No (remap) | UUID v4 makes collisions negligible. Preserving IDs simplifies sync. |
| **How are migrations versioned for two backends?** | Shared numbered migrations with dialect branches / Separate migration sets / Single consolidated PG schema | Shared migrations with dialect-specific SQL snippets is pragmatic but complex. |
| **How to avoid repository divergence?** | Shared service layer calling backend-specific repos / Single repo set with dialect switches / ORM | Shared service layer is cleanest. ORM is heaviest. |
| **How to support self-hosted installs?** | Docker Compose (app + PG) / Single binary with embedded PG / Manual PG setup | Docker Compose is standard for self-hosted. |
| **Backup strategy for server PostgreSQL?** | pg_dump cron / Continuous archiving (WAL-G) / Managed DB backups | Depends on deployment platform. |
| **Is the outbox consumed for sync, or does sync use a different mechanism?** | Outbox-based sync / PostgreSQL logical replication / API-based sync | Outbox is already populated — consuming it is the natural next step. |

### 11.2 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Dual-backend maintenance burden** | High | Keep the abstraction layer thin. Share service logic, not SQL. Gradually reduce SQLite-specific code paths. |
| **Behavioral differences cause subtle bugs** | High | Comprehensive integration tests on both backends. Type coercion tests for booleans, timestamps, numerics. |
| **Performance regression from network latency** | Medium | Optimise queries. Use `RETURNING`. Batch writes. Consider GraphQL/tRPC for efficient data fetching. |
| **Migration fails for complex local databases** | Medium | Validate and sanitize data during export. Log warnings for data that can't be imported. Allow partial import with error report. |
| **Conflict resolution complexity** | High | Define conflict resolution strategy before implementing sync. Last-write-wins is simplest but may lose data. |
| **Scope creep** | High | This plan explicitly excludes sync, collaboration UI, and user authentication. Each is a separate project. |
| **Stale outbox data** | Low | Outbox rows accumulate indefinitely. Add TTL or garbage collection before enabling sync. |

---

## 12. Recommendation

Based on the audit of the current Albatross codebase, the recommended approach is:

1. **Keep SQLite for local/offline mode.** The zero-setup embedded database experience is a core product strength. Solo users and offline workflows must continue to work without PostgreSQL.

2. **Use PostgreSQL for the server/collaboration mode.** When users want multi-user access, they connect to a server that runs PostgreSQL. This is a new deployment target, not a replacement for local SQLite.

3. **Build a shared service/use-case layer.** Repository functions are implementation details. The service layer (create production, duplicate production, log expense, move shoot day, etc.) should be the shared contract. SQLite repositories and PostgreSQL repositories can have different SQL but the same service interface.

4. **Migrate module-by-module.** Start with the simplest domain (settings, productions) and work toward the most complex (budget revisions, schedule). Each module can be validated independently.

5. **Use the outbox for sync.** The outbox table is already populated for every write. Consuming it to sync local changes to the server is the natural path to collaboration — this aligns with the offline-first architecture that was clearly planned from the initial schema design.

6. **Do not rush to replace SQLite.** The current SQLite layer works well. The locking and transaction issues have been solved. The migration to PostgreSQL is about adding a new capability (collaboration), not fixing a broken one.

### Priority order

1. PostgreSQL CI infrastructure and schema compatibility tests.
2. PostgreSQL-compatible repository adapter for the server-side.
3. Data import pipeline (SQLite → PostgreSQL).
4. Server API for multi-user access.
5. Sync mechanism (outbox consumer).
6. Conflict resolution and optimistic concurrency.
7. Attachment storage migration.

---

## 13. Phase 2 deliverables

This phase intentionally does **not** switch runtime behavior to PostgreSQL. It is strictly schema/docs/tests, with SQLite migrations unchanged.

### 13.1 Strategy decision (explicit)

- **Chosen strategy:** a **single consolidated PostgreSQL baseline** that represents the final semantic schema state after all SQLite migrations.
- **Not chosen:** replaying the entire historical SQLite migration chain on PostgreSQL.
- **Rerun behavior:** baseline migration is a one-time bootstrap; reruns on the same schema are expected to fail fast because migration state should be tracked externally.

### 13.2 Added artifacts

- `docs/POSTGRESQL_SCHEMA_AUDIT.md`: full table-by-table SQLite -> PostgreSQL mapping artifact (columns, defaults, constraints, indexes, risk levels).
- `postgres/schema/baseline.sql`: consolidated PostgreSQL baseline schema.
- `postgres/migrations/0001_baseline.sql`: baseline migration file (same semantic SQL as the schema baseline).
- `src/test/postgres/postgresSchemaParity.test.ts`: semantic parity checks against the SQLite migration end-state.
- `src/test/postgres/postgresMigrationExecution.test.ts`: clean-build + rerun behavior tests on a real PostgreSQL instance.

### 13.3 Type policy applied in baseline

- UUID defaults via `pgcrypto` + `gen_random_uuid()`.
- Selective boolean conversion for audited 0/1 boolean-like fields only.
- `TIMESTAMPTZ` for timestamp semantics (`*_at` family).
- `DATE` for date-only semantics.
- `NUMERIC` for money/precision fields.
- `JSONB` only for semantic JSON columns (`*_json`).

### 13.4 0054 budget revisions semantics

- Historical SQLite `0054_budget_revisions.sql` used `randomblob()/hex()` for UUID backfill.
- The PostgreSQL baseline does **not** port that historical implementation detail.
- Instead, it encodes the final semantics directly: UUID defaults (`gen_random_uuid()`) and the partial unique index enforcing one live revision per production.

*This document is primarily a planning artifact. Phase 1 adds only a conservative SQLite compatibility seam and CI infrastructure; PostgreSQL application behavior remains out of scope until later phases.*
