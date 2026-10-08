# 6. Locations

Locations is the register of every place the production shoots, holds or parks at: status, address, fee, contact, permits and release forms. Scenes, the Calendar and Movement Orders all read from this list.

## The Locations list

Open **Locations** in the sidebar (Plan group).

![The Locations list showing name, status, address, fee and contact](images/06-locations-list.png)

| Column | Shows |
|---|---|
| **Name** | The location's name. |
| **Status** | `unbooked`, `hold`, `booked` or `wrap`. |
| **Address** | Street address, or a dash if none. |
| **Location Fee** | In the production's currency. |
| **Contact** | Contact name, with email and phone beneath. |

Use the pencil icon at the end of a row to edit, and the bin icon to delete. Deleting asks for confirmation first. It also removes the location's permits and release forms.

> **Tip** Searching (⌘K / Ctrl+K) for a location name takes you to this page with the row highlighted.

## Add a location

1. Open **Locations** and click **Add location**.
2. Enter a **Name** and an **Address**. Both are required.
3. Set **Booked status**: **Unbooked** (the default), **Hold**, **Booked** or **Wrap**.
4. Optionally fill in **what3words**, **Parking information**, **Availability constraints**, **Location fee** (0 or greater) and **Notes**.
5. Under **Location contact**, enter **Name**, **Phone** and **Email**. A malformed email is rejected.
6. Click **Save**.

![The Add location dialog](images/06-add-location.png)

## Attach permits and release forms

The Add and Edit dialogs have two upload sections, **Permits** and **Location release forms**.

1. Click **Upload** in the section you want.
2. Choose a file in the system file picker. PDF, PNG, JPG, DOC and DOCX are accepted.
3. In a new location, the file is listed as "Uploads on save" and is stored when you click **Save**. In an existing location it is stored straight away.
4. Use the open icon to view a file and the bin icon to remove it.

> **Note** If a file fails to upload when you create a location, the location is still saved and a banner tells you to edit it and add the file again.

## How locations are used elsewhere

- **Script Import** creates a location for each new scene heading location, with status `unbooked` and no address. When you later edit one of these, you must enter an address before you can save. See [Script](04-script.md).
- **Scenes** have one location. You set it when you create or edit a scene on the Shot Lists page. See [Schedule](05-schedule.md).
- **Script Breakdown** treats a tagged Locations element as sourced once the matching location is **Booked** or **Wrap**, and in progress while it is **Hold** or **Unbooked**.
- **Calendar** day summaries list each day's locations in order with their addresses. Locations without an address show "Address missing".
- **Stripboard** Move strips can name an origin and destination location. See [Schedule](05-schedule.md).
- **Movement Orders** use the address to build route maps. See [Call Sheets and Movement Orders](11-call-sheets-and-movement-orders.md).

> **Note** Locations are a flat list. The page has no map and does not list the scenes shot at a location.

**Next:** [People](07-people.md)
