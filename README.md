# Albatross

Offline-first production management for film, TV, commercials and documentaries. Script, schedule, people, budget, paperwork and wrap — in one desktop app. Your data stays on your machine in an encrypted database. No cloud account required.

> **Disclaimer:** Albatross was built with heavy assistance from AI coding tools. Sensitive personal data is encrypted at rest, but no software is bulletproof. Use at your own risk, and keep backups (see [Back up your work](#back-up-your-work)).

## Highlights

| Area | What you get |
|---|---|
| **Script** | Import text or text-layer PDF scripts, split them into sections and sides, tag elements for breakdown by department and track what has been sourced. |
| **Schedule** | Calendar, drag-and-drop stripboard with multiple units, shot lists and storyboards. |
| **People** | Cast and crew managers, bookings, and a Day Out of Days inferred from your stripboard and availability. |
| **Budget** | Chart of accounts, line items, typed expenses, floats, vendors, purchase orders, receipts, budget revisions and cost reports. |
| **Deliver** | Industry-standard A4 call sheets, movement orders with route maps, risk assessments (RAMS), documents, deliverables, music clearances and cue sheets. |
| **Control** | Dashboard, tasks, a wrap checklist, ⌘K command palette and global search. |
| **Safe by design** | Encrypted local database, local accounts, per-production import/export as `.apf` files. Episodic productions supported. |

## Quick start

1. **Download** the latest installer for your platform from the [Releases page](https://github.com/mysterygift/albatross/releases):
   - macOS: the `.dmg`
   - Windows: the Windows installer
2. **Install and open it.** Release builds are not code-signed yet, so your OS will warn you the first time — see [Opening an unsigned app](#opening-an-unsigned-app).
3. **Run the setup wizard.** Choose a password, create the admin account and **save your recovery key somewhere safe**. There is no cloud reset: without your password or recovery key the data cannot be recovered.
4. **Take the tutorial** when offered. It creates a sample production with a starter budget that you can explore and delete later. A full demo production is also available from **Settings → Demo & tutorial**.
5. **Create your own production** from **Productions → Add**, or use **Import project** to open a `.apf` file.

Then follow the [Guidebook](GUIDEBOOK/README.md), a chapter-by-chapter walkthrough of every part of the app.

## Opening an unsigned app

### macOS

macOS blocks apps it cannot verify ("Albatross is damaged and can't be opened", or "cannot be opened because the developer cannot be verified").

1. Drag **Albatross** into **Applications** and try to open it once.
2. Open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to Albatross. Confirm with your password.

If macOS still reports the app as damaged, remove the download quarantine flag and open it again:

```bash
xattr -cr /Applications/Albatross.app
```

### Windows

1. Run the installer. If **"Windows protected your PC"** appears, click **More info → Run anyway**.
2. If the installer will not start at all, right-click the file → **Properties** → tick **Unblock** → **OK**, then run it again.
3. If antivirus quarantines it, restore it only if you downloaded it from the official Releases page.

## Troubleshooting

| Problem | Fix |
|---|---|
| Forgot your password | On the sign-in screen click **Forgot password?** and enter your recovery key. Without the recovery key, data is not recoverable. |
| Double-clicking a `.apf` file does not open Albatross | Right-click → **Open With → Albatross** (macOS) or choose Albatross in **Open with** (Windows). Or use **Productions → Import project**. |
| App closes immediately on Windows | Reinstall, and launch it from the Start menu. |
| A feature seems missing | Some features are experimental and hidden by default — see [Experimental features](GUIDEBOOK/15-experimental-features.md). |
| Want a completely fresh start | Quit Albatross, then delete the data folder below. **This permanently deletes everything in it.** |

More: [Guidebook → Troubleshooting](GUIDEBOOK/16-troubleshooting.md).

## Where your data lives

| Platform | Folder |
|---|---|
| macOS | `~/Library/Application Support/Albatross/` |
| Windows | `%APPDATA%\Albatross\` |
| Linux | `~/.config/Albatross/` |

It holds the encrypted database (`albatross.db` and its key sidecar files) and your attachments.

### Back up your work

- Per production: **Productions → Export project** to save a `.apf` file, or duplicate the production.
- Whole app: quit Albatross and copy the entire folder above. Keep your recovery key with the backup.

## Contributing

Developer documentation lives in [`DOCS/`](DOCS/README.md): architecture, database, security, and a reference for every feature. To run from source you need Node.js (current LTS), Rust 1.77.2+ and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
git clone https://github.com/mysterygift/albatross.git
cd albatross
npm install
npm run tauri:dev
```

See [DOCS/contributing.md](DOCS/contributing.md) for the full workflow.

## Links

- [Guidebook](GUIDEBOOK/README.md) — how to use Albatross
- [Release notes](RELEASE_NOTES.md)
- [Developer docs](DOCS/README.md)
- Feedback and bug reports: [GitHub issues](https://github.com/mysterygift/albatross/issues) or [aran@noholdsbarred.pictures](mailto:aran@noholdsbarred.pictures)

## License

Copyright 2026 Aran Davies. All rights reserved.
