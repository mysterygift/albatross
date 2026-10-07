# 11. Call Sheets and Movement Orders

Call Sheets and Movement Orders turn your schedule, bookings and locations into PDFs for a shoot day. Both live under **Deliver** in the sidebar. They read what you have already entered, so fill in the [Schedule](05-schedule.md), [Locations](06-locations.md) and [People](07-people.md) first.

## Before you start

A call sheet or movement order is built for one shoot day and one unit. Check these first:

| What | Where | Used for |
|---|---|---|
| Shoot day with a unit and scheduled strips | **Schedule → Stripboard** | Shooting schedule, locations |
| Call time and wrap time | **Schedule → Calendar** (open the day) | Unit call and wrap on the call sheet |
| Cast and crew bookings for that day | **People → Bookings** | Who is called, who receives a copy |
| Key contacts and crew departments | **People → Crew Manager** | Primary contacts, departmental requirements |
| Location addresses | **Locations** | Base and locations, movement legs, travel times |

## Make a call sheet

1. Go to **Deliver → Call Sheets**.
2. Choose a **Shoot day** and a **Unit**.
3. Choose **Paper size**: **A4** or **US Letter**.
4. On an episodic production, tick **Include episodes** to add an EP column to the shooting schedule.
5. Click **Preview PDF**. The call sheet appears in the **Preview** panel on the right.

![The Call Sheets page with a generated preview](images/11-call-sheet-preview.png)

The PDF opens with the production, date, day number and unit, then **Essential times & primary contacts**, environment and safety, base and locations, the shooting schedule, principal cast calls, departmental requirements, health and safety, meals when set, and an advanced schedule of the next shoot days.

> **Note:** The shooting schedule follows the Stripboard order for the chosen unit, including special strips such as **MOVE**, **CALL**, **LUNCH** and **WRAP**, and groups **IF TIME PERMITS** strips after the main block.

## Add weather and safety information

- **Weather:** when you preview or save, Albatross looks up a forecast for the first scheduled location. If that fails (for example offline), it uses what you type in **Weather (manual fallback)**. A message under the field says when the fallback was used.
- **Sunrise (optional)** and **Sunset (optional)** are used when the forecast does not supply them.
- **Safety information** is saved to the shoot day as you type and printed in the **Environment & safety** section. Use it for day-specific notes such as "Hard hats required on set".

## Check who is called

Below the form, **Cast called (booked & required)** lists the cast who are both booked and needed by the scheduled scenes, with number, name, phone and agent. **Departmental requirements (booked crew by department)** lists booked crew grouped by department, heads of department first.

Two alerts help you spot gaps:

- **required cast not booked for this day**: add a booking in **People → Bookings** to include them.
- **booked cast not required by scheduled material**: booked but not in any scheduled scene.

If the day's risk assessment is missing or still a draft, a red alert says **No RAMS covers this unit** or **RAMS not signed off**, with a link to **Open risk assessments**. See [Risk Assessments](09-risk-assessments.md).

## Save and distribute

| Button | What it does |
|---|---|
| **Preview PDF** | Builds the PDF in the preview panel. Nothing is saved. |
| **Save PDF** | Saves the call sheet to **Documents** and asks where to save a copy on your computer. |
| **Distribute Call Sheets** | Creates one personalised copy per person. |

If the risk assessment is missing or unsigned, **Save PDF** and **Distribute Call Sheets** ask **Export anyway?** first. The warning never blocks you.

### Distribute personalised copies

1. Click **Distribute Call Sheets**.
2. In the dialog, tick the cast and crew who should receive a copy. **Select all** and **Clear all** speed this up.
3. Click **Generate Selected Copies**.
4. Pick a folder for the copies when your computer asks.

Each copy has the recipient's name watermarked on it and is named `call-sheet-<date>-<unit>-<name>.pdf`. The copies are also filed in **Documents**. Sending them (email, messaging) is up to you; Albatross does not send anything.

![The Distribute Call Sheets dialog](images/11-distribute-call-sheets.png)

## Make a movement order

A movement order tells the unit how to travel between locations on the day: the order of stops, depart and arrive times, directions and contacts.

1. Go to **Deliver → Movement Orders**.
2. Choose a **Shoot day**, a **Unit** and a **Paper size**.
3. Check the **Movement order data summary** at the bottom. It lists **Ordered locations** (in the stripboard order of the unit's scenes), **Locations department contacts** and **Movement legs**. A journey needs at least two stops, or one location plus a base address on the shoot day.
4. Click **Refresh travel data** to fetch driving and walking times and written directions for each leg.
5. Enter the times (see below), then click **Preview Movement Order**.

![The Movement Orders page](images/11-movement-orders.png)

### Set times and revision

In **Times & revision**:

1. Optionally type a **Revision label**, for example `Draft 2`, so recipients can tell versions apart.
2. Set **Unit base opens**.
3. For each leg, enter the **Depart** and **Arrive** times by hand. Albatross does not calculate these from the crew call, so staggered or late departures print exactly as you enter them.

Times and revision label are saved automatically against the shoot day and unit.

### Maps and pins

The **Route maps & pins** card shows a route overview and a close-up for each location. Tick **Include maps in the PDF** to print them.

1. Under **Drop a pin:** click **Unit base**, **Parking** or **Other**, then click the map to place it.
2. Drag a pin to move it. In the **Pins** list, change its type, give it a **Label** and **Notes (e.g. permit number, bays)**, or use the bin to delete it.

Pins belong to the shoot day and are saved automatically. Maps need a map tile key: if you see a message asking for one, add it in **Settings → APIs & publishing → Map tiles** (see [Settings and administration](14-settings-and-admin.md)).

### Save and distribute

| Button | What it does |
|---|---|
| **Preview Movement Order** | Builds the PDF in the preview panel. |
| **Save PDF** | Saves to **Documents** and asks where to save a copy. |
| **Save & Open** | Same as **Save PDF**, then opens the saved file. |
| **Distribute Movement Orders** | Creates a watermarked copy per person, like call sheets. |

**Distribute Movement Orders** works exactly like **Distribute Call Sheets**: tick recipients (the cast called and crew booked for the day), click **Generate Selected Copies** and pick a folder. Files are named `movement-order-<date>-<unit>-<name>.pdf`.

> **Tip:** Saved call sheets and movement orders appear in **Deliver → Documents** under **Set paperwork**. See [Documents](12-documents-deliverables-music.md#documents).

**Next:** [Documents, Deliverables and Music & Archive](12-documents-deliverables-music.md)
