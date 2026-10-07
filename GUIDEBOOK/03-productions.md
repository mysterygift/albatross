# 3. Productions

A production is the container for everything else in Albatross: script, schedule, people, budget and paperwork. Use **Productions** to create, edit, duplicate, archive, import and export them.

![Productions page](images/03-productions-list.png)

The page lists every production with its **Name**, **Notes**, **Client** and **Delivery date**. Badges mark **Episodic** and **Archived** productions. Each row has four buttons: **Edit**, **Duplicate production**, **Archive project** and **Delete permanently**.

> **Note** If your account has limited access to a production, the buttons you cannot use are disabled. See [Settings and admin](14-settings-and-admin.md).

## Create a production

1. Go to **Productions** and select **New production**. You can also use **File → New Project…**, ⌘N (Ctrl+N), or **New production…** in the production switcher.
2. Enter a **Name** and, optionally, a **Project description**.
3. Optionally choose a **Client** and a **Delivery date** (see [Clients](#clients)).
4. Tick **Episodic production** for a series (see [Episodic productions](#episodic-productions)). Leave it unticked for a film, commercial or single programme.
5. Pick a **Project template**:
   - **Default** adds a chart of accounts, starter tasks (Pre-Production, Principal, Post) and a small set of deliverables. This is selected by default.
   - **Blank** adds nothing: no accounts, tasks or deliverables.
6. Select **Create**.

![New production dialog](images/03-new-production.png)

The new production becomes the current production straight away. The **Get started** checklist on the [Dashboard](02-finding-your-way.md#dashboard) is a good next step.

## Switch between productions

Select the production name in the top bar and pick another production from the list. Everything in the app, including search, shows data for the production selected there. Productions are kept completely separate.

## Edit a production

1. On **Productions**, select the pencil (**Edit**) on the row.
2. Change the **Name**, **Production code**, **Notes**, **Client** or **Delivery date**.
3. Select **Save**.

The **Production code** is optional. It is printed as the production number on script breakdown sheets, for example `WR-2026/01`.

## Clients

A client is an optional name, email and phone number attached to productions. Clients are shared across all your productions, so one client can be reused.

- **Pick one while creating or editing.** Open the **Client** list and choose a name, **None**, or **Add new client…**. For a new client, fill in **Client name**, **Email** and **Phone**, then select **Save client**. It is selected for you.
- **Manage the list.** Go to **Settings → Production** and scroll to **Clients**. Use **Add client**, or the edit and delete buttons on a row. Editing a client updates every production that uses it.

## Duplicate a production

Duplicate makes a full working copy: schedule, script, people, budget, documents and attachments. Use it for a what-if version, a safety copy before big changes, or a template for a similar job.

1. On **Productions**, select **Duplicate production** on the row.
2. Edit the **New production name** (it defaults to the original name plus "(Copy)").
3. Select **Duplicate**.

The copy becomes the current production. A confirmation message appears above the list.

## Archive and restore

Archiving hides a production from the list and the switcher without deleting anything. [Wrapping a production](13-tasks-and-wrap.md) also archives it.

1. Select **Archive project** on the row. The production disappears from the list.
2. To see archived productions, select the box icon at the top right of the page (its tooltip reads **Show archived projects**). Archived rows are greyed and badged **Archived**.
3. To restore one, select **Unarchive project** on its row.

## Delete a production

1. Select **Delete permanently** (the bin) on the row.
2. Confirm with **Yes, delete**.

This removes the production and all of its data and cannot be undone. Archive instead if you may need it again.

## Export and import a production file

An `.apf` (Albatross Project File) holds one production, including its document attachments and storyboard images. Use it to back up a production, move it to another computer, or send it to a colleague.

### Export

1. Open the production you want to export, so it is the current production.
2. On **Productions**, select **Export project**. (**File → Export Project…** and ⇧⌘E do the same.)
3. Choose a name and location in the save dialog and confirm.

A message confirms `Project exported as "…apf"`.

### Import

1. On **Productions**, select **Import project**. (**File → Import Project…** and ⌘O do the same.)
2. Choose an `.apf` file in the open dialog.

The production is added and becomes the current production. If the file has attachments missing, those documents are imported without their files and Albatross tells you. If the exported production was archived, it imports as archived and Albatross tells you to use **Show archived projects** to find it.

> **Tip** On an installed copy of Albatross, double-click an `.apf` file in Finder or File Explorer. Albatross opens (sign in if asked) and imports it automatically. If the file opens in another program instead, see [Troubleshooting](16-troubleshooting.md).

Import stops without changing anything if:

- A production with the same ID or the same internal name (slug) already exists in this library. To make a second copy in the same library, use **Duplicate production** instead.
- The file was made by a newer version of Albatross. Update the app and try again.
- The file is damaged or is not an Albatross project file.

> **Note** An `.apf` file holds production data only. Your sign-in accounts, app settings and global templates are not included. If the file names a client that does not exist in your library, the client link is left blank.

## Episodic productions

Episodic productions are for series and multi-episode work. They add episodes and shooting blocs.

- **Episodes** are the episodes of the series. Script import, deliverables and music are assigned to an episode.
- **Shooting blocs** are named date ranges on the calendar (for example "Block A"). The [Calendar and Stripboard](05-schedule.md) can be filtered by bloc.

### Make a production episodic

At creation, tick **Episodic production** and enter a **First episode name** (for example "Episode 1" or "101"). Albatross creates the episode and a default bloc called **Block A**.

For an existing production, go to **Settings → Production**, find **Episodic production** and select **Enable episodic mode…**. Enter the **First episode name** and confirm with **Enable episodic mode**.

> **Important** Episodic mode cannot be turned off once it is on.

![Episodes and shooting blocs in Settings](images/03-episodes-blocs.png)

### Manage episodes

Go to **Settings → Production → Episodic production → Episodes** (shown only for episodic productions).

1. **Add episode** adds one at the end of the list. Enter a name and select **Add**.
2. Use the arrows (**Move up**, **Move down**) to set the order. Order is used wherever episodes are listed.
3. **Rename** changes a name.
4. **Archive** hides an episode from active lists but keeps it on file. Archived episodes show a **Delete archived episode** button.
5. **Delete episode** removes it permanently. Scenes, music tracks and deliverables assigned to it keep existing but have no episode until you reassign them.

You cannot archive or delete the last active episode.

### Manage shooting blocs

Below the episodes, **Shooting blocs** lists each bloc with its dates.

1. Select **Add bloc**. The form suggests a name and dates. Adjust the **Name**, **Start date** and **End date** (`YYYY-MM-DD`; both dates are required, and the start cannot be after the end), then select **Add bloc**.
2. Use the edit button on a row to rename a bloc or change its dates. Changing dates can move or remove shoot days, so Albatross lists the effects and asks **Apply this change?** first.
3. Use the delete button to remove a bloc. Albatross shows what will be affected before you confirm. The first bloc cannot be deleted.

**Next:** [Script](04-script.md)
