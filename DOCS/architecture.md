# Architecture

How Albatross is put together: stack, repository layout, boot sequence, routing, state, the data layer and the Rust side.

## Stack
| Layer | Technology |
|---|---|
| Shell | Tauri 2 (Rust), one `main` window; desktop (macOS, Windows, Linux) and iOS/iPadOS (iPad and iPhone; [contributing.md](contributing.md#ipad-and-iphone)) |
| UI | React 19, TypeScript (strict), Vite 7, Tailwind CSS 4, shadcn/Radix primitives (`radix-ui`), lucide icons, `sonner` toasts, `cmdk` palette |
| Routing | `react-router-dom` 7 (`createBrowserRouter`) |
| Server state | TanStack Query 5 (also `@tanstack/react-table`, `@dnd-kit` for drag and drop) |
| Forms/validation | `react-hook-form`, `zod` |
| Local data | SQLite via `tauri-plugin-sql`, encrypted with SQLCipher (`rusqlite`/`libsqlite3-sys` bundled; vendored OpenSSL on desktop, Apple CommonCrypto on iOS) |
| Documents | `pdf-lib`, `html2pdf.js`, `react-pdf`, `fflate` (`.apf` archives) |
| Maps | `leaflet`, `react-leaflet` |
| Tests | Vitest 3, Testing Library, `sql.js` (in-memory SQLite for repository tests), `pg` (Postgres tests) |
| Optional server | PostgreSQL schema in `postgres/`; collaboration is optional ([collaboration.md](collaboration.md)) |

The app is local-first: all data lives in the encrypted SQLite file on the machine. A plain browser tab cannot run it; `src/App.tsx` shows an explainer unless `isTauriWebview()` is true.

## Repository layout
| Path | Contents |
|---|---|
| `src/main.tsx`, `src/App.tsx` | Entry point; imports theme CSS; renders providers and router |
| `src/app/` | Router, layout/auth gate, providers, navigation tree, native-menu schema, shortcut bridge |
| `src/lib/platform/` | `isIosPlatform`, `isMobilePlatform`, `hasNativeMenuBar`; `main.tsx` sets `data-platform` on `<html>` ([ui.md](ui.md#touch-and-mobile)) |
| `src/features/<name>/` | One folder per feature or page group (see below) |
| `src/components/` | Shared components; `ui/` holds shadcn primitives ([ui.md](ui.md)) |
| `src/hooks/` | Cross-feature hooks (settings flags, currency, theme, data source) |
| `src/lib/` | Non-visual logic by domain: `db/` (client, repositories, services, seed), `auth/`, `security/`, `access/`, `importExport/`, `publish/`, `server/` (collaboration client), `pdf/`, `budget/`, `schedule/`, ... |
| `src/styles/themes/` | UI theme CSS ([ui.md](ui.md)) |
| `src/test/` | Shared test harnesses, `postgres/` tests, `apf/`, `encryption/` |
| `src-tauri/` | Rust crate (`src/`), `migrations/*.sql` (SQLite), `capabilities/` (`desktop.json`, `mobile.json`), `tauri.conf.json` and `tauri.ios.conf.json`, `Info.ios.plist`, `gen/apple/` (Xcode project), `vendor/swift-rs/`, icons |
| `postgres/` | `migrations/` and `schema/baseline.sql` for the optional server database ([database.md](database.md)) |
| `scripts/` | `generate-theme-overrides.py` (theme CSS), `postgres/generatePhase2Artifacts.mjs` (derives the Postgres baseline from the SQLite migrations), `demo-toothpick/` (generator for the demo project) |
| `demo/` | `Toothpick-Manchester-Demo.apf`, a demo production to import ([contributing.md](contributing.md#demo-project)) |
| `DOCS/`, `GUIDEBOOK/` | Developer docs and user guide |

## Boot sequence
1. `src/main.tsx` imports `index.css` and every theme stylesheet, then renders `<App />` in `StrictMode`.
2. `App` renders `BrowserOnlyExplainer` outside Tauri; otherwise `AppProviders` + `RouterProvider`.
3. `AppProviders` (`src/app/providers.tsx`): `QueryClientProvider` (default `staleTime` 30 s) > `TooltipProvider` > `ProductionProvider` + `Toaster`.
4. `ProductionProvider` (`src/features/productions/context.tsx`) once per run opens the DB, calls `ensureSettingsDefaults()`, and loads the visible productions list. It holds `currentProductionId` in memory only (not persisted across launches).
5. The router's root element is `AppLayout` (`src/app/layout.tsx`). Before showing the shell it runs the gate, driven by `useAuthSession` and the `INITIAL_SETUP_STATUS_QUERY_KEY` query:
   - connecting/error screens while the session resolves;
   - **database locked, no admin yet, or not signed in** renders `AuthGateScreen`, which shows either the **setup wizard** (first run: encrypt the database, create the admin account, save the recovery key) or **sign-in**. Signing in unlocks SQLCipher (`openDbWithFileKey`, `src/lib/db/dbUnlock.ts`) and then loads the session ([security.md](security.md));
   - after setup/sign-in an intro transition overlay (`SetupWorkspaceTransitionOverlay`) plays while the shell mounts hidden.
6. `AppLayoutShell` mounts `TutorialProvider`, sidebar, top bar, routed `<Outlet />`, search and shortcut overlays ([ui.md](ui.md)).

The database cannot be read before unlock: `getDb()` throws `DatabaseLockedError` while the file is encrypted and locked, so any query that runs early must tolerate that (hooks such as `useBooleanSetting` treat a failed read as "off").

## Routing
Routes are declared in one place, `src/app/router.tsx`, as children of `AppLayout`. Page components are imported eagerly (no code splitting).

- Parent paths redirect to a default child: `/schedule` to `/schedule/calendar`, `/people` to `/people/cast-manager`, `/readiness` to `/tasks`. Unknown paths redirect to `/`.
- Detail routes: `/people/:personId` (cast), `/people/crew/:personId`, `/budget/vendors/:vendorId`, `/risk-assessments/:id`, `/documents/:category`.
- Settings sub-pages: `/settings/users`, `/settings/project-access` (admin-only routes; `src/features/admin/`).
- `/wrap-production` is reachable from the Dashboard, not the sidebar.
- The sidebar, breadcrumbs and palette are driven by `src/app/navigation.ts`, which must match the router ([ui.md](ui.md)).

## State
- **Server state** is TanStack Query over local repositories: `useQuery({ queryKey, queryFn: () => repo.list...(productionId) })`. There is no REST API on the desktop path; `queryFn`s call the repository functions that talk to SQLite.
- **Query keys** are arrays starting with the entity, then the scope, then variants: `['cast', productionId]`, `['shoot-days', productionId]`, `['budget-items', productionId, revisionId]`, `['settings', key]`, `['productions', {...}]`. Invalidate by prefix after a write (for example `['settings']`). When a production can switch between local and linked-server data, keys are namespaced with `tanstackDataSourceKey` (`['ds', source, productionId]`).
- **Current production**: `useCurrentProduction()` returns `currentProductionId`, `currentProduction`, `productions`, `setCurrentProductionId`, `refetchProductions`, plus the per-production selected budget revision. It clears itself if the current production is archived or no longer visible. With auth enabled the list is filtered by project access (`listVisibleProjectsForActor`). Pages are production-scoped and guarded with `RequireProduction`.
- **Persistent preferences**: the `settings` key-value table for anything shared or durable, `localStorage` for per-viewer UI conveniences (see [features/settings.md](features/settings.md)). Local component state otherwise; there is no global store library.
- **Tutorial events**: repositories call `emitTutorialEvent` after specific writes; a no-op unless the tutorial is listening ([features/tutorial.md](features/tutorial.md)).

## Feature modules
A feature lives in `src/features/<name>/`:
- `page.tsx` (or `*-page.tsx`) is the routed component; larger features add subfolders for tabs, dialogs, panels and `use*` hooks (see `src/features/budget/`, `src/features/people/`).
- Feature-specific pure logic and services sit next to the page or in `src/lib/<domain>/`; anything also used by import/export, PDFs or the server belongs in `src/lib/`.
- Repositories in `src/lib/db/repositories/*.ts` are the only code that writes SQL for that table family; services in `src/lib/db/*Service.ts` compose several repositories (script sections, sides, coverage analysis, episodes).
- Tests are colocated (`*.test.ts(x)`); integration tests that need a database use `setDbAdapterForTests` with an in-memory `sql.js` adapter.

## Data layer
- `src/lib/db/client.ts` owns the single `SQLiteDatabaseAdapter` (`DatabaseAdapter` interface in `databaseAdapter.ts`: `execute`, `select`, `executeBatch`, `runInSerializedTransaction`). Placeholders are `$1, $2, ...`. Writes are serialized through one queue; use `executeBatch` / `runInSerializedTransaction` for multi-statement changes. Details and rules: [database.md](database.md).
- Repositories also append to the local `outbox` table (`src/lib/db/outbox.ts`) on writes; the sync design is in [collaboration.md](collaboration.md).
- A `PostgresDatabaseAdapter` implements the same interface and is used only by the Postgres test suite (`src/test/postgres/`); the desktop runtime always uses SQLite.
- **Effective data source per production** (`src/lib/db/projectDataSource.ts`): `local_sqlite` (default) or `remote_server` for a production linked to a server in the legacy direct-remote mode. Only a few repositories have remote paths (`src/lib/server/remote/`); newer collaboration uses sync v2 over local SQLite ([collaboration.md](collaboration.md)). Pages that branch on it use `useEffectiveDataSourceForProduction`.
- Import/export of `.apf` archives: [import-export.md](import-export.md). Third-party APIs (OpenRouteService, Open-Meteo, exchange rates, map tiles): [integrations.md](integrations.md).

## Rust side (`src-tauri/src/`)
| File | Role |
|---|---|
| `lib.rs` | `run()`: registers the migration list (108 entries, versions 1 to 108), plugins and command handlers; calls `menu::setup`; on iOS installs the open-URL hook |
| `menu.rs` | Desktop only: builds the native menu (`rebuild_menu`) and forwards menu clicks as Tauri events (`albatross-menu-*`); `set_active_menu_section`, `set_budget_duplicate_live_as_draft_enabled` commands |
| `menu_mobile.rs` | Mobile stand-in for `menu.rs` (same module name): the two commands accept and ignore their arguments; there is no menu bar |
| `sqlite_load.rs` | `load_sqlite_with_passphrase`, `run_sqlite_migrations`, `execute_sqlite_transaction`: open the SQLCipher file with the key, then run the embedded migrations |
| `db_encryption.rs` | Local DB status, plain-to-SQLCipher migration, rekey, backups and restore, rollback of an interrupted first-run setup, passphrase probe, self-test |
| `sqlite_paths.rs` | `albatross.db` and `albatross.db.meta.json` in the app config directory |
| `apf_desktop.rs` | `.apf` file association: argv queue for cold start, second-instance handoff (`apf-open-request` event), fs scope grant for the opened file |
| `apf_ios.rs` | iOS only: copies an `.apf` opened from Files, the share sheet, Mail or AirDrop into the app sandbox and queues it as `apf_desktop.rs` does |
| `open_route_service.rs` | Route, travel-time and geocode requests to OpenRouteService (the API key is passed in from the frontend setting) |

- **Plugins**: sql, fs, dialog, opener, single-instance (desktop only), log (debug builds only). There is no shell plugin; URLs open through the opener plugin.
- **Capabilities** (`src-tauri/capabilities/`): `desktop.json` (macOS, Windows, Linux) grants sql, fs read/write under app data, desktop, documents and downloads, dialog and opener; `mobile.json` (iOS, Android) grants the same without desktop and downloads access and without reveal-in-folder. The CSP is disabled in `tauri.conf.json`.
- **Menu bridge**: the menu is rebuilt per section; events arrive in `ApfMenuEventBridge` (frontend) which navigates or dispatches a window event. On iOS the in-app **App menu** sends the same commands ([ui.md](ui.md)).
- **`.apf` association**: declared in `tauri.conf.json` (`fileAssociations`, ext `apf`) for desktop and in `Info.ios.plist` for iOS. Opening a file calls `pop_pending_apf_open_paths` (cold start) or receives `apf-open-request` (already running); `ApfDesktopOpenBridge` then runs the import.
- **Migrations**: add `src-tauri/migrations/NNNN_name.sql` and a `Migration { version, ... }` entry in `lib.rs`; see [contributing.md](contributing.md) and [database.md](database.md).

## Where things live
| I want to change... | Look in |
|---|---|
| A page's UI | `src/features/<feature>/` |
| A query or write | `src/lib/db/repositories/<entity>.ts` |
| A table | `src-tauri/migrations/` (+ `lib.rs`), then `postgres/migrations/` |
| Sidebar/breadcrumbs/search entries | `src/app/navigation.ts` |
| A keyboard shortcut or menu item | `src/app/menuSchema.ts`, `src-tauri/src/menu.rs` |
| A setting | `src/lib/db/repositories/settings.ts` |
| Auth, encryption | `src/lib/auth/`, `src/lib/security/`, `src-tauri/src/db_encryption.rs` |
| iOS/touch behaviour | `src/lib/platform/`, `src/styles/platform-mobile.css`, `src/lib/files/mobileShare.ts` ([ui.md](ui.md#touch-and-mobile)) |
| PDFs | `src/lib/pdf/` |
