# People: Cast, Bookings and Day Out of Days

Cast and crew records for a production, who is booked on which shoot day, and the Day Out of Days (DooD) matrix. UI: **People → Cast Manager** (`/people/cast-manager`), **Bookings** (`/people/bookings`), **Day Out of Days** (`/people/day-out-of-days`), plus detail pages. Crew has its own doc: [crew-manager.md](crew-manager.md).

## Code map
| Area | Location |
|---|---|
| Routes | `src/app/router.tsx`, sidebar in `src/app/navigation.ts` |
| Pages | `src/features/people/pages/` (`CastManagerPage`, `CastDetailPage`, `CrewDetailPage`, `BookingsPage`, `DayOutOfDaysPage`) |
| Forms/dialogs | `src/features/people/components/` (`CastForm`, `PersonUnavailabilityDialog`, `PhaseTagsInput`, `PersonDeleteConfirmDialog`) |
| Bookings views | `src/features/people/components/bookings/`, span/colour/appearance helpers in `src/features/people/lib/` |
| Logic | `src/lib/people/bookingIntelligence.ts`, `bookingsSummary.ts`, `productionPhases.ts` |
| Repositories | `src/lib/db/repositories/{person,booking,cast-availability,crew-availability,scene-cast,shot-cast,stripboard-strips}.ts` |
| DooD PDF | `src/lib/pdf/dood.ts` |
| Contact validation | `src/lib/contacts/contactFieldValidation.ts` |
| Tables | `people`, `bookings` (0001, rebuilt in 0004), `scene_cast`, `cast_availability` (0002, 0004), `shot_cast` (0041), `crew_availability` (0074, 0103); person columns added in 0040, 0042, 0086 |
| Tests | `src/lib/people/*.test.ts`, `src/features/people/**/*.test.*`, `src/lib/db/repositories/person.delete.test.ts` |

## Data model
- `people` is one table for cast and crew, scoped by `production_id`. `is_cast` (integer 0/1) separates them; `listCast` / `listCrew` filter on it, and `ensurePeopleIsCastNormalized` repairs legacy boolean values on SQLite. Cast fields: `cast_number`, `role_name` (character), `agent_name/email/phone`. Crew fields: `department`, `role_name`. Shared: `email`, `phone`, `phases`, `notes`, `contributor_form_status` (`not_requested | requested | signed | expired`).
- `name_sort_key` is a blind index for ordering when field encryption is on. `PERSON_PROTECTED_FIELDS` (`src/lib/security/sensitiveEntityFieldCrypto.ts`) lists the encrypted columns: name, email, phone, department, notes, cast number, agent fields, role. See [../security.md](../security.md).
- `scene_cast(scene_id, person_id)`: who is in a scene. `shot_cast(shot_id, person_id)`, unique per shot and person: who is in a shot. Adding someone to a shot also adds them to the parent scene (restoring soft-deleted rows).
- `bookings`: `person_id`, `shoot_day_id` (nullable, `ON DELETE SET NULL`), `start_date`, `end_date`, `role`, `notes`. One row per person per shoot day; the Bookings page groups consecutive days into spans for display only (`bookingSpans.ts`).
- `cast_availability` / `crew_availability`: date windows with `availability` of `AVAILABLE | UNAVAILABLE | TENTATIVE`. The UI only creates UNAVAILABLE windows. Both cascade on production or person delete.
- Everything soft-deletes (`deleted_at`). `deletePerson` soft-deletes the person's `scene_cast`, `shot_cast`, both availability tables, `bookings` and `floats` rows in one transaction.

## How it works
### Cast Manager and detail
Cast-only table with search (name, role, cast number, agent), a contributor-form filter and a missing-data filter (role, cast number, agent, has unavailability). Creating always sets `is_cast = 1`. `/people/:personId` is the cast detail page (bookings, unavailable dates, scene and shot participation, DooD summary, recent activity); it redirects crew to `/people/crew/:personId`. `/people` and `/people/cast` redirect to Cast Manager. Route order matters: `people/crew/:personId` is declared before `people/:personId`.

### Day Out of Days
Computed in the browser by `DayOutOfDaysPage`, never stored. Rows are all cast; columns are the production's shoot dates, sorted.
1. `getScheduledSceneIdsByShootDay`: for each shoot day, the distinct `scene_id`s of its stripboard strips (all units).
2. `getCastIdsBySceneIds` maps those scenes to people through `scene_cast`. A person **works** on a date if they are cast in any scene stripped onto that day.
3. Per person: `start` and `finish` are their first and last work dates.
4. Cell status per date:

| Status | Rule |
|---|---|
| CLASH | works that day and a `cast_availability` UNAVAILABLE window covers the date (`isUnavailableOnDate`) |
| WORK | works that day |
| HOLD | not working, but between `start` and `finish` |
| OFF | otherwise |

Bookings and `shot_cast` do not feed DooD. `crew_availability` is not used either (DooD is cast-only). The CSV and PDF exports honour the search and "Only with clashes" filters, save a copy through `persistProductionDocument` (so it appears in Documents) and then offer a save dialog. `CastDetailPage` repeats the same work-date logic for its single-person summary; keep the two in step.

### Bookings and booking intelligence
`BookingsPage` offers a Calendar and a Timeline view (view, lanes per week and colours persist per production in `localStorage`, see `bookingAppearance.ts`), filters by unit, department and cast/crew, and drag to move or resize spans. `getBookingCoverageByShootDay` (advisory, read-only) compares need with bookings per day:
- Needed on a day: if the day has scheduled shots, people in `shot_cast` for those shots; otherwise people in `scene_cast` for the scheduled scenes.
- Result sets per day: needed but not booked, booked but not needed, properly booked. `getPersonBookingNeedSummary` gives the per-person totals used on the detail page.

`getPersonBookingsSummary` (booked-day count and range) feeds the labour editor in Budget.

### Contact validation
`CastForm`, `CrewForm`, `PersonForm`, the crew wizard and vendor forms share `contactFieldValidation.ts`: email must match `local@domain.tld`; phone may contain only digits and a leading `+`, at most 17 digits. Both are optional (empty is valid). Zod helpers: `optionalContactEmailField`, `optionalContactPhoneField`.

### Phases
`people.phases` is a comma-separated list. Presets (Development, Prep, Shoot, Wrap, Post) and aliases are normalised by `productionPhases.ts`; custom phases are kept as typed.

## Connections
- **Call sheets** read cast through `scene_cast` and crew through bookings ([call-sheets.md](call-sheets.md), `src/lib/call-sheets/castRequirements.ts`, `bookingCallTimes.ts`). Booking `start_date`/`end_date` only produce a call time when they hold an ISO datetime.
- **Budget** labour lines reference `person_id` and use `getPersonBookingsSummary`. **Overtime** (experimental, [overtime.md](overtime.md)) reads people, bookings and shoot days.
- **Duplicate production** copies `people`, `scene_cast`, `shot_cast`, `cast_availability` and `crew_availability`; it does not copy `bookings`.
- **Access control**: pages use `*ForActor` wrappers in `src/lib/access/projectDomainService.ts` when a signed-in user exists (server/collaboration mode), otherwise call the repositories directly. Note that `DayOutOfDaysPage` and `BookingsPage` choose per query.

## Gotchas
- Changing how work days are derived means changing both `DayOutOfDaysPage` and `CastDetailPage`.
- `getScheduledSceneIdsByShootDay` takes every non-deleted strip on the day; its doc comment says SCHEDULED but the query does not filter on `strip_status`.
- `cast_availability` has an `AVAILABLE`/`TENTATIVE` status in the type, but only UNAVAILABLE affects DooD.
- Reading people requires sensitive-data access when client encryption is on (`requireSensitiveDataAccess`); locked databases return nothing useful.
