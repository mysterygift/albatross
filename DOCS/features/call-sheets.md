# Call Sheets

Builds the daily call sheet PDF for one shoot day and unit from the schedule, cast, crew, locations and contacts. UI: **Deliver → Call Sheets** (`/call-sheets`).

## Code map
| Area | Location |
|---|---|
| Page (data assembly, preview, save) | `src/features/call-sheets/page.tsx` (`CallSheetsPage`, `buildCallSheetData` memo) |
| Distribution | `src/features/call-sheets/CallSheetDistributionDialog.tsx`, `exportDistributedCallSheets.ts`, `src/lib/pdf/applyRecipientNameWatermarkToPDF.ts` |
| PDF engine | `src/lib/pdf/callSheet.ts` (`generateCallSheetPdf`, `CallSheetData`), `callSheetScheduleColumns.ts` |
| Data helpers | `src/lib/call-sheets/` (`castRequirements`, `crewRequirements`, `scheduleStripRow`, `advancedSchedule`, `primaryContacts`, `bookingCallTimes`, `callSheetEpisodic`) |
| Weather | `src/lib/weather/openMeteo.ts` (`getWeatherForCallSheet`); see [integrations.md](../integrations.md) |
| RAMS gate | `src/features/risk-assessments/{useRamsSignOff,RamsSignOffAlert}`, `src/lib/risk-assessments/ramsSignOff.ts` |
| Repository | `src/lib/db/repositories/call-sheets.ts` |
| Tables | `call_sheets` (0002, rebuilt in 0004); inputs on `shoot_days` (`call_time`, `wrap_time`, `special_notes`, `meal_times_json`, `weather_json`, `weather_manual`, `parking_base_address`, `hospital_*`, `police_station_*`) |
| Tests | `src/lib/pdf/callSheet*.test.ts`, `src/lib/call-sheets/*.test.ts`, `src/features/call-sheets/CallSheetEpisodic.integration.test.tsx` |

## Data model
`call_sheets` stores only a link: `(production_id, shoot_day_id, shoot_day_unit_id)` plus `generated_document_id` (the latest saved PDF in Documents). Nothing on a call sheet is stored as a snapshot; every PDF is rebuilt from live schedule data. `overrides_json` exists on the table but the page does not use it. The one call-sheet field edited on the page and persisted is **Safety information**, saved (debounced) to `shoot_days.special_notes`. A user choice to include episode numbers is a per-production setting, key `call_sheet_include_episodes:<productionId>`.

## How it works
### Assembling `CallSheetData`
`buildCallSheetData` returns null until a production, shoot day and shoot day unit are chosen. It combines:
- **Header**: production, `dayNumber` and `totalDays`, unit name and notes, call and wrap, bloc label for episodic productions, paper size (A4 default, or Letter, chosen on the page).
- **Schedule**: the unit's stripboard strips in `sort_index` order, turned into rows by `buildCallSheetStripFromStripboard` (location, scene/shot, synopsis, D/N, pages, compact cast, notes). IF TIME PERMITS strips are grouped after the main block. An EP column appears only for episodic productions with the include-episodes setting on; TIME only when a strip has an estimated time.
- **Cast**: `getCallSheetCastRequirements` works out who is required (shot-level casting for scheduled shots, else scene-level) and prints **required and booked**. Required-but-not-booked and booked-but-not-required people are returned for warnings in the UI. The character column is booking role, else the person's `role_name`; the set-call column comes from the booking's `start_date`/`end_date` only when they are ISO datetimes (`bookingCallTimes.ts`).
- **Crew**: `getCallSheetCrewRequirements` groups crew booked on the day by department, HOD first ([crew-manager.md](crew-manager.md)). Bookings are per shoot day, not per unit.
- **Contacts**: key contacts feed the departmental and Health, Safety & Stunts blocks; `selectPrimaryCallSheetContacts` picks the AD, coordinator and office rows for the top of page 1 (email only where `primaryContactShowsEmail`).
- **Advanced schedule**: `buildAdvancedScheduleForCallSheet` adds up to two following shoot days, same unit where possible.
- **Locations**: only those used by scenes scheduled on the unit.

`CallSheetData` also carries `revisionLabel`, `crewCallTimes`, `backgroundNotes`, `specialRequirements`, `radioChannels`, `transportRows` and per-cast `pickup_time`, `makeup_time`, `wardrobe_time`. The PDF draws them when set, but the page does not populate them, so those sections never appear in app-generated sheets.

### Weather
On Preview, Save and Save & Open the page geocodes the first scheduled location (name plus address hint) and calls `getWeatherForCallSheet` for the shoot date. On failure it falls back to the manual weather field or stored `weather_json` and shows "Weather lookup unavailable". Sunrise and sunset come from the API, else the manual or stored values. Distribution export skips the lookup: `weatherSummary` stays null and only stored or manual weather prints.

### PDF layout
`generateCallSheetPdf` (pdf-lib, Helvetica) draws top to bottom, starting a new page with a running header (`CALL SHEET (cont'd)`, production, day, date, unit) whenever `ensure(ctx, h)` finds less than `h` above `Y_MIN`. Page 1 uses a title block instead. Margins 36 pt; paper from `data.paperSize`. The paper size is held in module variables and set at the start of each call, so keep the drawing code synchronous until `doc.save()`.

| Order | Section |
|---|---|
| 1 | Title block (production, unit, bloc, revision, issue stamp), header strip (date and day, crew call with breakfast/lunch/wrap, weather) |
| 2 | Primary contacts, base and locations, safety text, nearest A&E, police |
| 3 | Shooting schedule table, principal cast calls (optional columns appear only if some row has data) |
| 4 | Day and unit notes, background, special requirements |
| 5 | Departmental requirements and Health, safety & stunts (two-column grid; blocks taller than a page break by row with a repeated banner) |
| 6 | Catering (meals other than breakfast and lunch), radio channels, transport |
| 7 | Advanced schedule |
| Every page | Footer: revision and issue stamp, "Page n of N", confidentiality line |

Meals come only from `meal_times_json`; no default lunch is added. Characters that StandardFonts cannot encode go through `textForPdf`.

### Save, distribute, flag
- **Save PDF** persists the PDF with `persistProductionDocument` (entity `call_sheet`, id = shoot day id), upserts the `call_sheets` row and offers a save dialog.
- **Distribute**: `exportDistributedCallSheets` renders one base PDF then `persistPersonalizedDocuments` stamps a diagonal recipient-name watermark per cast or crew recipient and files each copy in Documents. Recipients mirror the page's cast and crew preview.
- **RAMS flag**: when the unit's risk assessment is missing or unsigned, an alert shows and Preview, Save and distribution ask **Export anyway?** first ([risk-assessments.md](risk-assessments.md)).

## Changing the layout
1. Add the field to `CallSheetData` and fill it in `buildCallSheetData` (or in `src/lib/call-sheets/` if it needs logic).
2. Draw it in a `draw*` function in `callSheet.ts`, and call it from `generateCallSheetPdf` in the right position. Use `ensure` before blocks and the `drawTable` / `drawBoxes` helpers so pagination and wrapping keep working.
3. Schedule columns live in `callSheetScheduleColumns.ts`; `MAIN_SCHEDULE_TABLE_WIDTH` assumes A4 and the builder takes the real content width.
4. Add a case to `src/lib/pdf/callSheet*.test.ts`.

## Connections
Reads Schedule (shoot days, units, strips, scenes, shots), People (bookings, cast, crew), Locations, Key contacts, Episodes and Shooting blocs. Feeds Documents. Duplicate production does not copy `call_sheets` rows.

## Gotchas
- `src/lib/pdf/index.ts` still exports an older `generateCallSheet` (with its own `CallSheetData`). Nothing uses it; do not build on it.
- The header, not the schedule, owns breakfast, lunch and wrap, so they do not repeat in Catering.
- Missing cast bookings silently remove a person from the PDF; the warning is in the UI only.
