# Locations

The production's location register at **Locations** (`/locations`): address, booking status, fee, parking, what3words, a contact, permits and release forms. Locations are linked from scenes, the Stripboard, Call Sheets, Movement Orders and Script Breakdown.

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/locations/page.tsx`](../../src/features/locations/page.tsx) (table + add/edit dialog), `LocationDocumentsSection.tsx` (permits and release forms) |
| Repositories | [`location.ts`](../../src/lib/db/repositories/location.ts) (CRUD), [`location-scene.ts`](../../src/lib/db/repositories/location-scene.ts) (scene links) |
| Maps | [`src/lib/maps/`](../../src/lib/maps): `tileConfig` (tile URL/key settings), `mapMath`, `polyline`, `staticMapRenderer` (maps drawn into PDFs). Interactive Leaflet maps are in `src/features/movement-orders/MovementOrderMaps.tsx` |
| Travel/geocoding | `src/lib/logistics/openRouteService.ts`, `dayTravel.ts`; stacks in `src/lib/schedule/orderedLocationStack.ts` and `src/lib/movement-orders/` |
| Tables | `locations` (base schema; `what3words` `0033`, `parking_info` `0050`, contact columns and `permit_fee` removal `0091`), `location_scene` |
| Tests | `src/lib/maps/maps.test.ts`, `src/lib/movement-orders/*.test.ts`, `src/lib/schedule/orderedLocationStack.test.ts` |

## Data model

| Column | Notes |
|---|---|
| `name` (+ `name_sort_key`), `address` | Both required in the form. The address is the canonical full address used by Movement Orders and for geocoding |
| `booked_status` | `unbooked` \| `hold` \| `booked` \| `wrap` (Script Breakdown treats `booked`/`wrap` as sourced) |
| `location_fee` | Number >= 0; shown in the production currency |
| `what3words`, `parking_info`, `availability_constraints`, `notes` | Free text. what3words is stored as typed, with no validation or lookup |
| `contact_name`, `contact_email`, `contact_phone` | The location's own contact (owner/manager). Email is format-checked in the form |

There are no latitude/longitude columns. Coordinates are resolved on demand (below).

`location_scene` (location, scene) is a many-to-many link written when a script import matches a scene's slugline location. The primary scene to location link is `scenes.location_id`, which the Shot Lists, Stripboard filter and Calendar use.

Permits and location release forms are ordinary documents (`entity_type` `permit` / `location_release`, `entity_id` = location id) shown under Documents. Files picked while creating a location are staged and persisted after the row exists. `deleteLocation` soft-deletes the location and its documents.

## How it works

- **Encryption.** `name`, `address`, `what3words`, `parking_info`, `availability_constraints`, `notes` and the contact columns are in `LOCATION_PROTECTED_FIELDS` and encrypted when client-field encryption is on; `name_sort_key` keeps sorting possible. Always read and write through `location.ts`. See [security.md](../security.md).
- **Geocoding and travel.** The Calendar's Day Summary and Movement Orders geocode `address` (falling back to `name`) with OpenRouteService, then request driving times; results are cached in `api_cache`. The API key is the `openrouteservice_api_key` setting (see [integrations.md](../integrations.md)). Without a key or on failure, travel times are `null`.
- **Maps.** Interactive maps (Movement Orders) and the maps rendered into the Movement Order PDF use the same raster tile template, MapTiler by default, set in Settings (`MapTilesSettingsCard`; settings `map_tile_url_template`, `map_tile_api_key`). `staticMapRenderer.ts` composites tiles onto a canvas for the PDF.
- **Ordered location stack.** `orderedLocationStack.ts` builds the day/unit's location sequence from scheduled SHOT strips and MOVE strips' origin/destination, deduplicated; the Calendar uses it for moves and travel, Movement Orders for legs ([movement-orders.md](movement-orders.md)).
- **Location contacts in Movement Orders** are not these columns: `getMovementOrderLocationContacts` lists crew whose department resolves to "Locations".

## Connections

- [Schedule](schedule.md): `scenes.location_id`, Stripboard location filter, MOVE strips, Calendar travel.
- [Call sheets](call-sheets.md): location name, address, parking, what3words (`pdf/callSheet.ts`).
- [Movement orders](movement-orders.md): addresses, what3words, maps, pins.
- [Script](script.md): import creates/links locations (with spelling-variant merge); Breakdown sourcing status.
- Global search indexes location fields including what3words. Duplicate production and `.apf` export copy `locations` and `location_scene`.

## Gotchas

- `location_scene` is written on import and copied on duplicate/export, but nothing in the UI reads it back; do not rely on it for "scenes at this location". Use `scenes.location_id`.
- `permit_fee` was dropped in `0091`; use `location_fee`.
- `deleteLocation` is a soft delete, so the `ON DELETE SET NULL` on `scenes.location_id` never fires: scenes and MOVE strips can keep pointing at a deleted location. Readers must treat a missing/deleted location as none.
