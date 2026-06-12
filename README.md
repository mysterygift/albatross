# Albatross

Offline-first desktop production management for film, TV, commercial, and documentary workflows. All data stays on your machine — encrypted SQLite database and local attachments. No cloud account required.

---

## Features

### Dashboard
- Production overview at a glance
- Task completion, budget health, and next shoot day
- Stripboard snapshot and risk indicators

### Productions
- Create, edit, and switch between projects
- Import and export `.apf` project files
- Duplicate a production for backups or what-if copies

### Budget
- Chart of accounts, line items, and expenses
- Vendors, purchase orders, floats, and budget revisions
- Default currency GBP; display currency configurable in Settings

### Schedule
- **Calendar** — shoot days and bloc filters (episodic)
- **Stripboard** — drag-and-drop strips (scenes, moves, calls, lunch, wrap, notes), multiple units per day
- **Shot lists**, **storyboard**, and **script import** (text/`.txt`; PDF parsing not implemented)

### People
- Cast and crew **bookings**
- **Day Out of Days** — WORK/HOLD/OFF/CLASH inferred from stripboard and cast availability; export to PDF
- **Cast Manager** and **Crew Manager**

### Locations
- Add and manage locations; link scenes to locations

### Equipment
- Equipment registry, lists, and rental windows
- Checklists and PDF/CSV export

### Documents
- Attach PDFs, images, and other files; open in your system viewer

### Call Sheets
- Generate call sheet PDFs per shoot day and unit

### Movement Orders
- Create and distribute travel/movement orders

### Tasks
- Production tasks with required vs optional items; track completion readiness

### Deliverables
- Track deliverables; optional episode links on episodic shows

### Music & Archive
- Music tracks and clearance tracking; generate cue sheets

### Settings
- Display currency, chart of accounts, cost report groups
- Episodes and shooting blocs (episodic productions)
- User admin and per-project access control
- Optional server publish (requires separate `albatross-server`)

**Also:** first-run **local auth** and **encrypted database** (save your **recovery key** — no cloud reset); optional **first-launch tutorial**; **offline-first** after install.

---

## User setup

For installing a pre-built release (`.dmg` on macOS, installer on Windows). Node.js and Rust are not required.

### Install

1. Download and install the platform bundle from your release channel.
2. Launch **Albatross** — a native desktop window, not a browser tab.

### First launch

1. Complete the **setup wizard**: encrypt the local database, create an **admin account**, and **save your recovery key**.
2. Sign in on later launches to unlock the database.
3. Go to **Productions** → **Add** to create a project, or import a `.apf` file.
4. Use the **current production** selector in the top bar to switch projects. Most of the app shows data for the selected production only.
5. Optional: accept the **first-launch tutorial**, or use **Duplicate** on a production to make a full backup copy.

Double-click a `.apf` file to import on installed builds (see [Troubleshooting](#troubleshooting) if it does not open in Albatross).

### Where data is stored

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.albatross/` |
| Windows | `%APPDATA%\com.albatross\` |
| Linux | `~/.config/com.albatross/` |

Contents: `albatross.db` (SQLCipher), `attachments/`, and encryption sidecars. See [docs/DATA_ENCRYPTION.md](docs/DATA_ENCRYPTION.md) for recovery-key details.

---

## Development environment

For contributors cloning the repo.

### Requirements

- **Node.js** 18+
- **Rust** 1.77.2+ ([src-tauri/Cargo.toml](src-tauri/Cargo.toml))
- [Tauri OS prerequisites](https://v2.tauri.app/start/prerequisites/) (macOS: Xcode CLT; Windows: Visual Studio build tools; Linux: webkit2gtk)
- Windows: SQLCipher native build may need OpenSSL/vcpkg — see [docs/SQLCIPHER_SPIKE.md](docs/SQLCIPHER_SPIKE.md)

No `.env` file is required for normal development.

### Setup and run

```bash
git clone <repo-url>
cd albatross
npm install
npm run tauri:dev
```

- Starts Vite on **http://localhost:5174** and opens the Tauri window (`strictPort: true`).
- Dev and an installed build on the same machine share the **same local database**.
- **Developer tools** (demo seed, cascade verify, etc.) appear in Settings only when running `tauri:dev` — see [docs/SETTINGS_AND_DEVTOOLS.md](docs/SETTINGS_AND_DEVTOOLS.md).

Optional Rust check:

```bash
rustc --version   # should be >= 1.77.2
cargo --version
```

Use [rustup](https://rustup.rs/) if you need a specific version (match `src-tauri/Cargo.toml`).

### Build

```bash
npm run tauri:build
```

Outputs under `src-tauri/target/release/` (e.g. `.dmg` on macOS).

### Quality checks

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint on `src/` |
| `npm run test` | Vitest unit/integration (`src/**/*.test.ts`) |
| `npm run test:postgres` | Postgres adapter tests (needs PG env) |

Also run the app manually and use **Settings → Developer tools** for demo data and cascade verification.

### Making a first change

**Path alias:** `@/*` → `./src/*` ([tsconfig.app.json](tsconfig.app.json), [vite.config.ts](vite.config.ts)).

**Add a page:** create under `src/features/`, register in [src/app/router.tsx](src/app/router.tsx), add a nav link in [src/app/layout.tsx](src/app/layout.tsx).

**Change data:**
- Read/write via repositories in `src/lib/db/repositories/`; types in `src/lib/db/types.ts`.
- Multi-statement transactions: use `executeBatch` inside `runInSerializedTransaction` — see [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md).
- Schema change: add `src-tauri/migrations/NNNN_name.sql`, register in [src-tauri/src/lib.rs](src-tauri/src/lib.rs), restart the app.

### Developer gotchas

- **Port 5174 in use:** Vite uses `strictPort: true`. Free the port or update [vite.config.ts](vite.config.ts) and [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) `build.devUrl` together.
- **Shared DB in dev:** same database as an installed build on this machine. Remove `albatross.db` (and optionally `attachments/`) from the app config directory while the app is closed for a clean start.
- **Rust/Tauri changes:** restart `npm run tauri:dev` — Vite ignores `src-tauri/` for hot reload.
- **Migrations:** applied by the Tauri SQL plugin on DB load; require both `.sql` file and `Migration` entry in `lib.rs`.
- **Demo production:** keyed only by slug `demo-production-albatross`; reset never touches other productions.
- **Developer tools:** Settings card visible only when `import.meta.env.DEV` is true.
- **Episodic productions:** irreversible at creation; manage episodes and shooting blocs in Settings.
- **Strict TypeScript:** build is `tsc -b && vite build` — fix type and lint errors before committing.

### Quick reference

| Task | Command / location |
|------|---------------------|
| Install deps | `npm install` |
| Run app (dev) | `npm run tauri:dev` |
| Build | `npm run tauri:build` |
| Lint | `npm run lint` |
| Path alias | `@/*` → `./src/*` |
| DB (macOS) | `~/Library/Application Support/com.albatross/` |
| Migrations | `src-tauri/migrations/*.sql` + `src-tauri/src/lib.rs` |
| Repositories | `src/lib/db/repositories/` |
| Features / pages | `src/features/<name>/` |

---

## Limitations

- **Script import — PDF parsing:** attach and preview PDFs, but scene breakdown from PDF text is not implemented. Use paste text or a `.txt` file.
- **Cloud sync:** writes go to an internal outbox for future sync; sync is not implemented. The app is local-only.
- **Currency conversion API:** experimental, off by default, dev-only in Settings → Developer tools.

---

## Troubleshooting

### macOS

| Issue | Fix |
|-------|-----|
| **"App is damaged" / won't open (Gatekeeper)** | Remove quarantine: `xattr -cr /Applications/Albatross.app` (adjust path). Or right-click → **Open** once, or **System Settings → Privacy & Security → Open Anyway**. |
| **Downloaded build blocked** | Same as above — browsers apply a quarantine attribute to downloaded files. |
| **`.apf` doesn't open in Albatross** | Right-click → **Open With → Albatross** the first time. Fallback: **Productions → Import project**. See [docs/project-import-export-format-v1.md](docs/project-import-export-format-v1.md) §15. |
| **Forgot password / lost recovery key** | No cloud reset. With recovery key: **Forgot password?** on sign-in. Without it, data is not recoverable. See [docs/DATA_ENCRYPTION.md](docs/DATA_ENCRYPTION.md). |

### Windows

| Issue | Fix |
|-------|-----|
| **SmartScreen: "Windows protected your PC"** | Click **More info → Run anyway** for unsigned builds. For downloaded installers: **Properties → General → Unblock** (if shown), then run. |
| **Installer blocked by antivirus** | Allow the app if you trust the source. Re-download if the file may be corrupt. |
| **App closes immediately** | Reinstall. Launch from the Start Menu — do not open `localhost` in a browser. Data lives in `%APPDATA%\com.albatross\`. |
| **Dev build fails (SQLCipher/OpenSSL)** | Install VS build tools and OpenSSL per [docs/SQLCIPHER_SPIKE.md](docs/SQLCIPHER_SPIKE.md). |

### Shared

| Issue | Fix |
|-------|-----|
| **Blank page at localhost:5174 in browser** | Expected without Tauri. Run `npm run tauri:dev` or use the installed app. |
| **Port 5174 already in use** (dev) | Stop the other process or change the port in `vite.config.ts` and `tauri.conf.json`. |
| **Want a clean database** | Quit the app, then remove the app data directory (paths above) while closed. |
| **Rust/Tauri changes not applying** (dev) | Restart `npm run tauri:dev`. Vite ignores `src-tauri/` for hot reload. |

---

## Further reading

- [docs/DATA_ENCRYPTION.md](docs/DATA_ENCRYPTION.md) — encryption and recovery
- [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md) — database client, transactions, migrations
- [docs/SETTINGS_AND_DEVTOOLS.md](docs/SETTINGS_AND_DEVTOOLS.md) — settings and developer tools
- [docs/project-import-export-format-v1.md](docs/project-import-export-format-v1.md) — `.apf` import/export
- Feature docs: [schedule](docs/schedule.md), [budget](docs/budget.md), [call sheets](docs/call-sheets.md), [deliverables](docs/deliverables.md), [equipment](docs/equipment.md), [vendors](docs/vendors.md), [crew manager](docs/crew-manager.md)

## Tech stack

- **Shell:** Tauri 2
- **UI:** Vite, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Data:** TanStack Query, TanStack Table, React Hook Form, Zod
- **Database:** SQLite via Tauri SQL plugin, SQLCipher encryption, migrations in Rust
- **Files:** Tauri fs, dialog, shell, opener — attachments in app data directory
- **PDF:** pdf-lib (generate), react-pdf (preview)

## License

COPYRIGHT 2026 ARAN DAVIES. ALL RIGHTS RESERVED.

Feedback: aran@noholdsbarred.pictures
