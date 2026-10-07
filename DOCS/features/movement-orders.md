# Movement Orders

Plans the unit's journey for a shoot day (base to each location and back) with travel times, directions, map pins and route maps, and exports it as a PDF. UI: **Deliver → Movement Orders** (`/movement-orders`).

## Code map
| Area | Location |
|---|---|
| Page | `src/features/movement-orders/page.tsx`, `MovementOrderMaps.tsx` (Leaflet), `MovementOrderDistributionDialog.tsx`, `useSyncedDraft.ts` |
| Order logic | `src/lib/movement-orders/` (`orderedLocations`, `movementLegs`, `enrichMovementLegsWithRouteData`, `movementOrderInputs`, `pins`, `buildMovementOrderData`, `locationContacts`, `movementMaps`, `renderMovementOrderMaps`, `fileNaming`, `types`) |
| Routing | `src/lib/logistics/openRouteService.ts`, `normalizeOpenRouteServiceParams.ts` |
| Maps | `src/lib/maps/` (`tileConfig`, `mapMath`, `polyline`, `staticMapRenderer`) |
| PDF | `src/lib/pdf/movementOrder.ts` (`generateMovementOrderPDF`), `layoutKit.ts` |
| Location order | `src/lib/schedule/orderedLocationStack.ts` |
| Storage | `shoot_day_units.movement_order_json` (0100), `shoot_days.movement_pins_json` (0101); Postgres `0025`, `0026`; cache in `api_cache` |
| Tests | `src/lib/movement-orders/*.test.ts`, `src/lib/maps/maps.test.ts`, `src/lib/pdf/movementOrder.test.ts` |

## Data model
There is no movement-order table and no stored order. Everything printed is derived on demand, plus two small JSON columns of hand-entered values:
- `shoot_day_units.movement_order_json` (per day and unit): `{ revisionLabel, unitBaseTime, legs: { [legKey]: { departTime, arriveTime } } }`. Times are normalised to `HH:MM` and are never computed from the crew call. `parseMovementOrderInputs` / `serializeMovementOrderInputs` return and store null when empty.
- `shoot_days.movement_pins_json` (per day, shared by units): array of `{ id, kind: unit_base | parking | other, label, notes, lat, lng }`. Malformed entries are dropped on read. Pin codes on the map are `B`, `P1`, `X1`... (`getMovementPinCodes`).

Other inputs: the shoot day (`call_time`, `wrap_time`, `parking_base_address`, `special_notes`, hospital and police), scenes, shots and locations, and Locations-department crew for the contacts table.

## How it works
1. **Locations in order**: `getOrderedMovementOrderLocationsForDayUnit` takes the unit's stripboard strips and builds a de-duplicated stop list in schedule order (scene/shot strips contribute their location; MOVE strips contribute origin then destination), with the scenes (number, INT/EXT, D/N) shot at each.
2. **Waypoints**: if the shoot day has a `parking_base_address`, `buildMovementOrderWaypoints` wraps the stops as unit base, stops, unit base. Fewer than two waypoints means no legs.
3. **Legs**: `enrichMovementLegsWithRouteData` resolves coordinates (stored lat/lng, else geocode the address, else the name) and asks OpenRouteService for a driving summary (minutes, distance, written directions, encoded route geometry) and a walking summary for each consecutive pair. Leg keys come from `getMovementLegKeys`, so hand-entered times stay attached to the same stop pair. `applyMovementOrderLegInputs` merges the saved depart and arrive times.
4. **Data object**: `buildMovementOrderData` assembles `MovementOrderData` (header, unit base time, safety details, pins, locations, contacts, legs). The page also uses `applyResolvedLocationCoordinates` to give geocoded stops coordinates for the maps.
5. **Editing**: revision label, unit base time, depart and arrive times and pins are local drafts (`useSyncedDraft`) that save after a short pause, inputs to the shoot day unit and pins to the shoot day. Click the map after choosing a pin type to place a pin; drag to move it.
6. **Output**: **Preview Movement Order**, **Save PDF** and **Save & Open** call `renderMovementOrderMaps` then `generateMovementOrderPDF`. Saving stores the PDF through `persistProductionDocument` (entity `movement_order`, named by `getMovementOrderPdfFileName`) and offers a save dialog. **Distribute Movement Orders** produces recipient-named copies (`movement_order_personalized`) like call sheets ([call-sheets.md](call-sheets.md)). **Refresh travel data** re-queries ORS bypassing the cache.

### PDF
A4 by default (A4 or Letter selectable), built on `layoutKit.ts`. Sections: masthead, header strip (date and day, unit base opens or crew call, number of stops and total drive), Journey table (depart, drive, walk, arrive), Route overview map, Map pins, Locations (numbered, with scenes, parking, what3words), Location maps (two per row), Directions, Locations team contacts, safety box. Sections are omitted when empty. Total drive is flagged "(partial)" when some legs lack data.

### OpenRouteService
Needs the user's own API key (**Settings → APIs & publishing**, setting `openrouteservice_api_key`); keys, quotas and the cache are described in [integrations.md](../integrations.md). Responses are cached in `api_cache`: directions for 2 days, geocodes for 30 days (`src/lib/api/cacheTTL.ts`); `forceRefresh` bypasses the cache and falls back to cached data on API failure. Without a key, legs have no times or directions and the order still exports.

### Map tiles
One URL template feeds both the interactive Leaflet maps and the PDF maps (drawn onto a canvas by `staticMapRenderer.ts`). Settings **APIs & publishing → Map tiles** stores `map_tile_url_template` and `map_tile_api_key` (`tileConfig.ts`). The default is MapTiler Cloud streets (`{key}` is replaced by the key); any OpenMapTiles-style raster endpoint works, for example a self-hosted TileServer GL. If the template needs `{key}` and none is set, maps are left out with a warning rather than failing. Attribution is printed under the maps.

## Connections
- **Schedule**: stripboard order, MOVE strips, shoot day and unit; unit-specific orders.
- **Locations**: address, what3words, parking info, optional coordinates. **Crew Manager**: contacts are crew whose department resolves to "Locations" in the effective hierarchy ([crew-manager.md](crew-manager.md)).
- **Call sheets** share the shoot day's base address, safety text and bloc label.
- **Documents**: saved PDFs appear under set paperwork. **.apf export** carries the two JSON columns with their tables; duplicate production copies `movement_order_json` with `shoot_day_units` but not `movement_pins_json`; the copied leg keys refer to the source production's location ids.

## Gotchas
- ORS and map tiles are network calls from the desktop app; offline use yields blanks, not errors.
- A location with neither coordinates, address nor name cannot be routed; its legs stay empty.
- Leg keys are `fromLocationId>toLocationId` (a repeated pair gets `#n`). Changing the stop order or replacing a location orphans the times entered for the affected legs.
- The warning text from `renderMovementOrderMaps` says "Settings → Integrations", but the section is labelled **APIs & publishing**.
