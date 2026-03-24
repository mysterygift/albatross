# Albatross APIs Guide

This document explains how APIs are used in Albatross for:

- users (what features depend on APIs and what to configure), and
- developers (endpoints, command contracts, data flow, and failure behavior).

This guide intentionally excludes all API keys, tokens, and secrets.

## Quick Index

### External HTTP APIs

- OpenRouteService (Directions + Geocoding; responses cached in SQLite with TTL)
- Open-Meteo (Forecast for call sheets; coordinates come from OpenRouteService geocoding)
- Fawaz Ahmed Currency API (via jsDelivr CDN)

### Internal App APIs

- Tauri command APIs (`invoke`)
- Desktop OS integration APIs (Tauri plugins)
- Repository and service APIs (app-internal data/service boundaries)

---

## User Guide

## 1) OpenRouteService (travel times in Schedule)

### What it powers

- Day Summary Drawer travel-time lines between ordered shoot-day locations.
- Total travel time and long-move warning context in the schedule UI.
- Movement Orders: geocoding and route summaries (driving and walking) between ordered locations on the PDF/preview flow.

### What users need to do

- Add their own ORS key in Settings -> APIs -> OpenRouteService API key.
- Use `Get free key` to open the ORS website in a browser.

### What happens on failure

- If key, geocode, or directions lookup fails, Albatross returns `null` travel values.
- UI remains usable; travel rows show unavailable state rather than crashing.

### Caching and freshness

- Identical ORS requests are served from a **persistent SQLite cache** first, so repeat previews and new sessions avoid redundant network calls when data is still considered fresh.
- **Time-to-live (TTL)** is applied only when **reading** the cache (rows are not deleted when they age out):
  - **Directions** (driving and walking): treated as stale after **2 days**; the next use triggers a new ORS request and updates the stored response.
  - **Geocoding**: treated as stale after **30 days**; the next use triggers a new geocode request and updates the stored response.
- On the **Movement Orders** screen, **Refresh travel data** forces a new ORS round-trip for that enrichment pass (cache bypass for success), while still allowing a last-resort fallback to previously stored data if the network call fails.

---

## 2) Open-Meteo (call sheet weather enrichment)

### What it powers

- Weather summary + sunrise/sunset enrichment during call sheet generation/view flow.

### What users need to do

- **OpenRouteService API key** (Settings → APIs): call-sheet weather resolves the shoot location to coordinates via the same ORS geocoding used for logistics. Without a key, automatic weather lookup cannot geocode.
- Open-Meteo’s forecast endpoint itself does not require a key.

### What happens on failure

- App falls back to manual/stored weather values and continues PDF generation.
- User may see fallback messaging (weather lookup unavailable).

---

## 3) Currency conversion API (optional display conversion)

### What it powers

- Display-currency conversion in budget/dashboard contexts.

### What users need to do

- Enable currency conversion API setting (where available in app settings/dev settings).

### What happens on failure

- If unavailable, app uses cached rate when possible.
- Otherwise app falls back to production base currency display.

---

## Developer Documentation

## 1) OpenRouteService API

### Endpoints used

- Directions (driving): `https://api.openrouteservice.org/v2/directions/driving-car`
- Directions (walking): `https://api.openrouteservice.org/v2/directions/foot-walking`
- Geocoding: `https://api.openrouteservice.org/geocode/search`

### Where it is integrated

- Frontend service wrapper (includes cache-first reads and TTL):
  - `src/lib/logistics/openRouteService.ts`
- Travel segment orchestration:
  - `src/lib/logistics/dayTravel.ts`
- Movement Orders route enrichment:
  - `src/lib/movement-orders/enrichMovementLegsWithRouteData.ts`
  - `src/features/movement-orders/page.tsx` (manual **Refresh travel data**)
- Tauri backend HTTP calls:
  - `src-tauri/src/open_route_service.rs`
- Command registration:
  - `src-tauri/src/lib.rs`
- User key management UI:
  - `src/features/settings/page.tsx`

### Auth behavior (no secret values)

- Frontend reads key from app setting key: `openrouteservice_api_key`.
- Frontend passes key to Tauri commands as `orsApiKey`.
- Rust command fallback order:
  1. command argument key (if non-empty),
  2. environment variable `OPENROUTESERVICE_API_KEY`.

### Request/response usage in Albatross

- Directions request body:
  - `{"coordinates": [[start_lng, start_lat], [end_lng, end_lat]]}`
- Directions response fields consumed:
  - `routes[0].summary.duration` (seconds), converted to rounded minutes.
  - `routes[0].summary.distance` (meters), converted to document-friendly distance text.
  - `routes[0].segments[].steps[].instruction` (compact route directions summary).
- Geocode request:
  - GET with query params `text`, `size=1`, `api_key`.
- Geocode response consumed:
  - first feature geometry coordinates `[lng, lat]`.

### Flow in app code

1. DaySummaryDrawer builds ordered location stack.
2. `getTravelSegmentsForDayUnit()` resolves coordinates:
   - use existing `lat/lng` if present,
   - otherwise geocode with ORS from `address` or `name`.
3. For each adjacent pair, call directions command for travel minutes.
4. UI renders per-leg and total minutes where available.

### Error/fallback behavior

- Invalid coordinates, missing key, failed HTTP, non-success status, parse errors all return `null`.
- Failures do not throw into UI flow; travel data remains partial/unavailable.

### Persistent API cache (SQLite)

OpenRouteService responses from the Tauri commands are cached in the **`api_cache`** table (see migrations under `src-tauri/migrations/`). The stored payload is the **JSON shape returned by `invoke`** (e.g. geocode `{ lat, lng }` and directions summary objects), not a separate mapped schema.

**Relevant code**

- Table access (single `SELECT` for reads; single-statement `INSERT … ON CONFLICT … DO UPDATE` for writes):
  - `src/lib/db/repositories/apiCache.ts`
- Deterministic cache keys (stable recursive key sort + hash):
  - `src/lib/api/cacheKey.ts`
- Request normalization before keying (trim, lowercase text fields, rounded coordinates, non-secret API key fingerprint):
  - `src/lib/logistics/normalizeOpenRouteServiceParams.ts`
- TTL rules evaluated **only at read time** (no background jobs, no row deletion for expiry):
  - `src/lib/api/cacheTTL.ts`
  - **Directions** (driving and walking share the same cache `endpoint` discriminator with different normalized profiles): **2 days**
  - **Geocode**: **30 days**

**Behavior summary**

- **Cache hit + not expired + valid JSON:** return cached data; no ORS HTTP call from the Rust layer for that key.
- **Expired or missing:** call ORS; on success, **upsert** replaces `response_json` and bumps `updated_at` in **one** SQL statement (see `docs/DATABASE_LAYER.md` — no multi-step write, no manual transactions for this path).
- **`forceRefresh` (e.g. Movement Orders refresh):** skip using cache for the success path, call ORS, then upsert on success.
- **ORS failure:** if a row exists, the app may still return **previously stored** data (including **expired** entries) as a resilience fallback; it does **not** write to the cache in that case.

Features should **not** read `api_cache` directly; they call `openRouteService` helpers only.

---

## 2) Open-Meteo API

### Endpoints used

- Forecast: `https://api.open-meteo.com/v1/forecast` (daily variables for the shoot date).

### Where it is integrated

- API client/service:
  - `src/lib/weather/openMeteo.ts` (forecast HTTP only; geocode for this flow is `geocodeLocationWithOpenRouteService` in `src/lib/logistics/openRouteService.ts`).
- Call-sheet feature usage:
  - `src/features/call-sheets/page.tsx`

### Request/response usage in Albatross

- Geocoding for call-sheet weather: OpenRouteService (Tauri `geocode_location_to_lat_lng`); coordinates are passed into Open-Meteo with `timezone=auto` so daily sunrise/sunset align with the resolved place.
- Forecast: daily fields for target shoot date (weather code, temps, precip, wind, sunrise/sunset), with `past_days` / `forecast_days` sized so the shoot date falls inside the returned `daily.time` range.

### Error/fallback behavior

- Any geocode or forecast miss returns `null`.
- Call-sheet code uses manual/stored weather as fallback.

---

## 3) Currency conversion API

### Endpoint base used

- `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies`

### Where it is integrated

- FX service:
  - `src/lib/money/exchangeRates.ts`
- Settings-driven behavior:
  - `src/hooks/useCurrency.ts`
  - related UI consumers (budget/dashboard/settings flows)

### Request/response usage in Albatross

- Fetches `{base}.json`, reads nested quote rate from payload.
- Stores rates in SQLite cache via repository helpers.

### Error/fallback behavior

- If API setting disabled: no fetch, return `null`.
- If network fails: use stale cached rate if present; else return `null`.

---

## 4) Frontend <-> Tauri Command APIs

These are internal app APIs, but they are explicit runtime contracts.

### Logistics commands

- `get_driving_travel_time_minutes(start_lat, start_lng, end_lat, end_lng, ors_api_key?) -> Option<i64>`
- `get_route_summary(start_lat, start_lng, end_lat, end_lng, profile, ors_api_key?) -> Option<{ duration_minutes, distance_meters, instructions[] }>`
- `geocode_location_to_lat_lng(query, ors_api_key?) -> Option<{lat, lng}>`

Defined in:

- `src-tauri/src/open_route_service.rs`

Invoked from:

- `src/lib/logistics/openRouteService.ts` (cache layer may avoid invoking when SQLite cache is fresh)

### APF desktop commands

- `pop_pending_apf_open_paths() -> string[]`
- `grant_read_access_for_apf(path) -> Result<(), String>`

Defined in:

- `src-tauri/src/apf_desktop.rs`

Used from:

- `src/features/productions/ApfDesktopOpenBridge.tsx`
- `src/lib/importExport/importProduction.ts`

Purpose:

- handle cold-start/single-instance APF open requests
- extend fs scope for user-selected `.apf` files

---

## 5) System APIs via Tauri plugins

Albatross uses Tauri plugins as stable app-level system APIs:

- SQL API (`@tauri-apps/plugin-sql`) for SQLite data access and migrations.
- FS + Dialog APIs (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`) for scoped file access.
- Shell + Opener APIs for opening URLs/files in system defaults.
- Event/path APIs from `@tauri-apps/api/*` for desktop event handoff and paths.

Primary integration files:

- `src/lib/db/client.ts`
- `src/lib/files/index.ts`
- `src/lib/files/apfProjectDialogs.ts`
- `src/lib/files/directories.ts`
- `src/features/productions/ApfDesktopOpenBridge.tsx`

---

## 6) Repository and service APIs (internal contracts)

The repository layer under `src/lib/db/repositories/` is the core internal data API for features.

Typical contract style:

- `list*`, `get*`, `create*`, `update*`, `delete*` repository functions
- feature modules call repositories directly through typed interfaces

Service APIs orchestrate higher-level behavior around repositories and external APIs:

- `src/lib/logistics/dayTravel.ts`
- `src/lib/logistics/openRouteService.ts` (ORS + SQLite `api_cache` via `src/lib/db/repositories/apiCache.ts`)
- `src/lib/weather/openMeteo.ts`

---

## Security and Privacy Notes

- Never commit API keys or tokens to source control.
- Do not hardcode keys in frontend code, Rust code, docs, or tests.
- Keep key handling in user settings and/or runtime environment only.

---

## Maintenance Checklist

When adding or changing an API integration:

1. Add/update endpoint and auth description in this file.
2. Document user-facing behavior and fallback behavior.
3. Document command contracts if a Tauri boundary is involved.
4. Add source-file references for future maintainers.
5. For OpenRouteService, if caching or TTL rules change, update the **Persistent API cache** section and `src/lib/api/cacheTTL.ts` in sync.
6. Confirm no keys/secrets were added to docs.
