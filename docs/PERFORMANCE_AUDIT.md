# Albatross Performance Audit

## 0. Deliverables

### A) Diagnosis (evidence-based)

**Top bottlenecks (to be filled from DevPerfHud / console after reproduction):**

1. **Outbox write per mutation** – Every create/update/delete does a separate `INSERT INTO outbox` after the main write. Outbox is **not** in the same transaction as the entity update, so each mutation = 2+ round-trips (entity UPDATE + outbox INSERT). Evidence: slow statement log showed `INSERT INTO outbox` taking ~10s under lock.
2. **Broad query invalidation** – Stripboard mutations call `invalidate()` which invalidates: `stripboardQueryKeys.all`, `unscheduledShotsQueryKeys.all`, `boneyardStripsQueryKeys.all`, `['shots']`. One strip move triggers refetch of all strips, all unscheduled shots, all boneyard strips, and all shots.
3. **Shot list: one cell edit invalidates four key families** – `updateShotMutation` onSuccess invalidates `['shots', sceneId]`, `['shots', productionId]`, `['stripboard']`, `['equipment-terms']`.
4. **SQLite PRAGMAs** – Only `foreign_keys` and `busy_timeout` were set. Default `journal_mode=delete` and `synchronous=FULL` are conservative and slower for an offline desktop app.
5. **Connection lifecycle** – Single shared connection (singleton). No per-query open/close. Outbox and entity updates share the same connection but run as separate statements (no batching of outbox into the same transaction).

**Where time goes:**

- **DB layer:** execute/select round-trips to the Tauri SQL plugin; outbox INSERT is a separate round-trip per mutation.
- **Query invalidation:** After each mutation, TanStack Query marks 2–4 query key trees stale and refetches them (large lists).
- **Rendering:** To be confirmed with React Profiler (see workflow below).

---

### B) Fixes implemented or recommended

| Area | Fix | Status |
|------|-----|--------|
| PRAGMAs | Enable WAL, set synchronous=NORMAL | Implemented in client (see §1) |
| Perf visibility | DB timing wrapper + DevPerfHud | Implemented |
| Invalidation | Narrow stripboard/shot invalidations | Recommended (see §4) |
| Outbox | Co-locate outbox write in same transaction | Recommended (repo refactor) |
| Debounce | Inline cell edit: commit on blur/enter, not every keystroke | Audit: shot-list already commits on blur/enter (no per-keystroke write) |
| Indexes | Verify with EXPLAIN QUERY PLAN | Migration 0004 + 0011 add many indexes; audit script below |

---

### C) Reproducible profiling workflow

**1. Turn on logging**

- Run the app in **dev**: `npm run tauri:dev` (or `tauri dev`).
- **DB timing** is always on in dev: every `execute`/`select` is timed and stored in `@/lib/db/perf`.
- **Perf HUD**: Bottom-right corner shows "DB Perf" with rolling avg, call count, slow count. Click to expand and see "Top 5 slow" and buttons "Log to console" / "Clear".
- **Console**: Click "Log to console" in the HUD to print rolling avg (last 50 calls) and top 20 slow queries.

**2. What to do to reproduce**

- **Inline cell edit (shot list):** Schedule → Shot lists, select a scene, edit a cell (e.g. lens, duration), blur/enter to commit. Observe HUD and console.
- **Create row:** e.g. add a person, add a location, add a budget category.
- **Update row:** Edit and save any entity (production, person, etc.).
- **Drag & drop:** Calendar – move a shoot to another day; Stripboard – move a strip, reorder, or bulk assign.
- **Demo seed:** Settings → Create Demo Production (or Reset Demo Data). Clear HUD before and "Log to console" after.

**3. Console helpers (dev only)**

- `window.__dbPerfSummary()` or `window.__dbPerfLog()` – same as "Log to console" in the HUD (rolling avg + top 20 slow).

**5. Verify improvements**

- **Before fixes:** Note rolling avg and top slow from HUD/console after each flow.
- **After fixes:** Repeat same flows; compare rolling avg and top 20 slow. Confirm no new errors and no data loss.

**6. EXPLAIN QUERY PLAN (manual)**

Run in SQLite CLI or a dev script:

```sql
EXPLAIN QUERY PLAN SELECT * FROM shoot_days WHERE production_id = ? AND deleted_at IS NULL ORDER BY shoot_date;
EXPLAIN QUERY PLAN SELECT * FROM stripboard_strips WHERE production_id = ? AND deleted_at IS NULL AND strip_status = 'SCHEDULED' AND shoot_day_id IS NOT NULL ORDER BY shoot_day_id, shoot_day_unit_id, sort_index;
```

Check for "SCAN" (table scan) vs "SEARCH" (index use). Add indexes for any SCAN on large tables.

---

## 1. Database setup audit

**PRAGMAs in use (client, after fix):**

- `PRAGMA foreign_keys = ON` – set per connection.
- `PRAGMA busy_timeout = 10000` – 10s wait on lock.
- `PRAGMA journal_mode = WAL` – set at first connection (persists in DB file). Enables concurrent reads during write and often reduces fsyncs.
- `PRAGMA synchronous = NORMAL` – set per connection. Acceptable for offline desktop; reduces fsync cost vs FULL.

**Not set (defaults):**

- `temp_store`, `cache_size` – defaults.

**Connection lifecycle:** Single shared connection (singleton via `getDb()`). No per-query open/close. No blocking IPC per keystroke for DB (shot-list commits on blur/enter).

**Transaction usage:** Multi-step operations (e.g. moveShootDayUnitToDate, mergeShootDayUnitIntoDay, swapShootDays) use explicit `BEGIN`/`COMMIT`/`ROLLBACK`. Many single-row updates (e.g. updateShot, updateStripEstimatedMinutes) do one UPDATE + one outbox push **without** wrapping both in one transaction.

**Outbox:** Every create/update/delete calls `outboxPush()` which does a separate `getDb()` and `INSERT INTO outbox`. So outbox write is **not** in the same transaction as the entity write. Result: 2 round-trips per mutation and possible lock contention (as seen with slow outbox INSERT).

---

## 2. SQL query audit (summary)

**Indexes (from migrations):** 0004 and 0011 add indexes on major FKs and filters (e.g. production_id, shoot_day_id, scene_id, strip_status). Equipment terms have (production_id, type). Exchange rates have (base_currency, quote_currency).

**Common patterns:** SELECT by production_id, by id, by shoot_day_id; ORDER BY shoot_date, sort_index; UPDATE single row by id; INSERT single row; INSERT into outbox.

**Recommendation:** Run EXPLAIN QUERY PLAN on the top slow queries (from HUD) and add composite indexes if plans show table scans.

---

## 3. TanStack Query invalidation map

| Mutation | Invalidations |
|----------|----------------|
| Calendar move / merge / swap / replace | calendar-events, shoot-days, stripboardQueryKeys.all |
| Stripboard: move, reorder, create, delete, move to boneyard, update estimated, set locked | stripboardQueryKeys.all, unscheduledShotsQueryKeys.all, boneyardStripsQueryKeys.all, ['shots'] |
| Shot list: updateShot | ['shots', sceneId], ['shots', productionId], ['stripboard'], ['equipment-terms'] |
| Others | Typically single key (e.g. ['people'], ['bookings']) |

**Overly broad:** Stripboard and shot-list invalidations cause full refetches of large lists on small edits. Fix: invalidate only the specific query keys affected (e.g. by shoot_day_id or strip id) where feasible, or use optimistic cache updates.

---

## 4. Rendering vs DB

To isolate:

- **DB time:** Use DevPerfHud rolling avg and top slow; add `console.time('mutation')` / `console.timeEnd('mutation')` around mutation calls.
- **Render time:** React DevTools Profiler, record while performing the same edit; compare commit duration vs DB duration.
- **Per-keystroke:** Shot list does **not** write on every keystroke; it commits on blur/enter. So typing is not triggering DB writes per key.
