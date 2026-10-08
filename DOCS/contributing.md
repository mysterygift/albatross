# Contributing

How to set up, run, test, extend and release Albatross as a developer.

## Prerequisites
- **Node.js** and npm. No version is pinned in the repo; use a current LTS or newer.
- **Rust** 1.77.2 or newer (`rust-version` in `src-tauri/Cargo.toml`), via [rustup](https://rustup.rs/).
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/): Xcode Command Line Tools on macOS, Visual Studio Build Tools and WebView2 on Windows, `webkit2gtk` and friends on Linux.
- SQLCipher is compiled into the app. On desktop it uses `bundled-sqlcipher-vendored-openssl`, so the first Rust build also builds OpenSSL from source and needs a C toolchain and Perl. On iOS it uses `bundled-sqlcipher` with Apple's CommonCrypto, so no OpenSSL is built.
- For the iPhone build, a Mac with Xcode and the [Tauri iOS prerequisites](https://v2.tauri.app/start/prerequisites/#ios) ([below](#iphone-build)).
- PostgreSQL is only needed for `npm run test:postgres` and server work.

No `.env` file is needed for normal development.

## Setup and run
```bash
npm install
npm run tauri:dev
```
`tauri:dev` starts Vite on **http://localhost:5174** (`strictPort`; change it in both `vite.config.ts` and `src-tauri/tauri.conf.json` `build.devUrl`) and opens the native window. Use that window: a normal browser tab has no Tauri runtime and shows an explainer. Vite ignores `src-tauri/`, so Rust changes need a restart of `tauri:dev`. Migrations run when the database is opened, so a new migration also needs a restart.

## Commands
| Command | What it does |
|---|---|
| `npm run tauri:dev` | Desktop app with hot reload |
| `npm run dev` | Vite only (static UI work; no database) |
| `npm run build` | `tsc -b && vite build`: type-check and build the frontend to `dist/` |
| `npm run tauri:build` | Release bundle; output in `src-tauri/target/release/bundle/` |
| `npm run tauri -- ios dev` / `ios build` | iPhone dev run and release build ([iPhone build](#iphone-build)) |
| `npm test` | Vitest, all `src/**/*.test.ts(x)` (`npm run test:watch` to watch) |
| `npm run test:postgres` | Postgres adapter and schema tests in `src/test/postgres/`; needs a reachable Postgres for everything except schema parity (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`; default database `albatross_ci`) |
| `npm run lint` / `npm run lint:ci` | ESLint; `lint:ci` fails above 60 warnings |

Tests use the default `node` environment; component tests opt in with a `// @vitest-environment jsdom` first line. Repository tests run against in-memory SQLite (`sql.js`) through `setDbAdapterForTests`.

**CI** (GitHub Actions, on pull requests and pushes to `main` and `dev`):
- `.github/workflows/ci.yml` runs `npm ci`, `npm run lint:ci`, `npm test` (without the Postgres suites) and `npm run build`.
- `.github/workflows/postgres-infrastructure.yml` starts Postgres 16, runs a `SELECT 1` check and then `npm run test:postgres`.
- The lint, test, build and Postgres-test steps are `continue-on-error` because they were already failing when CI was added; each workflow lists the known failures in a comment. A step failure is visible in the log but does not fail the check. Remove `continue-on-error` from a step once it is green. Until then, run `npm run lint:ci`, `npm test` and `npm run build` locally and compare with the known failures rather than trusting a green check.

## Dev database
- Location: the Tauri app config directory for identifier `Albatross`, shared by dev runs and any installed build on the same machine.

  | OS | Path |
  |---|---|
  | macOS | `~/Library/Application Support/Albatross/` |
  | Windows | `%APPDATA%\Albatross\` |
  | Linux | `~/.config/Albatross/` |

- Contents: `albatross.db` (SQLCipher), `albatross.db.meta.json`, `albatross.instance-key.wrappers.json`, `albatross.recovery.meta.json`, `attachments/`.
- **Reset**: quit the app, then delete `albatross.db` and the three `albatross.*.json` files (and `attachments/` if you want a clean slate). The next launch runs the first-run setup wizard again. Remove the database and the `.json` files together so the app does not find encryption metadata for a missing database.
- Sample content without resetting: Settings → Demo & tutorial creates and resets the demo productions ([features/tutorial.md](features/tutorial.md)). `demo/Toothpick-Manchester-Demo.apf` is a larger sample project to import ([import-export.md](import-export.md#demo-project)).

## Developer tools in dev builds
- **Settings → Developer**: turn on **Developer mode** to show the Developer tools card in `tauri:dev` builds: DB perf HUD, external API call counters, **Verify Cascades**, currency conversion test, server collaboration dev tools. Release builds ignore it. Details: [features/settings.md](features/settings.md).
- Console helpers `window.__dbPerfSummary()`, `__dbPerfLog()`, `__dbDumpLogs()` in dev.
- **Productions** shows a dev-only "Verify Production Delete" panel.
- **Show experimental features** (Settings → Developer, all builds) reveals pages marked `experimental`.
- Dev builds log DB timings and warn if `PRAGMA foreign_keys` is off or menu accelerators clash.

## Add a page
1. Create the component in `src/features/<feature>/` using `PageHeader`, `RequireProduction` and `EmptyState` ([ui.md](ui.md)).
2. Register the route in `src/app/router.tsx`.
3. Add it to `src/app/navigation.ts` (group, label, icon, `experimental` if hidden by default). The sidebar, breadcrumbs, section tabs and search "Go to" pick it up automatically.
4. Optional: a menu command or shortcut in `src/app/menuSchema.ts` and `src-tauri/src/menu.rs`; a `data-tutorial` target and flow ([features/tutorial.md](features/tutorial.md)); a user guide chapter.
5. If it has detail routes, add them to the router only; `findNavTrail` falls back to the nearest parent.
6. Check it on a phone width ([ui.md](ui.md#phone-and-touch-layout)); the sidebar and tab bar need no change.

## Add a feature (new data)
1. Migration for tables (below).
2. Types in `src/lib/db/types.ts` and a repository in `src/lib/db/repositories/` (production-scoped queries, `$n` placeholders, `executeBatch` for multi-statement writes, outbox entries for synced entities).
3. Page and hooks under `src/features/<feature>/` with TanStack Query keys `[entity, productionId, ...]`.
4. Tests colocated with the repository and page.
5. Check the cross-cutting consumers: `.apf` export/import ([import-export.md](import-export.md)), duplicate production, global search, dashboard, server sync and the Postgres schema ([database.md](database.md), [collaboration.md](collaboration.md)).
6. Add `DOCS/features/<feature>.md` from the template in [README.md](README.md).

## Add a migration
Local SQLite schema changes are numbered files in `src-tauri/migrations/` (currently up to `0106`). For a new one:
1. Create `src-tauri/migrations/NNNN_short_name.sql` with the next number.
2. Add a `Migration { version: NNNN, description, sql: include_str!(...), kind: MigrationKind::Up }` entry at the end of the list in `src-tauri/src/lib.rs`. A file without an entry never runs.
3. Add the matching Postgres migration in `postgres/migrations/` (currently up to `0034`), run `node scripts/postgres/generatePhase2Artifacts.mjs` to refresh `postgres/schema/baseline.sql`, and keep `npm run test:postgres` schema parity passing ([collaboration.md](collaboration.md)).
4. Restart `tauri:dev`. Never edit a migration that has shipped; add a new one.

Rules for writing migrations, SQLite/Postgres differences and the parity tests: [database.md](database.md).

## Release build and signing
- `npm run tauri:build` builds installers for the host OS (`bundle.targets` is `all`); bundle version is `version` in `src-tauri/tauri.conf.json`. Release notes are kept in `RELEASE_NOTES.md`. Releases are tagged in git (`alpha-NNN`, `Nightly`).
- **Bundles are unsigned.** The repo has no macOS signing identity or notarization, no Windows certificate and no release workflow. Users see Gatekeeper (macOS) and SmartScreen (Windows) warnings (see the install notes in the root README). The iOS project signs with a development team and exports with method `debugging` (`src-tauri/gen/apple/ExportOptions.plist`); the repo has no App Store or TestFlight configuration.

## iPhone build
This branch builds the iPhone app as well as the desktop app, from one codebase. The Tauri project for iOS is committed: `src-tauri/gen/apple/` (Xcode project, `project.yml`, icons, `Podfile`) and a patched copy of `swift-rs` in `src-tauri/vendor/swift-rs/`, wired in by `[patch.crates-io]` in `src-tauri/Cargo.toml`.

**Run and build**
```bash
npm install
npm run tauri -- ios dev            # pick a simulator or connected iPhone; or: ios dev "<device name>"
npm run tauri -- ios build          # release build; writes an .ipa
```
- The repo defines no `tauri:ios` scripts; the Tauri CLI commands above are the entry points. Xcode's *Build Rust Code* phase in `gen/apple/project.yml` calls `tauri ios xcode-script`, so building from Xcode also builds the Rust library.
- `ios dev` serves Vite on port 5174. On a physical device the CLI sets `TAURI_DEV_HOST` and `vite.config.ts` binds to it.
- Signing: the Xcode project sets a `DEVELOPMENT_TEAM` and "iPhone Developer" signing in `gen/apple/app.xcodeproj/project.pbxproj`. Change the team to your own Apple developer account (Xcode: Signing & Capabilities) before running on a device. `gen/apple/ExportOptions.plist` uses export method `debugging`.
- Deployment target is iOS 15.0 (`bundle.iOS.minimumSystemVersion` in `tauri.conf.json`, `project.yml`); the target runs arm64 only.

**Why these versions and patches**
- Tauri is 2.12 or newer (`tauri` in `Cargo.toml`, `@tauri-apps/*` in `package.json`). Apps built with the iOS 27 SDK must use the UIScene lifecycle or UIKit aborts at launch; `tao` 0.37 (Tauri 2.12.1) provides it. Do not downgrade.
- Xcode 27 needs two workarounds in `Cargo.toml`: the vendored `swift-rs` (makes the SwiftRs helpers bundled in `libTauri.a`, such as `retain_object`, globally visible; Xcode 27 otherwise internalizes them) and `strip = "none"` for `profile.release.build-override` (stripping corrupts host proc-macro dylibs).

**Platform files**
| File | Role |
|---|---|
| `src-tauri/tauri.ios.conf.json` | iOS bundle identifier `com.mysterygift.albatross` (desktop is `Albatross`) |
| `src-tauri/Info.ios.plist` | Merged into the generated Info.plist: Files-app access to Documents (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`), the camera usage string, and the `.apf` document type and `com.albatross.apf` UTI. `gen/apple/project.yml` mirrors these; keep both in step |
| `src-tauri/capabilities/mobile.json` | Permissions on iOS and Android: app data and documents only |
| `src-tauri/src/apf_ios.rs` | Opens `.apf` files from Files, the share sheet, Mail and AirDrop ([import-export.md](import-export.md#ios-open-with)) |
| `src-tauri/src/menu_mobile.rs` | No-op menu commands; the **App menu** replaces the menu bar ([ui.md](ui.md#keyboard-shortcuts-command-palette-native-menu)) |
| `src/lib/platform/`, `src/styles/platform-mobile.css`, `src/styles/motion.css` | Platform checks and iOS styling ([ui.md](ui.md#phone-and-touch-layout)) |
| `src/lib/files/mobileShare.ts` | Exports and the share sheet ([integrations.md](integrations.md#files-and-attachments)) |

**On device.** The database and attachments live in the app sandbox (`app_config_dir` and app data), not in Files. Only the `Documents` folder shows in Files under On My iPhone › Albatross; exports go to `Documents/Exports`.

## Docs conventions
- **Developer docs** live in `DOCS/`; **user docs** in `GUIDEBOOK/` (one chapter per file, screenshots in `GUIDEBOOK/images/NN-slug.png`, named after the chapter). Release notes: `RELEASE_NOTES.md`. The index is [README.md](README.md).
- Each fact lives in one place; link instead of repeating. Link to code paths, not line numbers.
- A feature's dev reference goes in `DOCS/features/<feature>.md` (short, scannable); cross-cutting topics go in the core docs: [architecture.md](architecture.md), [ui.md](ui.md), [database.md](database.md), [security.md](security.md), [import-export.md](import-export.md), [collaboration.md](collaboration.md), [integrations.md](integrations.md).
- In prose, a project is a **production** (except the `.apf` "Albatross Project File" and `project*` identifiers). Match UI labels exactly, in bold; navigation as **Schedule → Stripboard**.
- Update the relevant doc in the same change as the code. Do not write plans, status or history in `DOCS/`.
