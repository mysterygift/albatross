# 12. Documents, Deliverables and Music & Archive

Three **Deliver** pages that keep the paperwork side of a production together: **Documents** is the filing cabinet for every file and export, **Deliverables** tracks what you owe distributors and clients, and **Music & Archive** lists the music used and produces a cue sheet.

## Documents

Documents collects every file in the production: scripts, generated call sheets and movement orders, cost reports, receipts, permits, deliverable attachments and anything you upload yourself. Albatross files generated PDFs here automatically when you save them.

![The Documents page showing the category cards](images/12-documents-hub.png)

### Browse by category

Open **Deliver → Documents**. Each card is a category with a file count and the most recent files:

| Category | Holds |
|---|---|
| **General files** | Manual uploads and uncategorised attachments |
| **Script & sides** | Imported scripts, script breakdown exports, shoot-day sides |
| **Set paperwork** | Call sheets, movement orders, risk assessments, script supervisor paperwork |
| **Releases** | Releases signed in Release Forms, uploaded contributor forms and location releases, permits |
| **Deliverables** | Files attached to deliverables |
| **Music & clearance** | Cue sheets |
| **Budget & finance** | Budget CSVs, cost reports, vendor invoices, purchase orders, expense receipts |
| **Production lists** | Equipment checklists and Day Out of Days exports |

1. Click a category card.
2. Files are grouped by what they relate to (for example by shoot day, deliverable, person or location). Each row shows the file name, its type and where it came from.
3. Click **Open** to open the file in your computer's default app, or **View source** to jump to the page that produced it. An empty category has a **Go to source** link.

### Find a file

1. Click **Search** at the top of the Documents page.
2. Type part of a file name, document type or context. Results update as you type.
3. Select a result to open the file.

### Upload a file

1. Click **Upload file**.
2. In **Choose a category**, pick where the file should appear, then click **Choose file…**.
3. Select the file in your computer's file picker. It is copied into the production's storage.

### Delete a file

Click the bin icon on a file's row, then **Delete document** to confirm. This is permanent. You can delete general and manually uploaded files, and anything in **Set paperwork**, **Music & clearance** and **Budget & finance**. Deleting an expense receipt also removes it from its expense. Files in other categories are removed from where they belong (for example, remove a deliverable's attachment from the deliverable).

> **Note:** Files are copied into Albatross's storage on your computer, so they stay available if the original moves. See [Troubleshooting](16-troubleshooting.md) for where data lives.

## Deliverables

Deliverables tracks each item you owe at the end of the job (picture masters, audio mixes, subtitle files, QC reports), who it goes to, when it is due and whether it has been approved.

![The Deliverables page](images/12-deliverables-overview.png)

The table shows **Name**, **Recipient**, **Due date**, **Status**, **Approval**, **Audio** and **Subtitles** (the last two come from the technical specs). It is sorted by due date, then name. On an episodic production a **Show** filter at the top narrows the list to **All deliverables**, **Project-wide** or a single episode, and an extra column shows each item's scope.

### Add a deliverable

1. Click **Add deliverable**.
2. Enter a **Name** (for example "Picture Master"). Optionally add a **Recipient (optional)** and **Due date (optional)**.
3. On an episodic production, choose the **Scope**: **Project-wide** or **Specific episode** (then pick the **Episode**).
4. Click **Add**. New items start as **Not started**.

### Apply a template

A template creates a whole delivery package at once.

1. Click **Apply template**.
2. Pick a **Template**: for example Streaming Package, Festival Package, Broadcast Package, or a platform package for Netflix, Amazon Prime Video, Hulu, Disney+ or Apple TV.
3. Optionally set an **Anchor date**. Each item's due date is the anchor date plus the item's offset. Leave it empty for no due dates.
4. On an episodic production, choose the **Scope**.
5. Click **Apply**.

Platform templates are a starting point, not a compliance check. Review each item against the partner's current requirements.

### Edit a deliverable and attach files

1. Click the pencil icon on a row to open **Edit deliverable**.
2. Under **Basics**, set the **Name**, **Due date** and (episodic) **Scope**.
3. Under **Recipient & delivery**, set the **Recipient**, **Delivery method** (for example Aspera, S3, Hard drive), **Delivered by** and **Delivered at**.
4. Under **Status**, choose a **Status** (**Not started**, **Preparing**, **QC**, **Ready**, **Delivered**) and an **Approval** (**Pending**, **Approved**, **Rejected**). Approval is separate from status, typically the recipient's sign-off.
5. Under **Attachments**, click **Attach file** to add QC reports, subtitle files or delivery receipts. Open or remove them from the same list.
6. Click **Save**.

![The Edit deliverable panel](images/12-edit-deliverable.png)

### Technical specs

1. Click the gear icon on a row to open **Technical specs**.
2. Fill in what applies: **Resolution**, **Codec**, **Bitrate** (Video); **Audio mix**, **Language** (Audio & Language); **Subtitles**, **Graphics** (Subtitles & Graphics); and **Notes**.
3. Click **Save**.

Each deliverable has one spec. The **Audio** and **Subtitles** columns in the table read from it.

### Delete a deliverable

Click the bin icon on the row. Albatross asks you to confirm, then removes the deliverable.

> **Tip:** The Dashboard shows deliverables that are overdue or due within 14 days. See [Finding your way](02-finding-your-way.md).

## Music & Archive

Music & Archive is the production's list of music tracks. From it you generate a cue sheet PDF to send to a composer, publisher or broadcaster.

![The Music & Archive page with a track list](images/12-music-archive.png)

### Add and edit tracks

1. Open **Deliver → Music & Archive**.
2. Click **Add track**.
3. Enter the **Title** (required), **Artist** and **Publisher / Label**. On an episodic production, choose **Applies to**: **Project-wide** or a specific episode.
4. Click **Add**.

To change a track, click its pencil icon, edit the fields and click **Save**. On episodic productions the **Show** filter limits the list to **All tracks**, **Project-wide** or one episode.

### Generate a cue sheet

1. Click **Generate cue sheet PDF**. The button is available once the production has at least one track.
2. Albatross builds `cue-sheet-<date>.pdf` from all tracks, files it in **Documents** under **Music & clearance**, and asks where to save a copy on your computer.

> **Note:** The cue sheet lists title, artist and publisher for every track in the production, whatever the **Show** filter is set to.

**Next:** [Tasks and Wrap](13-tasks-and-wrap.md)
