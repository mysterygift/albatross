# Collaboration and the optional server

How the desktop app talks to the optional Albatross collaboration server, what is implemented in this repository, and the PostgreSQL tooling that lives here. Albatross is local-first: everything works without a server, and nothing below is active until **Settings → Local collaboration (Pilot)** is enabled.

## What lives where

| Piece | Repository |
|---|---|
| Desktop client: connection, publish, linked runtime, sync-v2 client | this repo (`src/lib/server`, `src/features/server`, `src/lib/publish`) |
| Publish package export and PostgreSQL import code | this repo (`src/lib/publish`) |
| PostgreSQL baseline schema, migrations, adapter, tests | this repo (`postgres/`, `src/lib/db/postgresDatabaseAdapter.ts`, `src/test/postgres`) |
| HTTP server (REST routes, JWT auth, publish jobs, presence, sync-v2 endpoints) | separate `albatross-server` repo, not in this tree |

Server behaviour in this document is what the client expects. The server's own docs are the authority for its implementation.

## Two sign-ins

| | Local (desktop) | Server |
|---|---|---|
| Purpose | Unlock the encrypted SQLite file and client PII | Access shared productions |
| UI | Auth gate screen | **Connect to server** dialog |
| Accounts | `users` table in local SQLite | `users` in the server's PostgreSQL |
| Password hash | Argon2id (`src/lib/auth/passwordHash.ts`) | Server-defined (scrypt) |
| Session | Local session token in `settings` and `sessions` | Bearer access token (JWT) |
| At-rest encryption | SQLCipher plus field-level encryption, see [security.md](security.md) | None in this repo's contract; data is plaintext JSON/columns in PostgreSQL |

- The accounts are unrelated. Creating a local user does not create a server user; usernames and passwords are not shared.
- Every server call happens after local unlock. The server never receives the instance key, DEK or recovery material.
- Published data is decrypted in the app before packaging, so it is plaintext on the wire (use TLS) and at rest on the server. Treat the server's PostgreSQL as the trust boundary for shared productions.

## Enabling and connecting

Settings keys (table `settings`; constants in `src/lib/server/constants.ts`):

| Key | Meaning |
|---|---|
| `local_collaboration_enabled` | `'true'` turns collaboration UI and traffic on for this device (default managed by `ensureSettingsDefaults`). |
| `feature_server_publish_enabled` | Legacy beta flag. Required, in addition to the key above, for publish and the linked runtime (below). |
| `server_session_token:<connectionId>` | Bearer token for a connection. Never logged. |
| `server_client_install_id` | Per-install UUID used for unlink and presence. |
| `dev_simulate_server_offline` | Dev tool: makes every `serverFetchJson` call fail as a network error. |

Connect flow (`ConnectServerDialog`, `src/features/server`):

1. Enter display name, server URL (`http(s)://` required, trailing slash trimmed), username and password, or paste an access token instead.
2. `POST /v1/auth/login` returns a token (the client accepts `accessToken`, `token` or `sessionToken`), then `GET /v1/me` and `GET /v1/projects` validate it.
3. Pick a workspace (from `me.workspaces`, else "Default workspace"). A row is written to `server_connections`; the token goes to `settings`.
4. `useServerSession` re-validates with `GET /v1/me`. Removing a connection in settings clears the token and deletes the row.

Limitations: the client stores the access token only. There is no refresh (`/v1/auth/refresh`) or logout call, so an expired token means reconnecting.

## Client tables

`server_connections`, `linked_projects`, `publish_jobs`, `server_outbox_pending` come from `src-tauri/migrations/0067_server_collab.sql`; the `sync_*` tables from `0087_sync_v2_foundation.sql`. See [database.md](database.md) for the migration system.

| Table | Purpose |
|---|---|
| `server_connections` | Saved servers (URL, workspace, username). |
| `linked_projects` | Production to remote project link. `link_state`: `unlinked`, `publishing`, `linked`, `offline`, `conflict`, `unlinking`. |
| `publish_jobs` | Local record of each publish (stage, bytes uploaded, error). |
| `server_outbox_pending` | Queued writes for the legacy linked runtime. |
| `sync_client_identity`, `sync_project_state`, `sync_mutation_batches`, `sync_mutations`, `sync_row_state`, `sync_conflicts`, `sync_apply_guard` | Durable state for sync-v2. |

## Publish

Publishing uploads a snapshot of a production to the server and links the local production to it. UI: **Productions → Publish to Server** (`PreflightPublishSheet`). Logic: `src/lib/publish`, `src/lib/server/serverClient.ts`.

1. **Export** (`exportProductionForPostgresPublish`): load production tables (`loadPublishProductionData`, the `.apf` loader plus extra tables such as budget revisions and floats), order them by `PUBLISH_TABLE_ORDER` (`tableOrder.ts`), collect attachments (strict: a missing file aborts), and zip with `fflate` as `manifest.json`, `data/publish-production.json`, `files/assets/*`. Format version `CURRENT_PUBLISH_FORMAT_VERSION` (1). When auth is active the actor needs edit access (`requireProjectEditAccess`). The zip is written to `publish-temp/` in the app data directory and removed after success.
2. **Create**: `POST /v1/publish/jobs` with production id/name, format version, asset count and table row counts. A `publish_jobs` row is inserted and the link state becomes `publishing`.
3. **Upload**: `PUT /v1/publish/jobs/:id/package`, multipart field `package` (`application/zip`).
4. **Commit**: `POST /v1/publish/jobs/:id/commit`.
5. **Poll**: `GET /v1/publish/jobs/:id` every 800 ms, up to 120 s, until `succeeded` or `failed`. On success a `linked_projects` row is upserted with `remoteProjectId` and URL; on any error the link row is deleted and a message from `userMessageForServerError` is shown.

Server-side import is implemented in this repo as library code (`postgresImport.ts`, `service.ts`) for the server to reuse: it validates the manifest, converts SQLite values to PostgreSQL types by inspecting `information_schema`, writes assets through a `PublishAssetStorage`, inserts in table order and assigns the importing user as administrator via a callback. Failures throw `PublishImportError` with a `kind` (`validation`, `missing_assets`, `type_conversion`, `constraint`, `storage`, `acl`).

**Unlink** (Productions row action): `DELETE /v1/projects/:id/links/:clientInstallId`; a 404 counts as success. The remote production stays for the team.

## Linked runtime (legacy beta path)

When both collaboration flags are on and `linked_projects.link_state` is `linked`, `offline` or `conflict`, `getEffectiveDataSourceForProduction` (`src/lib/db/projectDataSource.ts`) returns `remote_server` and some repositories read from the server instead of SQLite.

- Reads: `GET /v1/projects/:id/<resource>` for `scenes`, `shoot_days`, `shots`, `budget_items`, `expenses` (`src/lib/server/remote/scheduleRemote.ts`, `budgetRemote.ts`; used by `schedule.ts` and `budget.ts` repositories, plus guards in script breakdown, script sections and coverage services).
- Writes: sent with `If-Match: <updated_at>`; on network failure they are queued in `server_outbox_pending` (`serverOutboxRepository.ts`). `runServerSyncOnce` (`syncEngine.ts`) replays the queue oldest first, maps `create` to POST and `update`/`delete` to PATCH/DELETE, sets the link to `conflict` on 409 and `offline` on a network error, and increments `tries`. No idempotency key is sent.
- Banner (`ServerCollabBanner`): shows queued changes, offline and conflict states, a **Sync now** button, auto-sync every 25 s while visible and on the browser `online` event, and the online collaborator count from the presence WebSocket.
- Presence: `ws(s)://<server>/v1/presence?project=<id>&token=<token>`; the client reads `{ online }` or `{ count }`.
- **Open legacy server project…** in settings creates an empty shell production with the remote id and links it.
- The sync-v2 setting never activates this path; the legacy flag is required.

## Sync-v2 (pilot)

Sync-v2 is the replacement design: SQLite stays the only read source, and the network is used only to pull, push and acknowledge row changes. All code is in `src/lib/server/syncV2`.

Implemented:

| Area | Behaviour |
|---|---|
| Client (`client.ts`) | `SyncV2Client` over an injectable transport. Endpoints: `GET /.well-known/albatross` (discovery), then under `/v2/projects/:id/sync`: `snapshot` (metadata), `head`, `changes?after=<epoch>:<seq>&limit=`, `mutations` (POST), `ack` (POST). Structured errors with `code` and `retryable`; codes in `SYNC_V2_ERROR_CODES` (`types.ts`). |
| Compatibility | `checkSyncV2Compatibility` compares protocol version (`2.0`), schema version, `registryHash` and capabilities. |
| Registry (`registry.ts`) | Declares which tables replicate. Scope is `pilot-v1-partial`: only `productions`, `scenes` and `shots`. The registry hash is part of every push. |
| Local journal (`localStore.ts`) | `executeSyncMutationTransaction` writes the domain change and a durable `sync_mutation_batches`/`sync_mutations` journal in one transaction. `getLocalWriteMutationContext` supplies the basis; it returns null for `local_only` and throws if a collaborative production has incomplete sync metadata. |
| Inbound (`inboundApplier.ts`) | `applyPilotChangeBatch` applies one server transaction atomically, checks ownership, and advances `applied_cursor` guarded by `sync_apply_guard`. |
| Coordinator (`coordinator.ts`) | `SyncV2ProjectCoordinator.runOnce`: pull, push pending batches, acknowledge. Modes in `sync_project_state.mode`: `local_only`, `enabling`, `collaborative`, `offline`, `paused`, `conflicts`, `disabling`, `needs_rebootstrap`. Exponential back-off (1 s to 60 s, jittered); epoch or cursor expiry sets `needs_rebootstrap`; 409 sets `conflicts`; retryable errors set `offline`. |
| Conflicts | `sync_conflicts` types: `same_field`, `update_delete`, `delete_update`, `dependent_row`. |
| Repository capture | Only `createShot` in `schedule.ts` routes through the journal today. Shot cast links are rejected while a production is collaborative. |

Not wired into the app: nothing constructs `SyncV2Client` or `SyncV2ProjectCoordinator` outside tests, and nothing outside tests sets a production's sync mode to `collaborative`. There is no UI for enabling, bootstrapping from a snapshot, resolving conflicts or detaching. Treat sync-v2 as a tested library, not a user feature.

## Server contract (what the client calls)

Errors are classified by status in `serverErrors.ts`: 401 `unauthorized`, 403 `forbidden`, 409 `conflict`, other 4xx `validation`, 5xx `server`, fetch failure `network`.

| Endpoint | Used for | Client expectation |
|---|---|---|
| `POST /v1/auth/login` | Sign in | Body `{ username, password }`; token in `accessToken` / `token` / `sessionToken`; 401 bad credentials, 403 disabled. |
| `GET /v1/me` | Validate session | `{ user: { id, username }, workspaces?: [{ id, name }] }`. |
| `GET /v1/projects` | List remote productions | Array or `{ projects: [...] }` of `{ id, name, slug?, url? }`. |
| `POST /v1/publish/jobs` | Start publish | Returns `{ id }`. |
| `PUT /v1/publish/jobs/:id/package` | Upload zip | Multipart `package`; non-2xx on failure. |
| `POST /v1/publish/jobs/:id/commit` | Import | Starts import (may be async). |
| `GET /v1/publish/jobs/:id` | Poll | `status` in `pending_upload`, `uploading`, `validating`, `importing`, `succeeded`, `failed`; `progress`, `error { kind, message }`, `remoteProjectId`, `remoteProjectUrl`, `members`. |
| `DELETE /v1/projects/:id/links/:clientId` | Unlink | 404 tolerated. |
| `GET /v1/projects/:id/<resource>[/:rowId]` | Linked reads | Bare array/object or `{ data }`. |
| `POST` / `PATCH` / `DELETE /v1/projects/:id/<resource>[/:rowId]` | Linked writes | `If-Match` precondition; 409 on mismatch. |
| `WS /v1/presence?project=&token=` | Online count | JSON messages with `online` or `count`. |
| `/.well-known/albatross`, `/v2/projects/:id/sync/*` | Sync-v2 | See above. |

Every project-scoped endpoint must enforce membership and role; the client relies on 403 and 409 for its UI states.

## PostgreSQL in this repo

PostgreSQL is not used by the desktop app at runtime. This repo holds the schema and code the server's database layer is built from, and tests that keep them honest.

| Item | Location |
|---|---|
| End-state schema snapshot generated from SQLite (UUID/TIMESTAMPTZ/JSONB types, tables in dependency order). The parity test reads this file. | `postgres/schema/baseline.sql` |
| Numbered migrations a server applies in order: `0001_baseline.sql` (the original 67-table baseline), then `0002_*` to `0027_*` (auth, memberships, audit logs, clients, field encryption, feature changes) and `0028_*` to `0034_*` (server collaboration tables, script sections, sync-v2, risk assessments, script supervisor, crew hours, script breakdown) | `postgres/migrations/` |
| Snapshot generator (replays `src-tauri/migrations/*.sql` through sql.js and writes `baseline.sql`; the human-readable audit goes to the git-ignored `scripts/postgres/.generated/`). It never touches `0001_baseline.sql`. | `node scripts/postgres/generatePhase2Artifacts.mjs` |
| `pg`-backed `DatabaseAdapter` (`dialect = 'postgres'`, `$n` placeholders, slow-query metrics) | `src/lib/db/postgresDatabaseAdapter.ts` |
| Postgres access control and auth services used by the tests | `src/lib/access`, `src/lib/auth` |
| Tests | `src/test/postgres/*.test.ts`, helpers `pgTestEnv.ts`, `postgresRepositoryHarness.ts`, `schemaAudit.ts` |

Run the tests against a local PostgreSQL (the suite creates and drops its own schemas):

```sh
npm run test:postgres   # all src/test/postgres suites
npm run test:publish    # SQLite -> publish package -> PostgreSQL round trip only
```

Connection: set `PGHOST` (default `127.0.0.1`), `PGPORT` (5432), `PGDATABASE` (`albatross_ci`), `PGUSER`, `PGPASSWORD`. Without these the helper tries the OS user, `postgres` and `albatross` against `albatross_ci` and `postgres`. When no server is reachable most suites skip their tests with a logged warning and vitest reports the connection error, so a run without a database is not a pass.

CI: `.github/workflows/postgres-infrastructure.yml` starts a PostgreSQL 16 service on pull requests and pushes to `main` and `dev`, runs the `SELECT 1` smoke check, then `npm run test:postgres` against the service container (the `PG*` variables are set on the job). The test step is `continue-on-error` for now, see below. Lint, unit tests and the build run in `.github/workflows/ci.yml` ([contributing.md](contributing.md)), which excludes the Postgres suites.

### Schema parity status

Keeping PostgreSQL in step with SQLite is manual:

1. Write the Postgres migration (`postgres/migrations/NNNN_*.sql`) for the new SQLite migration, translating types as in `0011_crew_availability.sql` and `0012_tax_credits.sql` (UUID ids with `gen_random_uuid()`, `TIMESTAMPTZ`, `DATE`, `NUMERIC`, `JSONB` for `*_json`, `BOOLEAN` for the audited columns in `BOOLEAN_COLUMN_ALLOWLIST`). Never edit a shipped migration; add a new one.
2. Run `node scripts/postgres/generatePhase2Artifacts.mjs` to refresh `postgres/schema/baseline.sql`.
3. `postgresSchemaParity.test.ts` then checks that every SQLite table exists in the baseline with the expected column types. It compares files only, not a live database. The column-type rules are duplicated in the generator and in `src/test/postgres/schemaAudit.ts`; change both together.

Status: the baseline covers all 119 SQLite tables and the parity test passes. When `0001` to `0034` were replayed on a live PostgreSQL 18 (after the two fixes below) and compared with `baseline.sql`, the tables, columns, types, nullability and defaults were identical. Constraint and index names differ for the tables created by `0003` to `0007` (hand-written auto names against `pk_*`/`fk_*`), and the migration chain has three performance indexes the baseline lacks. Column types the migrations fixed and the generator now mirrors: `tax_credits_enabled`, `vat_tracking_enabled`, `is_vfx`, `is_global` are `BOOLEAN`, and `movement_order_json` / `movement_pins_json` stay `TEXT`.

Known problems that still keep the Postgres suites red (not fixed here because they need a change to shipped migrations or to repository code):

- `0001_baseline.sql` cannot run: it creates tables before the tables their foreign keys reference (`bookings` before `shoot_days`). Reordering the `CREATE TABLE` blocks parents-first fixes it (the generator now does this for `baseline.sql`).
- `0009_equipment_list_item_quantity.sql` adds `quantity`, which `0001` already contains. Use `ADD COLUMN IF NOT EXISTS`, or remove the column from `0001`.
- With those two fixed, about 20 tests in the repository-level suites still fail: repositories bind `0`/`1` to `BOOLEAN` columns (`boolean = integer`), the `pg` driver returns `DATE` as a JavaScript `Date`, and some tests assume a signed-in encryption key (the repository harness now sets a test key).

## Not implemented

- Token refresh, logout and idempotency keys in the client.
- Any UI path that turns sync-v2 on; snapshot bootstrap, conflict resolution and detach screens.
- Sync-v2 replication of anything beyond `productions`, `scenes` and `shots`; attachments over sync.
- Running a server from this repo, or a PostgreSQL mode for the desktop app.
- Server-side encryption of published data; encrypted publish payloads.
- Real-time co-editing; presence is a collaborator count only.
- A green PostgreSQL test job in CI (the job runs the suites but does not gate on them yet).
