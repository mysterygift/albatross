# Call sheets — developer reference

This document describes how call sheet PDFs are built today: entry points, where each field comes from, and the exact layout produced by `pdf-lib`. Use it when refactoring PDF layout or data assembly.

## Entry points

| Flow | Location |
|------|----------|
| Primary UI | [`src/features/call-sheets/page.tsx`](../src/features/call-sheets/page.tsx) — **Call Sheets** route |
| PDF rendering | [`src/lib/pdf/callSheet.ts`](../src/lib/pdf/callSheet.ts) — `generateCallSheetPdf` |
| Bulk export + watermark | [`src/features/call-sheets/exportDistributedCallSheets.ts`](../src/features/call-sheets/exportDistributedCallSheets.ts) |
| Weather API | [`src/lib/weather/openMeteo.ts`](../src/lib/weather/openMeteo.ts) — `getWeatherSummaryForCallSheet` |

The calendar **Day Summary** drawer still has a placeholder “Generate Call Sheet” action ([`src/features/schedule/calendar-page.tsx`](../src/features/schedule/calendar-page.tsx)); it does not call this pipeline.

[`src/lib/pdf/index.ts`](../src/lib/pdf/index.ts) exports a separate, older `generateCallSheet` with a different `CallSheetData` shape. **Production call sheets use `generateCallSheetPdf` from `callSheet.ts`, not that helper.**

---

## Data assembly (`CallSheetsPage`)

`buildCallSheetData` (a `useMemo` in the page) returns `CallSheetData | null` when production, shoot day, and a **shoot day unit** are selected. It does **not** set `weatherSummary`; that field is filled only in the generate mutation (see [Weather](#weather)).

### Repositories and queries

Data is loaded with TanStack Query from production-scoped or day-scoped repositories:

- **Production:** `getProductionById` → `productionName`
- **Shoot day:** `getShootDayById`, `listShootDaysByProduction` → dates, times, safety, notes, meals, weather JSON (for UI default only)
- **Units:** `listShootDayUnitsByShootDay`, `listUnitsByProduction` → `unitName`, `unitNotes`
- **Stripboard:** `listStripsByShootDay` → filtered to `shoot_day_unit_id === selectedUnit`, sorted by `sort_index`
- **Scenes / shots:** `listScenesByProduction`, `listShotsByProduction` → resolve strip rows to scene metadata and shot numbers
- **Locations:** `listLocationsByProduction` → only locations referenced by scheduled scenes on this unit (via `scene.location_id`)
- **Key contacts:** `listKeyContactsByProduction`
- **Bookings:** `listBookingsByShootDay` → cast/crew eligibility for the **whole shoot day** (not per unit)
- **Cast roster:** `listCast`
- **Crew roster:** `listCrew`
- **Cast requirements:** `getCastIdsBySceneIds`, `getCastIdsByShotIds` keyed by scene/shot IDs appearing on the unit’s strips

### Derived rules (business logic)

**Cast list** — [`src/lib/call-sheets/castRequirements.ts`](../src/lib/call-sheets/castRequirements.ts) (`getCallSheetCastRequirements`):

- **Required:** If the unit has any scheduled **shots**, required cast come from `shot_cast` for those shots; otherwise from `scene_cast` for scheduled scenes.
- **Booked:** Person appears in `listBookingsByShootDay` for that shoot day.
- **On PDF:** Intersection only — required **and** booked. Unbooked required cast are warnings in the UI only.

Rows are sorted by `cast_number` (string/numeric-aware) then name. Each row carries phone and agent fields for the PDF table.

**Crew list** — [`src/lib/call-sheets/crewRequirements.ts`](../src/lib/call-sheets/crewRequirements.ts) (`getCallSheetCrewRequirements`):

- Includes crew (non-cast people) who have a booking on that shoot day.
- Grouped by **canonical department** from the effective crew hierarchy ([`getEffectiveCrewHierarchyOrDefault`](../src/lib/people/crewHierarchyResolver.ts)); unknown departments bucket to `"Other"`.
- Within each department: **HOD first** (role matches resolved HOD for that department), then hierarchy role order, then name.

**Schedule rows** — built from `unitStrips`:

- Strips with `strip_type` `SHOT` or `SCENE` and a `scene_id` are normalized to PDF strip type **`SCENE`**, pulling `scene_number`, title/heading, `int_ext`, `day_night`, `page_eighths` from the scene, and optional `shot_number` from the linked shot.
- Other strips keep their `strip_type` (`MOVE`, `CALL`, `LUNCH`, `WRAP`, `NOTE`, etc.) with `title` / `description` from the strip. A lone `SHOT` without scene follows the “non-scene” branch with `strip_type` coerced to `SCENE` in the object literal (see page source) for PDF typing.

**Locations on PDF:** Unique `location_id`s from scheduled scenes on this unit → rows from `listLocationsByProduction`. **`notes` on locations are mapped into `CallSheetLocation` but are not drawn in the PDF** (only name, address, what3words).

**Meals:** Parsed from `shoot_days.meal_times_json` (array of `{ name?, time? }`). If empty, the builder supplies a single default `{ name: 'Lunch', time: '13:00' }`.

### Field mapping (shoot day / unit → `CallSheetData`)

| `CallSheetData` field | Source |
|----------------------|--------|
| `productionName` | `productions.name` |
| `shootDate` | `shoot_days.shoot_date` (ISO string as stored) |
| `unitName` | Unit name from `units` via selected `shoot_day_unit`, else `"Main Unit"` |
| `dayNumber` | `shoot_days.day_number` |
| `callTime` / `wrapTime` | `shoot_days.call_time` / `wrap_time` |
| `dayNotes` | `shoot_days.notes` |
| `unitNotes` | `shoot_day_units.notes` |
| `keyContacts` | `key_contacts` rows (department, name, phone, email, notes — **notes not printed on PDF**) |
| `hospitalName` / `hospitalAddress` | `shoot_days` |
| `policeStationName` / `policeStationAddress` | `shoot_days` |
| `parkingBaseAddress` | `shoot_days.parking_base_address` |
| `mealTimes` | Parsed `meal_times_json` or default lunch |
| `specialNotes` | `shoot_days.special_notes` |
| `weatherSummary` | Always `null` in `buildCallSheetData`; see below |
| `schedule` | Derived strips (see above) |
| `castCalled` | `getCastCalledNames(castRows)` (names only; redundant when `castCalledRows` present) |
| `castCalledRows` | Full rows from `getCallSheetCastRequirements` |
| `crewGroups` | `getCallSheetCrewRequirements` |
| `locations` | Locations for scenes scheduled on this unit |

---

## Weather

On **Preview PDF**, **Save PDF**, and **Save & Open**, the mutation:

1. Builds `locationQuery` from the **first** location in `locationsForDay`: `name + ", " + address` (whichever exist).
2. Calls `getWeatherSummaryForCallSheet(locationQuery, shoot_date)` (Open-Meteo geocode + forecast for that calendar day).
3. On failure or empty query, uses `fallbackWeather`: the **Weather (manual fallback)** input, which is initialised from parsed `shoot_days.weather_json` (`summary` / `high` / `low`) when present.
4. Merges `{ ...baseData, weatherSummary: finalWeather }` then calls `generateCallSheetPdf`.

**Distributed export** ([`exportDistributedCallSheets`](../src/features/call-sheets/exportDistributedCallSheets.ts)) calls `generateCallSheetPdf(baseData)` **without** this step, so **`weatherSummary` stays null** and the PDF summary line shows an em dash for weather unless you change that flow.

---

## PDF generation (`generateCallSheetPdf`)

**Library:** `pdf-lib`. **Fonts:** standard Helvetica / HelveticaBold only.

**Page geometry:**

- Size: **612 × 792** (US Letter points).
- **Margin:** 54 pt on left; content starts at `y = PAGE_HEIGHT - MARGIN` and works **downward** (PDF coordinates).
- **Footer safe band:** Drawing stops above `Y_MIN = MARGIN + 40`; the generator does not run full pagination for overflowing **tables** — `drawTable` **stops adding rows** when `y.current < Y_MIN`, so excess schedule/cast/crew rows are **silently truncated** on that page.

**Continuation pages:** `addPageIfNeeded` adds a new page when vertical space before a major block is insufficient. New pages get a grey header: `CALL SHEET – {shootDate} (cont'd)`.

### Section order and layout

1. **Header / masthead**  
   - Title: `CALL SHEET` (bold, 20 pt).  
   - Production name (bold, 14 pt).  
   - One line: `{shootDate} • {unitName}[ • Day {dayNumber}]` (body 9 pt, truncated to 95 chars).  
   - Optional lines: `Crew call: {callTime}`, `Wrap (est.): {wrapTime}`.

2. **Key day summary band**  
   - Horizontal rule.  
   - Single line (8 pt): pipe-separated `Call {time}` (if present), `shootDate`, `unitName`, `weatherSummary` or `—`, hospital label or `—`. **Truncated to 120 characters** total.

3. **Locations & safety** (skipped only if no locations, parking, hospital, or police fields)  
   - Section title: `Locations & safety`.  
   - **Set:** For each location: `name — address` (indented 8 pt); optional grey line `what3words: …`.  
   - **Parking / base:** `parkingBaseAddress`.  
   - **Hospital** / **Police / emergency:** name and address lines.  
   - Location **`notes` are not rendered.**

4. **Today’s scenes**  
   - Table helper `drawTable`: top and header rules; columns **Scene** (70), **Title / description** (220), **I/E** (36), **D/N** (36), **Pgs** (40) — widths are in pt; cell text truncated by a `maxChars(width)` heuristic (~5.5 pt per char at 8 pt font).  
   - **SCENE** strips: `Scene {n}[ – {shot}]`, title from scene, int/ext, day/night, `{page_eighths}/8` or `—`.  
   - **Non-SCENE** strips: first column = strip type string; second column = joined type/title/description; other columns `—`.

5. **Cast called**  
   - Table columns: **#** (28), **Name** (120), **Phone** (100), **Agent / contact** (200).  
   - If `castCalledRows` is present: one row per cast member with cast number, name, phone, agent name/phone.  
   - **Fallback:** if only `castCalled` names exist, the code maps each name to `[name, '—', '—', '—']` — **four strings for four columns, but the first column is the name, not the cast number** (legacy path; normal flow always supplies `castCalledRows` from the page).

6. **Crew**  
   - For each `crewGroups` entry with rows: optional rule between departments (not before first).  
   - Department name as a plain bold line (not a table header).  
   - Then `drawTable` with **Name** (140), **Role** (160), **Phone** (120); role appends ` (HOD)` when `is_hod`.

7. **Key crew / contacts**  
   - Single table: **Department** (100), **Name** (110), **Phone** (95), **Email** (150).  
   - Key contact **`notes` are not rendered.**

8. **Meal times**  
   - `drawSection`: title + one line per meal `"{name}: {time}"` (95-char line truncation per line).

9. **Notes**  
   - Consolidated block: optional lines `Day: …`, `Unit: …`, `Special: …` from `dayNotes`, `unitNotes`, `specialNotes`.

10. **Advance schedule**  
    - Section title + placeholder `—` in grey (fixed placeholder, no data).

11. **Footer** (last page only in practice — drawn at **y = 36**)  
    - `Generated: {new Date().toLocaleString()}` in grey, 8 pt.

### Table rendering details

- Header row uses bold 8 pt; body 8 pt.  
- Row height ~10 pt; section spacing constants (`LINE_BODY`, `SEP_SECTION`, etc.) are defined at the top of [`callSheet.ts`](../src/lib/pdf/callSheet.ts).  
- No vertical borders; only horizontal rules above header and below header row.

---

## Distribution export

[`exportDistributedCallSheets`](../src/features/call-sheets/exportDistributedCallSheets.ts):

1. User picks a directory.  
2. Generates **one** base PDF via `generateCallSheetPdf(baseData)`.  
3. For each selected recipient, loads the PDF, applies [`applyRecipientNameWatermarkToPDF`](../src/lib/pdf/applyRecipientNameWatermarkToPDF.ts) (diagonal grey name on every page), writes `call-sheet-{shootDate}-{unit}-{recipient}.pdf` with uniqueness suffixes if needed.

Recipients are cast rows plus crew rows from the same preview logic as the page (deduped by id).

---

## Persistence and demo seed

- DB table **`call_sheets`** (see migrations) stores optional overrides / generated document linkage; **the current Call Sheets page flow does not document tying generated PDFs back through that table** in the path described above — saving uses a file dialog and filename pattern `call-sheet-{shoot_date}-{unitId or 'main'}.pdf`.  
- Demo production seed generates a sample PDF via the same `generateCallSheetPdf` ([`demoProductionSeed.ts`](../src/lib/db/seed/demoProductionSeed.ts), `buildCallSheetDataForSeed`).

---

## Refactor checklist (suggested)

- **Pagination:** Replace “truncate table when `y < Y_MIN`” with true multi-page tables or row splitting.  
- **Weather on distributed PDFs:** Decide whether to merge the same Open-Meteo + fallback step before bulk export.  
- **Unused / unprinted fields:** `CallSheetLocation.notes`, `CallSheetKeyContact.notes`, and legacy `castCalled`-only PDF path.  
- **Typography:** All Helvetica; no embedded production fonts or branding.  
- **Letter vs A4:** Hard-coded 612×792.  
- **Remove or isolate** legacy `generateCallSheet` in `src/lib/pdf/index.ts` to avoid confusion.
