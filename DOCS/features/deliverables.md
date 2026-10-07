# Deliverables

Production-scoped tracking of post-production delivery items (masters, mixes, captions, QC reports), with one technical spec each, file attachments and reusable global templates. Lives at Deliver → **Deliverables** (`/deliverables`).

## Code map
| Area | Location |
|---|---|
| Page (table, add/apply dialogs, edit sheet, specs dialog) | `src/features/deliverables/page.tsx` |
| Deliverables + technical specs | `src/lib/db/repositories/deliverable.ts` |
| Templates | `src/lib/db/repositories/deliverableTemplates.ts` |
| Attachments | `src/lib/db/repositories/document.ts`, `src/lib/files/index.ts` |
| Dashboard card | `DeliverablesCard` in `src/features/dashboard/page.tsx` |
| Wrap check | `src/lib/wrap-production/deliverablesReadiness.ts` |
| Demo data | `src/lib/db/seed/demoDeliverableSeed.ts` |
| Tables | `deliverables`, `technical_specs` (0029), `deliverable_templates`, `deliverable_template_items` (0030), `episode_id` column (0063) |
| Tests | `src/features/deliverables/Deliverables.integration.test.tsx`, `src/lib/db/repositories/deliverable.episodic.test.ts` |

## Data model
| Table | Notes |
|---|---|
| `deliverables` | `production_id`, nullable `episode_id`, `name`, `due_date`, `status`, `recipient`, `delivery_method`, `delivered_by`, `delivered_at`, `approval_status`, soft-delete. |
| `technical_specs` | At most one live row per deliverable (`deliverable_id`). All nullable: `resolution`, `codec`, `bitrate`, `audio`, `audio_mix`, `language`, `captions`, `subtitles`, `graphics`, `aspect_ratio`, `platform`, `notes`. |
| `deliverable_templates` / `_items` | Global (not per production). Item: `name`, `due_offset_days`, `default_status`, `spec_defaults_json` (JSON of spec fields), `sort_order`. |
| `documents` | Attachments use `entity_type = 'deliverable'`, `entity_id = deliverable.id`. |

**Status values** (UI): `not_started`, `preparing`, `qc`, `ready`, `delivered`. **Approval**: `pending`, `approved`, `rejected`, or null. Legacy `pending` / `done` still render (the edit sheet maps them to `not_started` / `delivered`). `status` is free text in the database; nothing enforces the list.

## How it works
- **List**: ordered by `due_date, name`. The Audio and Subtitles columns come from one batched `getTechnicalSpecsByDeliverableIds` call.
- **Specs**: `upsertTechnicalSpec` updates the existing row or inserts one; saving an empty form still creates a spec.
- **Templates**: seeded by migrations 0031 (Streaming, Festival, Broadcast packages) and 0058 (Netflix, Amazon Prime Video, Hulu, Disney+, Apple TV SVOD packages). **Apply template** takes an optional anchor date (`due_date = anchor + due_offset_days`, else null) and, on episodic productions, an episode. It inserts all deliverables and specs in one transaction. Templates are baseline checklists, not compliance validators.
- **Attachments**: **Attach file** copies the file into app storage (`pickAndSaveAttachment`) and creates a `documents` row; **Open** resolves the stored path and opens it in the system viewer; **Remove** soft-deletes the document. See [documents.md](documents.md).
- **Episodic scope**: on episodic productions a deliverable is project-wide (`episode_id` null) or tied to one active episode. `assertDeliverableEpisodeAllowed` rejects an episode on a non-episodic production and any archived or unknown episode. The list can be filtered All / Project-wide / one episode (`listDeliverablesByProduction` option `filter`). Archived episodes stay readable as a label ("archived episode"); deleting an episode nulls `episode_id` on its deliverables. See [productions.md](productions.md#episodic-productions).

## Connections
- **Dashboard**: card counts overdue (due before today, not `delivered`) and due within 14 days.
- **Wrap Production**: [wrap-production.md](wrap-production.md) reads all live deliverables.
- **Default template** (Productions → New): seeds six starter deliverables (Picture Master, Textless Master, Stereo Mix, 5.1 Surround Mix, Closed Captions, QC Report) in `createProductionFromTemplate.ts`.
- **Duplicate production**: copies `name`, `due_date`, `status`, `episode_id` (remapped) and a spec's `resolution`, `codec`, `notes` only; recipient, delivery fields, approval and other spec columns are not copied. Attachments are copied with `entity_id` remapped (`mapEntityId`).
- **.apf export/import** includes `deliverables` (`src/lib/importExport/tableKeys.ts`); see [import-export.md](../import-export.md).

## Gotchas
- The Wrap Production check does not understand the Deliverables statuses: it only treats `signed_off` / `complete` / `completed` as done, so `delivered` counts as "not reviewed" and the check can never be Ready from UI-set statuses (see [wrap-production.md](wrap-production.md#gotchas)).
- No UI exists to create or edit templates; only the repository functions do.
- Spec fields are free text. There is no platform validation.
