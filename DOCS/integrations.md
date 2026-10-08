# Integrations

Every external service and operating-system integration the desktop app uses today. Albatross works fully offline: each network integration is optional and degrades to a manual or empty value. For the optional collaboration server see [collaboration.md](collaboration.md).

## Network services

| Service | Purpose | Needs key | Code |
|---|---|---|---|
| OpenRouteService | Geocoding and driving/walking routes | Yes (user's own) | `src/lib/logistics/openRouteService.ts`, `src-tauri/src/open_route_service.rs` |
| Map tile server (MapTiler by default) | Basemap tiles for interactive maps and PDF maps | Yes for the default template | `src/lib/maps` |
| Open-Meteo | Weather and sunrise/sunset on call sheets | No | `src/lib/weather/openMeteo.ts` |
| Currency API (Fawaz Ahmed, via jsDelivr) | Exchange rates | No | `src/lib/money/exchangeRates.ts` |
| Albatross server | Optional collaboration | Account on the server | [collaboration.md](collaboration.md) |

These are the only outbound hosts in the app (`api.openrouteservice.org`, the tile URL template, `api.open-meteo.com`, `cdn.jsdelivr.net`, plus whatever server URL a user connects). The Tauri CSP is disabled (`"csp": null` in `src-tauri/tauri.conf.json`), so there is no allow-list to update when adding a host.

Keys and URLs are stored in the `settings` table of the local encrypted database ([security.md](security.md)). They are entered in the UI only; do not commit them or put them in docs.

Session-scoped call counters for the four services (`openrouteservice`, `open_meteo_forecast`, `currency_conversion_api`, `map_tiles`) are available under **Settings → Developer** once `enable_api_call_tracking` is on (`src/lib/dev/apiCallTracker.ts`). Call `recordApiCall(id)` next to any new outbound call.

### OpenRouteService

- **Purpose:** geocode addresses to coordinates; driving (`driving-car`) and walking (`foot-walking`) route summaries (duration, distance, turn instructions, geometry) for movement orders and travel times between locations.
- **Used by:** movement orders (`src/lib/movement-orders/enrichMovementLegsWithRouteData.ts`), day travel times (`src/lib/logistics/dayTravel.ts`), and weather geocoding (below).
- **Calls:** HTTP is made from Rust, not the webview. Tauri commands `geocode_location_to_lat_lng`, `get_route_summary`, `get_driving_travel_time_minutes` call `https://api.openrouteservice.org` (`/geocode/search`, `/v2/directions/<profile>`) with `reqwest`. The TypeScript wrapper invokes them with `invoke`.
- **Config:** **Settings → APIs & publishing → OpenRouteService API key** (setting `openrouteservice_api_key`). The Rust side falls back to the `OPENROUTESERVICE_API_KEY` environment variable if no key is passed. A free key comes from openrouteservice.org.
- **Cache:** table `api_cache` (`src/lib/db/repositories/apiCache.ts`), keyed by an FNV-1a hash of the normalised request plus a fingerprint of the key (`src/lib/api/cacheKey.ts`, `src/lib/logistics/normalizeOpenRouteServiceParams.ts`). TTL is 2 days for `directions` and 30 days for `geocode` (`src/lib/api/cacheTTL.ts`). A fresh entry is returned without a request; `forceRefresh` bypasses the read.
- **Failure:** no key, network error, bad response or an empty query all resolve to `null`; the Rust side logs a warning when the key is missing. If the live call fails, an expired cache entry is still returned. Identical start and end coordinates short-circuit to a zero-length route without a request. Cache read/write errors are swallowed.
- **Offline:** cached results (even expired) keep working; uncached lookups return `null` and the UI falls back to manual times and no route lines.

### Map tiles

- **Purpose:** raster basemap for the interactive Leaflet maps (`src/features/movement-orders/MovementOrderMaps.tsx`, via `react-leaflet`) and for the maps drawn into the movement order PDF (`src/lib/maps/staticMapRenderer.ts`, `src/lib/movement-orders/renderMovementOrderMaps.ts`).
- **Config:** **Settings → APIs & publishing → map tiles card** (`src/features/settings/MapTilesSettingsCard.tsx`). Settings `map_tile_url_template` (placeholders `{z}`, `{x}`, `{y}`, `{key}`) and `map_tile_api_key`. Default template is MapTiler `streets-v2`; any OpenMapTiles-style raster endpoint, including a self-hosted TileServer GL, works.
- **Attribution:** `MAP_TILE_ATTRIBUTION` is drawn on PDF maps and shown on Leaflet maps. Keep it if you change the source.
- **PDF rendering:** tiles are loaded into a canvas (`planTiles`, `projectToWorldPixels` in `mapMath.ts`), routes and markers drawn on top, exported as PNG and embedded with `pdf-lib`.
- **Failure:** `isMapTileConfigIncomplete` flags a template that needs `{key}` with no key. A tile that fails to load is skipped; the canvas starts as a grey background, so a PDF map renders with gaps rather than failing. There is no tile cache.
- **Offline:** maps show no basemap; route lines and markers still draw.

### Open-Meteo weather

- **Purpose:** forecast summary, high/low, sunrise and sunset for the shoot day location on call sheets.
- **Flow:** `getWeatherForCallSheet(locationQuery, shootDate, options)` geocodes the location through OpenRouteService (trying fallbacks: the stripped location name, the full query, then an address hint), then calls `https://api.open-meteo.com/v1/forecast` with daily weather code, temperatures, precipitation probability, wind, sunrise and sunset. `forecastWindowForShootDate` picks past/future days (default 16 forecast days, up to 92 past).
- **Trigger:** only when a call sheet is generated or previewed on **Deliver → Call Sheets** (`src/features/call-sheets/page.tsx`), never on page load.
- **Config:** none for Open-Meteo. Geocoding needs the OpenRouteService key.
- **Failure:** any failure (no location, geocode miss, HTTP error, no data for the date) returns `null` and the call sheet uses the manually entered or stored weather (`weather_manual`, `weather_json`) instead. Results are not cached.
- **Offline:** same as failure.

### Currency conversion

- **Purpose:** convert amounts between currencies for display (`src/hooks/useCurrency.ts`) and vendor purchase order currency fields (`src/features/budget/vendors/PoCurrencyFields.tsx`). The display currency defaults to GBP.
- **Calls:** `getRate(base, quote)` reads `…/@fawazahmed0/currency-api@latest/v1/currencies/<base>.json` from jsDelivr.
- **Config:** setting `enable_currency_conversion_api` (default `'true'`; a settings migration in `ensureSettingsDefaults` resets earlier `false` values). The display currency is under **Settings → Production → Currency**. The raw toggle and a test button are under **Settings → Developer** (marked experimental).
- **Cache:** table `exchange_rates`; a row is fresh for 24 hours (`src/lib/db/repositories/exchange-rates.ts`).
- **Failure:** `getRate` never throws. If disabled it returns `null` without reading the cache; on fetch failure it returns the last stored rate of any age, else `null`. Callers show unconverted amounts when the result is `null`.
- **Offline:** last stored rate, else unconverted.

## Tauri plugins and native commands

Registered in `src-tauri/src/lib.rs`; permissions in `src-tauri/capabilities/default.json`. Adding a new filesystem location or plugin call usually needs a capability entry.

| Plugin | Used for | Main code |
|---|---|---|
| `tauri-plugin-sql` (SQLite, SQLCipher build) | Database access through `DatabaseAdapter`; schema setup goes through the custom commands below | `src/lib/db/sqliteDatabaseAdapter.ts`, [database.md](database.md) |
| `tauri-plugin-fs` | Read/write attachments, storyboards, publish temp files, key sidecars under app data; read user-picked files (script, CSV, `.apf`) | `src/lib/files`, `src/lib/documents`, `src/lib/db/productionDocumentFiles.ts` |
| `tauri-plugin-dialog` | Open and save dialogs (attachments, `.apf`, CSV, export folders, storyboard PDF/image) | `src/lib/files/*.ts` |
| `tauri-plugin-shell` | `open()` for URLs (key sign-up links, external links) | `src/lib/files/index.ts`, settings cards |
| `tauri-plugin-opener` | Open local files in the OS default app; reveal in folder | `src/lib/files/index.ts`, `src/features/documents/DocumentsCategoryPage.tsx` |
| `tauri-plugin-single-instance` | Forward `.apf` files opened while the app is running to the existing window (desktop only) | `src-tauri/src/lib.rs`, `apf_desktop.rs` |

Capabilities grant filesystem read/write on app data, Desktop, Documents and Downloads, and `opener:allow-open-path` only for `$APPDATA/**`.

Custom Rust commands (`invoke_handler` in `lib.rs`): database encryption and migration (`db_encryption.rs`, `sqlite_load.rs`; see [security.md](security.md)), `.apf` file association (`apf_desktop.rs`), OpenRouteService (above), and two menu helpers (`set_budget_duplicate_live_as_draft_enabled`, `set_active_menu_section`).

## PDF libraries

| Library | Role | Where |
|---|---|---|
| `pdf-lib` | Generates every exported PDF in the app (call sheets, movement orders, DOOD, cost report, daily progress report, equipment list, risk assessments, script breakdown, sides, continuity sheets, marked-up script, signed release forms, location release cover) and applies recipient-name watermarks | `src/lib/pdf/*`, shared layout helpers in `layoutKit.ts`; `src/lib/risk-assessments/riskMatrix.ts` |
| `react-pdf` (wraps `pdfjs-dist`) | Renders a generated PDF to canvas for the in-app preview | `src/features/call-sheets/page.tsx`, `src/features/movement-orders/page.tsx` |
| `pdfjs-dist` (direct) | Reads text from an uploaded screenplay PDF; extracts frames from an Athena storyboard PDF | `src/lib/script-parser/pdf-parser.ts`, `src/lib/storyboard/athena-import.ts` |
| `fflate` | Zips publish packages and `.apf` archives | `src/lib/publish/packageCodec.ts`, `src/lib/importExport/buildApfArchive.ts`, `readApfArchive.ts` |

Text drawn with `pdf-lib` uses the standard Helvetica fonts, so text must go through `textForPdf` (`src/lib/pdf/layoutKit.ts`) to replace characters the font cannot encode. `html2pdf.js` is listed in `package.json` but is not imported anywhere in `src`.

## Files and attachments

| Data | Location on disk (under app data) | Code |
|---|---|---|
| Production documents and attachments | `attachments/<productionId>/<documentId>-<fileName>` | `src/lib/documents/persistDocument.ts`, `src/lib/db/productionDocumentFiles.ts` |
| Generic picked attachment | `attachments/<name>-<8 hex>.<ext>` | `pickAndSaveAttachment` in `src/lib/files/index.ts` |
| Storyboard images and import candidates | `storyboards/...` | `src/lib/files/storyboard.ts` |
| Publish packages (temporary) | `publish-temp/` | `src/features/server/PreflightPublishSheet.tsx` |

- The database stores the path relative to app data; resolve it with `resolveAppDataPath` or `createAppDataObjectUrl`, and delete through `deleteAttachmentFile`, which refuses absolute paths and `..`.
- Write the file first, then insert the row in the database transaction, so a failed insert cannot leave an orphan row pointing at a missing file.
- Files are copied into app data; the original is never moved. Attachments are not encrypted by SQLCipher.
- User-chosen export locations (PDF, `.apf`, CSV) go through `saveFileWithDialog` or `pickExportDirectory`, with filenames cleaned by `sanitizeForFilename` and de-duplicated by `ensureUniqueFilenameInDirectory`. See [import-export.md](import-export.md).
- Opening: local paths go through the opener plugin; URLs through the shell plugin (`openInSystem`).
