# Hello, Albatross

A short, beginner-friendly guide to getting started with **Albatross** — an offline-first desktop app for managing film, TV, commercial, and documentary productions.

---

## What is Albatross?

Albatross runs on your computer as a native desktop app. It helps you:

- **Manage productions** — Create and switch between projects; all data stays on your machine.
- **Plan the schedule** — Calendar, stripboard, shot lists, and script import.
- **Track people** — Cast and crew bookings, plus Day Out of Days (DOOD) inferred from the stripboard.
- **Handle budget** — Categories, line items, and expenses in your production’s currency.
- **Organize the rest** — Locations, equipment, documents, call sheets, tasks, deliverables, and music/archive clearances.

Everything is stored locally (SQLite + files). No account, no cloud, no internet required after install.

---

## Getting set up

### What you need

- **Node.js** 18 or newer  
- **Rust** 1.77.2+ (for the Tauri desktop shell)  
- **Platform prerequisites** for Tauri: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS  

### Run the app

```bash
# From the project root
npm install
npm run tauri:dev
```

A native window opens; the UI loads from the Vite dev server. No internet needed after this.

### Build a distributable app

```bash
npm run tauri:build
```

Outputs (e.g. `.dmg` on macOS) are under `src-tauri/target/release/`. See the main [README](README.md) for more build details.

---

## First steps in the app

1. **Create or open a production**  
   - Go to **Productions** in the sidebar.  
   - Click **Add** to create a new production (name and optional notes).  
   - Use the **current production** dropdown in the top bar to switch between productions.  
   - Most of the app (Dashboard, Budget, Schedule, People, etc.) only shows data for the **selected** production.

2. **Try the demo (development only)**  
   - In **Settings**, scroll to **Developer tools** (only visible when running with `npm run tauri:dev`).  
   - Use **Create Demo Production** to add a full demo production (stripboard, scenes, cast, budget, documents, call sheets, etc.).  
   - Use **Open Demo Production** to select it, or **Reset Demo Data** to remove only the demo production and re-seed it.  
   - Demo data is keyed by a special slug and never deletes your own productions.

3. **Duplicate a production**  
   - On the Productions list, use the **Duplicate** (copy) action on a production.  
   - Give it a new name to create a full copy (schedule, budget, people, documents, etc.). Useful for backups or “what-if” copies before trying experimental settings.

---

## Core functionality (at a glance)

| Area | What you can do |
|------|------------------|
| **Dashboard** | Overview of the current production; task completion score and required items. |
| **Productions** | Create, edit, delete, duplicate productions; select which one is “current”. |
| **Budget** | Set budget categories (pre/production/post), add line items and expenses. Default currency is GBP; display currency is configurable in Settings. |
| **Schedule** | **Calendar** — shoot days; **Stripboard** — drag-and-drop strips (scenes, moves, calls, lunch, wrap, notes), multiple units per day, lock columns; **Shot lists** — shots per scene; **Script import** — paste text or attach `.txt` to break down scenes (see *Not yet implemented* for PDF). |
| **People** | **Bookings** — cast/crew; **Day Out of Days** — WORK/HOLD/OFF/CLASH inferred from stripboard + cast availability; export DOOD to PDF. |
| **Locations** | Add and manage locations; link scenes to locations. |
| **Equipment** | Track equipment and terms per production. |
| **Documents** | Attach files (PDFs, images, etc.); open in system viewer. Call sheet PDFs are also stored here. |
| **Call sheets** | Generate call sheet PDFs per shoot day/unit; save and open in system viewer. |
| **Tasks** | Production tasks; required vs optional; completion status. |
| **Deliverables** | Track deliverables for the production. |
| **Music & archive** | Music tracks and clearances; generate cue sheets. |
| **Settings** | Display currency, budget categories for current production, data location info; in dev, developer tools (demo seed, currency API, cascade verification). |

---

## Where your data lives

- **Database**: `albatross.db` in the app config directory (e.g. on macOS: `~/Library/Application Support/com.albatross.app/`).  
- **Attachments**: An `attachments/` folder in that same directory. Uploaded files and generated call sheet PDFs are stored there.  

Exact paths for Windows and Linux are in the [README](README.md).

---

## Not yet implemented (or experimental)

- **Script import — PDF parsing**  
  You can attach a PDF script and preview it, but scene breakdown from PDF text is **not implemented**. Use **paste text** or a **.txt file** to import and parse scenes.

- **Cloud sync**  
  Creates/updates/deletes write to an internal **outbox** for future sync, but **sync is not implemented**. The app is local-only.

- **Currency conversion API**  
  Optional exchange-rate conversion (for display only) is **experimental** and off by default. It’s in **Settings → Developer tools** (dev only), with a warning. Normal use is single-currency (production base currency, with optional display currency preference).

---

## Where to go next

- **README.md** — Full setup from scratch, migrations, data model, DOOD rules, strip types, tech stack, and architecture.  
- **Sidebar** — Use the app’s navigation to explore each area; the top bar always shows which production is active.

Enjoy Albatross. If you have any feedback, reach out to Aran at aran@noholdsbarred.pictures
