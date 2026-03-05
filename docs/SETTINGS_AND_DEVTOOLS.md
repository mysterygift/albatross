# Settings and Developer tools — planning and implementation guide

This document describes the Settings page and the Developer tools section so they can be used for planning new features and implementation. It covers routes, data model, UI structure, query keys, and extension points.

---

## 1. Overview

### 1.1 Settings page

- **Route:** `/settings` (see `src/app/router.tsx`).
- **Entry point:** `src/features/settings/page.tsx` — single file containing `SettingsPage` and the inline `DemoSeedMeta` component.
- **Navigation:** Linked from the app nav as “Settings” (Settings icon) in `src/app/navigation.ts`.
- **Context:** Uses `useCurrentProduction()` for production-scoped sections (e.g. budget categories). Currency and global settings do not require a production.

The Settings page provides:

1. **Currency** — Display currency and optional conversion API toggle.
2. **Budget categories** — Per-production category CRUD (code, name, phase); only shown when a production is selected.
3. **Data location** — Informational card pointing to app data directory (README paths).
4. **Developer tools** (dev build only) — Demo production seed, DB perf logging, cascade verification, and experimental toggles.

### 1.2 Developer tools

- **Visibility:** The “Developer tools” card is rendered only when `import.meta.env.DEV` is true. It does not appear in production builds.
- **Location:** Inside the Settings page as the last card (`src/features/settings/page.tsx`).
- **Purpose:** Demo data, DB performance diagnostics, and experimental options for development and manual verification.

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
| `enable_currency_conversion_api` | `'false'` | `useCurrency`, exchange rates, Settings/Dev tools | When `'true'`, allows fetching exchange rates and converting displayed amounts. |
| `enable_db_perf_logging` | (none; treated as enabled if not `'false'`) | `src/lib/db/perf.ts`, Settings/Dev tools | When not `'false'`, enables DB perf recording and HUD in dev. |

Defaults are applied by `ensureSettingsDefaults()` in `settings.ts` (called from productions context on app init). Add new default keys to the `DEFAULTS` object and ensure they are created on first run if needed.

### 2.3 Related tables

- **Exchange rates:** `exchange_rates` (migration 0009) — cache for conversion API; see `src/lib/money/exchangeRates.ts`.
- **Productions:** `productions.currency_code` — per-production base currency; budget values are stored in this currency.
- **Budget categories:** `budget_categories` — production-scoped; managed in Settings when a production is selected.

---

## 3. Current UI and flows

### 3.1 Page layout (top to bottom)

1. **Title** — “Settings” (h1).
2. **Currency card** — Display currency dropdown; optional conversion banner from `useCurrency().conversionBanner`.
3. **Budget categories card** — Only when `currentProductionId` is set. “Add category” dialog; table of code, name, phase, delete. Description: “Define budget codes for this production.”
4. **Data location card** — Text only: “SQLite database and attachments are stored in the app data directory. See README for paths per platform.”
5. **Developer tools card** — Only when `import.meta.env.DEV`. See §3.3.

When no production is selected, a message is shown: “Select a production to manage budget categories and other settings.”

### 3.2 Currency card

- **Display currency:** `<Select>` over `CURRENCY_OPTIONS`; value from `useCurrency().displayCurrency`, onChange calls `setDisplayCurrency`.
- **Conversion API:** Not in the main Currency card in production; in dev it appears under Developer tools as “Enable Currency Conversion API (Experimental)” with a warning that it may break projects.
- **Banner:** `conversionBanner` (e.g. “Conversion disabled…”, “Exchange rate unavailable offline…”).

### 3.3 Developer tools card (dev only)

- **Title:** “Developer tools” (with Wrench icon).
- **Description:** “Demo production seed (slug: demo-production-albatross). Only affects this slug; never deletes user productions.”

**Toggles (in an amber-bordered box):**

- **DB Perf logging (HUD + Log to console)** — Checkbox; persists to `enable_db_perf_logging` via `setSetting`; also calls `setPerfLoggingEnabled()` from `src/lib/db/perf.ts` so the HUD and console logging turn on/off immediately.
- **Enable Currency Conversion API (Experimental)** — Checkbox; persists to `enable_currency_conversion_api`; labeled as experimental with “Do not use.”

**Buttons:**

- **Create Demo Production** — Calls `ensureDemoData()`, invalidates `['productions']`, refetches productions, switches current production to demo by slug (`DEMO_SLUG`). Errors shown inline for 5s.
- **Reset Demo Data** — Calls `resetDemoData()`, invalidates `['productions']`. Does not delete non-demo productions.
- **Open Demo Production** — Selects the demo production by slug if it exists (`getProductionBySlug(DEMO_SLUG)`).
- **Verify Cascades** — Calls `verifyCascades()` from demo seed; shows result (ok/message/details) below the buttons.
- **Test Currency Conversion (Demo)** — Temporarily sets display currency and API to USD/true, fetches GBP→USD rate, logs sample conversions to console, restores previous settings and invalidates `['settings']`.

**Meta:** `DemoSeedMeta` component shows “Last seeded: …” and seed version from `getLastSeededAt()` and `getSeedVersion()` (query keys `['seed-meta', 'last_seeded_at']`, `['seed-meta', 'seed_version']`).

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
| `['budget-categories', currentProductionId]` | Settings page | List categories for the current production; invalidate after create/delete category. |
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

1. **Location** — Add a button or control in the Developer tools card in `src/features/settings/page.tsx` (inside the `{import.meta.env.DEV && ( ... )}` block).
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
- **Cascade verification:** `verifyCascades()` checks FK/cascade behavior; result shown in Developer tools.

### 5.5 Budget categories in Settings

- **Scope:** Production-scoped; requires `currentProductionId`. Categories are created/deleted via `createBudgetCategory` and `deleteBudgetCategory` from `src/lib/db/repositories/budget.ts`.
- **No edit in UI** — Only add and delete; edit could be added with an update mutation and a small form/dialog.
- **Used by:** Budget page (dropdowns), quick-add spend; see `docs/BUDGET_FEATURE.md`.

---

## 6. Quick reference

| Item | Location / value |
|------|------------------|
| Settings route | `/settings` |
| Settings page component | `src/features/settings/page.tsx` |
| Settings repository | `src/lib/db/repositories/settings.ts` |
| Settings table migration | `src-tauri/migrations/0009_currency_settings_exchange_rates.sql` |
| Default setting keys | `DEFAULTS` in `settings.ts`: `display_currency`, `enable_currency_conversion_api` |
| Dev tools visibility | `import.meta.env.DEV` in Settings page |
| Demo slug | `DEMO_SLUG` in `src/lib/db/seed/constants.ts` |
| DB perf module | `src/lib/db/perf.ts`; toggle key `enable_db_perf_logging` |
| Currency hook | `src/hooks/useCurrency.ts`; keys `display_currency`, `enable_currency_conversion_api` |

For app-wide setup, migrations, and data location, see [GETTING_STARTED.md](./GETTING_STARTED.md) and the main [README](../README.md).
