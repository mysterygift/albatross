# Script Supervisor (SS1–SS10)

> **Experimental.** Script Supervisor is hidden from the sidebar and search unless **Settings → Developer →
> Show experimental features** is on (see [experimental-on-set.md](experimental-on-set.md)). Its route and data are unaffected.

Developer notes for the on-set Script Supervisor workflow: slates and takes logged against the
stripboard's shoot days, later lined onto the script as tramlines (the UK marked-up script).

## SS1 — data model (this stage)

Migration [`0093_script_supervisor_slates_takes.sql`](../src-tauri/migrations/0093_script_supervisor_slates_takes.sql)
adds two tables. Everything else is reused rather than duplicated:

| Reused | Why |
| --- | --- |
| `shoot_days` (stripboard) | A slate belongs to the day it was shot. `call_time`, `wrap_time` and `meal_times_json` already live here; only a first-shot time is still missing (SS5, Daily Progress Report). |
| `units` | A slate may record which unit shot it. |
| `scenes` | The scene the setup covers. |
| `shots` (shot list) | Optional link from a slate to the planned shot it realises. |

| Table | Notes |
| --- | --- |
| `slates` | One row per camera setup. `slate_prefix` + `slate_number` follow UK consecutive slating: '' main unit, `X` second unit, `Y` unsupervised. A partial unique index keeps live numbers unique per series; a soft-deleted number can be reused. |
| `takes` | One row per take. `status` is `pending`/`print`/`hold`/`ng`/`incomplete`; `ng_reason` only on NG takes (the repository clears it when a take moves off NG). Unique live `take_number` per slate. |

Repository: [`scriptSupervisor.ts`](../src/lib/db/repositories/scriptSupervisor.ts). Pure numbering and
label helpers: [`slateNumbering.ts`](../src/lib/script-supervisor/slateNumbering.ts). Query hooks:
[`features/script-supervisor/hooks.ts`](../src/features/script-supervisor/hooks.ts) (all mutations invalidate
`['script-supervisor']`).

## SS2 — slating system per production

Migration [`0094_script_supervisor_slating_system.sql`](../src-tauri/migrations/0094_script_supervisor_slating_system.sql):

- `production_script_supervisor_settings` (one row per production, absent = UK). Set in **Settings → Script
  supervisor → Slating** ([`ScriptSupervisorSettingsSection.tsx`](../src/features/settings/ScriptSupervisorSettingsSection.tsx)).
- `slates.slating_system` records the system each slate was created under, so labels never change later.
- **UK (default)**: consecutive numbers per series; unique per production + prefix.
- **US**: scene number + setup letter (23, 23A, 23B…, skipping I and O; doubling after Z). `slate_number`
  stores the setup ordinal within the scene (1 = scene alone, 2 = A…), unique per scene. Every US slate needs a scene.
- The setting **locks once any live slate exists** (`SLATING_SYSTEM_LOCKED_ERROR`), so a shoot never mixes systems.
- `getNextSlatePreview` returns the label the next "New slate" will get (UK `217`, US `23B`) for the UI.

## SS3 — slate panel

**Schedule → Script Supervisor** ([`script-supervisor-page.tsx`](../src/features/script-supervisor/script-supervisor-page.tsx),
[`SlatePanel.tsx`](../src/features/script-supervisor/SlatePanel.tsx)):

- Shoot day picker (opens today's day, else the latest past day). The day's scenes come from the stripboard
  (`listScenesForShootDay`: SCENE strips directly, SHOT strips via their planned shot); any other scene can be picked.
- **New slate (N)** shows the next label (UK `217`, US `23B`) and carries camera, lens, stop, filter, sound mode,
  rolls, INT/EXT and day/night over from the previous slate (`carryOverFields`). Shot type, code and description start blank.
- Slate setup fields save on blur. **Roll / Cut (Space)** runs a stopwatch and logs the take with its duration.
  **Print / Hold / NG (P / H / G)** mark the selected take, else the latest; NG shows reason chips.
  Shortcuts are ignored while typing. Switching slate is disabled while rolling.
- **Tablet layout** toggle (Lucide `Tablet` icon; always on for iOS/Android) is a per-device preference in local
  storage (`useTouchLayout`), not production data. Line & log becomes a fixed-height workspace
  ([`TabletWorkspace`](../src/features/script-supervisor/TabletWorkspace.tsx)) whose panes scroll independently, so
  Roll / Cut and Print / Hold / NG never scroll away. At 1080px of workspace width or more (landscape, sidebar hidden)
  it is scene rail | workbench | slate deck; below that (portrait, or the sidebar open) the scenes become a strip on
  top and the slate deck docks at the bottom, with the takes as chips until *Takes & notes* expands it. The deck keeps
  takes, notes, photos and setup on tabs; setup is collapsed to a one-line summary because it carries over between
  slates. All targets are at least 44px. The lined script keeps its key and drawing hint pinned (with *Cancel* for a
  half-drawn line) and reserves room for each line's add-note button.
- Remote-server productions see a notice instead of the workspace.

Not yet: demo seed data.

## SS4 — scene status and progress

Migration [`0095_script_supervisor_scene_progress.sql`](../src-tauri/migrations/0095_script_supervisor_scene_progress.sql)
adds `script_supervisor_scene_progress`: one optional row per scene holding only what the script supervisor
decides — `complete` (with the shoot day it was completed on), `omitted`, a part-shot page credit in eighths, and notes.

Everything else is derived ([`progress.ts`](../src/lib/script-supervisor/progress.ts),
[`scriptSupervisorProgressService.ts`](../src/lib/db/scriptSupervisorProgressService.ts)):

| Status | Rule | Pages credited |
| --- | --- | --- |
| Omitted | marked omitted | none; left out of totals |
| Complete | marked complete | the scene's full length, on its completion day |
| Part shot | has a live slate, not marked | the credited estimate, capped at the scene length |
| Not shot | no slates | none |

- **Line & log**: the scene rail shows a status pip per scene (shape, not just colour) and a
  **Mark scene complete** toggle that completes the selected scene on the current shoot day.
- **Review** (mode toggle in the header, [`ProgressView.tsx`](../src/features/script-supervisor/ProgressView.tsx)):
  pages shot / total, scenes complete, setups and takes; pages completed per day against the stripboard's scheduled
  pages; a scene table (natural scene order, filterable) with slates, takes, prints, pages shot, last shot day,
  an inline part-shot credit, and a Complete / Omitted / Not marked control.
- Marking a scene here does not change `script_sections.status` (SB1); keeping the two in step is a later decision.

## SS5 — Daily Progress Report

Migration [`0096_script_supervisor_day_log.sql`](../src-tauri/migrations/0096_script_supervisor_day_log.sql):

- `script_supervisor_day_logs` (one row per shoot day): **actual** unit call, first shot, lunch / back from lunch,
  first shot after lunch, camera wrap, unit wrap (HH:MM) and remarks. `shoot_days.call_time`, `wrap_time` and
  `meal_times_json` stay the **planned** schedule; the report shows a planned time, labelled, only when no actual
  time was logged.
- `script_supervisor_scene_progress.timed_seconds`: screen time the script supervisor timed for a completed scene.
  `setSceneProgress` is now a patch: fields left undefined keep their saved value.

Report ([`dailyProgressReport.ts`](../src/lib/script-supervisor/dailyProgressReport.ts) builds the data;
[`pdf/dailyProgressReport.ts`](../src/lib/pdf/dailyProgressReport.ts) renders A4 with pdf-lib):

| Row | Script | Previously / Today / To date | To do |
| --- | --- | --- | --- |
| Scenes | scenes not omitted | completed before / on / up to this day | script − to date |
| Pages | their eighths | completions, plus part-shot credit on the day the scene was last shot | script − to date |
| Minutes | sum of schedule estimates | timed screen time of completions, else the estimate (footnoted) | script − to date |
| Setups, takes | — | slates and takes logged per day | — |

Also: times, the day's scenes (strip order, plus scenes completed but not scheduled) with status, scenes completed
today, wild tracks, remarks. **Review → Daily progress report** holds the actual-time fields and **Export PDF**, which
saves a copy to Documents → Set paperwork (`daily_progress_report`) and opens a save dialog. Review's scene table
gains a **Timed** column (m:ss) for completed scenes.

## SS6 — script elements and tramlines (read-only view)

Migration [`0097_script_supervisor_lining.sql`](../src-tauri/migrations/0097_script_supervisor_lining.sql):

| Table | Notes |
| --- | --- |
| `script_elements` | Lining anchors per script version: scene heading, action paragraph, dialogue speech (cue + lines, parentheticals inline), transition, with page number and order. Generated **lazily** from `script_pages` by `ensureScriptElements` the first time a version is lined (one serialized transaction; idempotent). Derived data, so no outbox rows. |
| `tramlines` | One per slate per camera per script version: a contiguous run from `start_element_id` to `end_element_id`. |
| `tramline_segments` | Overrides only: `off` (off camera, dashed) or `not_covered` (gap). No row = on camera. |

- Why page text, not parser types: the parser's typed lines are in-memory only, but stored page text already
  separates blocks with blank lines for PDF (`joinScriptElements`) and TXT imports, so
  [`blocksFromPageText`](../src/lib/script-supervisor/scriptElements.ts) gives the same result for new and old scripts.
  `(MORE)` / `CONTINUED:` lines are skipped; a transition run on after action is split off.
- Elements belong to one script version; a new draft gets new elements. Carrying tramlines across drafts is SS10.
- [`loadLinedScene`](../src/lib/db/repositories/scriptLining.ts) returns a scene's elements (latest version containing
  the scene) and every live tramline overlapping them, with slate label, shot type and printed takes.
  [`layoutLinedScript`](../src/lib/script-supervisor/lining.ts) turns that into lanes (shot order) and rows (cells with
  start/end caps, coverage count, page breaks).
- **Line & log → Script** shows the marked-up scene read-only ([`LinedScript.tsx`](../src/features/script-supervisor/LinedScript.tsx)):
  tramline labels (`212/4 WS`), colours by shot type, dashed off-camera, a coverage strip flagging blocks with fewer
  than two tramlines, and page-break markers. Repository writes for drawing (`createTramline`, `updateTramlineRange`,
  `setTramlineSegment`, `softDeleteTramline`) are in place for SS7.

## SS7 — drawing tramlines

Line & log → **Script** is editable for the current slate ([`LinedScript.tsx`](../src/features/script-supervisor/LinedScript.tsx),
helpers in [`liningEdit.ts`](../src/lib/script-supervisor/liningEdit.ts)):

- **Draw lane** (right-hand column, labelled `Draw 217`): click or tap the first line, then the last line the shot
  covers. Dragging down the lane does the same in one gesture (Pointer Events, so mouse, touch and pen share one code
  path; `touch-action: none` on the lane stops the page scrolling mid-drag; the page auto-scrolls near the edges).
  Headings are skipped. If the slate already has a tramline, drawing again redraws it (`updateTramlineRange`).
- **Segments**: tap a line segment to cycle on camera → off camera → not covered. Long-press (touch/pen) or
  right-click / context-menu key opens a menu: the three states, *Off camera for CHARACTER to the end of this line*
  (dialogue rows), and *Delete tramline*.
- **Undo** (button or ⌘/Ctrl+Z while the script is showing): the last 20 lining actions — line, redraw, segment
  changes (including the bulk character change, applied with `setTramlineSegments` in one transaction) and delete
  (`restoreTramline`, refused if the slate has been lined again since).
- Keyboard: every draw cell and segment is a real button with a descriptive label; Esc cancels a half-drawn line.

## SS8 — script notes and continuity photos

Migration [`0098_script_supervisor_annotations_media.sql`](../src-tauri/migrations/0098_script_supervisor_annotations_media.sql):

| Table | Notes |
| --- | --- |
| `script_annotations` | A note on one script element: `line_change`, `ad_lib`, `cut`, `note`, `vfx`, `sfx`, `continuity`; optionally tied to a slate. |
| `script_annotation_takes` | Which takes of that slate it applies to (cascades when a take is deleted). |
| `continuity_media` | A continuity photo: the file is a document (`continuity_photo`, Documents → Set paperwork); the row links slate, take, scene, tags (wardrobe, props, make-up, hair, set, other) and a caption. Photos survive a slate delete — they stay on the scene for matching a reshoot. |

- Repository: [`scriptAnnotations.ts`](../src/lib/db/repositories/scriptAnnotations.ts). Photos are stored by
  [`continuityPhotos.ts`](../src/features/script-supervisor/continuityPhotos.ts) through `persistProductionDocument` with the
  `continuity_media` INSERT as `extraStatements`, so file, document row and media row land together.
- **Script view**: notes show as chips under their line (`T3 · 217 · Ad-lib: + “Nobody ever does.”`); each line has an
  add-note button (on hover/focus with a mouse, always shown in tablet layout). The dialog defaults the type to *Line
  change* on dialogue (*Note* otherwise) and ticks the selected take (else the latest) of the current slate.
- **Slate panel → Notes and photos**: the slate's notes (tap to edit) and continuity photos, with tag toggles for new
  photos and *Add photos* (a file input, so touch devices offer the camera or library). New photos file against the
  selected take, else the latest. Images are read back as blob URLs (`createAppDataObjectUrl`), so no asset protocol is needed.

## SS9 — exports and the two-tramline check

No migration. **Review → Exports** (for the selected shoot day) and **Line & log → Script → Export PDF** (one scene).
Every export saves a copy to Documents → Set paperwork, then opens a save dialog.

| Export | Built by | Contents |
| --- | --- | --- |
| Continuity sheets (PDF, `continuity_sheets`) | [`continuitySheets.ts`](../src/lib/script-supervisor/continuitySheets.ts) → [`pdf/continuitySheets.ts`](../src/lib/pdf/continuitySheets.ts) | One sheet per slate in shot order: shot type, camera, lens, stop, filter, sound, int/ext, day/night, camera and sound rolls; takes (duration, status, NG reason, end board, remarks); printed takes; script notes with the line each was said on; slate notes; photo count and tags. |
| Editor's log (CSV, `editors_log`) | `buildEditorsLogCsv` | One row per take (a slate without takes gets one row). Script notes on a row are those for that take plus whole-slate notes. UTF-8 BOM for Excel; cells starting `= + - @` get a leading apostrophe so an ad-lib like `+ "Nobody ever does."` is not read as a formula. |
| Marked-up script (PDF, `marked_up_script`) | [`markedUpScript.ts`](../src/lib/script-supervisor/markedUpScript.ts) → [`pdf/markedUpScript.ts`](../src/lib/pdf/markedUpScript.ts) | The day's slated scenes (Review) or one scene lined to date (Script view): Courier script text, tramline lanes with labels, caps, dashed off-camera runs and gaps, the coverage strip, notes under their lines, script page changes. |

- **Exported pages match the screen.** The loader ([`scriptSupervisorExportService.ts`](../src/lib/db/scriptSupervisorExportService.ts))
  feeds `planMarkedUpScript` the same `layoutLinedScript` output the Script view draws. The plan is pure (positions,
  lanes, cell states) and the renderer only paints it; tests check that every element appears once in order and every
  lane's cell state and start/end caps on paper equal the on-screen layout, including across split blocks and pages.
- Layout: a block that won't fit moves to the next page; a block taller than a page splits by line, and the tramline
  runs on (caps only at its real start and end). Lines also run across script page changes. More tramlines than fit
  across A4 (about 19) print as further passes of the scene ("Tramlines 20–38 of 38"), so none is dropped.
- Print colours (`PRINT_TRAMLINE_HEX`): master `#c2410c`, single `#2f5fb3`, multiple `#1a1a1a`, insert `#3f7a5c` —
  the UK colours darkened from the screen palette to at least 3:1 on white (tested). Print mint is only used for
  fills (coverage strip, rules).
- **Two-tramline check** (`loadDayCoverage`): each scene slated that day is *covered*, *under* (N blocks with fewer
  than two tramlines), *not lined yet* or *not in an imported script*. Tap a scene to open its script.
- Scenes not in an imported script are left out of the day's marked-up script and listed after the export.

## SS10 — revisions: carrying tramlines and notes onto a new draft

Migration [`0099_script_supervisor_revisions.sql`](../src-tauri/migrations/0099_script_supervisor_revisions.sql):
`tramlines.carried_from_id` and `script_annotations.carried_from_id` link a carried row to the one it came from, and
`script_revision_items` records one row per earlier tramline or note per new version: `carried`, `moved` (placed,
but its lines changed), `unmatched` (couldn't be placed) or `already_lined`, with the reasons and `reviewed_at`.

- **When**: whenever a scene's lining is loaded (Script view, exports, the two-tramline check),
  [`loadLinedSceneWithRevisions`](../src/lib/db/repositories/scriptRevisions.ts) first runs `carryForwardScene`.
  If the scene's latest script version is newer than some of its tramlines or notes, they are re-created on the new
  version in one serialized transaction. It is idempotent: an item that already has a carried child, or a record for
  the target version, is skipped. Earlier rows stay on their version as history. Drafts imported before SS10 are
  handled the same way.
- **Matching** ([`revisionRemap.ts`](../src/lib/script-supervisor/revisionRemap.ts)), within the scene:
  - Unchanged lines are paired by the longest common subsequence of type, speaker and normalised text. Case,
    spacing, quote and dash styles and `(CONT'D)` are ignored, and repeated lines pair up in order.
  - Reworded lines are then paired between those anchors when they are the same type and speaker and share enough
    words (Dice ≥ 0.5, or two or more shared words making up half the shorter line).
- **Tramlines** keep the run between the first and last of their lines that survive.
  - Off-camera and gap marks follow their lines.
  - Lines added inside the run are marked **not covered**, since they were never filmed, so the two-tramline check
    flags them.
  - Any cut, reworded or added line makes the tramline `moved`. No surviving line makes it `unmatched`.
  - A slate already lined on the new draft is recorded as `already_lined`.
- **Notes** move to the same line (`carried`), a reworded line (`moved`), or are `unmatched` when the line was cut.
  Take links are copied.
- **No tramline is silently lost.** Every live earlier tramline gets exactly one record per new version, which is
  tested. **Script view → Script revision** lists moved and unmatched items: the label, why, and the line it was on
  in the earlier draft.
  - *Checked* (moved) or *Dismiss* (unmatched) sets `reviewed_at`.
  - *Select slate* picks an unmatched slate from the selected day so it can be lined again.
  - Once a slate is lined again on the new draft, its item leaves the list ("lined again").
  - With nothing to check, a one-line summary sits by the Undo button.
- **Chains**: when a third draft arrives, the second draft's rows are carried and the first draft's rows are skipped
  (they have children). A carried tramline deleted on the newer draft is not brought back. An unmatched item that
  wasn't dismissed is tried again against the next draft.

## Known limits

- Matching is per scene. A line moved to another scene is reported as unmatched in its old scene, and a renumbered
  scene is a different scene.
- The carry runs when a scene is opened or exported, not at import time. The review list is per scene in the
  Script view; there is no production-wide list yet.

## Rules

- **Local SQLite only**, like the SB1 script-section tables. Writes throw `SCRIPT_SUPERVISOR_REMOTE_ERROR`
  for productions whose effective data source is `remote_server`. Not in publish, import/export or postgres yet.
- **Transactions** follow [`DATABASE_LAYER.md`](DATABASE_LAYER.md) §4: `runInSerializedTransaction` + one
  `executeBatch` with outbox rows inside. Next slate/take numbers are read inside the serialized slot so two
  quick taps cannot pick the same number; the unique indexes are the backstop.
- **Soft delete**: deleting a slate soft-deletes its takes in the same batch. Hard delete of a production
  cascades to `slates` → `takes` (checked by `verifyCascades`).
- **Not duplicated** with a production: slates and takes are a record of what was shot, so
  `duplicateProduction` leaves them behind.
