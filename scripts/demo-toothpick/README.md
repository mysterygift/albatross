# Toothpick (Manchester) demo project

Generates `demo/Toothpick-Manchester-Demo.apf`, a content-rich demo project (`.apf` in the app's current format) based on the short script
**Toothpick** by Aran Davies (V1, 04/12/2025), shot in Manchester. It is built to exercise the Script Supervisor, but also
covers schedule, people, finance, equipment, safety paperwork, music and deliverables.

## Use it

Import `demo/Toothpick-Manchester-Demo.apf` from **Productions → Import project** (or open it from Files / AirDrop on iOS).
The project opens with a **Demo guide** PDF in Documents that explains what's in it and where to start.

## Regenerate

```bash
npx vitest run --config scripts/demo-toothpick/vitest.config.ts scripts/demo-toothpick/build.gen.ts    # writes demo/*.apf
npx vitest run --config scripts/demo-toothpick/vitest.config.ts scripts/demo-toothpick/verify.gen.ts   # imports it into a fresh DB and checks it
```

Run `build` first, then `verify` (vitest does not guarantee file order when both are run together). Output is
reproducible apart from the manifest's `exportedAt`: ids are deterministic.

Nothing here touches app code. The generator runs the app's own modules under test-style shims (`lib/mocks.ts`): an in-memory
SQLite database built from the real migrations, the app's PDF parser, `generateScriptVersionFromScenes`,
`exportProductionAsApf` and, in `verify`, `importProductionFromApf` plus the Script Supervisor, calendar, Day Out of Days,
sides and RAMS queries.

## Layout

| Path | What |
| --- | --- |
| `data/` | Source data: scenes (parser output + reviewed fixes), locations, people, vendors, finance, shots, schedule, ops, floor plans |
| `build/` | Turns the data into `.apf` table rows (`core`, `finance`, `ops`, `floorPlans`) and the in-project guide PDF |
| `lib/` | Helpers: deterministic ids, dates and sunrise/sunset, sql.js DB, PDF writer, script layout classifier, test shims |
| `assets/Toothpick-V1.pdf` | The script. Bundled into the project as a document and used as the parser input |
| `build.gen.ts`, `verify.gen.ts` | Entry points (`*.gen.ts` so they stay out of the app's own `npm test`) |

## What's in it

- **Script:** 18 scenes, 26 pages, script version `V1` with generated pages, 284 sections, section characters linked to cast,
  and a coverage link from each of 108 planned shots to the sections it covers. UK slating is set explicitly.
- **Schedule:** 7 shoot days (Mon 2 – Tue 10 Nov 2026), Main Unit plus a Second Unit on days 2 and 7, shot-level stripboard with
  calls, company moves, meals, wraps and notes; sunrise/sunset computed for Manchester; real hospital and police fields.
- **Locations:** 13, real public venues with verified addresses (Platt Fields Park, Peveril of the Peak, The Koffee Pot, SOUP,
  Sandbar, Albert Hall, Benzie Building) and area-level addresses for private homes.
- **People:** 17 cast (principals, day players, montage, supporting artists) and 51 crew with availability, bookings, prep and post.
  A Script Supervisor role is added through the project crew hierarchy.
- **Finance:** 33 vendors, a typed budget (labour/rental/purchase/deposit/allow), 19 purchase orders and 38 invoices that reconcile
  to expenses, floats with receipts, VAT tracking, fringe and contingency.
- **Floor plans (experimental):** 13 plans with 49 setups (`data/floorPlans.ts`, built by `build/floorPlans.ts`). Set plans for
  nine locations with cameras, cast and catalogue kit placed for key shots (dollies on track, gimbal, sliders, HMIs, LED panels,
  tubes, flags, frames, bounce, a cherry picker), and four unit base layouts (Wilmslow Road and Church Street car parks, the bus
  yard, the pub's loading lane). Plans at locations with a published coordinate carry it, so the sun path works. Interiors are
  plausible layouts drawn from the scene notes, not surveys. Every kit id, shot and cast member is checked against the data.
- **Also:** equipment with pack lists, risk assessments for each day, music clearances, deliverables, tasks, key contacts.
- **Not included by design:** slates, takes and tramlines, so testing starts from a clean log.

## Known parser issue worked around here

For this A4 script the app's PDF parser (`src/lib/script-parser/pdf-parser.ts`) labels every body line `dialogue`: it anchors the
action margin on the scene-heading line's x position, which here is the left scene-number gutter (x≈51pt) rather than the action
column (x≈101pt). Script elements for the Supervisor would collapse to ~3 per scene. `lib/scriptLayout.ts` re-classifies the lines
from their actual columns and numbers pages as printed; scene metadata still comes from the parser.
