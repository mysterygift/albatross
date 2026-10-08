# 7. People

The **People** group holds everyone on the production: cast and crew records, who is booked on which shoot day, and the Day Out of Days. Set up your cast and crew first; Bookings and Day Out of Days then build on them and on the schedule.

| Page | Use it to |
|---|---|
| **Cast Manager** | Keep cast records: cast number, role, agent, contributor form, unavailable dates |
| **Crew Manager** | Keep crew by department and role, with Heads of Department (HODs) |
| **Bookings** | Book people onto shoot days and see who is still missing |
| **Day Out of Days** | See which cast work on which shoot days, and spot clashes |
| **Release Forms** | Have contributors and location owners sign a release on screen |

Everything here belongs to the current production. Pick it in the production switcher first (see [Productions](03-productions.md)).

## Add cast

![Cast Manager with the summary strip, filters and cast table](images/07-cast-manager.png)

1. Open **People → Cast Manager**.
2. Click **Add cast**.
3. Fill in the dialog. Only **Name** is required.

   | Section | Fields |
   |---|---|
   | Identity | **Name**, **Cast number**, **Role** (the character name) |
   | Direct contact | **Email**, **Phone** |
   | Agent | **Agent name**, **Agent email**, **Agent phone** |
   | Production / admin | **Contributor form status** (Not requested, Requested, Signed, Expired), **Phases**, **Notes** |

4. Click **Save**.

> **Note** Emails must look like `name@domain.com`. Phone numbers take digits and an optional leading `+` only (for example `+441234567890`), up to 17 digits. The dialog shows the problem under the field and will not save until it is fixed.

**Phases** tag a person with the stages they work in. Click **Development**, **Prep**, **Shoot**, **Wrap** or **Post** to toggle them, or type your own in **Add phase…** and press Enter.

### Find and review cast

- The strip at the top counts **Cast**, **With unavailability**, **Missing cast #**, **Missing role** and **Missing agent info**.
- Search by name, role, cast number or agent name.
- The first drop-down filters by contributor form status. The second (**Completeness**) shows people who are missing a role, cast number or agent info, or who have unavailable dates.
- Each row has four icons: view (opens the person's page), unavailable dates (calendar icon), edit (pencil) and delete (bin).

Deleting a cast member removes them from Cast Manager, their scene and shot participation, and their bookings. The scenes and shots themselves are kept.

## Record unavailable dates

Record the dates someone cannot work so that Day Out of Days can warn you when the schedule collides with them.

1. In **Cast Manager** (or **Crew Manager**), click the calendar icon on the person's row. You can also open the person's page and click **Manage** on the **Unavailable dates** card.
2. Click **Add unavailable dates**.
3. Choose a **Start date** and **End date**. A single day uses the same date twice. Add **Notes** if you like, such as "holiday".
4. Click **Add entry**.

Use the pencil and bin icons in the list to change or remove an entry.

## Cast page

Click a cast member's name to open their page. It shows, top to bottom:

- Summary cards: bookings, next booked day, clashes, unavailable entries, contributor form status and cast number.
- **Overview**: contact details, agent, phases and notes.
- **Bookings**: their booked days, plus how many days they are needed, booked and missing. **View in Bookings** jumps to the Bookings page.
- **Unavailable dates**.
- **Scene participation** and **Shot participation**: which scenes and shots they are in. Click **Add to scenes** or **Add to shots**, tick the rows, and click **Add selected**. Adding someone to a shot also adds them to the shot's scene.
- **Day out of Days**: first and last work day, work days and clashes. **View in DooD** opens the full chart.
- **Recent activity**.

Click **Edit** at the top for the same form as **Add cast**. The back arrow returns to Cast Manager.

> **Tip** Scene participation is what drives Day Out of Days and the "needed" counts on Bookings. A cast member with no scenes never shows as working.

## Set up your crew

![Crew Manager with the summary strip and crew table](images/07-crew-manager.png)

Crew are grouped by **department** and **role**. The lists come from your production's crew structure, which starts from a built-in film crew hierarchy (Development, Production, Finance, Locations, Art, Camera, Lighting, Grip, Sound and Post-Production) and can be changed in **Settings → Crew structure** (see [Settings and admin](14-settings-and-admin.md)). Each department has one role marked as its **HOD**.

### Setup wizard

The first time you open **Crew Manager** on a production with no crew, the **Set up your crew** wizard opens.

1. Click **Start setup**.
2. Tick the departments you want. For each, enter the HOD's **Name**, and optionally **Role**, **Email** and **Phone**. The role defaults to that department's HOD role.
3. Click **Add HODs and finish**. Departments you left without a name are skipped.

Click **Skip for now** to leave without adding anyone. Click **Start setup** again later from the empty page to reopen the wizard.

![The Set up your crew wizard, department step](images/07-crew-setup-wizard.png)

### Add crew

1. Click **Add crew** (or **Add crew manually** on an empty page).
2. Enter the **Name**, choose a **Department**, then choose a **Role**. Role is required, and its list changes with the department.
3. Add **Email**, **Phone**, **Phases** and **Notes** if needed, then click **Save**.

The form tells you when the role you pick is the HOD for that department.

### Work with the crew list

- The summary strip shows **Crew**, **Departments**, **HODs**, **Missing dept** and **With unavailability**.
- The table is sorted by department, then HOD first, then role order, then name.
- Search by name, department, role, email or phone. Filter by department (including **Other / unset**), HOD (**HOD only** or **Non-HOD**), or completeness (**Missing department**, **Missing role**, **Has unavailability**).
- If any tasks are assigned to a department, a **Department task responsibility** table shows each department's open and overdue tasks and its HOD. A line below warns about departments with open tasks but no HOD. See [Tasks and wrap](13-tasks-and-wrap.md).
- Click a name for the crew page: profile, department and HOD status, bookings, unavailable dates and notes. Click **Edit** to change the record.

> **Note** Crew who are booked on a shoot day appear on that day's call sheet, grouped by department with the HOD first (see [Call sheets and movement orders](11-call-sheets-and-movement-orders.md)).

## Book people onto shoot days

![Bookings page in Calendar View](images/07-bookings-calendar.png)

A booking assigns one person to one shoot day. Bookings for consecutive shoot days show as a single bar.

1. Open **People → Bookings**.
2. Click **Add booking**.
3. In **Assign person to shoot day**, choose the **Person** (shown as name, cast or crew, department, role) and the **Shoot day**. Add a **Role (optional)** and **Notes (optional)**.
4. If the shoot day runs more than one unit, a **Unit** box appears. Leave it on **All units**, or choose the unit the person works with. Call sheets and day packs for the other units then leave them out.
5. Click **Add booking**. To book a run of days, repeat for each day, or add one day and drag its bar longer (see below).

> **Note** A booking must have a shoot day to appear on the calendar. Create shoot days first in **Schedule** (see [Schedule](05-schedule.md)).

### Calendar View and Timeline View

Switch with the **Calendar View** / **Timeline View** control. Use the arrows to change month.

- **Calendar View** is a month grid. Days with no shoot day are hatched. When a week has more bookings than will fit, the surplus folds into **+n more**; click it to see the list. Each shoot day with unmet needs shows a number badge for people needed but not booked, and **+n** for people booked but not needed.
- **Timeline View** has one row per person, grouped into **Principal cast**, **Supporting cast** and one group per department. Click a group name to collapse it. Each row shows the person's booked days for the month.

![Bookings page in Timeline View](images/07-bookings-timeline.png)

The filters above the grid are **Unit**, **Department** and **Cast/Crew**. With a unit chosen, people booked to another unit of the same day are hidden; people booked for all units still show.

### Change a booking

- Click a bar to open **Edit booking**, change the person, day, role or notes, and click **Save changes**.
- Drag a bar sideways to move the whole run to other dates. The move is refused if a day has no shoot day or the person is already booked there.
- Drag the left or right edge of a bar to lengthen or shorten the run. Lengthening books every shoot day in the new range; shortening removes the bookings outside it.
- Hover a bar to see the person, dates, number of days, any unit, role and notes.
- Dragging a booking to another day sets it back to **All units**, because units belong to one day. Moving or removing a unit on the Stripboard or Calendar does the same for the people booked to it.

### Who is missing

An amber warning button appears in the header when cast are needed but not booked. Hover it for a list of **Cast needed but not booked** with date, role and name. "Needed" means the cast member is in a scene (or shot) scheduled on the **Stripboard** for that day (see [Schedule](05-schedule.md)). Albatross only advises; it never books anyone for you.

### Colours and layout

Click the gear button (**Appearance settings**) to adjust the view. These preferences are stored on this computer, per production.

- **Lanes per week** (Calendar View): 3 to 8.
- **Hide people with no bookings in the visible month** (Timeline View).
- A colour for each crew department, and for **Other crew**.
- **Cast**: tick people to make them principals with their own colour; everyone else uses the **Supporting cast / standing artists** colour.

Click **Save** to apply, or **Reset to defaults**.

## Day Out of Days

![Day Out of Days chart](images/07-day-out-of-days.png)

The Day Out of Days chart lists every cast member against every shoot day.

1. Open **People → Day Out of Days**.
2. Read each row left to right:

   | Mark | Meaning |
   |---|---|
   | **W** | Scheduled to work that day, because one of their scenes is on the Stripboard for it |
   | **H** | Hold: between their first and last work day, but not working |
   | **!** (red) | Clash: scheduled to work on a day they are marked unavailable. Hover for the date |
   | **—** | Off |

3. The columns at the right give **Start**, **Finish**, and counts of **Work**, **Hold** and **Clash** days.
4. Use **Search cast...** to find a person, or tick **Only with clashes** to list just the problems.

To fix a clash, move the scene on the Stripboard or edit the person's unavailable dates in Cast Manager.

> **Note** The chart reads the Stripboard and each cast member's scene participation. Bookings do not change it, and it covers cast only.

### Export

Click **PDF** or **CSV** to export the rows currently shown (after search and filter). Albatross also files a copy in **Documents** (see [Documents, deliverables and music](12-documents-deliverables-music.md)), then asks where to save a second copy.

## Release Forms

![Release Forms with signed releases listed](images/07-release-forms.png)

Release Forms brings up a contributor or location release for someone to sign on screen: with a finger or Apple Pencil on an iPad or iPhone, or with the mouse on a computer. The signed PDF is filed in **Documents → Releases**.

### Get a release signed

1. Open **People → Release Forms** and click **New Release**.
   The first time, Albatross asks for your **Production company**. Enter it and click **Save and continue**. It is required, because the releases grant their rights to it.
2. Choose **Contributor Release Form** or **Location Release Form**.

   ![Choosing a release form](images/07-new-release.png)

3. Fill in the details. For a location release, **Location address** is required, and it and the **Shoot date(s)** are written into the terms as you type. For a contributor under 18, tick **The person signing is under 18**; a parent or guardian then reads the consent and signs as well.
4. Hand over the device. The person reads the terms, signs in the signature box and types their **Full print name**. On iPad, Apple Pencil users can also handwrite their name into the box. **Undo** removes the last stroke and **Clear** starts again.
5. On a location release, the producer can add an optional countersignature.
6. Click **Sign**. The date and time are added at that moment.

![A contributor release ready to sign](images/07-release-sign.png)

Albatross saves the signed PDF to **Documents → Releases**, then lets you save or share a copy. On iPad and iPhone this opens the share sheet, so you can AirDrop, email or save it to Files. Cancelling keeps the copy in Documents.

The Release Forms page lists every signed release for the production, with **Open**, **Save or share** and delete buttons. On iPad and iPhone, **Share** replaces Open and Save or share.

### Edit the terms

1. On the Release Forms page, click **Edit terms**.
2. Enter your **Production company** (required). It replaces `{{production_company}}` in the terms; the production name comes from the current production.
3. Edit the **Contributor**, **Parent or guardian** and **Location** terms. Use the **Insert** buttons to add a placeholder, and leave a blank line between paragraphs. **Restore standard terms** puts the original wording back.
4. Click **Save terms**.

The company and terms are shared by every production on this computer.

> **Note** Changing the terms only affects releases signed afterwards. A signed release keeps the exact terms it was signed under.

**Next:** [Equipment](08-equipment.md)
