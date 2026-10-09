# 15. Experimental features

Experimental features are on-set tools that are still being tested. They are hidden by default so they don't clutter the app. Switch them on when you want to try them. Currently these are **Floor Plans**, **Script Supervisor**, **Overtime**, **Receipt Capture** and **Send Day Pack**.

## Turn them on

1. Open **Settings → Developer**.
2. Tick **Show experimental features**. The card lists everything it reveals.

![Experimental features card in Settings → Developer](images/15-experimental-toggle.png)

**Floor Plans** now appears under **Schedule** in the sidebar, **Script Supervisor** under **Script**, **Overtime** under **People**, **Receipt Capture** under **Budget** and **Send Day Pack** under **Deliver**, each marked with a flask icon and an **Experimental** badge. They also appear in search. Untick the box to hide them again. Nothing you have recorded is deleted.

> **Note** Experimental features may change between releases. Script Supervisor and Overtime store their data on this computer only, so they are not available for a production opened from a collaboration server.

## Floor Plans

Floor Plans lets you draw a set or a unit base at a location, to scale, and mark where the cameras, cast, lights and grip go for each scene and shot. Open **Schedule → Floor Plans**.

![A floor plan with cameras, cast, lights and grip plotted for a shot](images/15-floor-plans.png)

### Start a plan

1. Click **New floor plan**, give it a name (for example *Kitchen* or *Unit base*) and choose its **Location**. Add the location on **Locations** first if it isn't there. To switch plans later, click the plan's name at the top of the page.
2. Click **Background** in the toolbar if you want something to draw over:
   - **Map of location** draws a map of the location's address, north up and to scale (choose 100, 200 or 500 m across). It needs a map key in **Settings**.
   - **Image** uses a picture you have, such as a map screenshot or a recce photo. Then choose **Fit**, **Fill** or **Move** (drag it, or drag its corner to resize it) and set its **Opacity**.
3. Set the scale: type the **Plan width** in metres, or click the ruler, drag along something you know the length of (a doorway, a road) and type its length. Set **North** so the arrow points north on your picture.

### Draw the layout

With **Layout** selected, pick a tool:

| Tool | How to use it |
|---|---|
| **Rectangle** | Click and drag. Good for rooms, tables and doorways |
| **Line** | Click from point to point. Double-click or press Enter to finish; click the first point again to close the shape. Esc cancels |
| **Text** | Click where the label goes, then type it |
| **Add** | Pick a piece of kit, then click the plan to place it. Kit placed here, such as easy-ups, the generator or video village, stays on the plan for every setup |
| **Select** | Click anything to move it or open its settings. Drag the round knob to turn it, and the square handle to resize |

**90°** keeps lines straight across or up and down and turns things a quarter at a time. Turn it off to draw and turn freely. Press Delete to remove the selected item, the arrow keys to nudge it, and ⌘Z / Ctrl+Z to undo. Everything saves as you go.

To get in close, use **+** and **−** in the corner of the plan, hold ⌘ (Ctrl on Windows) and scroll, or pinch on an iPad or trackpad. Drag empty floor (or use two fingers on an iPad) to move around while zoomed in, and click or tap the percentage to see the whole plan again. Click **Done** (or double-click) to finish a line. On an iPad, tap to place things, double-tap or tap **Done** to finish a line, and drag the round and square handles with your finger.

### Plot the setups

1. Switch to **Setups**. The scene and its shots run along the bottom: pick the scene (scenes at this location come first), then **Blocking** for the whole scene or a shot. The chosen shot shows its description, camera details and notes.
2. Click **Camera** and then the plan to place a camera. Cameras are lettered A, B, C… and each letter has its own colour.
3. Click **Cast**, choose who (the scene's cast come first), then click the plan. Each person shows in their colour from the **Bookings** calendar.
4. Click **Lights** or **Grip**, search or browse the library, then click the plan. Lights are coloured by source: amber for tungsten, blue for HMI, white for LED. Every item has a label you can change.
5. Drag the round handle at the end of a jib, crane or menace arm to swing it and set how far it reaches.
6. Drag anything to move it and its round knob to turn it. **Copy from** starts a shot from another setup in the same scene.

### The equipment library

The library holds about 140 items, drawn to their real size so they line up with a map or a measured plan:

| Section | Includes |
|---|---|
| **Lights** | Tungsten fresnels from 150 W to 10K, Redheads, Blondes, PAR cans, Maxi-Brutes, space lights and china balls; HMIs from Joker-Bugs and M18s to 18K fresnels and the ARRIMAX; SkyPanels, Geminis, Vortex, Nova and LED mats; COBs and LED fresnels; tubes; balloon lights |
| **Camera support** | Fisher, PeeWee, Hybrid, doorway and western dollies; straight and curved track; Dana Dolly; sliders; sticks, baby legs and hi-hat; Steadicam and handheld; Porta-Jib, Jimmy Jib and Technocranes; arm car and low loader; drone |
| **Grip** | Flags, floppies and cutters; frames from 4x4 to 20x20; polyboard, bounce and V-flats; C-stands, combo, roller and wind-up stands; menace arm; apple boxes, sandbags, ladders, scaffold towers and lifts; wind machine and hazer |
| **Unit base** | Easy-ups and marquees; video village, DIT and sound carts; generators and distro; camera, grip and lighting trucks; artist, make-up and costume trailers; honeywagon, catering and dining bus; vans, minibuses and cars; toilets; barriers, cones and parking bays |

Track, frames, tents, arms, barriers and parking bays can be resized. Use **Unit base** kit on a map background to lay out a unit base or a location recce.

### See the sun

Click the sun in the toolbar. The first time, Albatross asks for the location (it looks up the address, or you can type coordinates such as `51.5072, -0.1276`). Pick the day and slide the time: the sun's path runs round the plan, and the dashed ray shows where the light comes from at that time.

### Export floor plans

Click **Export PDF** and choose what to print:

| Choice | Prints |
|---|---|
| **Shoot day** | Every setup for the shots on that day, on every unit and at every location, in stripboard order |
| **Location** | Every floor plan at the location with all its setups. A plan with no setups prints its layout |
| **Scene** | The scene's blocking, then each shot's setup |
| **Shots** | Just the shots you tick |

Each setup prints the plan with its background, kit, cameras and cast in their colours, a north arrow and a scale bar, with the shot details and notes underneath. A copy is filed under **Documents → Script & sides**, then a save dialog opens.

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

The header has the **Shoot day** picker, a **Line & log / Review** mode switch, a **Tablet layout** button (bigger touch targets, remembered on this device; on iPad and iPhone the tablet layout is always on and there is no button) and **New slate**. In **Line & log**:

- Left: the day's scenes from the stripboard, each with a status marker. Use **Another scene...** for a scene that isn't scheduled that day.
- Middle: switch between **Slates** (the day's slates) and **Script** (the marked-up scene).
- Right: the slate panel with takes, and notes and photos.

### Slate and take

1. Pick the scene, then click **New slate** (or press N). The next number is shown on the button. Camera, lens, stop, filter, sound mode and rolls carry over from the previous slate. With US slating, choose a scene first.
2. Click **Show setup** to fill in **Shot type**, **Shot**, **Camera**, **Lens**, **Stop**, **Filter**, **Camera roll**, **Sound roll**, **Description** and **Sound** (**Sync**, **Mute**, **Wild track**). Fields save when you leave them.
3. Click **Roll take** (or press Space). A stopwatch runs. Click **Cut take** (Space again) to log the take with its duration.
4. Mark the take with **Print** (P), **Hold** (H) or **NG** (G). The mark applies to the selected take, otherwise the latest. For an NG, pick a reason: Performance, Focus, Sound, Camera, Continuity or Other.
5. Type per-take notes in the **Remarks** box on its row.

To delete a slate, hover over it in the list and click the bin (or swipe it left on a touch screen).

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

## Receipt Capture

Receipt Capture logs a petty-cash purchase from a photographed receipt in one screen. Open **Budget → Receipt Capture**. It is designed for the iPad and iPhone; on a computer, **Take photo** opens a file picker.

1. Select **Take photo** and photograph the receipt, or **Choose photo or PDF** to use a file you already have. **Retake** and **Remove** change your mind.
2. Enter the **Total**, the **Date on receipt** and **What was bought**.
3. Under **Budget line**, choose the account the spend belongs to. If the cash came from a petty cash float, choose it under **Paid from** first: Albatross selects the float's budget line and shows how much is left on the float after this spend.
4. Optionally choose a **Vendor**, enter the **Receipt number**, a **VAT rate (%)** (shown when the production tracks VAT, starting at its default rate) and **Notes**.
5. Select **Save spend**. **Clear** empties the form.

The photo is saved as the expense's receipt and the spend appears in the budget as a **Purchase**. Large photos are shrunk to a readable size to save space. If the float cannot be matched, the spend is still saved and a message says so; match it from the float in the budget later. **Spend dated today** at the bottom lists today's spend and whether each item has a receipt.

> **Note** Receipt Capture only creates spend. To change it afterwards, open the expense from **Budget**; see [Budget](10-budget.md#review-and-edit-spend).

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
| **Floor plans** | Made now: the floor plan setups for the shots on this unit, in shooting order |

1. Choose the **Shoot day** and **Unit**. The next shoot day after today is picked for you.
2. Under **Documents**, tick what to send. Each line says where it comes from and whether it is ready. **Check** means the call sheet, movement order or sides were saved before the day last changed; you can still send them, or save them again first. **Missing** has a button that takes you to the page to make it.
3. Under **Recipients**, untick anyone who should not get it. The list is the cast and crew the unit's call sheet lists. People with no email address can't be ticked; add one on their person page. On a day with several units, crew marked **All units** are booked for the whole day rather than one unit; set their unit on **Bookings** (see [Book people onto shoot days](07-people.md#book-people-onto-shoot-days)) if they only work with one.
4. Under **Email**, edit the **Subject** and **Message**. Words in braces are filled in for each person: `{firstName}`, `{name}`, `{production}`, `{date}`, `{day}` and `{unit}`. Your wording is kept for this production; **Reset to default** brings the standard message back. Untick **Copy in cast agents** to leave agents out.
5. Click **Prepare packs**. Each person's copies are made in their own folder; **Reveal folder** shows them.
6. Click **Open draft** on a person, or **Open all drafts**. On a Mac whose default mail app is **Apple Mail** or **Microsoft Outlook**, a new message opens with the address, subject, message and files filled in. Check it and click **Send**. Nothing is sent until you do.

> **Note** The first time you use Outlook, macOS asks whether Albatross may control Outlook. Click **OK**. If you clicked **Don't Allow**, turn it on in **System Settings → Privacy & Security → Automation → Albatross**. In Apple Mail, agents are added as recipients rather than CC, because Mail's sharing window has no CC field.

> **Note** With any other mail app, on other computers, or if Apple Mail has no account set up, a draft opens with the address, subject and message but no files, and the person's folder opens beside it: drag the files into the email.

> **Tip** Ticking or unticking a document or a person after preparing means preparing again, so the files always match what you send.

### On iPad

- Tap **Open draft** or **Open all drafts**. If the Mail app has an account, an email opens inside Albatross with the address, subject, message and files filled in. Tap **Send** (or **Cancel**), and the next person's email opens. Each person's row then says **Sent**, **In Drafts** or **Shared**.
- If Mail isn't set up (for example you only use Outlook), the share sheet opens instead with the files and message. Choose **Outlook** (or another mail app), then paste the address into **To**: Albatross copies it for you just before the share sheet opens.
- Cancelling stops **Open all drafts**. Tap it again to carry on with the people not done yet.
- There is no **Reveal folder** on iPad.

**Next:** [Troubleshooting](16-troubleshooting.md)
