# 4. Script

The Script pages turn a screenplay into scenes, then into the sections that shots cover and the breakdown elements departments need. Start here: scenes created by Script Import feed the Stripboard, Shot Lists, Cast Manager and Day Out of Days.

The Script group in the sidebar has three pages: **Script Import**, **Script Sections** and **Script Breakdown**. (Script Supervisor is experimental; see [Experimental features](15-experimental-features.md).)

## Import a script

Script Import accepts pasted text, a `.txt` file or a PDF with a text layer. Scanned PDFs are not supported because there is no OCR. If a PDF has no selectable text, paste the script text instead. PDFs are limited to 400 pages.

![Script Import with the upload and paste cards](images/04-script-import.png)

1. Open **Script → Script Import**.
2. Either click **Pick file...** and choose a `.txt` or `.pdf` script, or paste the text into **Raw text** and click **Parse scenes**.
3. The page lists **Found N scene(s)**. Each row shows the scene number, heading and INT/EXT, DAY/NIGHT and page-eighths badges.
4. Click a row to fix how its heading was read. In **Edit parsed scene**, change **Scene number**, **Location**, **INT / EXT** or **Time of day**, or pick **Use existing production location**. Click **Save**.
5. Review **Locations in this import**. If the same place is spelled several ways, edit **Canonical name** and click **Merge N scenes** so they become one location.
6. Optionally fill in **Version label** (for example `v2`) and **Revision colour** (for example `Blue`).
7. In an episodic production, choose the **Episode for imported scenes**. This is required.
8. If an earlier script version exists, tick or clear **Link to previous script version**. Leave it ticked for a revision of the same script.
9. Click **Create scenes in production**.

A scene starts wherever a line begins with `INT.`, `EXT.`, `I/E`, `INT/EXT` or similar. Plain-text imports number scenes 1, 2, 3 in order. PDF imports use the scene numbers printed in the margins when they are there. Check the numbers in step 4 if your script has omitted or lettered scenes.

![Edit parsed scene dialog](images/04-edit-parsed-scene.png)

When the import finishes, a banner reads **Script version created.** and links to **View script sections**. The import creates:

- A scene for each heading, with its INT/EXT, day or night and location.
- A location for each new place name (status Unbooked, no address). See [Locations](06-locations.md).
- A script version with its text, split into sections of about an eighth of a page.

The file you picked is also kept with the production as a stored document.

> **Note** Importing again does not replace existing scenes. It adds new scenes and a new script version, so give them scene numbers that do not clash with the ones already in the production.

> **Note** Page and eighth counts for a `.txt` file are estimates from line counts. Sections for a PDF follow its real pages.

## Script Sections

Sections are the slices of script that shots cover. Script Sections shows how much of the script is covered, scheduled and shot.

![Script Sections with status filters, scene list and script panel](images/04-script-sections.png)

1. Open **Script → Script Sections**.
2. Choose the **Script version** and, if you like, a single **Scene**.
3. Use the status buttons to filter: **All**, **No coverage**, **Covered**, **Scheduled**, **Shot** and **Cut**. Each shows a count.
4. Click a section to highlight it in the script on the right. Its detail shows the shots linked to it, their shoot days and any printed takes.

Sections are numbered per scene, for example `12.1`, `12.2`. A status is worked out from the rest of the app and cannot be typed in:

| Status | Meaning |
|---|---|
| **No coverage** | No shot is linked yet. |
| **Covered** | Shots are linked. |
| **Scheduled** | Every linked shot is on the Stripboard. |
| **Shot** | Every linked shot has a printed take, or the scene is marked complete by the script supervisor. |
| **Cut** | You marked the section as cut. |

### Link shots to sections

1. Open **Schedule → Shot Lists** and pick a scene.
2. On a shot row, click **Sections**.
3. In **Link script sections**, click or drag across the script, or tick sections in the list.
4. Click **Save links**.

A shot with no sections shows **No coverage**. After a new script revision, linked shots may show **Needs review**.

### Change a section's range

1. Select a section and click **Edit**, or click the pencil on its row.
2. Drag across the script to set the range. Shift-click extends it. Use the **Start** and **End** − and + buttons to nudge by an eighth.
3. If **Saving changes other sections** appears, read it. The newest selection wins, and neighbouring sections are trimmed to fit.
4. Click **Save**. **Reset** returns to the saved range.

![Edit section dialog](images/04-edit-section.png)

To add a section, click **New section**, choose the **Linked scene**, and set the range the same way. In the edit dialog, **Mark as cut** leaves a section out of coverage, scheduling and sides; **Restore section** brings it back. **Delete** asks for a second click on **Confirm delete**.

### Compare script revisions

When the selected version is linked to an earlier one, **Compare with previous revision** appears. **Revision reconciliation** reports which sections matched, changed, were removed or are new. **Apply safe shot link remaps** moves shot links onto the matching sections in the new version. Links to sections you created by hand are never moved automatically.

## Sides

Sides are the script pages for one shoot day. They are built from the Calendar.

1. Open **Schedule → Calendar** and click a shoot day.
2. In the day summary, find **Sides** and click **Open Sides Builder**.
3. Narrow the sections with the filters (**Unit**, **Scene**, **Character**, **Location**, and **Episode** in episodic productions), or the **Linked-shot sections only** option.
4. Tick the sections to include. **Validation** lists problems; blocking ones disable export.
5. Click **Export sides PDF**, then **Open sides PDF**.

Exports are listed under **Sides** in the day summary and saved to Documents. See [Schedule](05-schedule.md) for the Calendar.

## Script Breakdown

Script Breakdown is for tagging what each scene needs, and for handing departments their lists.

![Script Breakdown, Script view, with a scene list and tagged words](images/04-script-breakdown.png)

### Tag the script

1. Open **Script → Script Breakdown** and choose a **Script version**. Tagging is only available on the latest version; older ones are read-only.
2. Pick a scene from the list on the left. Each scene shows **Not broken down**, or a count such as **2/3 sourced**.
3. With **Script** selected in the **Breakdown view**, highlight words in the script.
4. In the box that opens, click a category or press its key.

| Key | Category | Key | Category |
|---|---|---|---|
| 1 | Cast | 7 | Foley/Music |
| 2 | Props | 8 | Special FX |
| 3 | Extras | 9 | Stunts/Choreography |
| 4 | Costume | 0 | Animals/Children |
| 5 | Locations | - | Vehicles |
| 6 | Lighting | | |

Tagging the same words in several scenes creates one element with many tags. Click a tagged word to see its tags, move a tag to another element (**New element…** creates one) or remove it with **Remove tag**.

**Suggest cast & location** offers the scene's heading location and each speaking character. Untick any you do not want and click **Add N tags**. The category buttons above the script show or hide each colour.

### The scene sheet

Select **Sheet** to see a breakdown sheet for the scene: scene details, page count, and a box per category listing its elements with a status dot. Click an element to open it in **Elements**. **Export scene PDF** saves this scene's sheet. **Export all scenes** saves one page per scene. The production number on the sheet comes from **Production code** in the production's edit dialog (see [Productions](03-productions.md)).

### Elements and sourcing

Select **Elements** to see every element by category. Filter by **Category**, **Status** or search. Expand a row to work on it:

- **Mark sourced** sets the status by hand and overrides everything else.
- **Rename**, **Merge into** another element of the same category, or **Delete element** (this also removes all of its tags).
- **Notes for the department** are printed on the department list.
- **Confirm link** or **Link to ...** ties the element to a location, cast member, piece of equipment or music track.

Status is checked against the rest of the production:

| Category | Sourced when |
|---|---|
| Locations | A matching location is **Booked** or **Wrap**. **Hold** and **Unbooked** are in progress. |
| Cast | A matching cast member exists and is in the cast list of every tagged scene. Otherwise in progress. |
| Lighting | A matching lighting item exists in Equipment. |
| Foley/Music | A matching music track exists. In progress while its clearance is not granted. |
| All others | You mark it sourced. |

Statuses are **Sourced**, **In progress** and **Needed**. A single exact name match is used automatically and offered as **Confirm link**. Looser matches appear only as suggestions.

**Export department list** (or **Export Cast list** and so on when a category is chosen) saves a tick-box list per category. Both PDF types are saved to **Documents → Script & sides**.

![Elements view with an expanded element](images/04-breakdown-elements.png)

### After a new script draft

Import the new draft with **Link to previous script version** ticked, then open Script Breakdown. Tags from the earlier draft are carried across, keeping their elements and statuses. A box reports how many tags need a look, for example because the words moved or could not be found. Use **Go to scene** to check each and **Done** to clear it.

> **Note** Script Sections, sides and Script Breakdown are stored on your own computer. For a production that uses a remote server they show a notice and are unavailable.

**Next:** [Schedule](05-schedule.md)
