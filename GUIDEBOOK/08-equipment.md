# 8. Equipment

**Equipment** keeps a registry of the kit on your production (owned, bought or rented) and lets you build pack lists for a shoot day or department, tick items out and back in, and print or export them. Use it from prep through wrap.

The page has two tabs: **Registry** (every item) and **Equipment Lists** (kits made from registry items).

## Add equipment to the registry

![Equipment page, Registry tab](images/08-equipment-registry.png)

1. Open **Equipment**. The **Registry** tab is shown first.
2. Click **Add Equipment**.
3. Fill in the form. **Name** is the only required field.

   | Field | Notes |
   |---|---|
   | **Name** | For example "ARRI Alexa Mini LF" |
   | **Quantity** | Number of identical units, minimum 1. Use it for "8 x sandbags" rather than adding eight rows |
   | **Category** | Camera, Lenses, Camera Support, Camera Accessories, Wireless Systems, Lighting, Lighting Accessories, Power Distribution, Grip, Sound, DIT / Video Village, Production Logistics, Storage / Cases, Consumables, Other |
   | **Source** | Owned, Purchased or Rented (new items default to Rented) |
   | **Department** | Optional. Uses the same departments as Crew Manager (see [People](07-people.md)) |
   | **Status** | Planned, Active, Returned, Lost or Damaged |
   | **Vendor** | Pick one of your vendors, or type a name. See [Budget](10-budget.md) for vendors |
   | **Serial number** | Optional |
   | **Rental start**, **Return due**, **Returned at** | Dates for rented kit |
   | **Replacement value (insurance)** | Value of one item |
   | **Notes** | Optional |

4. Click **Save**.

![The Add equipment dialog](images/08-add-equipment-dialog.png)

The table shows **Name**, **Qty**, **Category**, **Department**, **Source**, **Status**, **Vendor**, **Rental Window** and **Replacement Value**. Use the pencil icon to edit an item and the bin icon to remove it. The bin asks for confirmation, then removes the item and its return reminder (see below).

### Edit several items at once

Tick the box at the start of each row you want to change. The box in the header ticks every item that matches the current search and filters. A bar above the table shows how many items are selected, and how many of them the filters are hiding.

1. Click **Edit selected**. With one item selected, this opens the normal edit form.
2. In **Edit n items**, tick each field you want to change and set its value. Changing a value ticks its field for you. A field where the items differ says **(mixed)**.
3. Click **Apply to n items**.

Fields you leave unticked keep each item's own value. A ticked field left blank clears that value on every selected item. **Name** and **Serial number** are locked, because each item needs its own; edit items one at a time to change them. Return reminders update for each item, just as they do when you edit one item.

### Find items

Search by name, UUID or serial number, and filter by category, source, department or status. Every item has a short UUID, which the exports use to recognise it.

### Return reminders

When an item is **Rented**, has a **Return due** date, and is not marked **Returned**, Albatross creates a task called "Return equipment — *item name*" in [Tasks](13-tasks-and-wrap.md). A bell icon appears next to the item's name. Setting the status to **Returned**, or clearing the date, completes or removes the task. Changing the due date updates it.

### Items bought on an invoice

If an item came from a vendor invoice, open **Budget → Vendors**, choose the vendor, and click the **Add equipment from invoice** icon on the invoice row. For each row you add, choose to create a new item, link to an existing one, or skip. Items linked this way show "(Invoice number)" under the vendor in the registry. See [Budget](10-budget.md).

## Import a registry from CSV

Use this to bring in an existing kit list from a spreadsheet.

1. On the **Registry** tab, click **Import CSV** and choose your file. (The file picker is your computer's own.)
2. In **Import CSV — map columns**, check the preview and match your columns to **Name (required)**, **Quantity**, **Serial number** and **Replacement value**. Click **Continue**.
3. Review **Import CSV — confirm**. It shows how many items will be created, and, if you mapped **Serial number**, how many existing items will be updated. Existing items are matched on name and serial number together. Rows with a blank name are skipped.
4. Click **Import n items**.

Imported items get category **Other**, source **Owned** and status **Planned**, and quantity 1 unless you mapped it. Edit them afterwards to fill in the rest.

## Make a pack list

Lists pick items from the registry; they do not copy them. Editing an item in the registry updates it in every list.

1. Open the **Equipment Lists** tab and click **New Equipment List**.
2. Enter a **Name**, for example "Main Unit Camera Package". Optionally choose a **Shoot day** and a **Department**, and add **Notes**.
3. If registry items already have the department you chose, a **Generate from department** box appears. Tick it to start the list with all of them.
4. Click **Create**.

![Equipment list with OUT and IN checkboxes](images/08-equipment-list.png)

Click a list to open it. A list shows each item's number, order, **Name**, **UUID**, **Category**, **Serial**, **Qty**, **OUT**, **IN** and **Notes**.

- **Add from registry** opens a window listing the whole registry. Search by name, UUID or serial number, and filter by category, department or source. Tick the items you want (or click a row) and set **Qty to add** for each. Typing a quantity ticks the item. Ticks stay when you change the search, so you can build a kit over several searches. Items already on the list are greyed out and marked **On list**; tick **Hide items already on list** to hide them. A quantity above what the registry holds turns red, but you can still add it. Click **Add n items** to add everything you ticked.
- Set **Qty** per row to the number of units to pack. If that is more than the registry holds, the number turns red and an **Insufficient stock in registry** warning appears at the top.
- Use the up and down arrows to reorder.
- The remove icon takes an item off the list only. It stays in the registry.
- **Edit list** changes the name, shoot day, department or notes. The back arrow returns to all lists.

### Check kit out and in

On the day, click **OUT** on a row as it leaves the store, and **IN** when it comes back. The row highlights when ticked. Click again to untick. The state belongs to the list, so the same item can be out on one list and not on another.

## Print or share a list

At the top of an open list:

- **Export PDF** makes a printable checklist with empty OUT and IN boxes. Choose **A4** or **US Letter** in the box beside it first.
- **Export CSV** saves the list as a spreadsheet with a fixed set of columns, including `item_uuid` and `quantity`.
- **Import CSV** adds rows from a CSV that was exported this way. Rows are matched to the registry by `item_uuid` only. In **Import CSV — review**, matched rows will be added; rows that match nothing are listed as **New / unknown**, and nothing is created until you click **Create** on each. Then click **Add to list**.

Your computer asks where to save exported files. A PDF export is also filed in **Documents** (see [Documents, deliverables and music](12-documents-deliverables-music.md)).

> **Note** Equipment and lists are not copied when you duplicate a production; the new production starts with an empty registry. They are included when you export the production as an `.apf` file (see [Productions](03-productions.md)).

**Next:** [Risk Assessments](09-risk-assessments.md)
