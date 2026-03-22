# Call sheets — developer reference

How call sheet PDFs are assembled and laid out: entry points, data sources, page structure, and pagination. Production PDFs use **`generateCallSheetPdf`** in [`src/lib/pdf/callSheet.ts`](../src/lib/pdf/callSheet.ts) (`pdf-lib`).

[`src/lib/pdf/index.ts`](../src/lib/pdf/index.ts) exports an older `generateCallSheet` with a different shape — **do not use that** for the in-app Call Sheets flow.

---

## Entry points

| Flow | Location |
|------|----------|
| Primary UI | [`src/features/call-sheets/page.tsx`](../src/features/call-sheets/page.tsx) |
| PDF engine | [`src/lib/pdf/callSheet.ts`](../src/lib/pdf/callSheet.ts) — `generateCallSheetPdf` |
| Bulk export + watermark | [`src/features/call-sheets/exportDistributedCallSheets.ts`](../src/features/call-sheets/exportDistributedCallSheets.ts) |
| Weather (preview / save) | [`src/lib/weather/openMeteo.ts`](../src/lib/weather/openMeteo.ts) — `getWeatherSummaryForCallSheet` |

The calendar **Day Summary** drawer still has a placeholder “Generate Call Sheet” action ([`src/features/schedule/calendar-page.tsx`](../src/features/schedule/calendar-page.tsx)); it does not call this pipeline.

---

## Data assembly (`CallSheetsPage`)

`buildCallSheetData` is a `useMemo` in the Call Sheets page. It returns `CallSheetData | null` when production, shoot day, and a **shoot day unit** are selected. It leaves **`weatherSummary` null**; the generate mutation fills that after Open-Meteo (see [Weather](#weather)).

### Queries (TanStack Query)

- **Production** → `productionName`
- **Shoot day** → dates, call/wrap, safety, notes, **`meal_times_json`** (meals only when this JSON has entries), weather fields
- **Shoot day units + units** → `unitName`, `unitNotes`
- **Stripboard** → strips for the selected unit, `sort_index` order
- **Scenes / shots** → schedule row metadata and cast resolution
- **Locations** → only those used by scenes scheduled on this unit
- **Key contacts** → departmental / H&S blocks and primary contacts
- **Bookings** → cast/crew eligibility for the shoot day (whole day, not per unit)
- **Cast / crew rosters** + **scene_cast / shot_cast** → principal cast and departmental crew

### Derived behaviour

- **Principal cast** — [`getCallSheetCastRequirements`](../src/lib/call-sheets/castRequirements.ts): required from shot-level or scene-level casting vs scheduled material; PDF shows **required ∩ booked**; UI warns on gaps.
- **Crew (departmental)** — [`getCallSheetCrewRequirements`](../src/lib/call-sheets/crewRequirements.ts): booked non-cast crew grouped by canonical department; HOD first, then hierarchy order, then name.
- **Schedule rows** — [`buildCallSheetStripFromStripboard`](../src/lib/call-sheets/scheduleStripRow.ts): stripboard-driven **LOC**, **EP/SC**, synopsis, **D/N**, **PGS**, compact **CAST**, notes; **IF TIME PERMITS** strips grouped after the main block in both the main schedule and the advanced schedule.
- **Primary contacts (page 1)** — [`selectPrimaryCallSheetContacts`](../src/lib/call-sheets/primaryContacts.ts): AD / coordinator / office-style rows for the right column under **Essential times & primary contacts**; email only where [`primaryContactShowsEmail`](../src/lib/call-sheets/primaryContacts.ts) applies.
- **Meals** — parsed from `shoot_days.meal_times_json` only. **No default lunch** is injected when the array is empty.
- **Advanced schedule** — [`buildAdvancedScheduleForCallSheet`](../src/lib/call-sheets/advancedSchedule.ts): up to two shoot days after the current day (same unit on the stripboard when possible), compact strip table, **IF TIME PERMITS** mirroring the main schedule.
- **`radioChannels` / `transportRows`** — supported on `CallSheetData` for the PDF. The Call Sheets page **does not populate** them from the DB/UI yet; they are omitted so **RADIO CHANNELS** and **TRANSPORT REQUIREMENTS** do not appear unless another caller sets real rows.

---

## Weather

On **Preview PDF**, **Save PDF**, and **Save & Open**:

1. Build `locationQuery` from the first scheduled location (name + address).
2. Call `getWeatherSummaryForCallSheet(locationQuery, shoot_date)`.
3. On failure or empty query, use **Weather (manual fallback)** (and/or parsed stored summary from `weather_json`).
4. Merge `{ ...baseData, weatherSummary: finalWeather }` then `generateCallSheetPdf`.

**Distributed export** calls `generateCallSheetPdf(baseData)` **without** that step unless extended; **`weatherSummary` stays null** there; **Environment & safety** still uses manual/stored weather and other fields when present.

---

## PDF layout (`generateCallSheetPdf`)

**Fonts:** Helvetica / HelveticaBold only. **Page:** US Letter **612 × 792** pt. **Margins:** 54 pt. **`Y_MIN`:** margin + footer reserve (~52 pt) so body text stays above the confidentiality band.

### Header policy (intentional)

- **Page 1** opens with the **full masthead** (production identity): **CALL SHEET** + formatted shoot date, production name, **Day n · Unit: …**. **Unit call and wrap are not repeated in the masthead** — they appear once under **Essential times & primary contacts** (together with meal-derived breakfast/lunch lines when data exists).
- **Every continuation page** (page breaks inside page 1 sections, schedule/cast continuations, operational support, advanced schedule) uses the **running header**: **CALL SHEET** or **CALL SHEET (cont'd)**, production name, formatted date, horizontal rule. **The masthead is not duplicated on page 1** to avoid a cluttered double header.

### Footer (every page)

Wrapped **confidentiality** text in small grey: production name (if any) + fixed legal core (`CONFIDENTIAL_FOOTER_CORE` in code). **Last page only:** a **Generated:** timestamp above that block.

---

## Page and section order

### Page 1 (single flow until a break forces a new page)

1. **Masthead / production identity** — as above; no unit call / wrap line here.
2. **Essential times & primary contacts** — left: **Date**, **Unit call**, **Wrap (est.)**, **Breakfast** / **Lunch** only when matched from real `mealTimes` (from `meal_times_json`). Right: **Primary contacts** (subset of key contacts).
3. **Environment & safety** — omitted if nothing to show. Forecast, stored weather keys, manual weather, day/unit/special notes, hospital, police/emergency.
4. **Base & locations** — unit base / crew parking; shooting locations with optional what3words and notes.
5. **Shooting schedule** — stripboard-driven grid: **LOC**, **EP/SC**, **SET / SYNOPSIS**, **D/N**, **PGS**, **CAST**, **NOTES**; special strips (e.g. **MOVE**, **CALL**, **LUNCH**, **WRAP**, **NOTE**) as grey band rows; **IF TIME PERMITS** subsection when needed. Continuation pages repeat the running header + **SHOOTING SCHEDULE (cont'd)** + column headers.
6. **Principal cast calls** — dynamic columns (**ID**, **CAST**, and optional **CHARACTER**, **ON SET**, **PHONE**, **NOTES**, **AGENT** when any row has data). Continuations repeat heading and header row.

### Operational support (starts on a **new page** when `hasOperationalSupportLayer`)

Shown only if there is departmental content, H&S/stunts content, **non-empty meal rows** (name + time), **radio** rows, or **transport** rows.

1. **DEPARTMENTAL REQUIREMENTS** — per general department: department title, key contact lines, compact **Name / Role / Phone** crew table. Long blocks **paginate**: new page → running header + **Operational support** subtitle + **DEPARTMENTAL REQUIREMENTS (cont'd)** + repeated department banner + continued rows (no silent truncation).
2. **HEALTH, SAFETY & STUNTS** — same pattern for stunt / medical / safety / fire / risk-style departments; same pagination rules.
3. **CATERING / MEALS** — **Meal** / **Time** table for rows with non-empty name and time from `mealTimes` only (no facilities subsection — there is no separate facilities field in the model).
4. **RADIO CHANNELS** — one line per `{ channel, purpose }` when `radioChannels` is set and non-empty (currently not populated by the main UI pipeline).
5. **TRANSPORT REQUIREMENTS** — sparse table over **Driver**, **Pickup**, **Passenger**, **From**, **To**, **Arrival** when `transportRows` is set (currently not populated by the main UI pipeline).

### Later pages — **ADVANCED SCHEDULE**

When `advancedScheduleDays` is non-empty: for each forward day, day meta (date, day number, unit call, base, locations summary), compact schedule table (**CAST** column only if any row has cast text), **IF TIME PERMITS** as needed. Continuations use the running header + **ADVANCED SCHEDULE (cont'd)** and repeated day/table headers as implemented in code.

---

## Field mapping snapshot

| `CallSheetData` | Source (typical) |
|-----------------|------------------|
| `mealTimes` | `meal_times_json` only; may be `[]` |
| `callTime` / `wrapTime` | `shoot_days`; shown under Essential times, not masthead |
| `radioChannels` / `transportRows` | Optional; unset in default UI assembly |
| `weatherSummary` | Set only in generate mutation / external callers |

---

## Distribution export

[`exportDistributedCallSheets`](../src/features/call-sheets/exportDistributedCallSheets.ts): one base PDF from `generateCallSheetPdf`, then per recipient watermark and file naming. Recipients mirror the page’s cast + crew preview (deduped by id).

---

## Demo seed

[`demoProductionSeed.ts`](../src/lib/db/seed/demoProductionSeed.ts) builds sample `CallSheetData` via `buildCallSheetDataForSeed` and uses **`meal_times_json`** from the seeded shoot day (empty → no catering table from fabricated lunch).

---

## Related cleanups elsewhere

- **Legacy `generateCallSheet`** in `src/lib/pdf/index.ts` remains a separate code path; production call sheets use `callSheet.ts` only.
