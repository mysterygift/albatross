# Risk Assessments (RAMS)

Per-shoot-day risk assessments and method statements with hazards, safety contacts, a 5x5 risk matrix, sign-off and PDF export. UI: **Risk Assessments** (`/risk-assessments`, editor at `/risk-assessments/:id`). The call sheet warns when the day's RAMS is missing or unsigned.

## Code map
| Area | Location |
|---|---|
| Pages/UI | `src/features/risk-assessments/` (`page.tsx` list, `editor-page.tsx`, `RiskMatrix.tsx`, `HazardCard.tsx`, `HazardPicker.tsx`, `FirstAidersEditor.tsx`, `NewRamsDialog.tsx`, `DuplicateRamsDialog.tsx`, `RamsStatusBadge.tsx`, `RamsSignOffAlert.tsx`, `useRamsSignOff.ts`, `ramsForm.ts`) |
| Logic | `src/lib/risk-assessments/` (`riskMatrix.ts`, `builtInHazards.ts`, `content.ts`, `ramsSignOff.ts`, `dayDefaults.ts`, `exportRiskAssessmentPdf.ts`) |
| PDF | `src/lib/pdf/riskAssessment.ts` (`pdf-lib`, landscape) |
| Repositories | `src/lib/db/repositories/risk-assessments.ts`, `hazard-templates.ts` |
| Tables | `risk_assessments`, `risk_assessment_units`, `risk_assessment_hazards`, `hazard_templates` (all migration 0092, SQLite only) |
| Tests | `src/lib/risk-assessments/*.test.ts`, `src/lib/db/repositories/risk-assessments.test.ts`, `src/lib/pdf/riskAssessment.test.ts`, `src/lib/db/duplicateProduction.riskAssessments.test.ts`, `src/features/risk-assessments/*.test.tsx` |

## Data model
| Table | Notes |
|---|---|
| `risk_assessments` | One per shoot day and unit set. Location (`location_id` plus free-text `location_name`), `activities`, responsible person (id plus name), `first_aiders_json` (array of name/phone/email), hospital and police name/address/phone, `status` (`draft | approved`), `approved_by`, `approved_at`, `generated_document_id` (latest exported PDF, `ON DELETE SET NULL`). Cascades with the shoot day. |
| `risk_assessment_units` | Which `shoot_day_units` the RAMS covers; unique per RAMS and unit. A second RAMS covering the other unit is a "distinct" RAMS. |
| `risk_assessment_hazards` | Ordered (`sort_order`): name, description, risks, outcomes, control measures (one per line), `at_risk_crew/cast/public`, and four ratings `severity_before`, `probability_before`, `severity_after`, `probability_after` (each `CHECK 1..5`). |
| `hazard_templates` | Production-scoped reusable hazards, `UNIQUE(production_id, name)`, hard-deleted. |

The risk factor is never stored: `factor = severity x probability`, banded by `riskBand` in `riskMatrix.ts` (1-6 Tolerable, 8-10 Moderate, 12-25 Severe). Band colours are fixed constants (`RISK_BAND_COLORS`), not theme tokens, so the PDF and every theme agree. Built-in hazards are code (`builtInHazards.ts`), not rows; add entries to that array (`builtInHazards.test.ts` checks them). First aiders are a manual list; **Add from crew** only prefills a row. Hospital and police prefill from the shoot day's `hospital_*` and `police_station_*` fields when the RAMS is created (`dayDefaults.ts`).

## How it works
- **Save** (`saveRiskAssessment`): one serialized transaction upserts the header and replaces the unit links and hazards. Units must belong to the RAMS's shoot day. The editor has an explicit **Save** (no autosave), an unsaved indicator and a leave-page guard.
- **Sign-off**: `approveRiskAssessment(id, approvedBy)` needs at least one hazard and a responsible person; the editor disables **Approve** while the form is dirty. Any content change to an approved RAMS reverts it to draft and clears approver and time; a save that changes nothing keeps approval (`riskAssessmentContentSignature` in `content.ts`).
- **Duplicate**: `duplicateRiskAssessment(id, targetShootDayIds)` copies content as drafts (no approval, no PDF link). Units map by `unit_id` onto the target day, falling back to all of that day's units.
- **Delete**: hard-deletes the RAMS, hazards, unit links and its exported PDF (`hardDeleteDocument`). Deleting the PDF from **Documents** keeps the RAMS.
- **Export**: `exportRiskAssessmentPdf` renders a saved RAMS (status banner, details, safety contacts, one block per hazard with before/after factors and two highlighted matrices; drafts carry a "not approved" footer on each page), stores it with `persistProductionDocument` (`entity_type = risk_assessment`, `entity_id` = shoot day id) and sets `generated_document_id` in the same transaction. A re-export replaces the previous PDF.
- **List page**: sort by shoot day and location, filter by status and unit; row actions Open, Duplicate, Export PDF, Delete.

### Call sheet flag
`getRamsSignOffStatus(ramsList, shootDayUnitId)` returns `ok` (every RAMS covering the unit is approved), `unapproved` (a covering RAMS is a draft) or `missing` (none covers it). With a null unit, all RAMS on the day count. In `src/features/call-sheets/page.tsx`, `useRamsSignOff` drives a destructive `RamsSignOffAlert`, and Preview, Save and distribution export ask **Export anyway?** first. It is a warning, never a block; an unknown status (loading or query error) never warns. See [call-sheets.md](call-sheets.md).

## Connections
- **.apf export/import**: the four tables are in `src/lib/importExport/tableKeys.ts` and loaded by `exportLoadProductionData.ts`; a RAMS whose PDF is not exported has `generated_document_id` nulled so import foreign keys hold. See [import-export.md](../import-export.md).
- **Duplicate production** copies templates, RAMS (status and approval included), units and hazards, remapping shoot day, unit, location, person and document ids; links to uncopied targets become null.
- **Documents** catalog entity type `risk_assessment` (`src/lib/documents/catalog.ts`); demo data in `demoProductionSeed.ts`.

## Limitations
- SQLite only: no tables in `postgres/migrations`, so RAMS does not work against the optional Postgres server.
- Not in the publish pipeline (`src/lib/publish/tableOrder.ts`) or sync-v2; repositories write outbox rows that nothing consumes.
- No access-control resolvers: `src/lib/access/projectDomainService.ts` has no `*ForActor` wrappers for RAMS, and pages call the repositories directly.
- First aider names, phones and emails are stored in plain text (not in the field-encryption lists, see [../security.md](../security.md)).
- No native menu items and no dashboard widget for RAMS awaiting sign-off.
