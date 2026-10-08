# Script Supervisor

Experimental on-set workflow at **Script → Script Supervisor** (`/schedule/script-supervisor`): slates and takes logged against shoot days, tramlines drawn on the script, notes, progress, the Daily Progress Report and paperwork exports. Hidden unless "Show experimental features" is on; see [settings.md](settings.md). The other experimental pages are [Overtime](overtime.md) and [Receipt Capture](receipt-capture.md).

## Code map

| Area | Location |
|---|---|
| Pages/UI | [`src/features/script-supervisor/`](../../src/features/script-supervisor): `script-supervisor-page.tsx` (modes **Line & log** / **Review**), `SlatePanel`, `SlateNotesPanel`, `LinedScript`, `AnnotationDialog`, `RevisionReview`, `ProgressView`, `DayReportCard`, `ExportsCard`, `SceneStatusPip`, `SwipeToDeleteRow`, `hooks.ts`, `exports.ts`, `continuityPhotos.ts`; tablet layout: `useTouchLayout.ts`, `TabletWorkspace`, `TabletSceneNav`, `TabletSlateDeck`, `useWorkspaceBox.ts` |
| Pure logic | [`src/lib/script-supervisor/`](../../src/lib/script-supervisor): `slateNumbering`, `slatePanel`, `progress`, `dailyProgressReport`, `scriptElements`, `lining`, `liningEdit`, `annotations`, `continuitySheets`, `markedUpScript`, `revisionRemap` |
| Services | `src/lib/db/scriptSupervisorProgressService.ts`, `scriptSupervisorExportService.ts` |
| Repositories | `scriptSupervisor.ts` (slates, takes, settings, day logs, progress), `scriptLining.ts`, `scriptAnnotations.ts`, `scriptRevisions.ts` in [`src/lib/db/repositories/`](../../src/lib/db/repositories) |
| PDFs | `src/lib/pdf/dailyProgressReport.ts`, `continuitySheets.ts`, `markedUpScript.ts` |
| Settings | **Settings → Script supervisor** (`src/features/settings/ScriptSupervisorSettingsSection.tsx`) |
| Tables | `slates`, `takes` (`0093`); `production_script_supervisor_settings`, `slates.slating_system` (`0094`); `script_supervisor_scene_progress` (`0095`, `timed_seconds` in `0096`); `script_supervisor_day_logs` (`0096`); `script_elements`, `tramlines`, `tramline_segments` (`0097`); `script_annotations`, `script_annotation_takes`, `continuity_media` (`0098`); `script_revision_items`, `carried_from_id` columns (`0099`; breakdown tag type added in `0105`) |
| Tests | `src/features/script-supervisor/*.test.tsx`, `src/lib/script-supervisor/*.test.ts`, `src/lib/db/scriptSupervisor.test.ts` |

## Data model

| Table | Notes |
|---|---|
| `slates` | One per camera setup, on a `shoot_day_id`, optional `unit_id`, `scene_id`, `shot_id`. `slate_prefix` + `slate_number`; `slating_system` is recorded per slate so labels never change. Live numbers are unique via partial indexes; soft-deleted numbers can be reused |
| `takes` | Per slate: `take_number`, `status` (`pending`/`print`/`hold`/`ng`/`incomplete`), `ng_reason` (cleared when a take leaves NG), duration |
| `production_script_supervisor_settings` | One row per production; absent means UK |
| `script_supervisor_scene_progress` | Optional row per scene holding only what the supervisor decides: `marked_status` (`complete`/`omitted`), `completed_shoot_day_id`, `credited_eighths` (part-shot credit), `timed_seconds`, notes |
| `script_supervisor_day_logs` | Per shoot day: actual unit call, first shot, lunch, camera wrap, unit wrap, remarks. `shoot_days.call_time`/`wrap_time` stay the planned values |
| `script_elements` | Lining anchors per script version (heading, action, dialogue, transition), generated lazily from `script_pages` by `ensureScriptElements`. Derived, so no outbox rows |
| `tramlines`, `tramline_segments` | One tramline per slate per camera per version (`start_element_id` to `end_element_id`); segments store only overrides (`off`, `not_covered`) |
| `script_annotations`, `script_annotation_takes` | Notes on an element (`line_change`, `ad_lib`, `cut`, `note`, `vfx`, `sfx`, `continuity`), optionally tied to a slate and its takes |
| `continuity_media` | Photo row linked to slate/take/scene with tags and caption; the file is a `continuity_photo` document. Photos outlive a deleted slate |
| `script_revision_items` | One row per earlier tramline, note or breakdown tag per new version: `carried`, `moved`, `unmatched`, `already_lined`; `reviewed_at` |

## How it works

**Slating.** UK (default): consecutive numbers per series, prefix `''` main, `X` second unit, `Y` unsupervised. US: scene number plus setup letter (`23`, `23A`...; I and O skipped), `slate_number` is the ordinal within the scene and every US slate needs a scene. The system is chosen in Settings and locks once any live slate exists (`SLATING_SYSTEM_LOCKED_ERROR`). `getNextSlatePreview` gives the next label; next slate/take numbers are read inside the serialized transaction slot, with the unique indexes as backstop.

**Slate panel.** Day picker (today, else latest past day); scenes come from the day's stripboard (`listScenesForShootDay`) and any scene can be added. **New slate** carries camera, lens, stop, filter, sound mode, rolls, INT/EXT and day/night over from the previous slate. Keys (ignored while typing): N new slate, Space roll/cut (stopwatch logs duration), P print, H hold, G NG.

**Tablet layout.** `useTouchLayout` returns `[touch, toggle]`. On iOS and Android (`isMobilePlatform`) touch is always on and the toggle is `null`, so the header has no button. On desktop the header's **Tablet layout** button flips it, stored per device in `localStorage` (`albatross.scriptSupervisor.touchLayout`). In touch mode **Line & log** renders `TabletWorkspace` instead of the three-column desktop layout: it fills the window height (`useWorkspaceBox` measures it) and each pane scrolls alone. At 1080 px of workspace width or more it is wide (scene rail, workbench, slate deck side by side); narrower, or with the sidebar open in portrait, it is narrow (scene strip on top, workbench, deck docked at the bottom, showing takes as chips until expanded). The deck (`TabletSlateDeck`) keeps **Roll take** / **Cut take** and the Print / Hold / NG buttons on screen, with **Takes**, **Notes**, **Photos** and **Setup** tabs below. Most controls are at least 44 px tall, the keyboard hints are hidden, and the slate list deletes by swiping a row left (`SwipeToDeleteRow`) instead of the bin button. `SlatePanel` and `SlateNotesPanel` take a `touch` prop for the same sizing.

**Progress.** Per scene: Omitted (excluded from totals), Complete (full length, credited on its completion day), Part shot (live slate, credited eighths capped at scene length), Not shot. Status is derived in `progress.ts`; marking a scene complete here feeds Script Sections' Shot/Cut status ([script.md](script.md)) but does not write `script_sections.status`.

**Daily Progress Report.** `dailyProgressReport.ts` builds rows for scenes, pages and minutes (previously / today / to date / to do), setups and takes, times (actual, else labelled planned), the day's scenes, wild tracks and remarks. **Review → Daily progress report** edits the actual times and exports the PDF.

**Lining.** The Script view shows the scene's tramlines as lanes (`layoutLinedScript`): labels like `212/4 WS`, colour by shot type, dashed off-camera, a coverage strip flagging blocks with fewer than two tramlines, and page breaks. Draw by clicking/tapping first and last line or dragging down the lane (Pointer Events, touch-safe). Tapping a segment cycles on camera, off camera, not covered; a menu offers character-wide off-camera and delete. Undo keeps the last 20 actions (Cmd/Ctrl+Z). Elements are built from stored page text, not parser types, so old and new imports behave the same.

**Notes and photos.** Chips under their lines in the Script view; the Slate panel lists a slate's notes and photos. Photos are stored with `persistProductionDocument` and the `continuity_media` insert as `extraStatements`, so file, document and row commit together.

**Exports.** **Review → Exports** (day) and **Line & log → Script → Export PDF** (scene). Each saves to Documents under Set paperwork, then opens Save As.

| Export | Entity type | Builder |
|---|---|---|
| Continuity sheets (PDF) | `continuity_sheets` | `continuitySheets.ts` |
| Editor's log (CSV; formula-guarded cells, UTF-8 BOM) | `editors_log` | `buildEditorsLogCsv` |
| Marked-up script (PDF) | `marked_up_script` | `markedUpScript.ts` |
| Daily progress report (PDF) | `daily_progress_report` | `dailyProgressReport.ts` |

The marked-up PDF uses the same `layoutLinedScript` output as the screen via a pure plan (`planMarkedUpScript`); tests assert the paper layout equals the screen. More tramlines than fit across A4 print as extra passes. The two-tramline check (`loadDayCoverage`) marks each slated scene covered, under, not lined yet or not in an imported script.

**Revisions.** Whenever a scene's lining is loaded, `loadLinedSceneWithRevisions` runs `carryForwardScene`: tramlines and notes from earlier versions are re-created on the scene's latest version in one transaction (idempotent). `revisionRemap.ts` pairs lines by longest common subsequence of type, speaker and normalised text, then pairs reworded lines by word overlap. Tramlines keep the run between their first and last surviving lines; added lines inside become not covered. Every earlier item gets exactly one record per new version. **Script revision** in the Script view lists moved and unmatched items to check or dismiss. Breakdown tags use the same table ([script.md](script.md)).

## Connections

- Reads shoot days, units, scenes, shots and strips ([schedule.md](schedule.md)) and script versions/pages ([script.md](script.md)).
- Feeds Script Sections status and the Overtime page (day log `call_time`/`wrap_time`, see [overtime.md](overtime.md)).
- `.apf` export/import includes slates, takes, progress, day logs, elements, tramlines, annotations, continuity media and revision items (format version 9 tables in `src/lib/importExport/tableKeys.ts`). Duplicate production deliberately does not copy them (they record what was shot); they are listed in `DUPLICATE_EXCLUDED_TABLES` in `duplicateProduction.ts`.

## Gotchas

- Local SQLite only. Writes throw `SCRIPT_SUPERVISOR_REMOTE_ERROR` for `remote_server` productions; the page shows a notice. There are no Postgres tables.
- Matching is per scene: a line moved to another scene is unmatched, and a renumbered scene is a different scene. The carry runs on open/export, not at import.
- Deleting a slate soft-deletes its takes in the same batch; hard-deleting a production cascades.
- `setSceneProgress` is a patch: undefined fields keep their saved value.
