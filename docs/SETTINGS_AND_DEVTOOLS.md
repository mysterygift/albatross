# Settings and Developer tools — planning and implementation guide

This document describes the Settings page and the Developer tools section so they can be used for planning new features and implementation. It covers routes, data model, UI structure, query keys, and extension points.

---

## 1. Overview

### 1.1 Settings page

- **Route:** `/settings` (see `src/app/router.tsx`).
- **Entry point:** `src/features/settings/page.tsx` — single file containing `SettingsPage` and the inline `DemoSeedMeta` component.
- **Navigation:** Linked from the app nav as “Settings” (Settings icon) in `src/app/navigation.ts`.
- **Context:** Uses `useCurrentProduction()` for production-scoped sections (e.g. legacy categories panel). Currency and global settings do not require a production.

The Settings page provides:

1. **Currency** — Display currency and optional conversion API toggle.
2. **Cost report groups** — Per-production groups when a production is selected. Add/edit/delete groups; map accounts (header or leaf) to groups for reporting and exports. Groups do not affect accounting totals.
3. **Chart of accounts** — Per-production when a production is selected. Tree view of accounts; add account (code, name, parent, postable); edit name; archive/unarchive; hard delete only when account is unused.
4. **Episodes & shooting blocs** — Shown only when the selected production is **episodic** (`is_episodic`). Manage episode names/order/archives and shooting-bloc calendars; see [docs/schedule.md](schedule.md) § Episodic productions.
5. **Data location** — Informational card pointing to app data directory (README paths).
6. **Demo projects** — Demo production seed and reset controls (available in both dev and production builds).
7. **Developer tools** (dev build only) — DB perf logging, cascade verification, and experimental toggles.

### 1.2 Demo projects and Developer tools

- **Demo projects visibility:** The demo seed/reset card is rendered in all builds.
- **Developer tools visibility:** The diagnostics card is rendered only when `import.meta.env.DEV` is true. It does not appear in production builds.
- **Location:** Inside the Settings page as the last card (`src/features/settings/page.tsx`).
- **Purpose:** Demo projects regenerate/open the canonical demo slug; Developer tools provide diagnostics and experimental controls.

---

## 2. Data model

### 2.1 Settings table

| Column | Type    | Purpose |
|--------|---------|--------|
| `key`  | TEXT PK | Setting identifier (e.g. `display_currency`, `enable_db_perf_logging`). |
| `value`| TEXT    | Stored value (e.g. `GBP`, `true`, `false`). |

- **Migration:** `src-tauri/migrations/0009_currency_settings_exchange_rates.sql` creates the `settings` table.
- **Repository:** `src/lib/db/repositories/settings.ts`.
- **API:** `getSetting(key)`, `setSetting(key, value)`, `ensureSettingsDefaults()`.

All values are stored as strings; consumers parse as needed (e.g. `value === 'true'` for booleans).

### 2.2 Known setting keys

| Key | Default | Used by | Purpose |
|-----|---------|---------|--------|
| `display_currency` | `'GBP'` | `useCurrency`, Settings UI | Display currency for budget/money (see `CURRENCY_OPTIONS` in `formatMoney`). |
| `enable_currency_conversion_api` | `'true'` | `useCurrency`, exchange rates, Settings/Dev tools | When `'true'`, allows fetching exchange rates and converting displayed amounts. Existing DBs that had the old default `'false'` are migrated once on startup. |
| `enable_db_perf_logging` | (none; treated as enabled if not `'false'`) | `src/lib/db/perf.ts`, Settings/Dev tools | When not `'false'`, enables DB perf recording and HUD in dev. |

Defaults are applied by `ensureSettingsDefaults()` in `settings.ts` (called from productions context on app init). Add new default keys to the `DEFAULTS` object and ensure they are created on first run if needed.

### 2.3 Related tables

- **Exchange rates:** `exchange_rates` (migration 0009) — cache for conversion API; see `src/lib/money/exchangeRates.ts`.
- **Productions:** `productions.currency_code` — per-production base currency; budget values are stored in this currency.
- **Budget categories:** `budget_categories` — production-scoped; legacy-only, not shown in Settings (see Budget feature docs).
- **Cost report groups:** `cost_report_groups`, `cost_report_group_accounts` — production-scoped; managed in Settings (Cost report groups card). Presentation/reporting only.

---

## 3. Current UI and flows

### 3.1 Page layout (top to bottom)

1. **Title** — “Settings” (h1).
2. **Currency card** — Display currency dropdown; optional conversion banner from `useCurrency().conversionBanner`.
3. **Cost report groups card** — Only when `currentProductionId` is set. Table: Name, Code, Accounts count, Actions (Edit, Delete). “Add group” opens a dialog (name, optional code, multi-select accounts). Edit opens same form with current name, code, and mapped accounts. Description: “Organise accounts for reporting and exports. Groups do not affect accounting totals.”
4. **Chart of accounts card** — Only when `currentProductionId` is set. Tree of accounts (code, name, indented); archived accounts shown with "Archived" badge. Add account, edit name, archive/unarchive, hard delete when eligible.
5. **Episodes card** — Only when the selected production has **`is_episodic = 1`**. Add, rename, reorder, archive (soft-delete) episodes; optional hard-delete when eligible. Episodes drive **scene** assignment in Shot Lists and episode badges on the stripboard.
6. **Shooting blocs card** — Only when the selected production is episodic. Table of blocs with name and **start/end dates**; editing a range may prompt to confirm re-association of **shoot days** whose dates fall in or out of the bloc. Bloc labels appear on the calendar and stripboard; shoot days reference `shooting_bloc_id`.
7. **Data location card** — Text only: “SQLite database and attachments are stored in the app data directory. See README for paths per platform.”
8. **Demo projects card** — Available in all builds; includes create/reset/open demo and seed metadata.
9. **Developer tools card** — Only when `import.meta.env.DEV`. See §3.3.

When no production is selected, a message is shown: “Select a production to manage cost report groups, chart of accounts, and other settings.”

When a production is selected but **not** episodic, the Episodes and Shooting blocs cards are hidden.

### 3.2 Currency card

- **Display currency:** `<Select>` over `CURRENCY_OPTIONS`; value from `useCurrency().displayCurrency`, onChange calls `setDisplayCurrency`.
- **Conversion API:** Not in the main Currency card in production; in dev it appears under Developer tools as “Enable Currency Conversion API (Experimental)” with a warning that it may break projects.
- **Banner:** `conversionBanner` (e.g. “Conversion disabled…”, “Exchange rate unavailable offline…”).

### 3.3 Demo projects card (all builds) and Developer tools card (dev only)

- **Demo projects title:** “Demo projects”.
- **Description:** Regenerates the canonical demo slug and never deletes user productions.

**Demo projects actions:**

- **Create Demo Production** — Calls `ensureDemoData()`, invalidates `['productions']`, refetches productions, switches current production to demo by slug (`DEMO_SLUG`). Errors shown inline for 5s.
- **Reset Demo Data** — Calls `resetDemoData()`, invalidates `['productions']`, `['crew']`, `['people']`, and `['deliverables']`. Does not delete non-demo productions.
- **Open Demo Production** — Selects the demo production by slug if it exists (`getProductionBySlug(DEMO_SLUG)`).
- **Meta:** `DemoSeedMeta` component shows “Last seeded: …” and seed version from `getLastSeededAt()` and `getSeedVersion()` (query keys `['seed-meta', 'last_seeded_at']`, `['seed-meta', 'seed_version']`).

**Developer tools title:** “Developer tools” (with Wrench icon).

**Developer tools toggles (in an amber-bordered box):**

- **DB Perf logging (HUD + Log to console)** — Checkbox; persists to `enable_db_perf_logging` via `setSetting`; also calls `setPerfLoggingEnabled()` from `src/lib/db/perf.ts` so the HUD and console logging turn on/off immediately.
- **Enable Currency Conversion API (Experimental)** — Checkbox; persists to `enable_currency_conversion_api`; labeled as experimental with “Do not use.”

**Developer tools buttons:**

- **Verify Cascades** — Calls `verifyCascades()` from demo seed; shows result (ok/message/details) below the buttons.
- **Test Currency Conversion (Demo)** — Temporarily sets display currency and API to USD/true, fetches GBP→USD rate, logs sample conversions to console, restores previous settings and invalidates `['settings']`.

---

## 4. Query keys and invalidation

### 4.1 Settings-scoped keys

| Query key | Used in | Purpose |
|-----------|---------|--------|
| `['settings']` | useCurrency, Settings page | Broad invalidation after any setting change (e.g. display currency, conversion API). |
| `['settings', 'display_currency']` | useCurrency | Display currency value. |
| `['settings', 'enable_currency_conversion_api']` | useCurrency | Conversion API enabled flag. |
| `['settings', DB_PERF_SETTING_KEY]` | Settings page (DB perf toggle) | `enable_db_perf_logging`; invalidate after toggle. |

`DB_PERF_SETTING_KEY` is the constant `'enable_db_perf_logging'` in `src/features/settings/page.tsx`.

### 4.2 Production- and seed-scoped keys

| Query key | Used in | Purpose |
|-----------|---------|--------|
| `['cost-report-groups', currentProductionId]` | Settings page | List cost report groups with account count; invalidate after create/update/delete group or mapping changes. |
| `['productions']` | After demo ensure/reset, Open Demo | Refetch production list. |
| `['seed-meta', 'last_seeded_at']` | DemoSeedMeta | Last seeded timestamp. |
| `['seed-meta', 'seed_version']` | DemoSeedMeta | Seed version. |

When adding new settings-backed features, use a key pattern like `['settings', key]` for that key and invalidate it (and optionally broad `['settings']`) on update.

---

## 5. Implementation notes for planning

### 5.1 Adding a new global setting

1. **Define the key** — Choose a string key (e.g. `my_feature_enabled`). If it must exist for all users, add it to `DEFAULTS` in `src/lib/db/repositories/settings.ts` and rely on `ensureSettingsDefaults()` (run on app init via productions context).
2. **Repository** — Use existing `getSetting(key)` and `setSetting(key, value)`; no schema change.
3. **Query key** — Use `['settings', key]` (or `['settings']` if you want to refetch all). Invalidate on write.
4. **UI** — Add a control in the appropriate Settings card (Currency, or a new card). For dev-only toggles, add under the Developer tools card and guard with `import.meta.env.DEV`.

### 5.2 Adding a new Developer tools action

1. **Location** — Add safe user-facing demo controls in the Demo projects card (always visible). Add diagnostics/experimental controls in the Developer tools card in `src/features/settings/page.tsx` (inside the `{import.meta.env.DEV && ( ... )}` block).
2. **Side effects** — Invalidate the minimal set of query keys (e.g. `['productions']`, `['settings']`) after async actions.
3. **Styling** — Keep the amber border and “experimental” tone for risky actions; use `Button variant="outline" size="sm"` for consistency with existing Dev tools buttons.

### 5.3 DB perf and HUD

- **Toggle:** Stored in `enable_db_perf_logging`; when value is `'false'`, `setPerfLoggingEnabled(false)` is called and the perf layer stops recording and hides the HUD.
- **HUD component:** `src/components/dev/DevPerfHud.tsx` — rendered when `import.meta.env.DEV` and perf logging is enabled; shows recent DB ops and “Log to console” (see `src/lib/db/perf.ts`).
- **Where HUD is mounted:** Check `src/app/layout.tsx` or the root layout for conditional render of `DevPerfHud`.

### 5.4 Demo production seed

- **Slug:** `DEMO_SLUG = 'demo-production-albatross'` in `src/lib/db/seed/constants.ts`. All demo actions target only this slug.
- **Seed module:** `src/lib/db/seed/demoProductionSeed.ts` — `ensureDemoData()`, `resetDemoData()`, `getLastSeededAt()`, `getSeedVersion()`, `verifyCascades()`.
- **Reset behavior:** Does not delete user productions; only the demo production and its related data (by id/slug) are removed or reset. User settings (e.g. display currency, conversion API) are not reset (see comment in demo seed).
- **Cascade verification:** `verifyCascades()` checks FK/cascade behavior; result shown in Developer tools (dev build only).

### 5.5 Cost report groups in Settings

- **Scope:** Production-scoped; requires `currentProductionId`. Repository: `src/lib/db/repositories/costReportGroups.ts`. Add/edit/delete groups; map accounts to groups via multi-select (header or leaf accounts allowed). Groups are presentation-only and do not affect Budget page totals or posting.
- **Query key:** `['cost-report-groups', currentProductionId]`. Invalidate after create, update, delete, or when group account mappings change. Account list for the multi-select uses `['budget-accounts', currentProductionId]` when the Add/Edit dialog is open.

### 5.6 Legacy categories

- Budget categories are **legacy-only** and are not shown or managed in Settings. They remain in the DB for legacy item display and backfill on the Budget page. See `docs/budget.md`.

---

## 6. Quick reference

| Item | Location / value |
|------|------------------|
| Settings route | `/settings` |
| Settings page component | `src/features/settings/page.tsx` |
| Settings repository | `src/lib/db/repositories/settings.ts` |
| Settings table migration | `src-tauri/migrations/0009_currency_settings_exchange_rates.sql` |
| Default setting keys | `DEFAULTS` in `settings.ts`: `display_currency`, `enable_currency_conversion_api` |
| Demo projects visibility | Always visible in Settings |
| Dev tools visibility | `import.meta.env.DEV` in Settings page |
| Demo slug | `DEMO_SLUG` in `src/lib/db/seed/constants.ts` |
| DB perf module | `src/lib/db/perf.ts`; toggle key `enable_db_perf_logging` |
| Currency hook | `src/hooks/useCurrency.ts`; keys `display_currency`, `enable_currency_conversion_api` |

For app-wide setup, migrations, and data location, see [GETTING_STARTED.md](./GETTING_STARTED.md) and the main [README](../README.md).
