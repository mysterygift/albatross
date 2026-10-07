# Script Breakdown

Developer notes for **Schedule › Script › Script Breakdown** (`/schedule/script-breakdown`). The producer highlights
words in the script and tags them with a category. The tags become per-scene breakdown sheets and per-department
lists, and each element is checked against the production's own data to see whether it has been sourced.

Local SQLite only, like the other script tables. Remote-server productions see `SbRemoteNotice`.

## Data

| Table | One row per | Notes |
|---|---|---|
| `breakdown_elements` | thing to source, per production and category | `manual_status` (`needed`/`sourced`) and optional `linked_entity_type`/`linked_entity_id` (location, person, equipment, music_track) |
| `breakdown_tags` | highlight in the script | per-page character offsets into `script_pages.content` (`start_page_id`/`start_offset` → `end_page_id`/`end_offset`, end exclusive), the same model as `script_section_ranges`; `tagged_text` is kept to carry the tag to later drafts |

Categories, colours and shortcuts live in [`src/lib/breakdown/categories.ts`](../src/lib/breakdown/categories.ts).
The first six colours follow the paper template (Cast green, Props blue, Extras mauve, Costume salmon, Locations
yellow, Lighting red).

Tagging words finds or creates the element: the category's element whose name matches the words
(`normalizeNameKey`: case, spacing and quote style ignored) is reused, so "BEACH" tagged in two scenes is one
Locations element with two tags. Elements can be renamed, merged and deleted from the Elements tab, and a tag can be
moved to another element from its popover. Writes go through
[`scriptBreakdown.ts`](../src/lib/db/repositories/scriptBreakdown.ts): one serialized transaction each, with outbox rows.

`productions.production_code` (free text) is printed as PRODUCTION NO. on the sheet. It is edited in the production's
Edit dialog.

## Page

[`script-breakdown-page.tsx`](../src/features/schedule/script-breakdown-page.tsx) has a version picker, a scene
list and three views:

- **Script** ([`script-breakdown-script.tsx`](../src/features/schedule/script-breakdown-script.tsx)). The shared
  `ScriptLines` view (Script Sections uses the same one) with inline highlights. Highlighting uses the browser's own
  text selection. [`selection.ts`](../src/lib/breakdown/selection.ts) maps it to page offsets through each line
  cell's `data-page-id`/`data-line-start`, then snaps it to whole words. A floating toolbar (keys `1`–`9`, `0`, `-`)
  picks the category. Overlapping tags become one segment ([`segmentByCoverage`](../src/lib/text/segments.ts)),
  drawn as horizontal colour bands stacked within the line (`stackedHighlightBackground`), with the same stack in
  the gutter band. "Suggest cast & location" ([`autoTag.ts`](../src/lib/breakdown/autoTag.ts)) offers the heading
  location and the first cue of each speaking character. Older drafts are read-only.
- **Sheet** ([`script-breakdown-sheet.tsx`](../src/features/schedule/script-breakdown-sheet.tsx)). The scene's
  sheet, built by [`buildSceneSheet`](../src/lib/breakdown/sceneSheet.ts) from data already held:
  - scene number, INT/EXT and DAY/NIGHT, description and location from the scene;
  - script pages and page count (eighths) from `script_pages`;
  - date from the latest tag change;
  - production title and code from the production.
- **Elements** ([`script-breakdown-elements.tsx`](../src/features/schedule/script-breakdown-elements.tsx)). Every
  element by category, with its scenes, status, link, notes, merge and delete. This is the department list.

## Sourced status

[`matching.ts`](../src/lib/breakdown/matching.ts) is a pure function:

| Category | Matched against | Sourced when |
|---|---|---|
| Locations | Locations | booked or wrapped; on hold / unbooked = in progress |
| Cast | cast members, by role name then name | found, and in the cast list (`scene_cast`) of every tagged scene; otherwise in progress |
| Lighting | Equipment in `lighting` / `lighting_accessories` | found |
| Foley/Music | Music tracks (+ clearances) | found; in progress while a clearance exists but is not granted |
| Others | — | the element's manual status |

How the match is chosen:

- A linked element uses its linked row.
- Otherwise a single exact name match is used automatically, and is offered as "Confirm link".
- Loose matches (word overlap, [`bestMatches`](../src/lib/text/similarity.ts)) are only suggestions.
- Marking an element sourced by hand always wins.

Adding a database for another category (e.g. props) means adding a candidate list and a judge in `matching.ts`.

## New drafts

When the latest draft is opened, [`carryBreakdownTagsForward`](../src/lib/db/repositories/scriptBreakdown.ts)
moves tags from earlier drafts onto it. Each tag is carried once and stays on the same element, so its status
carries with it.

[`revisionCarry.ts`](../src/lib/breakdown/revisionCarry.ts) pairs the scene's lines in both drafts with the Script
Supervisor's `matchElements`, then looks for the tagged words:

- in the paired lines → **carried**, or **moved** if those lines were reworded;
- elsewhere in the scene → **moved**;
- nowhere → **unmatched**.

Every tag gets a `script_revision_items` row with `item_type = 'breakdown_tag'` (the CHECK was widened in 0105).
Moved and unmatched tags are listed on the page until marked done.

## Exports

[`src/lib/pdf/scriptBreakdown.ts`](../src/lib/pdf/scriptBreakdown.ts) produces two PDFs:

- **Scene sheets**: one page per scene, with category boxes labelled on their highlight colour (`TextBlock.labelFill`).
- **Department list**: a table per category with a tick box.

Both are saved to Documents › Script & sides (`script_breakdown_sheets` / `script_breakdown_report`) and offered
through Save As.

Breakdown tables travel in `.apf` files from formatVersion 10 and are copied by Duplicate production. Copied
elements keep their location, cast and music links; equipment links are dropped because equipment is not copied.
