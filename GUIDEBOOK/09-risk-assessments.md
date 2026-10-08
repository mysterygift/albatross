# 9. Risk Assessments

**Risk Assessments** is where you write, sign off and print the risk assessment and method statement (RAMS) for each shoot day. A day's RAMS lists its hazards, the control measures, and the risk before and after those controls. Call sheets warn you when a day has no signed-off RAMS.

## Create a risk assessment

![Risk Assessments list](images/09-rams-list.png)

You need at least one shoot day first (see [Schedule](05-schedule.md)).

1. Open **Plan → Risk Assessments**.
2. Click **New risk assessment**.
3. Choose a **Shoot day**.
4. Under **Units covered**, tick the units the assessment applies to. All units working that day are ticked to start with. To write a separate assessment for each unit, create one per unit.
5. Click **Create**. The assessment opens in the editor.

Location, hospital and police details are prefilled from the day: the location comes from the first scene on that day's Stripboard, and the hospital and police station from the shoot day's details. You can change all of them.

![The New risk assessment dialog](images/09-rams-new-dialog.png)

## Fill in the details

![Risk assessment editor](images/09-rams-editor.png)

The editor is one page. Nothing is saved until you click **Save**.

| Card | Fields |
|---|---|
| **Details** | **Shoot day**, **Units covered**, **Location** (pick a production location, or choose **Custom / none** and type a name), **Responsible person** (pick from crew, or type a name), **Activities** |
| **Safety contacts** | **First aiders** (name, phone, email), **Nearest hospital** and **Nearest police station** (name, address, phone) |

For first aiders, click **Add from crew** to copy a crew member's name, phone and email into a row, or **Add first aider** for a blank row. The copy is just text; later edits to the crew record do not change it.

## Add hazards

1. Under **Hazards**, click **Add hazard**.
2. Choose **Blank hazard**, one of the **Built-in** hazards, or one **Saved in this project**. Type in **Search hazards…** to narrow the list.

   The built-in hazards are Manual Handling, Flying Drones (Internal and External), Trip Hazards, Lighting, Access / Egress Blocking, Personal Security, Crew and Contributor Fatigue, Theft of Equipment and Personal Possessions, Smoking on Set, Stunts, Electrical Equipment, Vehicles, Filming on Roads, Working On or Near Water, Building and Construction Sites, Hostile Environment and Smoke FX. Each comes with suggested risks, outcomes, controls and ratings to edit.

3. Fill in the hazard card:

   | Field | Notes |
   |---|---|
   | **Hazard** | Required |
   | **Description** | |
   | **Risks**, **Potential outcomes**, **Control measures** | One item per line |
   | **People at risk** | **Crew**, **Cast**, **General public** |
   | **Before controls** / **After controls** | Two risk matrices (see below) |

Each hazard header shows its name and the risk before and after controls. Click the header to collapse or expand the card, and drag the grip on the left to reorder hazards. The bin icon removes a hazard.

To reuse a hazard you have edited on other days of this production, click **Save as template** on it. It then appears under **Saved in this project**. Hover a saved template in the picker and click the bin to delete it.

### Rate the risk

![Before and after risk matrices on a hazard card](images/09-rams-hazard-matrices.png)

Each matrix is a 5 by 5 grid with **Probability** down the side and **Severity** along the bottom. Click the cell that fits, or focus the grid and use the arrow keys. The risk factor is severity multiplied by probability, and is shown in words as well as colour.

| Factor | Band |
|---|---|
| 1 to 6 | Tolerable (green) |
| 8 to 10 | Moderate (amber) |
| 12 to 25 | Severe (red) |

Rate the risk **Before controls**, then again **After controls** once your control measures are in place. The list page shows the highest after-controls factor for each assessment.

## Save, sign off and print

1. Click **Save**. An "Unsaved changes" note shows while there are edits. If you try to leave the page with unsaved edits, Albatross asks you to confirm.
2. Click **Approve**. Enter your name under **Approved by** (filled in from your login when you use accounts) and click **Approve**. The status changes from **Draft** to **Approved**, with your name and the time.
3. Click **Export PDF** to produce an A4 landscape document. Your computer asks where to save it, and a copy is filed in **Documents** (see [Documents, deliverables and music](12-documents-deliverables-music.md)). Exporting again replaces that copy. A draft's PDF is marked "DRAFT - NOT APPROVED".

**Approve** is greyed out until the form is saved, has at least one hazard, and has a responsible person. Hover it to see which is missing. **Export PDF** and **Duplicate** also need a saved form.

> **Note** Any change to an approved assessment reverts it to **Draft** when you save, and it must be approved again. The page warns you before this happens.

## Duplicate to other days

Most days on the same location share their hazards. Copy a finished assessment instead of starting again.

1. Open the assessment and click **Duplicate**, or use the **⋯** menu on its row in the list and choose **Duplicate**.
2. Tick the shoot days to copy it onto. The current day is marked "(same day)", so you can also copy it to cover another unit on the same day.
3. Click **Duplicate to n days**.

Copies are drafts with no approval. Units map across to the target day's matching units, or to all of that day's units if none match.

## Manage the list

The **Risk Assessments** page lists each assessment with its **Date**, **Location**, **Units**, **Hazards** count, **Highest residual risk** and **Status**. Click **Date** or **Location** to sort. Filter by status (**Draft** or **Approved**) and by unit.

The **⋯** menu on each row has **Open**, **Duplicate**, **Export PDF** and **Delete**. Delete asks for confirmation and permanently removes the assessment and its exported PDF.

## Call sheet warning

When you open a day on **Deliver → Call Sheets**, a red alert appears if no assessment covers the call sheet's unit (**No RAMS covers this unit**) or the covering one is still a draft (**RAMS not signed off**). Previewing or saving the PDF then asks **Export anyway?**. It is a prompt, not a block. See [Call sheets and movement orders](11-call-sheets-and-movement-orders.md).

**Next:** [Budget](10-budget.md)
