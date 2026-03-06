# Deliverables

This document is both a **user guide** (how to use the Deliverables feature) and a **developer guide** (architecture, data model, and implementation). It describes the post-production delivery tracking system for film and TV productions.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Key features](#2-key-features)
- [3. Overview table](#3-overview-table)
- [4. Creating deliverables](#4-creating-deliverables)
- [5. Editing a deliverable](#5-editing-a-deliverable)
- [6. Technical specs](#6-technical-specs)
- [7. Apply template](#7-apply-template)
- [8. Attachments](#8-attachments)
- [9. Status and approval](#9-status-and-approval)
- [10. Dashboard](#10-dashboard)

**Part II — Developer guide**

- [11. Architecture and file layout](#11-architecture-and-file-layout)
- [12. Data model](#12-data-model)
- [13. Repository functions](#13-repository-functions)
- [14. Query keys and invalidation](#14-query-keys-and-invalidation)
- [15. UI state and components](#15-ui-state-and-components)
- [16. Router and navigation](#16-router-and-navigation)
- [17. Demo seed](#17-demo-seed)
- [18. Gaps and future work](#18-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Deliverables is a production-scoped feature for tracking post-production delivery items: what is being delivered, to whom, when, and in what format. It supports structured technical specs (resolution, codec, audio, subtitles, etc.), delivery tracking (method, delivered by/at), and approval status.
- **Route:** `/deliverables` (see [src/app/router.tsx](../src/app/router.tsx)).
- **Navigation:** "Deliverables" (FileCheck icon) in the app sidebar.
- **Context:** Requires a current production. If none is selected, the page shows "Select a production first."
- **Scope:** All deliverables are scoped to the current production. Each deliverable can have one technical spec record and multiple attachments (files). Reusable **deliverable templates** (e.g. Streaming Package, Festival Package) can be applied to create a batch of deliverables at once.

### 2. Key features

| Feature | Description |
|--------|-------------|
| **Overview table** | Lists deliverables with name, recipient, due date, status, approval, audio mix, subtitles (from spec), and actions (Edit, Technical specs). |
| **Add deliverable** | Create a single deliverable with name (required), optional recipient and due date. New items default to status "Not started". |
| **Edit deliverable** | Side sheet to edit name, due date, recipient, delivery method, delivered by, delivered at, status, and approval status. |
| **Technical specs** | One spec per deliverable: video (resolution, codec, bitrate), audio/language (audio mix, language), subtitles/graphics, and notes. Opened via the specs (gear) button on a row. |
| **Apply template** | Choose a template (e.g. Streaming Package, Festival Package, Broadcast Package) and optional anchor date to create multiple deliverables and optional specs in one go. |
| **Attachments** | From the edit sheet, attach files (e.g. QC reports, subtitle files). List, open in system, or remove. |
| **Status** | Not started, Preparing, QC, Ready, Delivered. |
| **Approval** | Pending, Approved, Rejected. |

### 3. Overview table

The main table shows:

- **Name** — Deliverable name (e.g. Picture Master, Stereo Mix).
- **Recipient** — Who it is sent to (e.g. Netflix, Distributor). Shows "—" when empty.
- **Due date** — Due date or "—".
- **Status** — Badge (Not started, Preparing, QC, Ready, Delivered; legacy values like Pending/Done also display).
- **Approval** — Badge: Pending (muted), Approved (green), Rejected (red), or "—".
- **Audio** — From the technical spec (e.g. Stereo, 5.1). "—" when not set.
- **Subtitles** — From the technical spec (e.g. CC, SDH). "—" when not set.
- **Actions** — Edit (pencil) opens the edit sheet; Technical specs (gear) opens the specs dialog.

Long text is truncated with a tooltip on hover. The table is sorted by due date then name.

### 4. Creating deliverables

1. Click **Add deliverable** in the header.
2. Enter **Name** (required), and optionally **Recipient** and **Due date**.
3. Click **Add**.

The new deliverable appears in the table with status "Not started" and no approval set. You can then edit it to add delivery tracking and open Technical specs to add resolution, codec, audio mix, etc.

### 5. Editing a deliverable

1. In the table row, click the **pencil** (Edit) button.
2. The **Edit deliverable** side sheet opens with sections:
   - **Basics** — Name, Due date.
   - **Recipient & delivery** — Recipient, Delivery method (e.g. Aspera, S3, Hard drive), Delivered by, Delivered at (date).
   - **Status** — Status (dropdown) and Approval (dropdown).
   - **Attachments** — List of attached files, Attach file, Open, Remove.
3. Change any fields and click **Save**, or **Cancel** to close without saving.

### 6. Technical specs

1. In the table row, click the **gear** (Technical specs) button.
2. The **Technical specs** dialog opens with grouped fields:
   - **Video** — Resolution, Codec, Bitrate.
   - **Audio & Language** — Audio mix, Language.
   - **Subtitles & Graphics** — Subtitles, Graphics.
   - **Notes** — Free-form notes.
3. Fill in what applies (e.g. for a Picture Master: resolution 3840×2160, codec ProRes 422 HQ; for a Stereo Mix: audio mix Stereo only). Leave others blank.
4. Click **Save** or **Close**.

If the deliverable has no spec yet, the form starts empty; saving creates the spec. The overview table’s Audio and Subtitles columns pull from this spec.

### 7. Apply template

1. Click **Apply template** in the header.
2. Choose a **Template** (e.g. Streaming Package, Festival Package, Broadcast Package).
3. Optionally set an **Anchor date**. If set, each template item’s due date is anchor date plus its offset (days). If left empty, new deliverables have no due date.
4. Click **Apply**.

The template’s deliverables are created for the current production; any template items that define default technical spec fields get those specs created. The dialog closes and the table refreshes.

### 8. Attachments

Attachments are managed from the **Edit deliverable** sheet:

- **Attach file** — Opens a file picker; the chosen file is copied into app storage and linked to the deliverable.
- **List** — Each attachment shows its file name. Hover to reveal **Open** (opens in the system default app) and **Remove** (unlinks and soft-deletes the document).

Use attachments for QC reports, subtitle files, dialogue lists, delivery receipts, or other supporting documents. They are stored using the app’s standard document model (entity type `deliverable`, entity id = deliverable id).

### 9. Status and approval

- **Status** describes progress: Not started → Preparing → QC → Ready → Delivered. Use the edit sheet to change it.
- **Approval** is independent: Pending, Approved, or Rejected. Typical use: recipient approval of the delivered item.

Both appear in the overview table so you can scan what’s due, in progress, or approved at a glance.

### 10. Dashboard

The Dashboard can show a **Deliverables** card with:

- **Overdue** — Deliverables with due date in the past and status not Delivered.
- **Due in 14 days** — Due within the next 14 days and not yet delivered.

Clicking the card or "View deliverables" goes to the Deliverables page. If there are no due soon or overdue items, the card still links to the page.

---

## Part II — Developer guide

### 11. Architecture and file layout

| Path | Purpose |
|------|---------|
| `src/features/deliverables/page.tsx` | Single page: overview table, Add/Apply template dialogs, edit sheet, technical specs dialog, attachment UI. |
| `src/lib/db/repositories/deliverable.ts` | Deliverables and technical specs: list, create, update, delete, get spec by deliverable, get specs by deliverable IDs, upsert spec. |
| `src/lib/db/repositories/deliverableTemplates.ts` | Templates: list, get with items, CRUD template and items, apply template to production. |
| `src/lib/db/repositories/document.ts` | Documents (attachments): list by entity, create, delete. Deliverables use `entity_type: 'deliverable'`, `entity_id: deliverable.id`. |
| `src/lib/db/types.ts` | Types: `Deliverable`, `TechnicalSpec`, `DeliverableTemplate`, `DeliverableTemplateItem`. |
| `src/lib/files/index.ts` | `pickAndSaveAttachment`, `getFileUrl`, `openInSystem` for attach/open. |
| `src-tauri/migrations/0029_deliverables_expanded.sql` | Adds deliverable tracking and spec fields. |
| `src-tauri/migrations/0030_deliverable_templates.sql` | Tables for deliverable templates and template items. |
| `src-tauri/migrations/0031_deliverable_template_defaults.sql` | Seed data for default templates (Streaming, Festival, Broadcast). |
| `src/lib/db/seed/demoDeliverableSeed.ts` | Demo production seed: 12 deliverables with rich metadata and technical specs. |

### 12. Data model

**deliverables**

- `id`, `production_id`, `name`, `due_date`, `status`, `recipient`, `delivery_method`, `delivered_by`, `delivered_at`, `approval_status`, `created_at`, `updated_at`, `deleted_at`.
- Status values used in UI: `not_started`, `preparing`, `qc`, `ready`, `delivered`. Legacy `pending` / `done` are still displayed.
- Approval: `pending`, `approved`, `rejected` (nullable).

**technical_specs**

- One-to-one per deliverable (one spec per deliverable). `id`, `deliverable_id`, `resolution`, `codec`, `audio`, `captions`, `aspect_ratio`, `platform`, `notes`, `bitrate`, `subtitles`, `graphics`, `language`, `audio_mix`, timestamps, `deleted_at`.
- All spec fields are nullable; the UI groups them as Video, Audio & Language, Subtitles & Graphics, Notes.

**deliverable_templates / deliverable_template_items**

- Templates are global (not production-scoped). Template has `name`, `description`. Items have `name`, `due_offset_days`, `default_status`, `spec_defaults_json` (JSON object of spec fields), `sort_order`.
- Apply template: for each item, insert a deliverable (and optionally a technical_spec from `spec_defaults_json`). Uses `runInSerializedTransaction` + `executeBatch` per [DATABASE_LAYER.md](DATABASE_LAYER.md).

**documents (attachments)**

- Standard document table with `entity_type`, `entity_id`. Deliverable attachments use `entity_type = 'deliverable'`, `entity_id = deliverable.id`, `production_id = deliverable.production_id`.

### 13. Repository functions

**deliverable.ts**

- `listDeliverablesByProduction(productionId)` — all deliverables for production, ordered by due_date, name.
- `createDeliverable(data)` — insert deliverable; default status `not_started`.
- `updateDeliverable(id, data)` — partial update of name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status.
- `deleteDeliverable(id)` — soft delete.
- `getTechnicalSpecByDeliverable(deliverableId)` — single spec or null.
- `getTechnicalSpecsByDeliverableIds(deliverableIds)` — batch specs for overview table (one query).
- `upsertTechnicalSpec(deliverableId, data)` — update existing spec or insert new one.

**deliverableTemplates.ts**

- `listDeliverableTemplates()` — all non-deleted templates.
- `getDeliverableTemplateWithItems(templateId)` — template + items by sort_order.
- `createDeliverableTemplate`, `updateDeliverableTemplate`, `deleteDeliverableTemplate`.
- `createDeliverableTemplateItem`, `updateDeliverableTemplateItem`, `deleteDeliverableTemplateItem`.
- `applyDeliverableTemplateToProduction({ productionId, templateId, anchorDate? })` — creates deliverables and optional specs in one transaction; due dates = anchorDate + item.due_offset_days when anchor provided.

**document.ts** (for attachments)

- `listDocumentsByEntity('deliverable', deliverableId)` — attachments for a deliverable.
- `createDocument({ production_id, entity_type: 'deliverable', entity_id, file_name, file_path, mime_type })` — after `pickAndSaveAttachment()`.
- `deleteDocument(id)` — soft delete (remove attachment).

### 14. Query keys and invalidation

| Query key | Used for | Invalidated by |
|-----------|----------|----------------|
| `['deliverables', productionId]` | Main list | create, update, delete deliverable; apply template |
| `['technical-specs-by-deliverables', deliverableIds]` | Specs for table (Audio, Subtitles) | create/update deliverable; apply template; upsert spec |
| `['technical-spec', deliverableId]` | Spec in Technical Specs dialog | upsert spec |
| `['deliverable-templates']` | Template dropdown in Apply Template | (template CRUD not in UI yet) |
| `['documents', 'deliverable', deliverableId]` | Attachments in edit sheet | attach, remove attachment |

After mutations, the page invalidates the relevant keys so the table and dialogs stay in sync.

### 15. UI state and components

**DeliverablesPage**

- State: `open` (add dialog), `applyTemplateOpen`, `applyTemplateId`, `applyAnchorDate`, `editDeliverable` (selected deliverable or null), `specDeliverableId` (which row’s specs are open), `name`, `dueDate`, `recipient` (add form).
- Child components: **DeliverableEditSheet** (when `editDeliverable` set), **TechnicalSpecsPanel** (when `specDeliverableId` set). Add and Apply Template are inline dialogs.

**DeliverableEditSheet**

- Props: `deliverable`, `onClose`, `onSaved`. Loads attachments via `listDocumentsByEntity('deliverable', deliverable.id)`. Attach uses `pickAndSaveAttachment` then `createDocument`; remove uses `deleteDocument`. Save calls `updateDeliverable`.

**TechnicalSpecsPanel**

- Props: `deliverableId`, `onClose`. Loads spec with `getTechnicalSpecByDeliverable`; save with `upsertTechnicalSpec`. Invalidates both `['technical-spec', deliverableId]` and `['technical-specs-by-deliverables']` on success so the table Audio/Subtitles update.

### 16. Router and navigation

- **Route:** `path: 'deliverables'`, element: `DeliverablesPage` (see [src/app/router.tsx](../src/app/router.tsx)).
- **Nav:** Label "Deliverables", icon FileCheck, `to: '/deliverables'` (see [src/app/navigation.ts](../src/app/navigation.ts)).

### 17. Demo seed

- **File:** [src/lib/db/seed/demoDeliverableSeed.ts](../src/lib/db/seed/demoDeliverableSeed.ts).
- **Called from:** `demoProductionSeed.ts` as part of full demo seed (after production and other data).
- **Data:** 12 deliverables with realistic names (Picture Master, Textless Master, Stereo Mix, 5.1 Surround Mix, M&E Mix, Closed Captions, SDH Captions, Timed Text Subtitle File, QC Report, Dialogue List, As-Delivered Metadata, Trailer Master), mixed metadata (recipient, delivery_method, status, approval_status), and one technical_spec per deliverable with coherent fields (resolution, codec, audio_mix, subtitles, notes, etc.).
- **IDs:** `IDS.deliverable(1..12)`, `IDS.technicalSpec(1..12)`. Due dates: `addDaysLocal(startDate, 60 + i * 7)`.
- **Deterministic:** No randomness; reset/reseed reproduces the same data.

### 18. Gaps and future work

- **Template management UI** — Templates are seeded and applied from the page; there is no UI to create or edit template definitions (only repository functions exist).
- **Sub-deliverables / dependencies** — Not implemented; each deliverable is a single top-level item.
- **Platform-specific validation** — No compliance or validation engine; specs are free-form.
- **Localization packages** — No package or version tracking for localisation deliverables.
- **Duplicate production** — When duplicating a production, deliverable documents (attachments) are remapped to new deliverable IDs via `mapEntityId` in [duplicateProduction.ts](../src/lib/db/duplicateProduction.ts). Deliverable and technical_spec columns duplicated are the minimal set; expanded fields could be included in a future duplicate pass.
