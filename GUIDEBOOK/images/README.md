# Guidebook screenshots

Every image used by the [Guidebook](../README.md) lives here, named `NN-slug.png` after its chapter. This page is the capture checklist: it says exactly which screen to show for each file, so the set can be retaken when the UI changes.

## How to capture

1. Run the desktop app (a release build or `npm run tauri:dev`) with a clean data folder, so personal data never appears.
2. Make the window 1440 × 960 and use the default **Albatross Mint** theme (**Settings → Appearance**).
3. Create the demo productions: **Settings → Demo & tutorial → Create Demo Production** gives *Mint Heist* (feature) and *Demo: North Shore* (episodic). Use *Mint Heist* unless a shot says otherwise.
4. Set up the state in the table, then capture. On macOS use ⌘⇧4, press Space, then click the window (add Option to drop the shadow). For dialogs and regions, drag-select the area instead.
5. Save as PNG, 1600 px wide or less, into this folder under the listed file name. Never show real passwords, recovery keys or personal data.

Framing: **window** is the whole app window; **dialog** is the dialog or panel only; **region** is the part named.

## 1. Getting started

Shots 1-3 and 5 need a FRESH data directory (no existing database, so the setup wizard runs). Do 1, 2, 3, 5 in one pass through the wizard. Do not capture or type any real password; use any throwaway value and keep the password fields masked. Shot 3 shows a real generated key: crop out or blur the key text, or re-run with a throwaway data dir that is deleted afterwards.

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 01-setup-welcome.png | first launch, setup wizard step 1 | Fresh data dir. App just launched; "Welcome to Albatross" card with bullet list and **Begin setup** button visible. | window |
| 01-setup-admin.png | setup wizard, "Set up admin account" | After clicking **Begin setup** and waiting for "Securing database…" to finish. Username filled with `producer`; both password fields filled (masked dots); checklist shows both items ticked. | dialog (the card) |
| 01-setup-recovery-key.png | setup wizard, "Save your recovery key" | After **Create admin account**. Key visible (blur or crop the key value). "I have saved this recovery key" unticked. | dialog (the card) |
| 01-tutorial-welcome.png | first entry to the workspace | Fresh data dir, immediately after clicking **Enter Workspace** on the final wizard screen and the intro animation ends. The "Welcome to Albatross" dialog with **Skip for now** and **Start Tutorial** is open. No production exists. | dialog |
| 01-sign-in.png | sign-in screen | Any existing data dir. Choose File → Log Out (or relaunch the app). "Sign in" card with empty Username and Password fields. "Forgot password?" link visible (needs a normal install made through the wizard). | window |
| 01-tutorial-menu.png | Dashboard `/`, top bar | Signed in, Dashboard open, tutorial not started (dismiss the welcome dialog with **Skip for now**). Click the graduation-cap button in the top bar; menu open showing "Tutorial", "Start tutorial", "Tutorial for Dashboard", "Restart this section", "Restart tutorial", "Choose a section…". | region: top-right of window with the open menu |

## 2. Finding your way

All from the unmodified demo production "Mint Heist" (Settings → Demo & tutorial → Create Demo Production). Default theme (Albatross Mint). Window about 1440x900. Get started checklist must NOT have been hidden (Dashboard shows "You're set up." in the demo because all five steps are done).

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 02-dashboard.png | Dashboard `/` | Mint Heist current; no dialogs; no menus open; all cards shown (Customise reset). Scroll to top. | window |
| 02-dashboard-customise.png | Dashboard `/` | Click **Customise** (top right of page); menu open with all seven "Show cards" items ticked and **Reset** disabled. | region: top-right of the page area with the open menu |
| 02-app-layout.png | Schedule → Stripboard `/schedule/stripboard` | Mint Heist current; sidebar fully visible with Plan group and Schedule expanded, Stripboard highlighted; breadcrumb "Plan > Schedule > Stripboard" visible; section tabs (Calendar, Stripboard, Shot Lists, Storyboard) visible; no dialogs. | window |
| 02-production-switcher.png | any page (use Dashboard) | Click the production name button in the top bar; dropdown open listing both demo productions (Mint Heist ticked), then "New production…" and "Wrap production…". | region: top bar and dropdown |
| 02-command-palette.png | any page (use Dashboard), press Cmd+K / Ctrl+K | Type `bank` in the box. Results visible (Locations group, "Bank Interior") plus any command matches. No preview open. | dialog |
| 02-shortcuts.png | any page, press `?` (focus not in an input) or click keyboard icon in top bar | "Keyboard shortcuts" dialog open at top of its list. | dialog |
| 02-themes.png | Settings → Appearance `/settings?section=appearance` | Albatross Mint selected; all theme tiles visible. | window |

## 3. Productions

Demo data present (Settings → Demo & tutorial → Create Demo Production creates "Mint Heist" and "Demo: North Shore"). No archived productions should exist. Default theme.

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 03-productions-list.png | Productions `/productions` | Mint Heist is the current production. Both demo productions listed (North Shore shows the Episodic badge). "Show archived productions" off. No dialogs open, no toasts visible. | window |
| 03-new-production.png | Productions → **New production** | Click **New production**; dialog open and empty (Name blank, "Episodic production" unticked, **Default** template selected, Client "Optional"). Scroll the dialog to the top. | dialog |
| 03-episodes-blocs.png | Settings → Production `/settings?section=production` | North Shore is the current production (switch with the top-bar switcher). Scroll so the "Episodic production" card is in view with the Episodes table and the Shooting blocs table both visible (scroll the page down past the Currency card). No dialogs open. | region: the Episodic production card (Episodes and Shooting blocs tables) |

## 4. Script

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 04-script-import.png | Script → Script Import | Mint Heist open; nothing picked or pasted; no dialog open | window |
| 04-edit-parsed-scene.png | Script → Script Import | Paste `INT. WAREHOUSE - DAY` followed by a blank line and `JADE picks the lock.` into **Raw text**, click **Parse scenes**, click the first scene row; **Edit parsed scene** dialog open. Do not click Create scenes | dialog |
| 04-script-sections.png | Script → Script Sections | Script version "Demo Script v1" selected, Scene = All scenes, status filter All, no section selected | window |
| 04-edit-section.png | Script → Script Sections | Click the pencil on the first section of scene 1; **Edit section** dialog open, nothing changed | dialog |
| 04-script-breakdown.png | Script → Script Breakdown | Demo Script v1, **Script** view, scene 1 selected. Highlight `JADE` and press 1 (Cast), highlight `WAREHOUSE` in the heading and press 5 (Locations). Click away so no popover is open | window |
| 04-breakdown-elements.png | Script → Script Breakdown | Same tags as above; switch to **Elements**; expand the JADE element row | window |

## 5. Schedule

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 05-calendar.png | Schedule → Calendar | Month containing the first demo shoot days; no drawer open; bloc filter not applicable | window |
| 05-day-summary.png | Schedule → Calendar | Click the first Main Unit card of the month; day summary drawer open, scrolled to top | region: day summary drawer |
| 05-shot-lists.png | Schedule → Shot Lists | Scene 1 selected; Edit mode off; no dialog open | window |
| 05-stripboard.png | Schedule → Stripboard | First shoot day selected; both side panels expanded; Smart Scheduling Insights collapsed; no popover open | window |
| 05-add-strip.png | Schedule → Stripboard | Click **Add strip**; popover open with Type = Move / Setup, nothing entered | region: Add strip popover |
| 05-storyboard.png | Schedule → Storyboard | Display = Grid, Scene = All scenes; no dialog open | window |

## 6. Locations

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 06-locations-list.png | Locations | Mint Heist open; no dialog open; no row highlighted | window |
| 06-add-location.png | Locations → **Add location** | Dialog open and empty (status Unbooked), scrolled to top | dialog |

## 7. People

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 07-cast-manager.png | People → Cast Manager | Demo production "Mint Heist" selected. No dialog open, no search text, both filters on their defaults (All statuses / All). | window |
| 07-crew-manager.png | People → Crew Manager | "Mint Heist" selected. No dialog open, no search text, filters on defaults. Scroll position at top so the summary strip and first rows show. | window |
| 07-crew-setup-wizard.png | People → Crew Manager | A production with no crew: create a new empty production (Productions → New, any name), switch to it, open People → Crew Manager. The wizard opens by itself; click **Start setup**, then tick **Camera** and **Lighting** and type a name in each Name field. Do not click Finish. | dialog |
| 07-bookings-calendar.png | People → Bookings | "Mint Heist" selected. **Calendar View** selected (default). Use the month arrows to reach a month that contains shoot days with bookings. No dialog open, filters all "All". | window |
| 07-bookings-timeline.png | People → Bookings | Same month as the calendar shot. Click **Timeline View** in the switch at the top right. No dialog open, groups expanded. | window |
| 07-day-out-of-days.png | People → Day Out of Days | "Mint Heist" selected. Search empty, **Only with clashes** unticked. Scroll to top-left so names and the first columns show. | window |

## 8. Equipment

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 08-equipment-registry.png | Equipment | "Mint Heist" selected. **Registry** tab, all four filters on "All", search empty, no dialog open. Scroll to top. | window |
| 08-add-equipment-dialog.png | Equipment | **Registry** tab; click **Add Equipment**. Dialog open with default values (Name empty, Quantity 1, Source Rented, Status Planned). | dialog |
| 08-equipment-list.png | Equipment → Equipment Lists | "Mint Heist" selected. Click the **Equipment Lists** tab, then open the first list (e.g. "Camera Package – Shoot Day 1"). In the list, click **OUT** on the first two rows so the highlight shows. No dialog open. | window |

## 9. Risk Assessments

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 09-rams-new-dialog.png | Plan → Risk Assessments | "Mint Heist" selected. Click **New risk assessment**, choose the first shoot day in **Shoot day** so the **Units covered** tick boxes appear. Do not click Create. (The demo has no risk assessments, so the page itself is empty behind it.) | dialog |
| 09-rams-editor.png | Plan → Risk Assessments → (open the new assessment) | Click **Create** in the dialog above to open the editor. Then click **Add hazard → Built-in → Manual Handling**, and again for **Trip Hazards**. Type a name in **Responsible person name**. Click **Save**. Scroll to the top. | window |
| 09-rams-hazard-matrices.png | same editor page | Continue from above. In the **Manual Handling** hazard card (expanded), set **Before controls** to a Severe cell (e.g. severity 4, probability 4) and **After controls** to a Tolerable cell (e.g. severity 2, probability 2). | region: the expanded hazard card, from its header row through both matrices |
| 09-rams-list.png | Plan → Risk Assessments | Continue from above: click **Approve**, enter a name, confirm; then click **All risk assessments**. Use **Duplicate** on the row to copy it to a second shoot day (tick one other day), so the list shows one Approved and one Draft row. No menu or dialog open. | window |

## 10. Budget

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 10-apply-chart-template.png | Settings → Budget accounts | Mint Heist open. In the **Chart of accounts** card click **Apply template…**; leave Standard and **Add missing accounts** selected and wait for the plan summary to load | dialog |
| 10-budget-overview.png | Money → Budget | Mint Heist, **Budget** tab, live revision selected. Expand the top-level account `1100` (and one child) so line items are visible; no dialog or side panel open | window |
| 10-log-spend.png | Money → Budget | Click **Log Spend**. Account: pick any postable account (e.g. `2406`); Transaction type: **Purchase**. Type a description in Details; nothing saved | dialog |
| 10-vendor-detail.png | Money → Vendors | Select **Panavision London** and click **View vendor detail**; scroll so **Invoices** and **Purchase Orders** are both visible | window |
| 10-allocate-float.png | Money → Budget | **Floats** tab, click **Allocate float**; choose any line item and the first crew member; leave amount empty | dialog |
| 10-create-revision.png | Money → Budget | Open the **Revision** selector and choose **Create budget revision...**; type "Scenario B", choose **Copy from existing revision** | dialog |
| 10-cost-report.png | Money → Budget | **Cost Report** tab, **Chart of accounts** layout; no account expanded | window |

## 11. Call Sheets and Movement Orders

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 11-call-sheet-preview.png | Deliver → Call Sheets | Mint Heist. Select the first shoot day in **Shoot day** and its first **Unit**; paper size A4; click **Preview PDF** and wait for the preview panel to render page 1 | window |
| 11-distribute-call-sheets.png | Deliver → Call Sheets | Same selection as above; click **Distribute Call Sheets**; tick the first three recipients; do not generate | dialog |
| 11-movement-orders.png | Deliver → Movement Orders | Mint Heist. Select the first shoot day that has two or more locations and its first **Unit**; scroll so **Times & revision** and the start of **Movement order data summary** are visible; no preview generated | window |

## 12. Documents, Deliverables and Music & Archive

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 12-documents-hub.png | Deliver → Documents | Mint Heist, no dialog open (category cards visible) | window |
| 12-deliverables-overview.png | Deliver → Deliverables | Mint Heist, no dialog or side sheet open | window |
| 12-edit-deliverable.png | Deliver → Deliverables | Click the pencil on the first row so **Edit deliverable** is open; scroll the sheet to the top | region: right-hand side sheet |
| 12-music-archive.png | Deliver → Music & Archive | Mint Heist, no dialog open | window |

## 13. Tasks and Wrap Production

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 13-tasks-overview.png | Tasks | Mint Heist selected; no filters, no dialog open. If the demo has no tasks, add 4 across two sections (one High priority, one parent with 2 subtasks) first | window |
| 13-new-task-dialog.png | Tasks → New task | Dialog open, empty except Description typed "Confirm location permit" | dialog |
| 13-template-editor.png | Tasks → Templates → Edit items | Create template "Pre-shoot checklist" with 3 items (one with a subtask, section name "Pre-production", due offset -14) and open Edit items | dialog (the side sheet) |
| 13-wrap-overview.png | production switcher → Wrap production... | Mint Heist; all four sections collapsed, no dialog | window |
| 13-wrap-budget-expanded.png | Wrap Production | Click the Budget and Actualisation header to expand it | region: Budget and Actualisation section |

## 14. Settings and admin

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 14-settings-overview.png | Settings | Mint Heist selected; default Production section open; nothing edited | window |
| 14-chart-of-accounts.png | Settings → Budget accounts | Scroll so the Chart of accounts card (Apply template… and Add account buttons, a few accounts expanded) is in view | region: Chart of accounts card |
| 14-appearance-themes.png | Settings → Appearance | Albatross Mint selected | region: Appearance card with all theme tiles |
| 14-user-management.png | Settings → User management → Open User Management | Signed in as the admin account; at least the admin user plus one extra user created (username "assistant", role user) so the row buttons show. Use a throwaway local install | window |
| 14-crew-structure.png | Settings → Crew structure | Mint Heist selected; default structure, Camera department selected in the list, no unsaved changes | window |

## 15. Experimental features

| file | route / menu path | exact state to set up before capture | framing |
|---|---|---|---|
| 15-experimental-toggle.png | Settings → Developer | Show experimental features ticked (leave Developer mode off) | region: Experimental features card |
| 15-script-supervisor-log.png | Script → Script Supervisor | Experimental features on; Mint Heist; a shoot day chosen with scenes; mode Line & log; create one slate (New slate), roll and cut two takes, mark take 1 Print and take 2 NG with a reason; Slates tab showing; Show setup open | window |
| 15-script-tramlines.png | Script → Script Supervisor, Script tab | Same slate selected; middle view switched to Script for the scene; draw a tramline over a few lines; add one Ad-lib note via the add-note button | region: middle script panel |
| 15-script-supervisor-review.png | Script → Script Supervisor, Review | Same day; mode switched to Review; scroll to show progress tiles, Daily progress report and Exports cards | window |
| 15-overtime.png | People → Overtime | Experimental features on; Mint Heist; a shoot day with booked crew selected; Unit wrap entered 2 hours later than planned so tiles show overtime | window |
