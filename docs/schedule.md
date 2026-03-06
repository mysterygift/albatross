# Schedule

This document is both a **user guide** (how to use the Schedule feature and its child pages) and a **developer guide** (architecture, data model, and implementation). Schedule is the production scheduling hub for shoot days, scenes, shots, and the stripboard.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Child pages summary](#2-child-pages-summary)
- [3. Calendar](#3-calendar)
- [4. Stripboard](#4-stripboard)
- [5. Shot Lists](#5-shot-lists)
- [6. Script Import](#6-script-import)
- [7. Fundamental workflow](#7-fundamental-workflow)
- [8. Relationships and connections to other pages](#8-relationships-and-connections-to-other-pages)

**Part II — Developer guide**

- [9. Architecture and file layout](#9-architecture-and-file-layout)
- [10. Data model](#10-data-model)
- [11. Data flow and dependencies](#11-data-flow-and-dependencies)
- [12. Query keys and invalidation](#12-query-keys-and-invalidation)
- [13. Drag and drop and transactions](#13-drag-and-drop-and-transactions)

**Part III — Reference**

- [14. Router and navigation](#14-router-and-navigation)
- [15. Gaps and future work](#15-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Schedule is albatross' production scheduling hub. It manages shoot days, scenes, shots, and the stripboard (day-by-day breakdown of what to shoot). It supports script import, shot editing, drag-and-drop scheduling, and calendar-based rescheduling.
- **Route:** `/schedule` redirects to `/schedule/calendar`. Child routes: `/schedule/calendar`, `/schedule/stripboard`, `/schedule/shots`, `/schedule/script-import`.
- **Navigation:** "Schedule" (Calendar icon) in app nav with sub-items: Calendar, Stripboard, Shot Lists, Script Import.
- **Context:** Requires a current production. All schedule data is scoped by `production_id`.

### 2. Child pages summary

| Page | Route | Purpose |
|------|-------|---------|
| Calendar | `/schedule/calendar` | Month view of shoot days; drag to move/swap; Day Summary drawer |
| Stripboard | `/schedule/stripboard` | Day/unit columns with strips; Unscheduled Shots; Boneyard; drag and drop scheduling |
| Shot Lists | `/schedule/shots` | Scene-by-scene shot breakdown; edit shot details and estimates |
| Script Import | `/schedule/script-import` | Import scenes from script text or .txt file |

### 3. Calendar

- **Month view:** One event per (shoot_day, shoot_day_unit). Events show unit name, call–wrap time, estimated runtime, primary location, shot count.
- **Drag and drop:** Drag an event to another date to move the shoot day. If target date already has a shoot, the two days swap.
- **Day Summary drawer:** Click an event to open. Shows call time, lunch, wrap time, location, shot count, estimated runtime. Warning if runtime > 10h 30min. Actions: "Open Stripboard", "Generate Call Sheet" (placeholder).
- **Unit colours:** Main Unit and Second Unit use distinct CSS variables for quick identification.

### 4. Stripboard

- **Layout:** Left panel (Unscheduled Shots), center (day/unit columns), right (Boneyard).
- **Unscheduled Shots:** Shots not yet on the stripboard. Search, filter by location, multi-select, "Assign to Day" (shoot day + unit). Can drag shots onto a column.
- **Day columns:** One column per (shoot_day, shoot_day_unit). Strips show scene/shot info, estimated minutes. Drag strips between columns to move or reorder. Lock toggle per unit.
- **Strip types:** SHOT (from Shot List), SCENE (legacy), MOVE, CALL, LUNCH, WRAP, NOTE. "Add strip" popover for non-SHOT types.
- **Boneyard:** Discarded strips. Drag from board or from Boneyard back to Unscheduled/column. Strips in Boneyard can be permanently deleted.
- **Day totals:** Estimated runtime per column; warning if > 10h 30min.
- **Unit lock:** Prevents accidental drops when locked.

### 5. Shot Lists

- **Scene selector:** Choose a scene to view its shots.
- **Shot table:** Shot number, subject, shot description, size, duration, estimated shoot minutes, camera movement, lens, support, notes. Inline edit with save.
- **Validation:** Estimated minutes and duration use schemas from `shot-list-validation.ts`.

### 6. Script Import

- **Paste text:** Paste script content; click Parse to extract scenes.
- **Upload file:** .txt supported; PDF stores file but parsing not implemented.
- **Parsed scenes:** Preview before creating. Create scenes adds them to the production.
- **Parser:** Extracts scene number, heading, int/ext, day/night from standard script format.

### 7. Fundamental workflow

**Create schedule from script**

1. Script Import: paste or upload script, parse, create scenes.
2. Shot Lists: add shots per scene, set estimated shoot minutes.
3. Stripboard: create shoot days (via Calendar or elsewhere), assign shots to days/units.

**Reschedule**

4. Calendar: drag events to move or swap shoot days.
5. Stripboard: drag strips between columns, or from Unscheduled to column.

**Output**

6. Day Summary drawer: Open Stripboard, Generate Call Sheet (placeholder).
7. Call Sheets page: separate workflow to generate call sheet PDFs per shoot day.

### 8. Relationships and connections to other pages

| Page | Relationship |
|------|--------------|
| **Wrap Production** | Schedule readiness checks future shoot days and calendar events. See [docs/wrap-production.md](docs/wrap-production.md). |
| **Call Sheets** | Generates PDFs from shoot day + strip data. Calendar Day Summary has "Generate Call Sheet" (placeholder). |
| **Locations** | Scenes link to locations; Stripboard Unscheduled filter by location. |
| **People / Bookings** | Cast availability; call sheet cast data. |
| **Productions** | All schedule data scoped by production. |

---

## Part II — Developer guide

### 9. Architecture and file layout

```
src/
├── features/schedule/
│   ├── calendar-page.tsx       # Month view, drag and drop, Day Summary drawer
│   ├── stripboard-page.tsx     # Main stripboard layout
│   ├── stripboard-hooks.ts     # useStripboard, useUnscheduledShots, useBoneyardStrips, mutations
│   ├── stripboard-day-column.tsx
│   ├── stripboard-column.tsx
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
│   │   └── units.ts
│   └── script-parser/          # Parser interface, txt-parser
```

### 10. Data model

- **ShootDay:** id, production_id, shoot_date (YYYY-MM-DD), day_number, call_time, wrap_time, notes, meal_times_json, etc.
- **ShootDayUnit:** id, shoot_day_id, unit_id, is_locked. Links a unit (Main, Second) to a shoot day.
- **Scene:** id, production_id, scene_number, heading, title, int_ext, day_night, location_id, duration_minutes, etc.
- **Shot:** id, scene_id, shot_number, description, estimated_shoot_minutes, shot_size, camera_movement, etc.
- **StripboardStrip:** id, production_id, shoot_day_id, shoot_day_unit_id, strip_type (SHOT|SCENE|MOVE|CALL|LUNCH|WRAP|NOTE), shot_id, scene_id, strip_status (SCHEDULED|UNSCHEDULED|BONEYARD), sort_index, estimated_minutes.
- **Unit:** id, production_id, name (e.g. "Main Unit", "Second Unit").

### 11. Data flow and dependencies

- **Calendar:** `listCalendarShootDayEvents(productionId, dateRange)` — aggregates from shoot_days, shoot_day_units, stripboard_strips, shots. `moveShootDayToDate`, `swapShootDays` for drag.
- **Stripboard:** `listShootDaysByProduction`, `listShootDayUnitsByProduction`, `listStripsByProduction`, `listScenesByProduction`, `listShotsByProduction`, `listUnscheduledShots`, `listBoneyardStrips`. Mutations: `createStrip`, `createShotStrip`, `moveStrip`, `moveStripToUnscheduled`, `moveStripToBoneyard`, `reorderStrip`, `bulkAssignShotsToDay`, `deleteStrip`.
- **Shot Lists:** `listScenesByProduction`, `listShotsByScene`, `updateShot`.
- **Script Import:** `defaultParser.parse()`, `createScene`.

### 12. Query keys and invalidation

- **Calendar:** `['calendar-events']`, `['shoot-days']`, `stripboardQueryKeys.all`.
- **Stripboard:** `stripboardQueryKeys.shootDays(productionId)`, `strips(productionId)`, `scenes(productionId)`, `dayUnits(productionId)`, `units(productionId)`, `estimatedMinutes(productionId)`; `unscheduledShotsQueryKeys.list()`; `boneyardStripsQueryKeys.list(productionId)`.
- **Shot Lists:** `['scenes', productionId]`, `['shots', productionId]` (via listShotsByScene).
- **Script Import:** invalidates `['scenes']` on create.

### 13. Drag and drop and transactions

- **@dnd-kit/core:** PointerSensor, KeyboardSensor, DndContext, DragOverlay, useDraggable, useDroppable.
- **Schedule moves:** `moveShootDayToDate`, `swapShootDays`, `moveShootDayUnitToDate`, `mergeShootDayUnitIntoDay` — use `runInSerializedTransaction` + `executeBatch` per [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md).
- **Stripboard mutations:** Single-statement writes where possible; strip status transitions (SCHEDULED ↔ UNSCHEDULED ↔ BONEYARD) via UPDATE.

---

## Part III — Reference

### 14. Router and navigation

- **Routes:** [src/app/router.tsx](src/app/router.tsx) — `/schedule` → Navigate to `/schedule/calendar`; `/schedule/calendar`, `/schedule/stripboard`, `/schedule/shots`, `/schedule/script-import`.
- **Navigation:** [src/app/navigation.ts](src/app/navigation.ts) — Schedule group with sub-items.

### 15. Gaps and future work

- Calendar "Generate Call Sheet" is a placeholder (TODO).
- PDF script parsing not implemented.
- Broader calendar integration (external calendars) not present.
- Stripboard: page-eighths target (48) referenced but full page count UI may be incomplete.
