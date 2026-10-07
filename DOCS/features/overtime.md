# Overtime

Experimental estimate of what running over costs, per shoot day and crew member: **Overtime** (`/people/overtime`). Hidden unless "Show experimental features" is on; see [settings.md](settings.md). It reads the unit call and wrap from the [Script Supervisor](script-supervisor.md) day log.

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/people/overtime/`](../../src/features/people/overtime): `OvertimePage.tsx`, `OvertimeRuleDialog.tsx`, `TimeField.tsx` |
| Logic | [`src/lib/overtime/overtime.ts`](../../src/lib/overtime/overtime.ts): pure and tested (`computeCrewDay`, `computeOvertimeDay`, `crewForDay`, `pickDayRates`, `restMinutes`) |
| Repository | [`src/lib/db/repositories/overtime.ts`](../../src/lib/db/repositories/overtime.ts) |
| Tables | `production_crew_hours_settings`, `crew_day_hours`, `crew_hours_person_settings` (migration `0102`; the `crew_hours` names predate the "Overtime" label) |
| Tests | `src/lib/overtime/overtime.test.ts`, `src/lib/db/overtime.test.ts` |

## Data model

| Table | Notes |
|---|---|
| `production_crew_hours_settings` | One row per production (absent = defaults): `overtime_basis` (`scheduled_wrap` or `day_length`), `standard_day_minutes` (660), `hourly_rate_divisor` (10), `overtime_multiplier` (1.5), `overtime_increment_minutes` (30; 0 = exact), `minimum_rest_minutes` (660). Edited in `OvertimeRuleDialog` |
| `crew_day_hours` | Exceptions only: a person's own `call_time`/`wrap_time` (`HH:MM`) for a shoot day. Unique per live (day, person). Clearing both times removes the row |
| `crew_hours_person_settings` | `overtime_exempt` per person (buyout) |

## How it works

- **Who is listed.** Crew (not cast, `is_cast` is not 1) booked on the day, by `shoot_day_id` or a date range covering it, plus anyone with own hours that day (`crewForDay`).
- **Unit times.** Actual unit call and wrap are `call_time`/`wrap_time` of `script_supervisor_day_logs` (shared with the Daily Progress Report). Until a wrap is logged, the planned `shoot_days.wrap_time` is used and the page labels figures as projected. Edits on the page write the day log via `saveDayLog`.
- **Overtime starts** at the planned wrap (`scheduled_wrap`) or at call plus `standard_day_minutes` (`day_length`). Hourly rate is day rate divided by `hourly_rate_divisor`; an overtime hour is hourly times `overtime_multiplier`, billed per started `overtime_increment_minutes` block.
- **Day rates** come from labour line items in the working budget revision (`listLabourDayRates`, `pickDayRates`): a `shoot_day` line wins, then untyped, then `prep_day`; `overtime` lines are ignored. People without a rate are shown as "No day rate" and never costed as zero.
- **Buyouts** (`overtime_exempt`) are shown as Buyout and not costed.
- **Rest** is measured from a person's wrap to the next shoot day's call (own, else unit actual, else planned); under the minimum is flagged. A wrap earlier than the call means after midnight, so night shoots need no date field.

## Connections

- Reads Bookings, People, shoot days, budget labour lines ([budget.md](budget.md)) and the Script Supervisor day log.
- Does not write budget expenses; it is an estimate only.

## Gotchas

- Local SQLite only: repository functions throw `OVERTIME_REMOTE_ERROR` for `remote_server` productions. These tables are not in the `.apf` export or Duplicate production, and have no Postgres counterpart.
- Cast (Equity) overtime and meal penalties are not modelled.
