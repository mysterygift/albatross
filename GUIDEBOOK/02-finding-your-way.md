# 2. Finding your way

How the Albatross window is laid out, how to jump to anything quickly, and what the Dashboard shows. Read this once and the rest of the guide is easy to follow.

## The window

![Albatross window with sidebar, top bar and section tabs](images/02-app-layout.png)

| Area | What it does |
|---|---|
| **Sidebar** (left) | Every page in the app, in groups. |
| **Top bar** | Sidebar toggle, breadcrumbs, production switcher, search, keyboard shortcuts and the tutorial menu. |
| **Section tabs** | Appear under the top bar on pages that have sub-pages, such as Schedule or People. |
| **Page area** | The page itself. A banner appears here when you are in the demo production. |

Most pages show data for the **current production** only. The current production is the one named in the top bar.

### Sidebar

The sidebar is grouped by stage of work:

| Group | Pages |
|---|---|
| *(top)* | **Dashboard**, **Productions** |
| **Plan** | **Schedule** (Calendar, Stripboard, Shot Lists, Storyboard), **Script** (Script Import, Script Sections, Script Breakdown), **Locations**, **Equipment**, **Risk Assessments** |
| **People** | **Cast Manager**, **Crew Manager**, **Bookings**, **Day Out of Days** |
| **Money** | **Budget**, **Vendors** |
| **Deliver** | **Call Sheets**, **Movement Orders**, **Documents**, **Deliverables**, **Music & Archive** |
| **Tasks** | **Tasks** |
| **Settings** | **Settings**, **Guidebook** |

- Select a page to open it. Select the arrow beside **Schedule**, **Script**, **People** or **Budget** to expand or collapse its sub-pages. Albatross remembers which groups you left open.
- Hide or show the whole sidebar with the button at the left of the top bar, or with ⌘B (Ctrl+B).
- Hover over a page to see its keyboard shortcut.
- Experimental pages (Script Supervisor, Overtime, Receipt Capture) are hidden by default. See [Experimental features](15-experimental-features.md).

### Top bar

- **Breadcrumbs** show where you are, for example **Plan › Schedule › Stripboard**. Select an earlier crumb to go back up. They are hidden when the window is narrow.
- **Production switcher** shows the current production. See below.
- **Search** opens the command palette (⌘K / Ctrl+K).
- **Keyboard shortcuts** (the keyboard icon, or `?`) opens the shortcut list.
- **Tutorial** (the graduation cap) opens the tutorial menu; see [Getting started](01-getting-started.md).

This guide is also available inside the app: open **Guidebook** in the sidebar, just below Settings, and use the contents list on the left to move between chapters and sections.

### Switch production

1. Select the production name in the top bar.
2. Pick another production from the list.

![Production switcher open](images/02-production-switcher.png)

The same menu has **New production…** and, when a production is open, **Wrap production…**; see [Productions](03-productions.md) and [Tasks and wrap](13-tasks-and-wrap.md). If no production is selected, most pages ask you to choose or create one.

## Search and the command palette

Press ⌘K (Ctrl+K) from anywhere, or select **Search** in the top bar. The palette finds records in the current production and runs commands. Press ⌘K again or Esc to close it.

![Command palette showing search results](images/02-command-palette.png)

### Find a record

1. Press ⌘K (Ctrl+K).
2. Type part of a name, role, email, phone number, scene, document name or PO number.
3. Use the arrow keys and press Enter, or click a result, to open it.

Results are grouped as **Cast**, **Crew**, **Scenes**, **Locations**, **Equipment**, **Documents**, **Vendors** and **Purchase Orders**. Each group shows up to eight matches; a line such as "3 more — refine your search" tells you when more exist. With an empty search box, the palette lists the first few entries of each group.

To check a result without leaving the palette, select the eye icon on its row, or press the right arrow key with the row highlighted. The left arrow closes the preview.

### Run a command

Commands appear below the results.

- **Go to** commands open any page, such as **Go to Schedule: Stripboard**.
- **Create** commands start a new item: **New production**, **Add cast member**, **Add crew member**, **Add booking**, **Log spend**, **Add line item**, **New shoot day**, **Add strip**, **New task**, **Add location**, **Upload document** and **Add deliverable**. They are greyed out with "Select a production" until a production is open (except **New production**).
- **Keyboard shortcuts** opens the shortcut list.

Start the search with `>` to show commands only, for example `> add`.

## Keyboard shortcuts

Press `?` (when you are not typing in a field) or select the keyboard icon to see the full list. The most useful are below. On Windows, use Ctrl in place of ⌘.

![Keyboard shortcuts list](images/02-shortcuts.png)

| Shortcut | Action |
|---|---|
| ⌘K | Search and commands |
| ⌘B | Toggle sidebar |
| ⌘, | Settings |
| ⌘N | New production |
| ⌘O / ⇧⌘E | Import / export a production file |
| ⌘1 | Dashboard |
| ⌘2 | Productions |
| ⌘3 | Budget |
| ⌘4 | Schedule (Calendar) |
| ⌘5 | People (Cast Manager) |
| ⌘6 | Locations |
| ⌘7 | Documents |
| ⌘8 | Deliverables |
| ⌘9 | Tasks |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3 / ⌥⌘4 | Call Sheets / Movement Orders / Equipment / Music & Archive |

Create shortcuts follow the page you are on: for example ⇧⌘D adds a shoot day, ⇧⌘T adds a strip, ⇧⌘C adds cast, ⇧⌘R adds crew, ⇧⌘K adds a booking, ⇧⌘L logs spend and ⇧⌘I adds a budget line item. The menu bar shows them too: the **File** and **View** menus are always present, and a menu for the current area (**People**, **Budget**, **Schedule**, **Tasks**, **Locations**, **Documents** or **Deliverables**) appears when you open that area. The **Help** menu has **Getting Started**, which opens the tutorial section list, and **Keyboard Shortcuts**, which opens the shortcut list.

## Dashboard

Open **Dashboard** (⌘1) for a one-screen picture of the current production.

![Dashboard for the demo production](images/02-dashboard.png)

From top to bottom:

| Section | Shows |
|---|---|
| **Get started** | Five setup steps: create a production, import a script, add cast, build a shoot day, set a budget. Each step links to its page and ticks off as you complete it. **Hide** dismisses it for every production and it cannot be brought back. When all steps are done it is replaced by "You're set up." |
| **Next shoot day** and **Attention needed** | The next shoot day with its call and wrap times, plus up to three urgent items: critical risks, overdue deliverables, incomplete required tasks. Select an item to open it; "All clear" means nothing needs attention. |
| **Required items** | The percentage of required tasks completed. |
| Detail cards | **Next Shoot Day**, **Budget Health Check**, **Petty cash floats**, **Tasks Due Soon**, **Deliverables**, **Vendor finance** and **Risk Watch**. Select a card to open the matching page (for example, the Next Shoot Day card opens the Stripboard). |
| **Outstanding required items** | A list of required tasks still open, shown only when there are some. |

At the bottom, **Wrap production** starts the wrap-up flow once shooting has finished.

### Choose which cards to show

1. Select **Customise** at the top right of the Dashboard.
2. Tick or untick cards under **Show cards**: **Next shoot day details**, **Budget health**, **Tasks due soon**, **Risk watch**, **Vendor finance**, **Petty cash floats**, **Deliverables**.
3. Select **Reset** to show all of them again.

![Customise menu on the Dashboard](images/02-dashboard-customise.png)

> **Note** This choice is saved on this computer and applies to every production.

## Appearance

Albatross has eight looks: **Albatross Mint** (the default), **Bold**, **Yuzu**, **Sunset**, **Signal**, **Ledger**, **Clay** and **Night Shoot**. Night Shoot is dim and red-shifted for dark sets. The layout and workflows are the same in every theme.

1. Go to **Settings → Appearance**.
2. Select a theme tile. It applies immediately.

![Appearance settings with theme tiles](images/02-themes.png)

## iPad and iPhone

The iPad and iPhone app has the same pages and data as the desktop app. These things differ:

- **App menu.** There is no menu bar, so the menu button at the right of the top bar holds what the File menu and the current area's menu hold on a computer: **New production**, **Import production**, **Export production**, the commands for the page you are on (for example **Add cast member** on People), **Settings**, **Keyboard shortcuts** and **Log out**. The keyboard icon is not shown in the top bar.
- **Sidebar.** Swipe right from the left edge of the screen to open the sidebar and swipe left on it to close it. On a narrow screen it opens over the page.
- **Drag and drop.** Press and hold a strip, booking or list item for a moment before dragging it. A quick swipe scrolls the page instead.
- **Controls.** Buttons that only appear when you hover are always visible, and menus and lists have larger tap targets.
- **Saving and opening files.** Exports (PDFs, CSV files and `.apf` production files) are saved in Albatross's folder in the Files app, under **On My iPad › Albatross › Exports**, and the share sheet opens so you can preview, save elsewhere, AirDrop or email the file. Opening a stored document also opens the share sheet. To import a production, open an `.apf` file from Files, Mail or AirDrop and choose Albatross, or use **Import production** in the app menu.
- **Script Breakdown.** Press and hold a word in the script, drag the handles over the words, then pick a category.
- **Script Supervisor** always uses its tablet layout. See [Experimental features](15-experimental-features.md).

**Next:** [Productions](03-productions.md)
