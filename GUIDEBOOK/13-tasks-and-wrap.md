# 13. Tasks and Wrap Production

Tasks is a checklist for the current production: permits, contracts, department hand-offs, delivery chores. Wrap Production is the closeout check you run when shooting is finished, before you archive the production.

## The Tasks page

Open **Tasks** in the sidebar. The page lists every task for the current production, grouped by section, with a **% complete** badge in the header.

![Tasks page with sections, priorities and a parent task showing subtask progress](images/13-tasks-overview.png)

Each row shows the description (with a notes preview underneath), **Department**, **Due date**, **Priority** and **Status**. A parent task also shows "2 / 4 subtasks complete".

### Add a task

1. Click **New task**.
2. Enter a **Description** (required). Notes, **Due date**, **Department**, **Priority** (High, Medium, Low) and **Section** are optional.
3. Click **Add**.

![New task dialog](images/13-new-task-dialog.png)

### Add a subtask

1. On the parent task's row, click the subtask icon (tooltip **Add subtask**).
2. Fill in the dialog, titled **Add subtask**, and click **Add**.

Subtasks can be nested further by adding a subtask to a subtask. A subtask always sits in its parent's section.

### Work through tasks

- Click the **Incomplete** / **Complete** button in the Status column to toggle a task.
- Click the pencil icon to edit. The **Edit task** dialog also has a **Mark as complete** checkbox.
- Click the chevron on a parent task to collapse or expand its subtasks. Collapsed state is not remembered between visits.
- Click the bin icon to delete a task. A confirmation first tells you how many subtasks will be deleted with it.

### Sections

Sections group tasks, for example "Pre-production" or "Wrap".

1. Click **Manage Sections**.
2. Type a name under **New section name** and click **Add**. Use the pencil to rename and the bin to delete.
3. To move a task, click the folder icon (tooltip **Assign to section**) on a top-level task and pick a section or **No section**. Its subtasks move with it.

Deleting a section does not delete its tasks. They move to **Unsectioned**.

### Search and filter

Above the table, search by description or notes, or narrow the list with the filters below. **Clear filters** resets everything.

| Filter | Options |
|---|---|
| **Status** | All, Incomplete, Complete |
| **Department** | All departments, or one of the production departments (Camera, Sound, Legal and so on) |
| **Priority** | All, High, Medium, Low |
| **Due** | All, Overdue, Due soon (today to 7 days ahead), No due date |

## Task templates

A template is a reusable batch of tasks, with nested subtasks and section names. Templates are shared by every production on this machine, so you build a "Pre-shoot checklist" once and apply it to each production. Albatross ships with no ready-made templates.

### Build a template

1. Click **Templates**.
2. Type a name under **New template name** and click **Add**.
3. Click **Edit items** next to the template, then **Add item**.
4. For each item, set **Description** (required), **Notes**, **Due offset (days)**, **Section name**, **Department** and **Priority**. Click **Add**.
5. Use the subtask icon on an item to nest an item under it. Pencil edits an item; bin deletes it.

![Template editor listing items and their sections](images/13-template-editor.png)

From the **Task Templates** list you can also rename a template (pencil) or delete it (bin, with confirmation). Deleting a template never touches tasks already created from it.

### Apply a template

1. Click **Apply Template**.
2. Choose a **Template**.
3. Optionally set an **Anchor date**. Each item with a due offset gets a due date of anchor date plus its offset (use a negative offset for "14 days before"). With no anchor date, those tasks have no due date.
4. Click **Apply**.

The tasks are added to the current production. Sections named in the template are created if they don't exist yet, otherwise reused.

> **Tip** The **Dashboard** has two task cards: **Tasks Due Soon** (open tasks, overdue first, then by priority) and **Required items**, which counts **High** priority tasks. Mark must-do tasks High and they appear in both.

## Wrap Production

Wrap Production reviews money, schedule and deliverables in one place, then archives the production. It is a check, not a gate: warnings never block you from finishing.

### Open it

- Click the production switcher at the top of the window and choose **Wrap production...**, or
- on the **Dashboard**, click **Wrap production** next to "Finished shooting?".

![Wrap Production page with the four sections collapsed](images/13-wrap-overview.png)

### Review the four sections

Click a section header to expand it. Each header shows **Ready** or **Needs review**.

| Section | Ready when | Fix it in |
|---|---|---|
| **Budget and Actualisation** | All spend is allocated to line items, no line item is unmatched, none is overspent, and every petty cash float is reconciled | **Budget**, including its actualisation and floats tabs |
| **Schedule and Calendar** | No shoot day falls after today | **Schedule → Calendar** |
| **Deliverables** | At least one deliverable exists and every one has status **Delivered** (Ready, QC, Preparing and Not started do not count yet) | **Deliverables** |

Expanded sections show counts and detail tables:

- **Budget and Actualisation**: unallocated spend, unmatched, partially matched and overspent line items, remaining estimate, petty cash floats (floats open for more than 14 days, or overspent, are flagged), and potential reallocation opportunities. The reallocation list is informational only.
- **Schedule and Calendar**: future shoot days, future scheduled activity, the latest scheduled date and a table of each future item.
- **Deliverables**: every deliverable with its status and due date.

![Budget and Actualisation section expanded](images/13-wrap-budget-expanded.png)

### Complete and archive

1. Click **Complete and Archive Production** at the bottom of the page.
2. Read the summary in the confirmation dialog. It repeats each check as **Ready** or **Needs review**. Outstanding items do not stop you.
3. Click **Complete and Archive Production** again to confirm, or **Cancel**.

Albatross archives the production, clears the current production and returns you to the Dashboard.

To see an archived production again, open **Productions** and switch on the show archived toggle. Archiving and unarchiving are covered in [Productions](03-productions.md).

> **Note** When user accounts are enabled (see [Settings and admin](14-settings-and-admin.md)), only a production administrator or an instance admin can complete and archive.

**Next:** [Settings and admin](14-settings-and-admin.md)
