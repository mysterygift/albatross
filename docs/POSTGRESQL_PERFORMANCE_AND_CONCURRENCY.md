# PostgreSQL Performance and Concurrency (Phase 6)

## Scope

This phase validates PostgreSQL under simulated multi-user workload without changing SQLite runtime behavior.

- No product feature changes.
- No global runtime switch to PostgreSQL.
- SQLite support remains intact.

## Key operations and latency targets

The load suite targets these operations:

- Read
  - open project shell
  - list scenes and shots
  - load schedule/stripboard
  - load budget overview
  - load cost report + budget revision reads
  - load storyboard bundle
  - load people + bookings
- Write
  - update production metadata
  - update scene
  - update shot
  - reorder stripboard strip
  - update shoot day
  - update budget item

Default acceptance thresholds (env-overridable):

- p95 pool wait: `<= 40ms`
- operation error rate: `<= 2%`
- deadlocks: `0`
- lock wait failures (`55P03`): `<= 2`

## Load harness usage

Run:

- `npm run test:postgres -- src/test/postgres/postgresPerformanceConcurrency.test.ts`

Primary env controls:

- `PG_PHASE6_USERS` (default `6`)
- `PG_PHASE6_DURATION_MS` (default `5000`)
- `PG_PHASE6_WRITE_RATIO_DIVISOR` (default `4`, roughly 75/25 read/write)
- `PG_PHASE6_ACCEPTABLE_ERROR_RATE` (default `0.02`)
- `PG_PHASE6_ACCEPTABLE_P95_POOL_WAIT_MS` (default `40`)
- `PG_PHASE6_ACCEPTABLE_LOCK_WAIT_COUNT` (default `2`)

Pool tuning controls (used by PostgreSQL test harness):

- `PGPOOL_MAX` (default `8`)
- `PGPOOL_IDLE_TIMEOUT_MS` (default `10000`)
- `PGPOOL_ACQUIRE_TIMEOUT_MS` (default `5000`)
- `PG_SLOW_QUERY_MS` (default `75`)

The harness reports per-operation `p50/p95/p99`, error counts, and collects query/pool wait metrics from `PostgresDatabaseAdapter`.

## Query plan review (`EXPLAIN ANALYZE`)

The Phase 6 test suite includes explicit `EXPLAIN ANALYZE` checks for:

- scene list query by production, ordered by scene number
- shot list query by scene, ordered by shot number

These checks are tied to new measured indexes:

- `idx_scenes_production_scene_number_active`
- `idx_shots_scene_shot_number_active`
- `idx_stripboard_strips_board_lookup_active`

## Optimistic concurrency (`updated_at`)

Repository mutations now support server-side stale-write detection via optional expected timestamp checks:

- `updateProduction(..., { expectedUpdatedAt })`
- `updateScene(..., { expectedUpdatedAt })`
- `updateShot(..., { expectedUpdatedAt })`
- `updateShootDay(..., { expectedUpdatedAt })`
- `updateBudgetItem(..., { expectedUpdatedAt })`
- `reorderStrip(..., { expectedUpdatedAt })`
- `updateStrip(..., { expectedUpdatedAt })`

On mismatch, mutations throw `OptimisticConcurrencyConflictError` with code:

- `OPTIMISTIC_CONCURRENCY_CONFLICT`

## Deadlock risk review and lock ordering

High-risk write path reviewed:

- live budget revision switching (`setLiveBudgetRevisionForProduction`)

Rule applied:

- for PostgreSQL, lock all candidate `budget_revisions` rows for a production in deterministic `ORDER BY id FOR UPDATE` order before applying live/unset updates.

This avoids concurrent transactions taking row locks in opposite order.

## Known limits

- Current load suite executes at repository layer (not HTTP endpoint layer), which is intentional for deterministic CI coverage.
- Test data is synthetic “North Shore style” shape, not a full publish/import package replay.
- Production rollout monitoring/alerting and deployment tuning are out of Phase 6 scope.

## Slow query investigation workflow

1. Run `src/test/postgres/postgresPerformanceConcurrency.test.ts`.
2. Inspect console output table for high `p95/p99` operations.
3. Inspect collected PostgreSQL adapter metrics (query duration and pool wait).
4. Add focused `EXPLAIN ANALYZE` for the slow SQL.
5. Add or adjust index only when plan evidence shows repeated costly scans/sorts.
