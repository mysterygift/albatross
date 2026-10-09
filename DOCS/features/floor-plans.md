# Floor Plans

Experimental: draw the spaces at each location, then mark camera and actor positions for every scene and shot, and print them. **Schedule → Floor Plans** (`/schedule/floor-plans`). Hidden unless "Show experimental features" is on; see [settings.md](settings.md). Local productions only: a remote-server production shows a notice instead.

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/floor-plans/`](../../src/features/floor-plans): `FloorPlansPage.tsx` (plan list, mode, scene and shot pickers, URL state), `FloorPlanEditor.tsx` (`LayoutEditor`, `SetupEditor`: toolbars, properties, shot details), `FloorPlanCanvas.tsx` (the SVG editor), `floor-plan-dialogs.tsx` (new/edit plan, export), `useEditHistory.ts` (undo/redo), `useAutosave.ts`, `useSnapPreference.ts` |
| Model | [`src/lib/floor-plans/model.ts`](../../src/lib/floor-plans/model.ts): shape and marker types, tolerant `parseLayout` / `parseMarkers`, geometry (`snapAngle`, `constrainSegment`, `textCorners`, `drawingBounds`) |
| Repository | [`src/lib/db/repositories/floor-plans.ts`](../../src/lib/db/repositories/floor-plans.ts) |
| PDF | [`src/lib/pdf/floorPlan.ts`](../../src/lib/pdf/floorPlan.ts): `buildFloorPlanPdfData` (scope → ordered entries), `generateFloorPlanPdf` (on `PdfLayout`); export flow `exportFloorPlansPdf` in `src/features/schedule/scheduleExports.ts` |
| Tables | `floor_plans`, `floor_plan_setups` (SQLite `0108`, Postgres `0036`) |
| Tests | `src/lib/db/floorPlans.test.ts`, `src/lib/db/duplicateProduction.floorPlans.test.ts`, `src/lib/floor-plans/model.test.ts`, `src/lib/pdf/floorPlan.test.ts`, `src/features/floor-plans/*.test.ts(x)` |

## Data model

| Table | Notes |
|---|---|
| `floor_plans` | `location_id` (required), `name`, `layout_json` `{ shapes: [...] }`. A location can have several plans (kitchen, yard). Listed only while the location is live |
| `floor_plan_setups` | `floor_plan_id`, `scene_id`, `shot_id` (null = blocking for the whole scene), `markers_json` (array), `notes`. At most one live setup per (plan, scene, shot), enforced by `saveFloorPlanSetup`; saving no markers and no notes soft-deletes it |

Drawing coordinates are plan units on a fixed 1200 × 800 canvas (y down, as in SVG); there is no real-world scale. Angles are degrees clockwise from pointing right.

| Shape / marker | Fields |
|---|---|
| `rect` | `x`, `y`, `width`, `height` (axis-aligned) |
| `path` | `points[]`, `closed` (closing needs three points) |
| `text` | `x`, `y` (unrotated top-left), `width`, `height`, `rotation` (about the centre), `text`, `fontSize`. Text wraps to the box width and is centred |
| marker | `kind` `camera` \| `actor`, `x`, `y`, `rotation` (facing), `label` |

## How it works

**Modes.** **Draw layout** edits the plan's shapes. **Plot setups** shows the layout faded and read-only and edits the markers of the chosen scene + shot; the shot's description, camera details (size, lens, support, movement), cast and the setup notes are shown beneath the plan. Plan, mode, scene and shot are URL params (`plan`, `mode=setup`, `scene`, `shot`, with `shot=scene` for scene blocking). Scenes at the plan's location are listed first; ● marks shots with a setup on this plan. **Start from…** copies another setup's markers on the same plan and scene.

**Canvas.** Tools: Select, Rectangle (click and drag), Line (click point to point; double-click or Enter finishes, clicking the first point closes, Esc cancels), Text (click to place; the label text field takes focus), Camera and Actor (click to place; labels `A`, `B`… and `1`, `2`…). Selected shapes get handles: rectangle corners resize, line points move, a text box has a resize corner and a rotation knob, a marker has a turning knob. **Snap to 90°** (on by default, kept in `localStorage`) makes each line segment horizontal or vertical and snaps text rotation and marker facing to 90° steps; off, everything is free. Delete/Backspace removes the selection, arrow keys nudge (Shift ×10), ⌘Z/Ctrl+Z and Shift+⌘Z/Ctrl+Y undo and redo. Keyboard handling is on the canvas element, so it never fights the global shortcuts.

**Saving.** Each editor (one per plan, one per setup, remounted by `key`) keeps an undo history where a drag is one step (`transient` updates while dragging, committed on pointer up). `useAutosave` saves 700 ms after the last committed change and immediately on unmount, so switching plan, mode or shot never drops an edit; it updates the TanStack Query cache first so the other mode sees the change at once. Typing a label is one undo step, committed on blur.

**Export.** **Export PDF** opens a dialog: a **Shoot day** (every unit, Main first, in strip order via `shotIdsForShootDay`; each scene's blocking before its first shot), a **Location** (every plan by name; a plan with no setups prints its bare layout), a **Scene** (blocking, then shots by number) or chosen **Shots**. It shows how many plans will print. The PDF has a section bar per entry (location | plan), the title (`Scene 4 | Shot 4A | WS`), slugline, the drawing (one scale per plan across its entries, framed, up to 300 pt high), then description, camera details, notes and a marker summary, kept together on one page. It is filed in Documents → Script & sides as `floor_plan_export` (deletable) and offered in a save dialog, as the other schedule exports are.

## Connections

- [Locations](locations.md): plans belong to a location; a deleted location hides its plans (and `.apf` export leaves them out).
- [Schedule](schedule.md): scenes, shots and strip order; the export reuses `loadScheduleExportSources` and `fileAndOffer`.
- `.apf` format version 12 carries both tables ([import-export.md](../import-export.md)); Duplicate production copies them onto the copied location, scene and shot. Server publish does not include them.

## Gotchas

- Local SQLite only: writes throw `FLOOR_PLANS_REMOTE_ERROR` for `remote_server` productions. The Postgres tables exist for schema parity only.
- Deleting a shot or scene removes its setups from lists and exports (soft-deleted rows are filtered); `ON DELETE CASCADE` only fires on hard deletes.
- The editor wraps label text with the browser's Helvetica/Arial; the PDF wraps with pdf-lib's Helvetica metrics, so a long label can break at a different word.
