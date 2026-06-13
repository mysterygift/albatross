# Schedule

**User guide and technical reference.**

This document has two parts: a **user guide** (how to use the Schedule area and its child pages) and a **technical reference** (current state, dependencies, refactor impact, and file reference). Schedule is the production scheduling hub for shoot days, scenes, shots, and the stripboard.

---

## Table of contents

**Part 0 — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Child pages summary](#2-child-pages-summary)
- [3. Calendar](#3-calendar)
- [4. Stripboard](#4-stripboard)
- [5. Shot Lists](#5-shot-lists)
- [6. Script Import](#6-script-import)
- [7. Fundamental workflow](#7-fundamental-workflow)
- [8. Relationships and connections to other pages](#8-relationships-and-connections-to-other-pages)
- [9. Episodic productions (user guide)](#9-episodic-productions-user-guide)

**Part I — Current state**

- [1. Overview and purpose (current state)](#1-overview-and-purpose-current-state)
- [2. Architecture and file layout](#2-architecture-and-file-layout)
- [3. Data model](#3-data-model)
- [4. Data flow and dependencies](#4-data-flow-and-dependencies)
- [5. Query keys and invalidation](#5-query-keys-and-invalidation)
- [6. Drag and drop and transactions](#6-drag-and-drop-and-transactions)

**Part II — Dependencies and refactor impact**

- [1. Outbound dependencies](#1-outbound-dependencies)
- [2. Inbound dependencies](#2-inbound-dependencies)
- [3. Duplicate production](#3-duplicate-production)
- [4. Checklist for refactors](#4-checklist-for-refactors)

**Part III — Reference**

- [1. File and route reference](#1-file-and-route-reference)
- [2. Router and navigation](#2-router-and-navigation)
- [3. Gaps and future work](#3-gaps-and-future-work)

---

## Part 0 — User guide

### 1. Overview and purpose

- **Purpose:** Schedule is albatross' production scheduling hub. It manages shoot days, scenes, shots, and the stripboard (day-by-day breakdown of what to shoot). It supports script import, shot editing, drag-and-drop scheduling, and calendar-based rescheduling.
- **Route:** `/schedule` redirects to `/schedule/calendar`. Child routes: `/schedule/calendar`, `/schedule/stripboard`, `/schedule/shots`, `/schedule/script-import`.
- **Navigation:** "Schedule" (Calendar icon) in app nav with sub-items: Calendar, Stripboard, Shot Lists, Script Import.
- **Context:** Requires a current production. All schedule data is scoped by `production_id`.
- **Episodic:** Productions created with **episodic** mode (`productions.is_episodic = 1`) add **episodes**, **shooting blocs**, scene **episode** assignment, and optional **shoot day ↔ bloc** association. See [§9](#9-episodic-productions-user-guide).

### 2. Child pages summary

| Page | Route | Purpose |
|------|-------|---------|
| Calendar | `/schedule/calendar` | Month view of shoot days; drag to move/swap; Day Summary drawer |
| Stripboard | `/schedule/stripboard` | Day/unit columns with strips; Unscheduled Shots; Boneyard; drag and drop scheduling |
| Shot Lists | `/schedule/shots` | Scene-by-scene shot breakdown; edit shot details and estimates |
| Script Import | `/schedule/script-import` | Import scenes from script text or .txt file |

### 3. Calendar

- **Month view:** One event per (shoot_day, shoot_day_unit). Events show unit name, call–wrap time, estimated runtime, primary location, shot count. Episodic productions may show **shooting bloc** / **episode** hints on events and support a **bloc filter** (all, unassigned, or one bloc).
- **Drag and drop:** Drag an event to another date to move the shoot day. If target date already has a shoot, the two days swap.
- **Day Summary drawer:** Click an event to open. Shows call time, lunch, wrap time, location, shot count, estimated runtime. Warning if runtime > 10h 30min. Actions: "Open Stripboard", "Generate Call Sheet" (placeholder).
- **Unit colours:** Main Unit and Second Unit use distinct CSS variables for quick identification.

### 4. Stripboard

- **Episodic:** Day column headers may show the **shooting bloc** for that shoot day; shot/scene strips may show an **episode** badge. Use the **bloc filter** to hide columns outside the selected block (or show only days “outside blocs”).
- **Layout:** Left panel (Unscheduled Shots), center (day/unit columns), right (Boneyard).
- **New shoot day:** Header action "New shoot day" opens a lightweight dialog to enter a shoot date. Creates an empty shoot day for the current production with Main Unit by default (no Second Unit, no strips). After creation the stripboard refreshes, the new day scrolls into view, and a brief "Shoot day created." message is shown.
- **Unscheduled Shots:** Shots not yet on the stripboard. Search, filter by location, multi-select, "Assign to Day" (shoot day + unit). Can drag shots onto a column or **onto a specific strip**; the new shot strip is inserted **above or below** that strip depending on where you release (not only at the bottom of the column).
- **Day columns:** One column per (shoot_day, shoot_day_unit). Strips show scene/shot info, estimated minutes. Drag strips between columns to move or reorder **up and down** within a column; drop target resolution uses the hovered strip and release position (before/after). Lock toggle per unit.
- **Strip types:** SHOT (from Shot List), SCENE (legacy), MOVE, CALL, LUNCH, WRAP, NOTE. "Add strip" popover for non-SHOT types. **MOVE** strips can optionally set **origin** and **destination** locations (from the production Locations list); these waypoints feed the ordered location stack used by Movement Orders and the calendar day summary travel segments.
- **Boneyard:** Discarded strips. Drag from board or from Boneyard back to Unscheduled/column. Strips in Boneyard can be permanently deleted.
- **Day totals:** Estimated runtime per column; warning if > 10h 30min.
- **Unit lock:** Prevents accidental drops when locked.

### 5. Shot Lists

- **Scene selector:** Choose a scene to view its shots.
- **Episodic productions:** **New scene** and **Edit scene** require an **episode** (add episodes under **Settings** first). Script import / new scenes must target an episode when the production is episodic.
- **New scene:** "New scene" button in the header opens a dialog to create a scene in the current production. Required: scene number. Optional: heading, title, INT/EXT, DAY/NIGHT, location. On success the scene list refreshes and the new scene is selected so you can add shots immediately.
- **Edit scene:** When a scene is selected, "Edit scene" appears in the header. Opens a dialog pre-filled with that scene’s metadata (scene number, heading, title, INT/EXT, DAY/NIGHT, location). Save updates the scene; the list refreshes and the edited scene stays selected.
- **Shot table:** Columns include scene/shot number, subject, shot description, size, duration, estimated shoot minutes, camera movement, lens, support, notes, and cast. Rows are ordered by **shot number** within the selected scene (`listShotsByScene`).
- **Edit mode:** Use **Edit** in the toolbar to turn **Edit mode** on or off. When Edit mode is **off**, shot fields (including the shot number) are read-only. When **on**, you can inline-edit shot fields: click a cell, edit, then commit with blur, Enter, or the control’s Done action (same pattern as before). **Add shot** and **Delete shot** (per row) are available alongside Edit mode; deleting uses a confirmation dialog.
- **Shot number (Edit mode):** In Edit mode, the **shot number** part of the first column (after the scene number) is editable like other text cells. Changing it updates only the **shot** record’s `shot_number`. It does **not** change stripboard strip order or sequencing; strips remain keyed by shot id. Empty or whitespace-only values are rejected. **Two shots in the same scene cannot share the same shot number** — the app shows a clear error and does not save if you try.
- **Validation:** Estimated minutes and duration use schemas from `shot-list-validation.ts`. Scene creation/edit requires scene number; duplicate scene numbers per production show a clear error. New shots require a non-empty shot number and the same per-scene uniqueness rule as edits. Shot updates surface friendly errors for missing shot number, duplicate number in scene, and generic failures.

### 6. Script Import

- **Paste text:** Paste script content; click Parse to extract scenes.
- **Upload file:** `.txt` and text-layer `.pdf` supported; creates schedule scenes and generates script versions/sections locally.
- **Parsed scenes:** Preview before creating. Create scenes adds them to the production and runs SB2 section generation.
- **Parser:** Extracts scene number, heading, int/ext, day/night from standard script format.
- **Script sections & sides:** See [script-sections-and-sides.md](script-sections-and-sides.md) for the full import → sections → shots → sides data flow.

### 7. Fundamental workflow

**Create schedule from script**

1. Script Import: paste or upload script, parse, create scenes.
2. Shot Lists: add shots per scene, set estimated shoot minutes.
3. Stripboard: create shoot days (via "New shoot day" on Stripboard or via Calendar), assign shots to days/units.

**Build scene structure without script**

- Shot Lists: use "New scene" to add scenes manually; optionally "Edit scene" to update metadata. Then add shots per scene and schedule from the Stripboard.

**Reschedule**

4. Calendar: drag events to move or swap shoot days.
5. Stripboard: drag strips between columns, or from Unscheduled to a column or **between strips** (insertion order matches drop position).

**Output**

6. Day Summary drawer: Open Stripboard, Generate Call Sheet (placeholder).
7. Call Sheets page: separate workflow to generate call sheet PDFs per shoot day.

### 8. Relationships and connections to other pages

| Page | Relationship |
|------|--------------|
| **People / DooD** | Day out of Days derives work days from stripboard (scheduled scenes) + scene_cast; schedule data drives who works when. |
| **People / Booking intelligence** | Needed-on-day is derived from scheduled scenes/shots per day (stripboard + scene_cast/shot_cast). |
| **People / Bookings** | Bookings page and Person detail use shoot days for lists and summaries. |
| **Call Sheets** | Generates PDFs from shoot day + strip data. Calendar Day Summary has "Generate Call Sheet" (placeholder). |
| **Dashboard** | Shows next shoot day and schedule summary. |
| **Wrap Production** | Schedule readiness checks future shoot days and calendar events. See [docs/wrap-production.md](docs/wrap-production.md). |
| **Locations** | Scenes link to locations; Stripboard Unscheduled filter by location. |
| **Duplicate production** | When a production is duplicated, schedule entities (shoot days, scenes, shots, stripboard strips) are copied with ID mapping. |
| **Productions** | All schedule data scoped by production. |
| **Settings (episodic)** | Episodes list (add, rename, reorder, archive) and shooting blocs (name + date range; changing ranges can re-tag shoot days). |
| **Deliverables / Music** | Optional `episode_id` on rows for episodic productions (filtering and reporting). |
| **Import/export (APF)** | Episodic packages must include `episodes`, `shooting_blocs`, `scenes.episode_id`, and `shoot_days.shooting_bloc_id` closure; see [project-import-export-format-v1.md](project-import-export-format-v1.md). |

### 9. Episodic productions (user guide)

**Turning on episodic mode**

- When **creating a production** (Productions list → New), you can enable **Episodic series**. That flag is **permanent**: you cannot switch a production back to single-story mode.
- The app creates an initial episode (e.g. “Episode 1”) so you can assign scenes immediately. Add, rename, reorder, or archive episodes under **Settings** while the episodic production is selected.

**Episodes and scenes**

- Every **scene** in an episodic production has an **episode** (required in Shot Lists when creating or editing a scene). Shots inherit episode context from their scene.
- **Shot Lists:** Episode selector appears in the **New scene** and **Edit scene** flows when the production is episodic.

**Shooting blocs**

- **Shooting blocs** are named **date ranges** (start/end per calendar day) that represent blocks of photography (e.g. a prep block, or “Episodes 1–2” shoot weeks).
- Manage bloc **names and ranges** in **Settings → Shooting blocs**. When you change a bloc’s dates, shoot days whose calendar date falls in the range can be **re-associated** with that bloc (the UI may prompt to confirm moves that affect many days).

**Shoot days**

- Each **shoot day** can reference a **`shooting_bloc_id`** (nullable). Days outside every bloc range show as **Outside blocs** in schedule UIs. Association is **app-maintained** from bloc calendars, not a free-form pick list on the day.

**Calendar**

- Episodic productions can **filter** calendar events by shooting bloc (e.g. one bloc, “unassigned” days only, or all). Event copy can reflect **episode** names derived from scheduled strips’ scenes.

**Stripboard**

- **Column headers** can show the shoot day’s shooting-bloc label.
- **Strips** (shot/scene) can show a small **episode** badge when the scene has an episode.
- A **bloc filter** narrows which day columns appear (same semantics as calendar: all, unassigned, or a specific bloc).

**Call sheets, DooD, bookings**

- Call sheets and people workflows still key off **shoot days** and stripboard strips; episodic metadata is additive (episode/bloc labels where surfaced in PDFs or schedule helpers). DooD and booking rules remain cast/stripboard-driven.

---

## Part I — Current state

### 1. Overview and purpose (current state)

Schedule manages **shoot_days**, **shoot_day_units**, **scenes**, **shots**, and **stripboard_strips**. Episodic productions additionally use **episodes**, **shooting_blocs**, **`scenes.episode_id`**, and **`shoot_days.shooting_bloc_id`**. The Calendar and Stripboard are the main scheduling UIs; Shot List and Script Import feed the stripboard. The stripboard is shot-based; `getScheduledSceneIdsByShootDay` and `getScheduledShotIdsByShootDay` (from [stripboard-strips](src/lib/db/repositories/stripboard-strips.ts)) drive People (DooD) and booking intelligence.

### 2. Architecture and file layout

```
src/
├── features/schedule/
│   ├── calendar-page.tsx       # Month view, drag and drop, Day Summary drawer
│   ├── stripboard-page.tsx     # Main stripboard layout
│   ├── stripboard-hooks.ts     # useStripboard, useUnscheduledShots, useBoneyardStrips, mutations
│   ├── stripboard-day-column.tsx
│   ├── strip-item.tsx          # Draggable strip render
│   ├── unscheduled-scenes-panel.tsx
│   ├── boneyard-panel.tsx
│   ├── shot-list-page.tsx
│   ├── shot-list-validation.ts
│   └── script-import-page.tsx
├── lib/
│   ├── db/repositories/
│   │   ├── schedule.ts         # shoot_days, scenes, shots, move/swap
│   │   ├── shoot-day-units.ts
│   │   ├── stripboard-strips.ts
│   │   ├── calendar.ts         # listCalendarShootDayEvents
│   │   ├── episodes.ts
│   │   ├── shootingBlocs.ts
│   │   └── units.ts
│   ├── schedule/
│   │   └── episodicScheduleDisplay.ts  # Bloc/episode labels, filters, strip → scene
│   └── script-parser/          # Parser interface, txt-parser
```

### 3. Data model

- **Production (episodic):** `is_episodic` (`0` | `1`). Once created as episodic, the app does not allow turning it off.
- **Episode:** id, production_id, name, sort_order; soft-delete via `deleted_at` (archived). Repositories: [episodes.ts](src/lib/db/repositories/episodes.ts); Settings flows use [episodeManagementService.ts](src/lib/db/episodeManagementService.ts).
- **ShootingBloc:** id, production_id, name, `start_date`, `end_date` (YYYY-MM-DD); soft-delete. [shootingBlocs.ts](src/lib/db/repositories/shootingBlocs.ts); range changes: [shootingBlocAssociation.ts](src/lib/db/shootingBlocAssociation.ts).
- **ShootDay:** id, production_id, shoot_date (YYYY-MM-DD), day_number, call_time, wrap_time, notes, meal_times_json, optional **`shooting_bloc_id`** → `shooting_blocs` (`ON DELETE SET NULL`), etc.
- **ShootDayUnit:** id, shoot_day_id, unit_id, is_locked. Links a unit (Main, Second) to a shoot day.
- **Scene:** id, production_id, scene_number, heading, title, int_ext, day_night, location_id, duration_minutes, optional **`episode_id`** → `episodes` (required in UI when `is_episodic = 1`), etc.
- **Shot:** id, scene_id, **shot_number** (unique among non-deleted shots in the same scene; enforced in `createShot` / `updateShot`), description, estimated_shoot_minutes, shot_size, camera_movement, etc.
- **StripboardStrip:** id, production_id, shoot_day_id, shoot_day_unit_id, strip_type (SHOT|SCENE|MOVE|CALL|LUNCH|WRAP|NOTE), shot_id, scene_id, strip_status (SCHEDULED|UNSCHEDULED|BONEYARD), sort_index, estimated_minutes, origin_location_id, destination_location_id (MOVE strips only; optional FKs to locations).
- **Unit:** id, production_id, name (e.g. "Main Unit", "Second Unit").

### 4. Data flow and dependencies

- **Calendar:** [calendar.ts](src/lib/db/repositories/calendar.ts) `listCalendarShootDayEvents(productionId, dateRange)` — aggregates from shoot_days, shoot_day_units, stripboard_strips, shots; joins **shooting bloc** name/id where present. `moveShootDayToDate`, `swapShootDays` for drag. Episodic UI uses [episodicScheduleDisplay.ts](src/lib/schedule/episodicScheduleDisplay.ts) for bloc labels, episode name ordering, and filter helpers.
- **Stripboard:** `listShootDaysByProduction`, `listShootDayUnitsByProduction`, `listStripsByProduction`, `listScenesByProduction`, `listShotsByProduction`, `listUnscheduledShots`, `listBoneyardStrips`; episodic pages also load `listEpisodesByProduction`, `listShootingBlocsByProduction` for badges and bloc filters. Mutations: `createStrip`, `createShotStrip`, `moveStrip`, `moveStripToUnscheduled`, `moveStripToBoneyard`, `reorderStrip`, `bulkAssignShotsToDay`, `deleteStrip`. **`createStrip`** accepts optional **`sort_index`**; if omitted, new strips append after the current max `sort_index` for that day/unit. **`createShotStrip`** accepts an optional **`sortIndex`** argument (passed through as `sort_index`) so drag-from-unscheduled can persist insertion order to match the drop. Shoot day creation: `createShootDayWithDefaultMainUnit(productionId, shootDate)` in [schedule.ts](src/lib/db/repositories/schedule.ts) — creates one shoot day and one Main Unit shoot_day_unit in a single transaction; no strips. Stripboard invalidates `stripboardQueryKeys.all` after creation and scrolls the new day into view.
- **Shot Lists:** `listScenesByProduction`, `listShotsByScene`, `createScene`, `updateScene`, `createShot`, `updateShot`, `deleteShot`. Scene create/edit use the same optional fields (heading, title, int_ext, day_night, location_id). **`createShot`** enforces a non-empty trimmed `shot_number` and rejects a duplicate `shot_number` within the same scene (application check before insert). **`updateShot`** loads the shot first; if `shot_number` is in the patch, it trims, rejects empty/whitespace, and rejects duplicates in the same scene for any **other** shot id. Invalidates `['scenes', currentProductionId]` and `['scenes']` for scene mutations; shot mutations invalidate `['shots', selectedSceneId]` (and the same related keys as other shot updates, e.g. production shots and equipment terms where applicable). New scene is selected after create, edited scene stays selected after update.
- **Script Import:** `defaultParser.parse()`, `createScene`. Invalidates `['scenes']` and `['scenes', currentProductionId]` on create.

### 5. Query keys and invalidation

- **Calendar:** `['calendar-events']`, `['shoot-days']`, `stripboardQueryKeys.all`.
- **Stripboard:** `stripboardQueryKeys.shootDays(productionId)`, `strips(productionId)`, `scenes(productionId)`, `dayUnits(productionId)`, `units(productionId)`, `estimatedMinutes(productionId)`; `unscheduledShotsQueryKeys.list()`; `boneyardStripsQueryKeys.list(productionId)`.
- **Shot Lists:** `['scenes', productionId]`, `['shots', selectedSceneId]` (via listShotsByScene). Scene create/edit invalidate `['scenes', productionId]` and `['scenes']`. Shot create/update/delete also invalidate `['shots', selectedSceneId]`, production-level `['shots', productionId]` where used, and `['stripboard']` (same pattern as other shot field updates; changing **shot_number** does not reorder strips).
- **Script Import:** invalidates `['scenes']` and `['scenes', productionId]` on create.

### 6. Drag and drop and transactions

- **@dnd-kit/core:** PointerSensor, KeyboardSensor, DndContext, DragOverlay, useDraggable, useDroppable. Stripboard also uses `@dnd-kit/sortable` for scheduled strips (`SortableContext` + `useSortable` on strip rows).
- **Schedule moves:** `moveShootDayToDate`, `swapShootDays`, `moveShootDayUnitToDate`, `mergeShootDayUnitIntoDay` — use `runInSerializedTransaction` + `executeBatch` per [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md).
- **Stripboard mutations:** Single-statement writes where possible; strip status transitions (SCHEDULED ↔ UNSCHEDULED ↔ BONEYARD) via UPDATE.
- **Stripboard drop handling** ([stripboard-page.tsx](src/features/schedule/stripboard-page.tsx)): `onDragEnd` resolves the drop target as either a **strip id** (hovered row) or a **column id** (`col:{shootDayId}:{shootDayUnitId}` from the unit droppable). A shared helper computes **`sort_index`** for the insert position: strips in the target column are ordered by `sort_index`, the **active strip is excluded** when reordering within the same column (avoids no-op math), and when dropping **on** another strip, **before vs after** is determined by comparing the vertical midpoint of the dragged item to the hovered strip’s rectangle. Same column → `reorderStrip`; different column or from boneyard → `moveStrip`; unscheduled shot → `createShotStrip` with computed `sortIndex`. Unscheduled panel and Boneyard panel use fixed droppable ids (`unscheduled-panel`, `boneyard-panel`) for status-only moves.

---

## Part II — Dependencies and refactor impact

### 1. Outbound dependencies

(What Schedule uses; these must remain available or be updated in sync.)

- **Productions context:** `useCurrentProduction()` from [src/features/productions/context](src/features/productions/context). All schedule UIs are production-scoped.
- **Units:** [src/lib/db/repositories/units.ts](src/lib/db/repositories/units.ts) — `listUnitsByProduction`, `ensureMainUnit`; [shoot-day-units](src/lib/db/repositories/shoot-day-units.ts) — `getShootDayUnitById`, `listShootDayUnitsByProduction`. Stripboard and Calendar use units and shoot_day_units.
- **Locations:** [src/lib/db/repositories/location.ts](src/lib/db/repositories/location.ts) — `listLocationsByProduction`. Shot List and Stripboard (location filter) use locations; scenes have `location_id`.
- **People/Cast:** [src/lib/db/repositories/person.ts](src/lib/db/repositories/person.ts) — `listCast`. Shot List uses cast for per-shot cast; Call Sheets use cast + schedule.
- **Scene cast / Shot cast:** [scene-cast](src/lib/db/repositories/scene-cast.ts), [shot-cast](src/lib/db/repositories/shot-cast.ts) — Shot List manages per-scene and per-shot cast; DooD and booking intelligence read scene_cast/shot_cast plus stripboard.
- **Shared UI:** `@/components/ui/*`, `@dnd-kit/core`.

### 2. Inbound dependencies

(Other features that use Schedule data; refactors here can break them.)

| Consumer | What they use | Risk if Schedule refactor |
|----------|----------------|----------------------------|
| **People – DooD** | `listShootDaysByProduction`, `getScheduledSceneIdsByShootDay` from [stripboard-strips](src/lib/db/repositories/stripboard-strips.ts) | Changing shoot_days or stripboard_strips shape/repos breaks work-day derivation. |
| **People – Booking intelligence** | `listShootDaysByProduction`, `getScheduledSceneIdsByShootDay`, `getScheduledShotIdsByShootDay` | Same; needed-on-day logic depends on these. |
| **People – Bookings / Person detail** | `listShootDaysByProduction` | Bookings page and Person detail use shoot days for lists and summaries. |
| **Call Sheets** | `listShootDaysByProduction`, `getShootDayById`, `listStripsByShootDay` | Call sheet content is driven by shoot day and strips. |
| **Dashboard** | Next shoot day, `listStripsByShootDay` (via [nextShootDay](src/lib/dashboard/nextShootDay.ts) or similar) | Dashboard shows next shoot day or schedule summary. |
| **Wrap Production** | `listShootDaysByProduction`, calendar/stripboard data for readiness | Schedule readiness checks depend on shoot days and future events. |
| **Duplicate production** | [duplicateProduction.ts](src/lib/db/duplicateProduction.ts) copies `shoot_days`, `shoot_day_units`, `scenes`, `shots`, `stripboard_strips` with ID mapping | Renaming tables or columns used in duplication breaks copy. |

### 3. Duplicate production

When a production is duplicated via [src/lib/db/duplicateProduction.ts](src/lib/db/duplicateProduction.ts), the following schedule entities are copied with new IDs and mapped so references stay consistent: **units**, **shoot_days**, **shoot_day_units**, **scenes** (with `location_id` and episodic **`episode_id`** mapped), **shots** (with `scene_id` mapped), **stripboard_strips** (with `shoot_day_id`, `shoot_day_unit_id`, `scene_id`, `shot_id` mapped). For **episodic** productions, **episodes** and **shooting_blocs** are copied and **`shoot_days.shooting_bloc_id`** is remapped. Bookings are **not** copied. **scene_cast** and **shot_cast** are copied (person/scene/shot maps). Any change to these tables or their columns must be reflected in duplicateProduction.

### 4. Checklist for refactors

When changing Schedule (shoot_days, scenes, shots, stripboard_strips, shoot_day_units, calendar):

- **Changing shoot_days or stripboard_strips:** Check DooD (`getScheduledSceneIdsByShootDay`), booking intelligence (`getScheduledSceneIdsByShootDay`, `getScheduledShotIdsByShootDay`), Call Sheets, Bookings page, Person detail, Dashboard, Wrap Production.
- **Changing tables/columns copied in duplicate production:** Update [duplicateProduction.ts](src/lib/db/duplicateProduction.ts) and ID mapping (shootDayIdMap, shootDayUnitIdMap, sceneIdMap, shotIdMap).
- **Changing stripboard-strips API used by DooD or booking intelligence:** Update those callers; DooD uses only scene-by-day (not shot_cast for work days).
- **Changing stripboard drop rules or `createStrip` / `createShotStrip` signatures:** Update [stripboard-page.tsx](src/features/schedule/stripboard-page.tsx), [stripboard-hooks.ts](src/features/schedule/stripboard-hooks.ts), and this doc’s §I.4 / §I.6; keep UI insertion semantics aligned with persisted `sort_index`.

---

## Part III — Reference

### 1. File and route reference

| Item | Path or route |
|------|----------------|
| Calendar page | [src/features/schedule/calendar-page.tsx](src/features/schedule/calendar-page.tsx) — `/schedule/calendar` |
| Stripboard page | [src/features/schedule/stripboard-page.tsx](src/features/schedule/stripboard-page.tsx) — `/schedule/stripboard` |
| Shot List page | [src/features/schedule/shot-list-page.tsx](src/features/schedule/shot-list-page.tsx) — `/schedule/shots` |
| Script Import page | [src/features/schedule/script-import-page.tsx](src/features/schedule/script-import-page.tsx) — `/schedule/script-import` |
| Stripboard hooks | [src/features/schedule/stripboard-hooks.ts](src/features/schedule/stripboard-hooks.ts) |
| Stripboard day column | [src/features/schedule/stripboard-day-column.tsx](src/features/schedule/stripboard-day-column.tsx) |
| Strip item | [src/features/schedule/strip-item.tsx](src/features/schedule/strip-item.tsx) |
| Unscheduled panel | [src/features/schedule/unscheduled-scenes-panel.tsx](src/features/schedule/unscheduled-scenes-panel.tsx) |
| Boneyard panel | [src/features/schedule/boneyard-panel.tsx](src/features/schedule/boneyard-panel.tsx) |
| Shot list validation | [src/features/schedule/shot-list-validation.ts](src/features/schedule/shot-list-validation.ts) |
| Schedule repo | [src/lib/db/repositories/schedule.ts](src/lib/db/repositories/schedule.ts) |
| Stripboard strips repo | [src/lib/db/repositories/stripboard-strips.ts](src/lib/db/repositories/stripboard-strips.ts) |
| Calendar repo | [src/lib/db/repositories/calendar.ts](src/lib/db/repositories/calendar.ts) |
| Episodes repo | [src/lib/db/repositories/episodes.ts](src/lib/db/repositories/episodes.ts) |
| Shooting blocs repo | [src/lib/db/repositories/shootingBlocs.ts](src/lib/db/repositories/shootingBlocs.ts) |
| Episodic schedule UI helpers | [src/lib/schedule/episodicScheduleDisplay.ts](src/lib/schedule/episodicScheduleDisplay.ts) |
| Episodes Settings UI | [src/features/settings/EpisodesSettingsSection.tsx](src/features/settings/EpisodesSettingsSection.tsx) |
| Shooting blocs Settings UI | [src/features/settings/ShootingBlocsSettingsSection.tsx](src/features/settings/ShootingBlocsSettingsSection.tsx) |
| Shoot day units repo | [src/lib/db/repositories/shoot-day-units.ts](src/lib/db/repositories/shoot-day-units.ts) |
| Units repo | [src/lib/db/repositories/units.ts](src/lib/db/repositories/units.ts) |
| Router | [src/app/router.tsx](src/app/router.tsx) |
| Navigation | [src/app/navigation.ts](src/app/navigation.ts) |

### 2. Router and navigation

- **Routes:** [src/app/router.tsx](src/app/router.tsx) — `/schedule` → Navigate to `/schedule/calendar`; `/schedule/calendar`, `/schedule/stripboard`, `/schedule/shots`, `/schedule/script-import`.
- **Navigation:** [src/app/navigation.ts](src/app/navigation.ts) — Schedule group with `defaultChild: '/schedule/calendar'`, sub-items: Calendar, Stripboard, Shot Lists, Script Import.

### 3. Gaps and future work

- Episodic: further cross-feature surfacing (e.g. budget revision per episode, richer call-sheet episode columns) may evolve; import/export rules are documented in APF v1.
- PDF script parsing not implemented.
- Broader calendar integration (external calendars) not present.
- Stripboard: page-eighths target (48) referenced but full page count UI may be incomplete.
