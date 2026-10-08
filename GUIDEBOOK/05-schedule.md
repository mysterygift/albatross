# 5. Schedule

Schedule is where scenes become shots and shots become shoot days. It has four pages: **Calendar**, **Stripboard**, **Shot Lists** and **Storyboard**. The normal order of work is Shot Lists, then Stripboard, then Calendar for review and day details.

Everything here belongs to the current production. Scenes come from [Script Import](04-script.md) or are created in Shot Lists. Only shots can be scheduled, so a scene with no shots will not appear on the Stripboard.

## Shot Lists

**Schedule → Shot Lists** holds the scenes and, for each scene, its shots.

![Shot Lists with a scene selected](images/05-shot-lists.png)

### Choose or create a scene

1. Open **Schedule → Shot Lists**.
2. Pick a scene from **Scene**. Scenes imported from a script are already there.
3. To add a scene by hand, click **New scene**, fill in **Scene number**, **Title**, **INT / EXT**, **Time of day** and **Location**, then click **Create scene**. In an episodic production you must also choose an **Episode**.
4. To change a scene, select it and click **Edit scene**.

The **Cast in this scene** card lists everyone assigned to any shot in the scene.

### Add shots

1. With a scene selected, click **Add shot**.
2. Enter a **Shot number** (required, for example `1A`). It must be unique within the scene.
3. Optionally fill in **Subject**, **Shot Description**, **Shot size**, **Movement**, **Duration (m:ss)**, **Est. minutes**, **Lens**, **Support** and **Notes**, and pick **Cast on this shot**.
4. Click **Add shot**.

**Est. minutes** is how long the shot is expected to take to shoot. The Stripboard adds these up to give a day's runtime, so fill them in before you schedule.

### Edit shots

1. Click **Edit** in the toolbar. The button changes to **Editing...** and the cells become editable.
2. Click a cell, change it, and press Enter or click away to save.
3. Click **Editing...** to switch editing off again.

In the table, the copy icon on a row duplicates the shot and the bin deletes it (after a confirmation). **Add cast** on a row assigns cast members to that shot. In edit mode, **Reset cast** removes all cast from every shot in the scene.

The **Sections** column shows how many script sections a shot covers. Click **Sections** to link them. See [Link shots to sections](04-script.md#link-shots-to-sections).

> **Note** Changing a shot number does not move the shot on the Stripboard. The Stripboard follows the shot, not its number.

## Stripboard

The Stripboard assigns shots to shoot days and puts each day in running order.

![The Stripboard with Unscheduled Shots on the left, one shoot day in the centre and the Boneyard on the right](images/05-stripboard.png)

The page has three areas:

- **Unscheduled Shots** (left): shots not yet on any day.
- The selected **shoot day** (centre), with one table per unit.
- **Boneyard** (right): strips you have set aside.

Collapse either side panel with its arrow button.

### Create a shoot day

1. Open **Schedule → Stripboard** and click **New shoot day**.
2. Choose the date and click **Create shoot day**.

The new day has a **Main Unit** table. A day cannot be created on a date that already has one.

### Move through the days

Use the day selector, the previous and next arrows, or the row of day buttons to choose which day you are viewing. The bin button at the right of the day heading deletes the shoot day (see below). The day heading shows the date, the **Day N** badge, the number of shots, pages in eighths, INT and EXT counts, DAY and NIGHT counts, and **Day runtime**. A warning appears when the runtime passes 10 hours, and a stronger one past 10.5 hours (which allows for a 30 minute lunch).

### Schedule shots

You can assign shots in three ways.

**Assign several at once**

1. In **Unscheduled Shots**, filter with **Search** or **Location**.
2. Tick the shots, or click **Select All**.
3. Choose a shoot day and a unit, then click **Assign N to Day**.

**Use the plus button.** The **+** on a shot offers each day and unit; pick one.

**Drag.** Drag a shot onto a unit table. Dropping it on a row inserts it above or below that row. Drag a row within its table to reorder, onto a day button at the top to move it to another day, onto **Unscheduled Shots** to unschedule it, or onto the **Boneyard**.

Each unit table shows **Sc**, **Shot**, **Description**, **INT/EXT**, **D/N**, **Location**, **Pages**, **Cast** and **Est. min** (plus **Episode** in an episodic production). The **INT**, **EXT**, **DAY** and **NIGHT** buttons beside the unit name filter the rows you see. They do not change the schedule.

> **Tip** When you move a shot to **Unscheduled** or the **Boneyard**, a message appears with an **Undo** button.

### Add Call, Lunch, Wrap, Move and Note strips

1. Click **Add strip**.
2. Choose the **Type**: **Move / Setup**, **Call**, **Lunch**, **Wrap** or **Note**.
3. Choose the **Shoot day** and **Unit**.
4. For **Call** and **Wrap**, enter a **Time** as HH:MM. Each unit can have one of each.
5. For **Move / Setup**, optionally pick an **Origin** and **Destination** from your locations. Add a **Title** and **Description** if you want.
6. Click **Add strip**.

![The Add strip popover](images/05-add-strip.png)

The Main Unit's Call and Wrap times become the day's call and wrap times on the Calendar. Origin and destination on a Move strip set the order of locations in the day summary.

Icons on a strip let you edit it:

| Icon | Tooltip | What it does |
|---|---|---|
| Clock (shot) | **Set shot duration** | Overrides the shot's estimated minutes for this strip. Leave it empty to use the Shot List value. |
| Clock (Call, Wrap) | **Edit strip time** | Changes the time. |
| Pencil (Move) | **Edit move / setup** | Changes origin, destination, title and notes. |
| Skull | **Send to Boneyard** | Removes the strip from the day and keeps it in the Boneyard. |
| Bin | **Delete strip** | Deletes a Call, Lunch, Wrap, Move or Note strip. |

### More units

A shoot day can run up to five units: **Main Unit**, **Second Unit**, **Third Unit**, **Fourth Unit** and **Fifth Unit**.

1. Click **Add unit**.
2. Tick the shoot days that need another unit and click **Add unit**. Each day shows which unit it will get.

Days that already have five units are not listed, and the button is disabled when every day is full. Units always appear in order, Main Unit first. Each unit has its own totals, and a unit that goes over 48 eighths of a page shows **Over 48 eighths**.

To take a unit off a day, click the bin icon beside its name and confirm. Shots scheduled on it return to **Unscheduled Shots**, and its Call, Lunch, Wrap, Move and Note strips are deleted. The units after it move up a place, so removing the Second Unit makes the Third Unit the Second Unit. Main Unit cannot be removed; to drop it, first make another unit the Main Unit on the [Calendar](#calendar).

### Delete a shoot day

Click the bin icon at the right of the day heading and confirm. Shots and scenes scheduled on the day move to the **Boneyard**, and the day's other strips and units are deleted. The Boneyard is the only way back, so check it before you rely on those shots.

### Lock a unit

The padlock beside a unit name locks it. Strips cannot be dropped onto or reordered in a locked unit, which protects a day you have finished. Click the padlock again to unlock.

### Boneyard

The Boneyard holds strips you do not want on any day but may need later. Drag a strip from the Boneyard back to a day or to **Unscheduled Shots**. A strip in the Boneyard can be removed for good with its cross button.

### Smart Scheduling Insights

Above the board, **Smart Scheduling Insights** can be expanded. It looks at scheduled shots and points out when shots that share a support, shot size, location or cast are spread across different days, and suggests grouping them. It is advice only and changes nothing.

> **Note** Cast Manager, Day Out of Days and Bookings use the Stripboard. A cast member is on a day when one of their shots is scheduled for it. See [People](07-people.md).

## Calendar

The Calendar shows every shoot day in a month and is where you review and adjust each day.

![The Calendar month view](images/05-calendar.png)

1. Open **Schedule → Calendar**.
2. Use the arrows beside the month name to change month.
3. Each shoot day has a **Day** header (with how many of its five units are in use) above one coloured card per unit. A card shows the unit name, call and wrap times, runtime, main location and shot count. Each unit (Main to Fifth) has its own colour.

**Move a whole day.** Drag the **Day** header onto another date. If that date already has a shoot day, **That date already has a shoot day.** appears; click **Swap** to exchange the two days.

**Move one unit.** Drag a unit card onto another date. Its shots go with it.
- If that date has a shoot day, the unit joins it as the next unit. A Main Unit dropped on a day that already has a Main Unit becomes its Second Unit (or Third, and so on). A day with five units cannot take another.
- If the date is empty, a new shoot day is made there with the unit as its Main Unit.
- The units left behind move up a place, so if the Main Unit leaves, the Second Unit becomes the Main Unit.
- If it was the only unit on its day and the date already has a shoot day, choose whether to delete the old day or keep it with an empty Main Unit.

**Swap units on a day.** Drag a unit card onto another unit on the same day to swap their places, for example to make the Second Unit the Main Unit. The day's call and wrap times follow whichever unit is the Main Unit.

On a touch screen, press and hold a card or day header for a moment, then drag. A quick swipe scrolls the page and a tap opens the day summary. You can also do all of this from the day summary (below), without dragging.

Moves and swaps show everywhere straight away: the Stripboard, call sheets, movement orders and risk assessments use the new day and unit. A unit moved to another day is taken off the old day's risk assessment.

> **Note** The Calendar does not create shoot days. Use **New shoot day** on the Stripboard.

### The day summary

Click a card to open its summary on the right.

![A day summary](images/05-day-summary.png)

- **Unit**: **Make this unit the** swaps this unit's place with another unit on the day. Pick a date and click **Move unit to date** to move just this unit.
- **Edit day details** lets you change **Call time**, **Wrap time** (HH:MM) and **Notes**. Click **Save**. **Lunch** is shown for reference and cannot be edited here.
- **Work Summary**: scenes scheduled, pages and shots.
- **People Summary**: cast called and crew booked.
- **Location Stack**: the day's locations in running order with their addresses, and the **Moves** between them. A **Long move between locations** note appears at an hour or more.
- **Warnings**: scheduling problems for the day, or **No schedule warnings for this day.**
- **Turnaround**: the shortest gap since the previous day's wrap, flagged when it is **Below 10h recommended turnaround**.
- **Sides**: **Open Sides Builder** to build the day's script pages. See [Sides](04-script.md#sides).

An estimated runtime over 10h 30min shows a warning to consider splitting the day.

### Travel times

For two or more locations the summary shows drive times between them. This needs an OpenRouteService key. Get a free key from openrouteservice.org, open **Settings → APIs & publishing**, paste it into **API key** under **OpenRouteService API key** and click **Save key**. Back in the day summary, click **Refresh travel times**. Without a key, drive times show "Travel time unavailable".

## Storyboard

Storyboard attaches reference images to each shot.

![The Storyboard in grid view](images/05-storyboard.png)

1. Open **Schedule → Storyboard**.
2. Choose **Grid** or **List** under **Display**, and one scene or **All scenes** under **Scene**.
3. On a shot, click **Add image** and choose an image file in the file picker. Common formats such as JPG, PNG, WebP, GIF and HEIC are accepted.
4. Click a thumbnail to enlarge it. **Replace** swaps an image, and **Remove** deletes it after a confirmation.

### Import an Athena Gallery PDF

If you storyboard in Athena Gallery, export its PDF and bring all the panels in at once.

1. Optionally choose the scene the panels belong to.
2. Click **Import Athena Gallery PDF** and choose the PDF.
3. In **Exclude non-shot images**, untick anything that is not a panel, then click **Continue to review**.
4. In **Athena import review**, check which shot each panel matched. Use the **Shot** drop-down to fix it or choose **Unassigned**. If a shot already has images, set **Conflict handling** to **Skip**, **Replace existing** or **Add as additional**.
5. Click **Apply import**. **Discard import** throws the panels away.

Panels are matched to shots by the number printed on each one, so number your boards to match your shot numbers.

## Episodic productions

In an episodic production, scenes belong to an episode and days belong to a shooting bloc. Shot Lists asks for an **Episode** on scenes. The Calendar and the Stripboard show the bloc on each day and add a bloc filter with **All blocs**, **Outside blocs** and each named bloc. Add episodes and blocs under **Settings → Production**, in the **Episodic production** card. See [Productions](03-productions.md).

**Next:** [Locations](06-locations.md)
