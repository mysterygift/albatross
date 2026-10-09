# 15. Experimental features

Experimental features are on-set tools that are still being tested. They are hidden by default so they don't clutter the app. Switch them on when you want to try them. Currently these are **Floor Plans**, **Script Supervisor**, **Overtime** and **Send Day Pack**.

## Turn them on

1. Open **Settings → Developer**.
2. Tick **Show experimental features**. The card lists everything it reveals.

![Experimental features card in Settings → Developer](images/15-experimental-toggle.png)

**Floor Plans** now appears under **Schedule** in the sidebar, **Script Supervisor** under **Script**, **Overtime** under **People** and **Send Day Pack** under **Deliver**, each marked with a flask icon and an **Experimental** badge. They also appear in search. Untick the box to hide them again. Nothing you have recorded is deleted.

> **Note** Experimental features may change between releases. They store their data on this computer only, so they are not available for a production opened from a collaboration server.

## Floor Plans

Floor Plans lets you draw the spaces at your locations and mark where the cameras and actors go for each scene and shot. Open **Schedule → Floor Plans**.

![A floor plan with cameras and actors plotted for a shot](images/15-floor-plans.png)

### Draw a floor plan

1. Click **New floor plan**, give it a name (for example *Kitchen*) and choose its **Location**. A location can have as many plans as it has spaces. Add the location on **Locations** first if it isn't there.
2. With **Draw layout** selected, pick a tool from the toolbar:

| Tool | How to use it |
|---|---|
| **Rectangle** | Click and drag. Good for rooms, tables, beds and doorways |
| **Line** | Click from point to point. Double-click or press Enter to finish; click the first point again to close the shape. Esc cancels |
| **Text** | Click where the label goes, then type it in **Label text** |
| **Select** | Click a shape to select it, drag it to move it. Drag a corner to resize a rectangle, a point to reshape a line. A label has a square corner to resize it and a round knob to rotate it |

3. **Snap to 90°** keeps lines straight across or straight up and down, and turns labels a quarter at a time. Untick it to draw and rotate freely.

Press Delete to remove the selected shape, the arrow keys to nudge it (hold Shift for bigger steps) and ⌘Z / Ctrl+Z to undo. Everything saves as you go.

### Plot the setups

1. Switch to **Plot setups**.
2. Choose the **Scene** (scenes set at this plan's location are listed first), then the **Shot**, or **Whole scene (blocking)** for positions that apply to every shot. The shot's description, size, lens, support, movement and cast show beneath the plan while you work.
3. Pick **Camera** or **Actor** and click on the plan to place one. Cameras are labelled A, B, C…; actors 1, 2, 3… Type a different label, such as the character's name, in the box under the plan.
4. Drag a marker to move it, and drag its round knob to turn it to face the right way. **Snap to 90°** works here too.
5. Add **Setup notes** if you need them, such as where the dolly track runs.

Shots that already have a setup on the plan show ● in the **Shot** list. **Start from…** copies the markers of another setup in the same scene, so you only move what changes.

### Export floor plans

Click **Export PDF** and choose what to print:

| Choice | Prints |
|---|---|
| **Shoot day** | Every setup for the shots on that day, on every unit and at every location, in stripboard order |
| **Location** | Every floor plan at the location with all its setups. A plan with no setups prints its layout |
| **Scene** | The scene's blocking, then each shot's setup |
| **Shots** | Just the shots you tick |

Each setup prints the floor plan with its cameras and actors, and the shot details and notes underneath. A copy is filed under **Documents → Script & sides**, then a save dialog opens.

## Script Supervisor

Script Supervisor logs the shoot as it happens: slates and takes against the stripboard's shoot days, scene progress, the daily progress report, and tramlines drawn on the script. Open **Script → Script Supervisor**.

![Script Supervisor in Line & log mode with scene list, slates and the slate panel](images/15-script-supervisor-log.png)

Before you start you need shoot days on the stripboard ([Schedule](05-schedule.md)). For lining, you also need an imported script ([Script](04-script.md)).

### Choose the slating system

Do this once, before the first slate.

1. Open **Settings → Script supervisor**.
2. Under **Slating system**, choose **UK (consecutive)** (217, 218...) or **US (scene + letter)** (23, 23A, 23B...).

The choice locks as soon as any slate exists, so a shoot never mixes systems.

### The screen

The header has the **Shoot day** picker, a **Line & log / Review** mode switch, a **Tablet layout** button (bigger touch targets, remembered on this device) and **New slate**. In **Line & log**:

- Left: the day's scenes from the stripboard, each with a status marker. Use **Another scene...** for a scene that isn't scheduled that day.
- Middle: switch between **Slates** (the day's slates) and **Script** (the marked-up scene).
- Right: the slate panel with takes, and notes and photos.

### Slate and take

1. Pick the scene, then click **New slate** (or press N). The next number is shown on the button. Camera, lens, stop, filter, sound mode and rolls carry over from the previous slate. With US slating, choose a scene first.
2. Click **Show setup** to fill in **Shot type**, **Shot**, **Camera**, **Lens**, **Stop**, **Filter**, **Camera roll**, **Sound roll**, **Description** and **Sound** (**Sync**, **Mute**, **Wild track**). Fields save when you leave them.
3. Click **Roll take** (or press Space). A stopwatch runs. Click **Cut take** (Space again) to log the take with its duration.
4. Mark the take with **Print** (P), **Hold** (H) or **NG** (G). The mark applies to the selected take, otherwise the latest. For an NG, pick a reason: Performance, Focus, Sound, Camera, Continuity or Other.
5. Type per-take notes in the **Remarks** box on its row.

To delete a slate, hover over it in the list and click the bin (or swipe on a touch screen).

> **Tip** Shortcuts are ignored while you're typing in a field.

### Mark scenes complete

Click **Mark scene complete** under the scene list when a scene is finished. It is credited to the current shoot day.

### Line the script (tramlines)

Tramlines are the vertical lines on a marked-up script showing what each shot covers.

1. Create and select a slate, then switch the middle view to **Script**.
2. In the right-hand lane labelled **Draw 217** (your slate's number), click the first line the shot covers, then the last line. Dragging down the lane does the same.
3. Click a line segment on the tramline to cycle it between on camera, off camera (dashed) and not covered. Right-click a segment for the menu: set a state, **Off camera for** a character **to the end of this line**, or **Delete tramline**.
4. Click **Undo** (or Ctrl+Z / ⌘Z) to reverse the last 20 lining actions.

![Marked-up script scene with tramlines, labels and a note chip](images/15-script-tramlines.png)

Tramlines are labelled with slate and shot type, coloured by shot type. A strip beside the script flags blocks covered by fewer than two tramlines.

When a new script draft is imported, existing tramlines and notes are carried onto it automatically the next time you open the scene. Anything that can't be placed is listed in a **Script revision** box above the script: click **Select slate** to line it again, **Checked** to confirm a moved tramline, or **Dismiss** to drop one that couldn't be placed.

### Script notes and continuity photos

1. In the Script view, click the add-note button on a line. The **Add a note to this line** dialog opens.
2. Choose a **Type**: Line change, Ad-lib, Cut, Note, VFX, SFX or Continuity. Enter the text. Tick **Applies to slate** to tie it to the current slate and choose the takes it applies to. Click **Add note**.
3. In the slate panel, the notes appear under the slate. Click one to edit it.
4. Under **Continuity photos**, toggle tags (Wardrobe, Props, Make-up, Hair, Set, Other) and click **Add photos** to attach images to the selected take.

### Review progress and paperwork

Switch the header mode to **Review**.

![Script Supervisor Review mode with progress tiles and the exports card](images/15-script-supervisor-review.png)

- Tiles show **Pages shot**, **Scenes** and **Setups | takes**, then a chart of pages completed each day against the stripboard.
- The **Scenes** table lists status, slates, takes, prints, last shot day and a **Mark** control (**Not marked**, **Complete**, **Omitted**). Filter it by All, Part shot, Not shot or Complete, and enter timed screen time or a part-shot page credit inline.
- **Daily progress report** holds the day's actual times (**Unit call**, **First shot**, **Lunch**, **Back from lunch**, **First shot after lunch**, **Camera wrap**, **Unit wrap**) and remarks. Click **Export PDF**.
- **Exports** produce, for the selected day:

| Button | Output |
|---|---|
| **Continuity sheets (PDF)** | One sheet per slate: setup, takes, printed takes, notes, photo tags |
| **Editor's log (CSV)** | One row per take, for the edit |
| **Marked-up script (PDF)** | The day's scenes with tramlines and notes |

Each export is filed under **Documents → Set paperwork** and then opens a save dialog.

- **Two-tramline check** lists every scene slated that day as covered, under-covered, not lined yet or not in an imported script. Click a scene to open its script.

The Script view also has its own **Export PDF** for the single scene on screen.

## Overtime

Overtime estimates what running late will cost, so you can decide on set. Open **People → Overtime**.

![Overtime page with summary tiles and the crew table](images/15-overtime.png)

It lists crew booked on the chosen shoot day. Everyone wraps with the unit unless you record their own times, and overtime is priced from each person's day rate on the budget's labour lines.

1. Pick the **Shoot day**.
2. Enter **Unit call** and **Unit wrap** once the day is under way. These are shared with the Script Supervisor daily progress report. Until a wrap is entered, the page uses the planned wrap and says the figures are projected.
3. For anyone with different hours, type their own **call** and **wrap** in the table. The reset button on the row returns them to the unit times.
4. Tick **Buyout** for crew on a buyout. No overtime is costed for them.
5. Read the tiles: **Crew on the day**, **Unit overtime**, **Overtime cost** and **Short rest before next day**. Crew with overtime but no day rate are counted separately as "No day rate", never costed at zero. Filter the table with **All**, **Own times**, **No rate** or **Short rest**.

A wrap earlier than the call counts as after midnight, so night shoots need no extra date.

### Set the overtime rule

Click **Overtime rule** to set the rule for this production.

| Field | Meaning |
|---|---|
| **Overtime starts** | At the shoot day's planned wrap, or a standard day after each person's call |
| **Standard day (hours, with lunch)** | Length of the standard day |
| **Hourly rate = day rate ÷** | Divisor used to turn a day rate into an hourly rate |
| **Overtime hour = hourly rate ×** | Overtime multiplier |
| **Bill per started (minutes)** | Overtime is billed in blocks of this length (0 bills exact minutes) |
| **Minimum rest (hours)** | Anyone with less rest than this before the next shoot day is flagged |

Click **Save rule**.

> **Note** Overtime is an estimate only. It covers crew, not cast, and does not create expenses in the budget.

## Send Day Pack

Send Day Pack emails everyone called to one unit on a shoot day their own copy of the day's paperwork. Each person's name is printed faintly across every page of their copy, so a leaked page shows whose it was. Open **Deliver → Send Day Pack**.

![Send Day Pack with documents, recipients and the email](images/15-day-pack.png)

A pack can hold these documents:

| Document | Where it comes from |
|---|---|
| **Call sheet** | The last call sheet saved for this day and unit on **Call Sheets** |
| **Movement order** | The last movement order saved for this day and unit on **Movement Orders** |
| **Script sides** | The last sides saved in the Sides Builder for this unit. With none, sides for every scene on the unit are made for you (marked **Generated**) |
| **Shooting schedule** | Made now from the Stripboard: this unit's strips for the day |
| **Shot list** | Made now: the shots scheduled on this unit, in running order |
| **Risk assessments** | Every risk assessment covering this unit, with a warning if one is not signed off |
| **Storyboard** | Made now: the panels for the shots on this unit |

1. Choose the **Shoot day** and **Unit**. The next shoot day after today is picked for you.
2. Under **Documents**, tick what to send. Each line says where it comes from and whether it is ready. **Check** means the call sheet, movement order or sides were saved before the day last changed; you can still send them, or save them again first. **Missing** has a button that takes you to the page to make it.
3. Under **Recipients**, untick anyone who should not get it. The list is the cast and crew the unit's call sheet lists. People with no email address can't be ticked; add one on their person page. On a day with several units, crew marked **All units** are booked for the whole day rather than one unit; set their unit on **Bookings** (see [Book people onto shoot days](07-people.md#book-people-onto-shoot-days)) if they only work with one.
4. Under **Email**, edit the **Subject** and **Message**. Words in braces are filled in for each person: `{firstName}`, `{name}`, `{production}`, `{date}`, `{day}` and `{unit}`. Your wording is kept for this production; **Reset to default** brings the standard message back. Untick **Copy in cast agents** to leave agents out.
5. Click **Prepare packs**. Each person's copies are made in their own folder; **Reveal folder** shows them.
6. Click **Open draft** on a person, or **Open all drafts**. On a Mac whose default mail app is **Apple Mail** or **Microsoft Outlook**, a new message opens with the address, subject, message and files filled in. Check it and click **Send**. Nothing is sent until you do.

> **Note** The first time you use Outlook, macOS asks whether Albatross may control Outlook. Click **OK**. If you clicked **Don't Allow**, turn it on in **System Settings → Privacy & Security → Automation → Albatross**. In Apple Mail, agents are added as recipients rather than CC, because Mail's sharing window has no CC field.

> **Note** With any other mail app, on other computers, or if Apple Mail has no account set up, a draft opens with the address, subject and message but no files, and the person's folder opens beside it: drag the files into the email.

> **Tip** Ticking or unticking a document or a person after preparing means preparing again, so the files always match what you send.

**Next:** [Troubleshooting](16-troubleshooting.md)
