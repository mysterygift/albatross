# Settings

The Settings page (`/settings`) with a grouped left nav, plus the developer tools and the experimental-features flag. It is also the home of the key-value `settings` store used across the app.

## Code map
| Area | Location |
|---|---|
| Page (all section bodies) | `src/features/settings/page.tsx` |
| Section ids, groups, URL parsing | `src/features/settings/settingsSections.ts`, `src/features/settings/SettingsNav.tsx` |
| Section components | `src/features/settings/{AppearanceSettingsSection,EpisodesSettingsSection,ShootingBlocsSettingsSection,TaxCreditsSettingsSection,ClientsSettingsSection,CrewStructureEditor,ScriptSupervisorSettingsSection,MapTilesSettingsCard,ExperimentalFeaturesSettingsCard}.tsx` |
| Server section and dev tools | `src/features/server/ServerPublishingSettingsSection.tsx`, `src/features/server/ServerCollabDevTools.tsx` (see [../collaboration.md](../collaboration.md)) |
| Settings repository | `src/lib/db/repositories/settings.ts` |
| Boolean/flag hooks | `src/hooks/useBooleanSetting.ts`, `useDeveloperMode.ts`, `useShowExperimental.ts`, `useUiTheme.ts`, `useCurrency.ts` |
| Dev diagnostics | `src/components/dev/DevPerfHud.tsx`, `src/lib/db/perf.ts`, `src/lib/dev/apiCallTracker.ts` |
| Demo data | `src/lib/db/seed/` (see [tutorial.md](tutorial.md)) |
| Tests | `src/features/settings/*.test.ts(x)`, `src/hooks/useDeveloperMode.test.tsx` |

## Sections
The active section is the `?section=<id>` URL param (`sectionFromSearchParams`). The old `?tab=` values are still accepted; unknown ids fall back to `production`.

| Group | Section id (label) | Contents |
|---|---|---|
| Production | `production` (Production) | Currency, **Episodic production** (enabling is irreversible; shows Episodes and Shooting blocs once episodic), Tax credits, Clients. Needs a selected production except Currency and Clients |
| | `budget-accounts` (Budget accounts) | Cost report groups, Chart of accounts |
| | `script-supervisor` (Script supervisor) | Per-production slating system (UK/US); locked once slates exist |
| Appearance | `appearance` | UI theme picker ([../ui.md](../ui.md)) |
| Team & Access | `people` (Crew structure) | Departments, roles, HODs |
| | `users`, `project-access` | Entry points to `/settings/users` (instance admins) and `/settings/project-access` (see [../security.md](../security.md)) |
| Integrations | `integrations` (APIs & publishing) | OpenRouteService key, map tile source, server publishing / collaboration |
| Advanced | `demo-tutorial` (Demo & tutorial) | Open/reset tutorial, create/reset/open demo productions |
| | `developer` (Developer) | Experimental toggle (every build), Developer mode toggle, dev tools |

## Developer tools
- **Show experimental features** (`show_experimental`) is available in every build. It shows nav entries marked `experimental` in `src/app/navigation.ts` in the sidebar, section tabs and search; routes always exist, and no data is deleted when it is off. The card lists the current experimental entries from `experimentalNavLabels()`.
- **Developer mode** (`developer_mode`) is available in every build but only reveals the **Developer tools** card in dev builds (`import.meta.env.DEV`, i.e. `npm run tauri:dev`). Release builds show a notice instead.
- **Developer tools card** (dev builds, developer mode on): DB perf logging (HUD in `DevPerfHud` plus console helpers `__dbPerfSummary`, `__dbPerfLog`, `__dbDumpLogs`), external API call counters (session only), currency-conversion toggle, **Verify Cascades**, **Test Currency Conversion (Demo)**, **Trigger First-Launch Tutorial on Next Load**, and server collaboration dev tools.
- The **Productions** page also shows a dev-only "Verify Production Delete" panel.

## Settings storage
Key-value table `settings` (`key`, `value` text; created by migration `0009_currency_settings_exchange_rates.sql`). Use `getSetting` / `setSetting`; booleans are the strings `'true'` / `'false'`. `ensureSettingsDefaults()` inserts the `DEFAULTS` once at boot (from `ProductionProvider`) and runs two one-time migrations. Query key convention: `['settings', key]`; invalidate it (or `['settings']`) after a write.

| Key | Default | Purpose |
|---|---|---|
| `display_currency` | `GBP` | Display currency; production base currency is separate |
| `enable_currency_conversion_api` | `true` | Allow fetching exchange rates |
| `ui_theme` | `albatross-mint` | UI theme id |
| `developer_mode`, `show_experimental` | `false` | Flags above |
| `enable_api_call_tracking` | `false` | Session API counters |
| `enable_db_perf_logging` | unset (on unless `'false'`) | DB perf HUD, dev builds only |
| `local_collaboration_enabled` | `false` | Enables collaboration UI/traffic on this device |
| `openrouteservice_api_key`, `map_tile_url_template`, `map_tile_api_key` | unset | Integration credentials, stored in the local encrypted database |
| `first_launch_tutorial_progress`, `first_launch_tutorial_seen`, `onboarding_checklist_hidden` | unset | Onboarding state ([tutorial.md](tutorial.md)) |

Other modules store their own keys in the same table (auth session token, `db_encryption_version`, server connection tokens and install id, `dev_simulate_server_offline`); see [../security.md](../security.md) and [../collaboration.md](../collaboration.md). Per-viewer UI preferences that are not worth syncing live in `localStorage` instead (sidebar groups, dashboard hidden cards, budget view mode, show-archived productions).

## Gotchas
- `page.tsx` is large; each section is a `section === '<id>'` block. A new section needs an entry in `settingsSections.ts` (and `requiresDeveloperMode` only if it should be hidden).
- Adding a default key: add it to `DEFAULTS`; existing installs get it on next boot (`INSERT OR IGNORE`).
- Demo reset never touches user productions or user settings.
