# Albatross developer docs

Everything a contributor needs to know about how Albatross is built. Using the app? See the [Guidebook](../GUIDEBOOK/README.md). Setting up to contribute? Start with [contributing.md](contributing.md).

## Start here

| Doc | Read it to learn |
|---|---|
| [contributing.md](contributing.md) | Setup, commands, iPad and iPhone builds, testing, adding pages/features/migrations, releases |
| [architecture.md](architecture.md) | Stack, repo layout, boot sequence, routing, state, data sources |
| [database.md](database.md) | SQLite access and transaction rules, migrations, repositories, schema map |
| [ui.md](ui.md) | App shell, navigation, shared components, themes, shortcuts, touch and mobile |

## Cross-cutting

| Doc | Covers |
|---|---|
| [security.md](security.md) | Local auth, SQLCipher and field encryption, recovery key, access control |
| [import-export.md](import-export.md) | The `.apf` project file format, import/export, file association, iOS file sharing |
| [collaboration.md](collaboration.md) | The optional server, publish, linked runtime, PostgreSQL, sync-v2 status |
| [integrations.md](integrations.md) | External APIs, Tauri plugins, PDF libraries, attachments |

## Features

Each page follows the same layout: code map, data model, how it works, connections, gotchas.

| Group | Docs |
|---|---|
| App | [Dashboard](features/dashboard.md) · [Search](features/search.md) · [Settings](features/settings.md) · [Guidebook viewer](features/guidebook.md) · [Tutorial](features/tutorial.md) · [Productions](features/productions.md) |
| Plan | [Schedule](features/schedule.md) · [Script](features/script.md) · [Locations](features/locations.md) · [Equipment](features/equipment.md) · [Risk Assessments](features/risk-assessments.md) |
| People | [People](features/people.md) · [Crew Manager](features/crew-manager.md) · [Release Forms](features/release-forms.md) |
| Money | [Budget](features/budget.md) · [Vendors](features/vendors.md) |
| Deliver | [Call Sheets](features/call-sheets.md) · [Movement Orders](features/movement-orders.md) · [Documents](features/documents.md) · [Deliverables](features/deliverables.md) · [Music & Archive](features/music-archive.md) |
| Run | [Tasks](features/tasks.md) · [Wrap Production](features/wrap-production.md) |
| Experimental | [Script Supervisor](features/script-supervisor.md) · [Overtime](features/overtime.md) · [Receipt Capture](features/receipt-capture.md) |

## Conventions for these docs

- Developer docs live only in `DOCS/`. User-facing docs are the root `README.md` and `GUIDEBOOK/`.
- One fact lives in one place; link instead of repeating.
- The code is the source of truth. Describe what exists today, not plans or history.
- Link to files, not line numbers. Keep links relative.
- A new feature gets `features/<name>.md` with the sections above; keep it under about 120 lines.
- When you change behaviour a doc describes, update the doc in the same change.
- Guidebook screenshots go in `GUIDEBOOK/images/` and are named `NN-slug.png` after their chapter number.
