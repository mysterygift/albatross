# Getting Started Guide

This guide is for new developers joining the Albatross project. It covers cloning, environment setup, running the app, checks (lint; tests), and making a first change.

## 1. Clone the repo

```bash
git clone <repo-url>
cd albatross
```

Use the same clone URL and branch workflow your team uses (e.g. `main` or `develop`).

---

## 2. Set up the dev environment

### Requirements

- **Node.js** 18 or newer  
- **Rust** 1.77.2 or newer (see [Cargo.toml](../src-tauri/Cargo.toml) `rust-version`)  
- **Platform prerequisites** for Tauri: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (e.g. macOS: Xcode CLT; Windows: Visual Studio build tools; Linux: webkit2gtk, etc.)

### Install dependencies

```bash
npm install
```

No `.env` file is required for normal development. The app is offline-first; the SQLite DB and attachments live in the OS app data directory (see [Where data is stored](../README.md#where-data-is-stored)).

### Optional: Check Rust

```bash
rustc --version   # should be >= 1.77.2
cargo --version
```

If you need a specific Rust version, use [rustup](https://rustup.rs/) and run e.g. `rustup override set 1.77.2` in the repo (or match the version in `src-tauri/Cargo.toml`).

---

## 3. Run the app locally

From the project root:

```bash
npm run tauri:dev
```

This:

1. Starts the Vite dev server (frontend) on **http://localhost:5174**
2. Launches the Tauri desktop window, which loads that URL in the webview

You should see a native window; the UI is the React app. No internet is required after install.

**Gotcha — port 5174:** Vite is configured with `strictPort: true`. If another process is using 5174, the dev server will fail. Stop the other process or change the port in [vite.config.ts](../vite.config.ts) (and ensure [tauri.conf.json](../src-tauri/tauri.conf.json) `build.devUrl` matches).

**Gotcha — DB location:** In dev you use the **same** SQLite database as the “installed” app on this machine. It lives in the app config directory (e.g. macOS: `~/Library/Application Support/com.albatross.app/albatross.db`). To start with a clean DB you can remove that file (and optionally the `attachments/` folder there) while the app is closed.

---

## 4. Lint and tests

### Lint

```bash
npm run lint
```

ESLint runs on `src` (see [eslint.config.js](../eslint.config.js)). Fix any reported issues before submitting changes.

### Tests

Unit and integration tests use **Vitest** (`npm test` / `npm run test` runs `vitest run`). Tests live under `src/` (e.g. `*.test.ts`, `*.integration.test.tsx`). Rust tests in `src-tauri` are optional per crate.

Also use:

- **Lint:** `npm run lint`
- **Manual verification:** Run the app, use the relevant flows (e.g. create/edit productions, stripboard, budget, episodic settings)
- **Developer tools:** In dev, **Settings → Developer tools** for demo data, DB perf, and cascade verification

---

## 5. Making a first change

Below is a minimal path to make a visible first change and touch the main layers.

### 5.1 Use the path alias

Imports use the `@/` alias for `src/`:

- Good: `import { something } from '@/lib/db/client'`
- Avoid: `import { something } from '../../../lib/db/client'`

The alias is set in [tsconfig.app.json](../tsconfig.app.json) and [vite.config.ts](../vite.config.ts).

### 5.2 Example: add a new route and page

1. **Add a simple page** under `src/features/`, e.g. `src/features/hello/page.tsx` that renders a heading and a line of text.
2. **Register the route** in [src/app/router.tsx](../src/app/router.tsx):
   - Import the page component.
   - Add a child route, e.g. `{ path: 'hello', element: <HelloPage /> }`.
3. **Add a nav link** in the app shell (e.g. sidebar in [src/app/layout.tsx](../src/app/layout.tsx) or wherever the main nav is) pointing to `/hello`.
4. Run `npm run tauri:dev`, open the new route, and confirm it renders.

This gets you used to: feature folders, React Router, and the `@/` alias.

### 5.3 Example: change existing data (repositories + migrations)

- **Read path:** Repositories in `src/lib/db/repositories/` own all DB access. Domain types live in `src/lib/db/types.ts`. Features in `src/features/<feature>/` use TanStack Query and call these repos.
- **Write path:** Repositories use the shared client in `src/lib/db/client.ts`. Wrapped `execute()` calls are serialized (re-entrant global queue); multi-statement transactions must use `executeBatch` inside `runInSerializedTransaction` so BEGIN/COMMIT run in one round-trip and you avoid “database is locked” or “cannot start a transaction within a transaction”. See [docs/DATABASE_LAYER.md](DATABASE_LAYER.md).
- **Schema change:** Add a new migration:
  1. Add a new `.sql` file under `src-tauri/migrations/` with a clear name, e.g. `0012_add_my_column.sql`.
  2. In [src-tauri/src/lib.rs](../src-tauri/src/lib.rs), add a new `Migration { version: 12, description: "...", sql: include_str!("../migrations/0012_add_my_column.sql"), kind: MigrationKind::Up }` to the `migrations` vector, in **version order**.
  3. Restart the app so migrations run on next DB load.

---

## 6. Gotchas that aren’t obvious from the code

- **SQLite `PRAGMA foreign_keys`:** The app runs `PRAGMA foreign_keys = ON` on every connection ([src/lib/db/client.ts](../src/lib/db/client.ts)). SQLite does **not** persist this; if you run raw SQL (e.g. in a migration) that sets `PRAGMA foreign_keys = OFF`, you must set it back to `ON` before the connection is reused, or FK/cascade behavior will not apply.
- **Migrations are run in Rust:** Migrations are applied by the Tauri SQL plugin when the DB is first loaded. They live in `src-tauri/migrations/` and are registered in `src-tauri/src/lib.rs`. Adding a new migration requires both the `.sql` file and a new `Migration` entry in the correct version order.
- **Demo production slug is fixed:** Demo data is keyed only by the slug `demo-production-albatross`. “Create Demo Production”, “Reset Demo Data”, and “Open Demo Production” in Settings → Developer tools only create, delete, or open that slug. They never delete or match other productions by name.
- **Developer tools only in dev:** The “Developer tools” card in Settings (demo seed, Reset Demo, DB Perf toggle, Verify Cascades, experimental currency API) is rendered only when `import.meta.env.DEV` is true. You won’t see it in a production build.
- **Vite watch ignores `src-tauri/`:** The Vite config has `watch: { ignored: ['**/src-tauri/**'] }`. Changes to Rust or Tauri config require restarting `npm run tauri:dev` (or running a Tauri build) to take effect; hot reload only applies to the frontend.
- **Database locking:** The app uses WAL, `busy_timeout`, and a **re-entrant global serializer** for `execute()` so the Tauri SQL pool does not run conflicting writes on different connections. For any block that does BEGIN … COMMIT/ROLLBACK, use `executeBatch` inside `runInSerializedTransaction` per [docs/DATABASE_LAYER.md](DATABASE_LAYER.md). See [src/lib/db/client.ts](../src/lib/db/client.ts).
- **Episodic productions:** A production can be created as **episodic** (checkbox on **Productions**); that choice is **irreversible**. Episodic projects get **episodes** (story units) and **shooting blocs** (date ranges); scenes belong to an episode, shoot days can be tagged with a bloc, and Schedule (calendar/stripboard/shot lists) surfaces filters and labels. Manage episodes and bloc names/ranges in **Settings** when an episodic production is selected. See [docs/schedule.md](schedule.md) § “Episodic productions” and import/export notes in [docs/project-import-export-format-v1.md](project-import-export-format-v1.md).
- **Strict TypeScript:** The project uses strict options (e.g. `noUnusedLocals`, `noUnusedParameters`). The build is `tsc -b && vite build`; fix type and lint errors before committing.

---

## 7. Quick reference

| Task              | Command / location |
|-------------------|---------------------|
| Install deps      | `npm install`       |
| Run app (dev)     | `npm run tauri:dev` |
| Build for current OS | `npm run tauri:build` |
| Lint              | `npm run lint`      |
| Path alias        | `@/*` → `./src/*`   |
| DB (macOS)        | `~/Library/Application Support/com.albatross.app/` |
| Migrations        | `src-tauri/migrations/*.sql` + `src-tauri/src/lib.rs` |
| Repositories      | `src/lib/db/repositories/` |
| Features / pages  | `src/features/<name>/` |

For more on data location, demo seed, migrations, foreign keys, and architecture, see the main [README](../README.md).
