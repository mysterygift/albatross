# Risk assessments (RAMS) — developer reference

Film crews need a risk assessment per shoot day. **Plan → Risk Assessments** (`/risk-assessments`) lets a production create, edit, sign off, duplicate, export and delete RAMS. A day whose RAMS is missing or not signed off is flagged when exporting the call sheet.

Scope of the first pass: SQLite, `.apf` export/import and production duplication. **Not done yet** (each a small follow-up): Postgres migration + baseline, `PUBLISH_TABLE_ORDER` / sync-v2 wiring, access-control resolvers (`*ForActor`), field-level PII encryption (first-aider names / phones / emails are plain text), native menu items and command palette entries, and a dashboard "RAMS awaiting sign-off" widget. `src/test/postgres/postgresSchemaParity.test.ts` already fails on the Postgres baseline drift (see `docs/ui-refactor/BASELINE-failing-tests.txt`); these tables widen that gap until the Postgres work lands.

---

## Risk matrix

`factor = severity × probability`, both 1–5. Bands are by factor value:

| Band | Factor | Colour |
|------|--------|--------|
| Tolerable | 1–6 | green `#1FA34A`, white text |
| Moderate | 8–10 (9 included) | amber `#FFB400`, text `#2B1B00` |
| Severe | 12–25 | red `#E02B20`, white text |

The colours are fixed (not theme tokens) so a band reads the same in every theme and in the PDF. They live once in `RISK_BAND_COLORS` ([`src/lib/risk-assessments/riskMatrix.ts`](../src/lib/risk-assessments/riskMatrix.ts)), which also has `riskFactor`, `riskBand` and `formatRiskFactor` (`12 | Severe`). **The factor is never stored**; it is always computed.

---

## Data model

SQLite migration [`0092_risk_assessments.sql`](../src-tauri/migrations/0092_risk_assessments.sql), registered as version 92 in `src-tauri/src/lib.rs`. Types are in [`src/lib/db/types.ts`](../src/lib/db/types.ts) (`RiskAssessment`, `RiskAssessmentHazard`, `HazardTemplate`, …).

| Table | Purpose |
|-------|---------|
| `risk_assessments` | Header: shoot day, location (picker id + free-text name), activities, responsible person (id + name), `first_aiders_json`, hospital / police name, address, phone, `status` (`draft` \| `approved`), `approved_by`, `approved_at`, `generated_document_id` (latest exported PDF; `ON DELETE SET NULL`). |
| `risk_assessment_units` | Which `shoot_day_units` a RAMS covers (one or both). Unique per RAMS + unit. A "distinct" RAMS is just a second RAMS covering the other unit. |
| `risk_assessment_hazards` | Ordered hazards: name, description, risks, outcomes, control measures (multi-line, one item per line), `at_risk_crew/cast/public`, and the four ratings (`severity_before`, `probability_before`, `severity_after`, `probability_after`, each `CHECK 1..5`). |
| `hazard_templates` | Project-scoped reusable hazards, `UNIQUE(production_id, name)`. Hard-deleted so a name can be reused. |

Built-in templates are code, not data: [`builtInHazards.ts`](../src/lib/risk-assessments/builtInHazards.ts) (starting with *Manual Handling*: crew at risk, 4×3 before = 12 red, 2×2 after = 4 green). Add more entries to that array.

First aiders are a per-RAMS manual list (name, phone, email); **Add from crew** only prefills a row from People, nothing is linked. Hospital / police are manual fields, prefilled from the shoot day's `hospital_*` / `police_station_*` when the RAMS is created.

### Outbox

Repositories write `outbox` rows like every other repo (`risk_assessments`, `risk_assessment_units`, `risk_assessment_hazards`, `hazard_templates`). The outbox is a plain log table today and nothing consumes entities the sync registry does not know, so this is safe until sync wiring is added.

---

## Repositories

[`src/lib/db/repositories/risk-assessments.ts`](../src/lib/db/repositories/risk-assessments.ts) (follows [DATABASE_LAYER.md](DATABASE_LAYER.md): `runInSerializedTransaction` + one `executeBatch`):

| Function | Behaviour |
|----------|-----------|
| `listRiskAssessmentsByProduction` / `listRiskAssessmentsByShootDay` | Summaries with covered units, hazard count and highest residual factor. |
| `getRiskAssessment` | Full RAMS with parsed first aiders, unit ids and hazards. |
| `saveRiskAssessment` | One transaction: upsert header, replace units and hazards. Units must belong to the RAMS's shoot day. **Any content change on an approved RAMS reverts it to draft and clears approver / time**; a save that changes nothing keeps the approval (`riskAssessmentContentSignature` in [`content.ts`](../src/lib/risk-assessments/content.ts)). |
| `approveRiskAssessment(id, approvedBy)` | Needs ≥ 1 hazard and a responsible person. Records who and when. |
| `duplicateRiskAssessment(id, targetShootDayIds[])` | Copies content as drafts (no approval, no PDF link); units map by `unit_id` onto the target day's units, falling back to all of that day's units. |
| `deleteRiskAssessment` | Hard delete of the RAMS, hazards, unit links **and** its exported PDF (file + row, via `hardDeleteDocument`). |

[`hazard-templates.ts`](../src/lib/db/repositories/hazard-templates.ts): `listHazardTemplatesByProduction`, `upsertHazardTemplate` (by trimmed name; an existing template of that name is updated), `deleteHazardTemplate`.

---

## PDF and Documents

[`src/lib/pdf/riskAssessment.ts`](../src/lib/pdf/riskAssessment.ts) (`pdf-lib`, A4 landscape): status banner (red *DRAFT – NOT APPROVED* or green *Approved by X, date*; drafts also carry it in every page footer), details, safety contacts (first-aider table, hospital and police boxes), then one block per hazard — header row colour-coded by the before factor with an after-factor segment, text fields, and two 5×5 matrices with the selected cell highlighted. Long hazards flow onto following pages.

[`exportRiskAssessmentPdf`](../src/lib/risk-assessments/exportRiskAssessmentPdf.ts) renders a **saved** RAMS, stores it with `persistProductionDocument` (`entity_type = risk_assessment`, `entity_id` = shoot day id, so it groups by day like call sheets, in the *Set paperwork* category), and sets `generated_document_id` in the same transaction. A re-export replaces the previous PDF, so there is one per RAMS.

- Deleting the exported PDF from **Documents** keeps the RAMS (`ON DELETE SET NULL`).
- Deleting the RAMS in its own UI removes the PDF too.

---

## UI

`src/features/risk-assessments/`:

- `page.tsx` — list at `/risk-assessments`: sortable by shoot day and location, filters for status and unit, row actions Open / Duplicate / Export PDF / Delete (destructive confirm). *New risk assessment* picks a shoot day and units.
- `editor-page.tsx` — `/risk-assessments/:id`. Explicit **Save** (hazards are a replaced child collection, so no autosave) with an unsaved indicator and a leave-page guard. **Approve** is disabled while the form is dirty, or with no hazard or no responsible person; it opens a dialog with the approver prefilled from the signed-in user. Export PDF and Duplicate need a saved form.
- `RiskMatrix.tsx` — 5×5 `radiogroup` (probability rows, 5 at top; severity columns). Arrow keys move the selection; the factor and band are also written as text so it is not colour-only.
- `HazardCard.tsx` (collapsible, drag to reorder via `@dnd-kit`), `HazardPicker.tsx` (Blank / Built-in / Saved in this project), `FirstAidersEditor.tsx`, `DuplicateRamsDialog.tsx`, `NewRamsDialog.tsx`, `RamsStatusBadge.tsx`.

---

## Call sheet gate

[`getRamsSignOffStatus(ramsList, shootDayUnitId)`](../src/lib/risk-assessments/ramsSignOff.ts) returns `ok` (every RAMS covering the unit is approved), `unapproved` (a covering RAMS is still a draft) or `missing` (none covers the unit).

In [`src/features/call-sheets/page.tsx`](../src/features/call-sheets/page.tsx), when the status is not `ok`:

- an inline destructive `Alert` appears next to the cast-gap warnings ("RAMS not signed off" vs "No RAMS covers this unit");
- Preview PDF, Save PDF and the distribution export first ask **Export anyway?** (`useConfirm`).

It is a warning the user can override, never a hard block. An unknown status (still loading, or the query failed) never warns.

---

## Import / export and duplication

- `.apf`: the four tables are in `APF_V1_TABLE_KEYS`, exported by `exportLoadProductionData.ts` (a RAMS whose PDF document is not exported has `generated_document_id` set to `NULL` so import FKs hold). **`formatVersion` is 8**; the v7 → v8 migrator adds empty tables for older files. See [project-import-export-format-v1.md](project-import-export-format-v1.md).
- Production duplication (`duplicateProduction.ts`) copies templates, RAMS (status and approval included), unit links and hazards, remaps the shoot day / unit / location / person / PDF ids, and nulls links whose target was not copied.
- `verifyCascades` (dev tools) also checks `risk_assessments` and `hazard_templates`.

---

## Tests

`src/lib/risk-assessments/*.test.ts` (matrix bands for all 25 cells, sign-off, content helpers, day defaults), `src/lib/db/repositories/risk-assessments.test.ts` (sql.js: save/replace, approve, revert to draft, duplicate, delete incl. the PDF, export linking), `src/lib/pdf/riskAssessment.test.ts`, `src/lib/db/duplicateProduction.riskAssessments.test.ts`, the RAMS round trip in `apf-e2e-sqljs.integration.test.ts`, jsdom tests for `RiskMatrix`, the list page and the editor, and the call sheet gate in `CallSheetEpisodic.integration.test.tsx`.
