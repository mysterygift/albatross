# PostgreSQL Migration Phase 5 Summary (5A-5C)

## Outcome

Phase 5 is implemented as validation + narrow compatibility fixes while keeping SQLite as runtime.

- Runtime remains SQLite.
- PostgreSQL is validated via adapter/harness + integration tests.
- No product features were added in this phase.
- Compatibility work was limited to mapper coercion, SQL dialect safety, and import/export robustness.

## What 5A validated (core production graph)

- Modules:
  - productions
  - settings
  - people/cast/crew/bookings
  - locations
  - scenes/shots
  - schedule (shoot days/units/strips/calendar)
  - episodic foundations (episodes + shooting blocs)
- Added PostgreSQL core graph integration coverage.
- Added North Shore structural assertions for schedule and scene/episode integrity.

## What 5B validated (financial + operational + asset-heavy)

- Modules:
  - budget
  - documents/attachments
  - equipment
  - vendors + finance links
  - tasks/templates
  - deliverables/templates
  - music/archive + clearances
  - storyboards
- Added comprehensive PostgreSQL repository-level integration tests for these modules.
- Strengthened publish/import asset-path and cleanup checks.

## What 5C validated (final portability pass)

- APF compatibility:
  - PostgreSQL planner path validated via `information_schema.columns`
  - SQLite planner path validated via `PRAGMA table_info`
- Publish package export:
  - deterministic table order assertions
  - manifest/version/source assertions
  - asset checksum/size assertions
  - strict missing-referenced-asset export failure behavior
- Publish package import:
  - explicit type-conversion coverage (`UUID`, `BOOLEAN`, `NUMERIC`, `DATE`, `TIMESTAMPTZ`, `JSONB`)
  - server-path rewriting checks (documents + storyboard images)
  - failed-import cleanup checks (storage + DB)
- North Shore end-to-end:
  - export from SQLite -> import to PostgreSQL
  - expanded repository/service-level usability and relationship integrity assertions across modules

## Key compatibility fixes across Phase 5

- Boolean normalization for cross-dialect reads/writes (e.g. `is_cast`, `is_locked`, `is_complete`, `approval`, `is_postable`, `is_enabled`, equipment list booleans).
- Numeric coercion where PostgreSQL returns strings (budget/vendor/aggregate paths).
- Date/time coercion normalization for PostgreSQL timestamp/date representations.
- Dialect-safe SQL updates (notably task due-date filtering/ordering and boolean predicates/literals).

## North Shore verification result

- Full verification logic exists in the PostgreSQL integration suite and now includes repository-level usability checks, not only table counts.
- Local PostgreSQL credential fallback is now auto-resolved in test harness (`PGUSER`/`PGDATABASE` if set, otherwise local-user candidates), removing the hard dependency on a pre-created `albatross` role.

## SQLite regression result

- APF import/export regression suites pass.
- Touched SQLite repository regressions pass.
- No intentional SQLite runtime behavior changes were introduced.

## Remaining limitations / deferred items

- Environment provisioning blocker (`role "albatross" does not exist`) is fixed by dynamic local credential resolution in PostgreSQL test setup.
- Follow-up: continue validating live PostgreSQL suites in CI and local runs with explicit `PG*` env vars where needed.

## Phase 5C files changed

- `src/test/postgres/postgresPublishRoundTrip.test.ts`
- `src/lib/importExport/__tests__/planImportStatements.postgres.test.ts`
- `docs/POSTGRESQL_MODULE_VALIDATION.md`
- `docs/POSTGRESQL_PHASE5_SUMMARY.md`

## Related docs

- `docs/POSTGRESQL_MODULE_VALIDATION.md`
- `docs/POSTGRESQL_PUBLISH_IMPORT.md`
