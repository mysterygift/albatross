# Albatross APIs Guide

This document explains how APIs are used in Albatross for:

- users (what features depend on APIs and what to configure), and
- developers (endpoints, command contracts, data flow, and failure behavior).

This guide intentionally excludes all API keys, tokens, and secrets.

## Quick Index

### External HTTP APIs

- OpenRouteService (Directions + Geocoding)
- Open-Meteo (Geocoding + Forecast)
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

### What users need to do

- Add their own ORS key in Settings -> APIs -> OpenRouteService API key.
- Use `Get free key` to open the ORS website in a browser.

### What happens on failure

- If key, geocode, or directions lookup fails, Albatross returns `null` travel values.
- UI remains usable; travel rows show unavailable state rather than crashing.

---

## 2) Open-Meteo (call sheet weather enrichment)

### What it powers

- Weather summary + sunrise/sunset enrichment during call sheet generation/view flow.

### What users need to do

- Nothing. No key is required for this integration in current code.

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

- Directions: `https://api.openrouteservice.org/v2/directions/driving-car`
- Geocoding: `https://api.openrouteservice.org/geocode/search`

### Where it is integrated

- Frontend service wrapper:
  - `src/lib/logistics/openRouteService.ts`
- Travel segment orchestration:
  - `src/lib/logistics/dayTravel.ts`
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
- Directions response field consumed:
  - `routes[0].summary.duration` (seconds), converted to rounded minutes.
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

---

## 2) Open-Meteo API

### Endpoints used

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Forecast: `https://api.open-meteo.com/v1/forecast`

### Where it is integrated

- API client/service:
  - `src/lib/weather/openMeteo.ts`
- Call-sheet feature usage:
  - `src/features/call-sheets/page.tsx`

### Request/response usage in Albatross

- Geocoding: first result only (`count=1`), reads `latitude`, `longitude`, `timezone`.
- Forecast: daily fields for target shoot date (weather code, temps, precip, wind, sunrise/sunset).

### Error/fallback behavior

- Any geocode/forecast miss returns `null`.
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
- `geocode_location_to_lat_lng(query, ors_api_key?) -> Option<{lat, lng}>`

Defined in:

- `src-tauri/src/open_route_service.rs`

Invoked from:

- `src/lib/logistics/openRouteService.ts`

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
- `src/lib/logistics/openRouteService.ts`
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
5. Confirm no keys/secrets were added to docs.
