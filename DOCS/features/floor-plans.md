# Floor Plans

Experimental: draw a set or a unit base at a location (to scale, over a map or picture if wanted), then plot cameras, cast and lighting/grip kit for every scene and shot, and print them. **Schedule → Floor Plans** (`/schedule/floor-plans`). Hidden unless "Show experimental features" is on; see [settings.md](settings.md). Local productions only: a remote-server production shows a notice instead.

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/floor-plans/`](../../src/features/floor-plans): `FloorPlansPage.tsx` (plan picker as title, Layout/Setups, URL state, sun settings, booking colours), `FloorPlanEditor.tsx` (`LayoutEditor`, `SetupEditor`, toolbar, sun control, shot strip), `FloorPlanCanvas.tsx` (the SVG editor), `SelectionPopover.tsx`, `EquipmentLibrary.tsx`, `BackgroundDialog.tsx` (background, scale, north, location), `floor-plan-dialogs.tsx` (new/edit plan, export), `useEditHistory.ts`, `useAutosave.ts`, `useSnapPreference.ts`, `floorPlanDisplay.ts` |
| Model and maths | [`src/lib/floor-plans/`](../../src/lib/floor-plans): `model.ts` (shapes, markers, layout settings, tolerant parsing, colours, geometry), `catalog.ts` (equipment with real footprints), `itemGeometry.ts` (how each item is drawn, shared by SVG and PDF), `background.ts` (fit/fill, image downscaling, map rendering), `sun.ts` (solar position, sunrise/sunset, time zones), `geo.ts` (geocoding and time zone lookup) |
| Repository | [`src/lib/db/repositories/floor-plans.ts`](../../src/lib/db/repositories/floor-plans.ts) |
| PDF | [`src/lib/pdf/floorPlan.ts`](../../src/lib/pdf/floorPlan.ts): `buildFloorPlanPdfData`, `generateFloorPlanPdf` (on `PdfLayout`); export flow `exportFloorPlansPdf` in `src/features/schedule/scheduleExports.ts` |
| Tables | `floor_plans`, `floor_plan_setups` (SQLite `0108`, Postgres `0036`) |
| Tests | `src/lib/db/floorPlans.test.ts`, `src/lib/db/duplicateProduction.floorPlans.test.ts`, `src/lib/floor-plans/*.test.ts`, `src/lib/pdf/floorPlan.test.ts`, `src/features/floor-plans/*.test.ts(x)` |

## Data model

| Table | Notes |
|---|---|
| `floor_plans` | `location_id` (required), `name`, `layout_json`, `background_image` (data URL, JPEG/PNG/WebP, at most 12 MB of text; kept apart so the drawing's autosave never resends it; the outbox records only that it changed). Listed only while the location is live |
| `floor_plan_setups` | `floor_plan_id`, `scene_id`, `shot_id` (null = blocking for the whole scene), `markers_json`, `notes`. At most one live setup per (plan, scene, shot), enforced by `saveFloorPlanSetup`; saving no markers and no notes soft-deletes it |

`layout_json` holds `shapes` plus `unitsPerMetre` (scale; 40 by default, so the 1200 x 800 canvas is 30 x 20 m), `north` (degrees clockwise from up that north points), `background` (`source` `image`|`map`, placement in plan units, `opacity`, and for maps the centre and width rendered) and `geo` (`lat`, `lon`, IANA `timezone`). Coordinates are plan units, y down; angles are degrees clockwise from pointing right.

| Shape / marker | Fields |
|---|---|
| `rect`, `path`, `text` | As drawn in Layout mode (see the editor below) |
| `item` (layout or setup) | `type` (catalogue id), `x`, `y`, `rotation` (facing), `label`, `width` and `depth` in metres |
| `camera` | `label` (letter); colour by letter (A orange, B cyan, C lime, D pink, E yellow, then round again) |
| `actor` | `personId` (cast), `label` (character name, else the person's name); colour from the booking calendar (`resolvePersonColor`, principal cast colour or the supporting colour) |

**Equipment colours** say the source of a light (tungsten amber, HMI daylight blue, LED white); its shape says the form (fresnel, open face, PAR, COB, panel, tube, balloon, practical). Grip and camera support are grey, flags and floppies black, tents dashed. Items are drawn to the plan's scale with a minimum size so small kit stays visible, and always carry a label (lights default to `M18 | HMI`).

## How it works

**Page.** The plan picker is the page title (`Location | Plan`, grouped by location, with New, Rename or move, Delete). **Layout** and **Setups** sit beside **Export PDF**. Plan, mode, scene and shot are URL params (`plan`, `mode=setup`, `scene`, `shot`, `shot=scene` for blocking).

**Layout mode.** One tool row: Select, Rectangle, Line (point to point; double-click or Enter finishes, first point closes, Esc cancels), Text, **Add** (equipment library, all categories), Background, **90°** (snap: lines horizontal/vertical, rotations and facing in quarter turns; off is free; per viewer in `localStorage`), Sun, save state, undo/redo. Selecting anything opens a popover beside it (label, facing, size in metres for resizable kit, text size and rotation, closed shape). Items in the layout are permanent (unit base, practicals); items placed in Setups belong to that setup.

**Background, scale and north** (`BackgroundDialog`). **Map of location** renders the configured map tiles north up and to scale over the whole plan (100, 200 or 500 m across), sets the scale and north 0. **Image** shrinks the picture to 2400 px on the long side (JPEG) and fits it; then **Fit**, **Fill** or **Move** (drag on the plan, corner handle to resize; resizing carries the scale with it), opacity, **Remove**. **Plan width (m)** sets the scale directly, or the ruler draws a line over something of known length and asks for its length. North is a number with a live arrow. **Location** finds coordinates for the address (OpenRouteService with a key, else OpenStreetMap Nominatim, or typed `lat, lon`) and the time zone (Open-Meteo); both are kept in the plan, so the sun works offline afterwards.

**Sun.** `sun.ts` computes the sun's bearing and elevation locally (NOAA equations) for the chosen day in the location's time zone. The toolbar has the day (shoot days; defaults to the next shoot day with shots at this location) and a time slider from sunrise to sunset. The canvas draws the day's path round the plan (hourly dots, labelled every three hours, turned by `north`) and a ray from the sun now, longer when the sun is low. Without a location the control offers **Set location** (in Setups, a small dialog that saves straight to the plan).

**Setups mode.** Tools: Select, **Camera** (A, B… by letter), **Cast** (menu of the scene's cast first, in booking colours; then click to place), **Lights** and **Grip** (library filtered), **90°**, Sun, **Copy from** (another setup in the same scene), save state, undo/redo. Along the bottom: the scene picker (scenes at this location first) and the scene's shots as cards (dashed when they have no setup on this plan); the chosen card shows the slugline, shot details, description and the setup's notes.

**Saving.** Each editor (one per plan, one per setup, remounted by `key`) keeps an undo history where a drag is one step. `useAutosave` saves 700 ms after the last change and on unmount, updating the TanStack Query cache first. The background picture is saved immediately through `setFloorPlanBackgroundImage`.

**Export.** **Export PDF** opens a dialog: a **Shoot day** (every unit, Main first, in strip order; each scene's blocking before its first shot), a **Location** (every plan; a plan with no setups prints its bare layout), a **Scene** or chosen **Shots**. The PDF draws each entry's background picture, shapes, equipment (from `itemGeometry`), cameras and cast in their colours, a north arrow and a scale bar, then description, details, notes and a summary (`Cameras A, B | Cast Marta | Lights M18, S60 | Grip Track`). Filed in Documents → Script & sides as `floor_plan_export`.

## Connections

- [Locations](locations.md): plans belong to a location; its address seeds the location search.
- [People](people.md): actor colours come from the Bookings calendar colours (`bookingCalendarColors.ts`, per production in `localStorage`).
- [Schedule](schedule.md): scenes, shots, cast per scene/shot and strip order; the export reuses `loadScheduleExportSources` and `fileAndOffer`.
- External APIs (see [integrations.md](../integrations.md)): map tiles, OpenRouteService or Nominatim, Open-Meteo; each is called only from the Background or Location dialog.
- `.apf` format version 12 carries both tables, the picture included ([import-export.md](../import-export.md)); Duplicate production copies them onto the copied location, scene and shot. Server publish does not include them.

## Gotchas

- Local SQLite only: writes throw `FLOOR_PLANS_REMOTE_ERROR` for `remote_server` productions. The Postgres tables exist for schema parity only.
- Map backgrounds need a map tile key (Settings); tiles stop at zoom 19, so a 100 m map is upscaled. For interiors, upload a drawing or photo instead.
- Shapes drawn before the scale changes keep their plan units; equipment (in metres) resizes with the scale.
- The editor wraps label text with the browser's fonts; the PDF wraps with pdf-lib's Helvetica, so a long label can break at a different word.
