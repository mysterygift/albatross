# Albatross

Offline-first desktop production management app for film/TV/commercial/documentary workflows. Built with Tauri, React, TypeScript, SQLite, and shadcn/ui.

## Setup (from scratch)

If you need to recreate the project from scratch:

```bash
# 1) Create Vite + React + TypeScript project
npm create vite@latest . -- --template react-ts
npm install

# 2) Add Tailwind (v4 with Vite plugin)
npm install -D tailwindcss @tailwindcss/vite
# Add tailwindcss() to vite.config.ts plugins and @import "tailwindcss" in src/index.css

# 3) Add path alias in tsconfig.app.json: "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
#    and resolve.alias in vite.config.ts for "@" -> ./src

# 4) Initialize shadcn/ui
npx shadcn@latest init -d

# 5) Install UI and app dependencies
npm install react-router-dom @tanstack/react-table @tanstack/react-query react-hook-form @hookform/resolvers zod @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-pdf pdf-lib
npm install @tauri-apps/cli @tauri-apps/api
npm install @tauri-apps/plugin-sql @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-shell

# 6) Initialize Tauri (from project root)
npx tauri init
# Use: app name Albatross, window title Albatross, frontend dist ../dist, dev URL http://localhost:5173,
#      before dev command "npm run dev", before build command "npm run build"

# 7) Add Tauri SQL plugin with SQLite (in src-tauri)
cd src-tauri && cargo add tauri-plugin-sql --features sqlite && cargo add tauri-plugin-fs tauri-plugin-dialog tauri-plugin-shell && cd ..
# Register plugins in src-tauri/src/lib.rs and add migrations; add sql preload and permissions in tauri.conf.json and capabilities/default.json

# 8) Add npm scripts for Tauri
# In package.json scripts: "tauri": "tauri", "tauri:dev": "tauri dev", "tauri:build": "tauri build"
```

Then run `npm run tauri:dev` to confirm dev works and `npm run tauri:build` to build.

## Requirements

- **Node.js** 18+
- **Rust** 1.77.2+ (for Tauri)
- **Platform deps**: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) per OS

**New to the project?** See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for a full guide: cloning, environment setup, running the app, lint/tests, making a first change, and gotchas.

## Development

```bash
# Install dependencies
npm install

# Run the app (Vite dev server + Tauri window)
npm run tauri:dev
```

The app opens as a native window. The frontend runs at `http://localhost:5173`; Tauri loads it in the webview. No internet required after install.

## Build

```bash
# Build for current platform (macOS / Windows / Linux)
npm run tauri:build
```

Outputs are under `src-tauri/target/release/` (or `target/debug` for dev). Installer/bundle location depends on platform (e.g. `.dmg` on macOS).

## Where data is stored

- **SQLite database**: `albatross.db` in the app config directory.  
  - **macOS**: `~/Library/Application Support/com.albatross.app/`  
  - **Windows**: `%APPDATA%\com.albatross.app\`  
  - **Linux**: `~/.config/com.albatross.app/` or `$XDG_CONFIG_HOME/com.albatross.app/`

- **Attachments** (uploaded PDFs, images, etc.): `attachments/` inside the same app data directory (path stored in DB as relative path).

Database path is controlled by the Tauri SQL plugin: the connection string is `sqlite:albatross.db`, which is resolved relative to the app config directory.

### Productions slug

Productions have a **`slug`** column: a stable, URL-safe identifier (lowercase letters, numbers, hyphens) derived from the name at creation. It is **never changed** after creation. Slugs are used to:

- Identify the **demo production** reliably (by slug, not name), so seed/reset logic never touches user-created productions.
- Allow future features (e.g. deep links or APIs) to reference a production by slug.

New productions get a unique slug generated from the name; existing rows (before the migration) were backfilled with `prod-<id>`.

### Demo data (seed)

A **deterministic demo production** can be created for instant realistic data (budget, stripboard, scenes, cast, locations, documents, call sheets, deliverables, music clearances, etc.).

- **Slug**: Demo data is keyed only by **slug** `demo-production-albatross`. Seed and reset logic **never match by name** and **never delete** productions that do not have this slug.
- **How to run**: Open **Settings** and use the **Demo projects** section: **Create Demo Production** (creates the demo production and full dataset if missing), **Reset Demo Data** (removes only the demo production and its related rows and attachment files, then re-runs ensure), **Open Demo Production** (selects the demo production in the app).
- **Where demo attachments are stored**: Same as other attachments: **`attachments/`** in the app data directory. Demo files use names like `demo-location-release.pdf`, `demo-cue-sheet.pdf`, `demo-doc-4.txt`.
- **Safety**: Only the production with `slug = demo-production-albatross` is ever deleted or overwritten by reset. All other productions and data are untouched.

Seed metadata (last run time, version) is stored in the **`seed_meta`** table and shown in Settings under **Demo projects**.

### Episodic (series) productions

- **Create:** On **Productions → New production**, enable **Episodic series** if the project has multiple episodes (TV, anthology, etc.). That choice **cannot be reversed** for that production.
- **Model:** Episodic productions have **episodes** (names/order in **Settings**), **shooting blocs** (named date ranges, also in **Settings**), **`scene → episode`** assignment in **Shot Lists**, and **`shoot day → shooting bloc`** association derived from each day’s date vs bloc ranges.
- **Schedule:** **Calendar** and **Stripboard** support **bloc filters** and show **episode** context on strips where relevant. See **[docs/schedule.md](docs/schedule.md)** (§ Episodic productions).
- **Elsewhere:** **Deliverables** and **music clearance** rows can carry an optional **episode** link on episodic shows. **Import/export** (APF v1) includes episodes, blocs, and FK closure; see **[docs/project-import-export-format-v1.md](docs/project-import-export-format-v1.md)**.

### Call sheet PDFs

Generated call sheets are saved under **`attachments/`** in the app data directory (e.g. `call-sheet-2025-02-11-main.pdf`). A row is created in the **documents** table with `entity_type: 'call_sheet'` and `entity_id` set to the shoot day id; `file_path` stores the relative path. Open from **Documents** or use **Save & Open** to open in the OS default viewer.

### Currency

- **Default currency**: British Pound Sterling (**GBP**, symbol £). All budget values are stored in the production’s **base currency** (`productions.currency_code`; default `GBP`).
- **Display currency**: In **Settings → Currency**, you can choose the currency used to **display** amounts (GBP, EUR, USD, CAD, AUD, NZD, JPY, CHF). Stored values stay in the production’s base currency; display is a preference only.
- **Conversion (optional, off by default)**: An optional **exchange-rate API** can convert amounts from the production’s base currency to the display currency. This is **disabled by default** and is in **Dev Settings** (Settings → Developer tools, visible in development):
  - Toggle: **“Enable Currency Conversion API (Experimental)”** with warning: *“Experimental — likely to break projects. Do not use.”*
  - When **off**: the app never fetches rates; all values are shown in the production’s base currency (with an info banner when display currency differs).
  - When **on**: rates are fetched from the [Fawaz Ahmed Exchange API](https://github.com/fawazahmed0/exchange-api) (CDN: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base}.json`), cached in SQLite (`exchange_rates` table) for 24 hours, and used for display-only conversion. If the network fails or the API is unavailable, cached (including stale) rates are used when possible; otherwise values are shown in the base currency with a banner. The app remains **fully functional offline**; conversion never blocks core functionality and never mislabels currency (e.g. no £ amounts shown with a $ symbol unless actually converted).

### Duplicate production

From the **Productions** list, use the **Duplicate** action (copy icon) on a production to create a full copy:

- Prompts for a new name (default: “&lt;original&gt; (Copy)”).
- Creates a new production with a **unique slug** (e.g. `my-production-copy`, `my-production-copy-2`).
- Copies all production-scoped data in a single transaction: units, people, locations, scenes, shoot days, stripboard strips, cast availability, budget categories/items/expenses, key contacts, production tasks, deliverables, technical specs, music tracks, clearances, equipment terms, and documents (metadata + attachment files under `attachments/<newProductionId>/`).
- No outbox entries are written for the duplicated rows (duplication is local-only).
- After duplication, the new production is selected and a “Production duplicated.” message is shown. Use this to make a **safe copy** before trying risky or experimental settings (e.g. the currency conversion API).

## Stripboard strip types

The stripboard supports multiple **strip types** per shoot day/unit:

- **SCENE** — Scheduled scene (links to a scene; shows scene number, title, INT/EXT, DAY/NIGHT, page eighths).
- **MOVE** — Setup or company move (optional title/description).
- **CALL** — Call time marker.
- **LUNCH** — Lunch/meal break.
- **WRAP** — Wrap.
- **NOTE** — General note.Res

Strips are ordered by a fractional `sort_index`; drag-and-drop (dnd-kit) updates the order and can move strips between days/units. Each shoot day can have multiple **units** (e.g. Main Unit, 2nd Unit); each unit column can be **locked** to prevent edits.

## Day Out of Days (DOOD) inference rules

DOOD is **cast-only** (people with `is_cast = 1`). Work is inferred from the **stripboard**: a cast member **WORKS** on a shoot day if any **SCENE** strip scheduled that day includes them (via `scene_cast`). No manual bookings are used.

- **Start** = first shoot day where they WORK.
- **Finish** = last shoot day where they WORK.
- **HOLD** = any day between Start and Finish when they do not WORK.
- **OFF** = outside the Start–Finish range (and not WORK).

**CLASH** = they are scheduled to WORK on a date but are marked **UNAVAILABLE** in `cast_availability` for that date. Clash cells are highlighted (red) in the matrix and in the exported PDF.

## Migrations

Migrations run **automatically on app startup** when the SQLite connection is first used. They are defined in Rust and applied by the Tauri SQL plugin.

- **Where**: `src-tauri/migrations/` (e.g. `0001_initial.sql`).
- **How they run**: The plugin is configured in `src-tauri/src/lib.rs` with `add_migrations("sqlite:albatross.db", migrations)`. Loading the DB (from the frontend via `@tauri-apps/plugin-sql`) runs pending migrations in a transaction.
- **Adding a new migration**:  
  1. Add a new `.sql` file under `src-tauri/migrations/` (e.g. `0002_add_foo.sql`).  
  2. In `src-tauri/src/lib.rs`, add a new `Migration { version: 2, description: "...", sql: include_str!("../migrations/0002_add_foo.sql"), kind: MigrationKind::Up }` to the `migrations` vector (order by version).

## Foreign keys and delete behavior

Referential integrity is enforced with **FOREIGN KEY** constraints and **ON DELETE CASCADE** / **ON DELETE SET NULL** (migration `0004_fk_cascade_refactor.sql`).

- **PRAGMA foreign_keys**: The app runs `PRAGMA foreign_keys = ON` on every SQLite connection (see `src/lib/db/client.ts`). Without it, FK and cascades are not enforced; SQLite does not persist this setting.
- **Cascade decisions**:  
  - **productions(id)** is the root: child tables (scenes, shoot_days, people, documents, budget_*, etc.) use `ON DELETE CASCADE` so that when a production row is hard-deleted, all its child rows are removed by the database.  
  - **stripboard_strips.scene_id** and **scenes.location_id** use `ON DELETE SET NULL` so that deleting a scene or location does not break the stripboard or leave scenes with a dangling reference.  
  - **expenses.category_id**, **bookings.shoot_day_id**, **equipment.shoot_day_id**, and optional FKs (e.g. **document_id**) use `ON DELETE SET NULL` where the child can exist without the reference.
- **Soft delete vs hard delete**:  
  - **Soft delete** (default): `deleteProduction(id)` sets `deleted_at` so the row is hidden from normal queries. No child rows are removed; used for normal “delete production” from the UI.  
  - **Hard delete**: `hardDeleteProduction(id)` runs `DELETE FROM productions WHERE id = $1`. Used only for **demo reset** and explicit “Delete Production Permanently” (admin/dev). The app must delete attachment files from disk separately (e.g. query documents by production_id before hard-deleting).
- **Verification**: In dev, use **Settings → Developer tools → Verify Cascades** to create a minimal production, hard-delete it, and confirm no child rows remain.

## Architecture (short)

- **Repositories** (`src/lib/db/repositories/`): All DB access. One module per domain (productions, people, budget, schedule, etc.). Create/update/delete write to the **outbox** table for future sync; sync is not implemented.
- **Domain types** (`src/lib/db/types.ts`): Shared TypeScript types for entities (UUIDs, `created_at` / `updated_at` / `deleted_at`).
- **Features** (`src/features/<feature>/`): Per-feature UI, hooks, and types (e.g. `productions`, `budget`, `schedule`). Pages use TanStack Query for loading data and React Hook Form + Zod for forms.
- **App shell**: `src/app/` holds the router, layout (sidebar + top bar), and providers. The “Current Production” selector in the top bar drives which production’s data is shown; most pages require a selected production.
- **Routing**: React Router; routes are defined in `src/app/router.tsx`.

No backend and no cloud sync; everything is local and offline-first.

## Tech stack

- **Shell**: Tauri 2  
- **UI**: Vite, React 19, TypeScript, Tailwind CSS, shadcn/ui  
- **Data**: TanStack Query, TanStack Table, React Hook Form, Zod  
- **DB**: SQLite via Tauri plugin (`tauri-plugin-sql`), migrations in Rust  
- **Files**: Tauri fs + dialog + shell (open in OS), attachments in app data dir  
- **PDF**: pdf-lib (generate), react-pdf (preview)  
- **Drag/drop**: dnd-kit (stripboard)

## License

COPYRIGHT 2026 ARAN DAVIES. ALL RIGHTS RESERVED.
