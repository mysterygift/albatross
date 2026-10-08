# UI

How the app shell, navigation, shared components, themes, shortcuts and URL state are put together, and the conventions new pages should follow.

## App shell
`AppLayout` (`src/app/layout.tsx`) is the route element for everything. It first runs the auth/unlock gate (see [architecture.md](architecture.md)), then renders `AppLayoutShell`:

| Piece | Component |
|---|---|
| Providers around the shell | `TutorialProvider` (see [features/tutorial.md](features/tutorial.md)), shadcn `SidebarProvider` (starts closed on a phone) |
| Sidebar | `src/components/app-sidebar.tsx` |
| Top bar | `src/components/top-bar.tsx`: sidebar toggle, breadcrumbs, `ProductionSwitcher`, **Search** (⌘K), keyboard-shortcuts button, tutorial menu, and on platforms without a menu bar the **App menu** (`AppActionsMenu`) |
| Collaboration banner | `src/features/server/ServerCollabBanner.tsx` |
| Section tabs | `src/components/section-tabs.tsx` |
| Page body | `<main>` with `DemoProductionBanner` and the routed page (`<Outlet />`), wrapped in a div keyed on the path so each page fades in (`motion.css`) |
| Phone tab bar | `src/components/phone-tab-bar.tsx`, shown on iPhone portrait ([Phone and touch layout](#phone-and-touch-layout)) |
| Overlays | `GlobalSearchDialog` ([features/search.md](features/search.md)), `ShortcutCheatSheet`, dev-only `DevPerfHud` |
| Bridges (render nothing) | `GlobalShortcutBridge`, `ApfMenuEventBridge`, `ApfDesktopOpenBridge`, `MenuSidebarBridge`, `SidebarSwipeGestures` |

Every page renders inside this shell, scoped to the **current production** chosen in the top bar. Pages that need one are wrapped in `RequireProduction`.

## Navigation
`src/app/navigation.ts` is the single source for the sidebar, breadcrumbs, section tabs and the search "Go to" commands.

- `navGroups` is a list of groups (`top`, `plan`, `people`, `money`, `deliver`, `tasks`, `settings`) of items; an item with `sub` + `defaultChild` is a parent with child pages (Schedule, Script, People, Budget).
- `experimental: true` on an item or sub-item hides it from the sidebar, section tabs and search unless **Settings → Developer → Show experimental features** is on (`visibleNavGroups(showExperimental)`, `useShowExperimental`). Routes stay registered, so direct links still work. Currently Receipt Capture, Script Supervisor and Overtime.
- `findNavTrail(pathname)` does a longest-prefix match and flags detail routes (`isDetail`), which breadcrumbs and `SectionTabs` use (tabs are hidden on detail routes).
- Script pages live under `/schedule/script-*` on purpose; the native menu bridge depends on those paths.
- Sidebar group open/closed state is saved in `localStorage` (`albatross.sidebar.groups`) and the group for the current route auto-opens.
- To add a page: see "Add a page" in [contributing.md](contributing.md).

## Shared components
| Component | Use |
|---|---|
| `PageHeader` (`src/components/page-header.tsx`) | The only place a page renders its `<h1>`. Props: `title`, `description`, `actions`, `tabs`. Titles match the sidebar label |
| `EmptyState` | Whole-page or list empties: `icon`, `title`, `description`, `action` (`role="status"`) |
| `RequireProduction` | Wrap production-scoped pages; shows "No production selected" with the switcher and **New production** (`/productions?new=1`) |
| `ConfirmDialog` / `useConfirm()` (`src/components/ui/confirm-dialog.tsx`) | Replace `window.confirm`. `const { confirm, dialog } = useConfirm()`, render `{dialog}` once, `await confirm({ title, confirmLabel, destructive })`. A throwing `onConfirm` keeps the dialog open |
| Toasts (`src/components/ui/sonner.tsx`) | `import { toast } from '@/components/ui/sonner'`; `toast.success/error`. One `<Toaster />` is mounted in `src/app/providers.tsx` |
| `DashboardCard` | Card with `status`: `loading` / `error` (with retry) / `empty` / `ready` |
| `SectionTabs` | Tab strip for the sub-pages of the current nav parent; never build per-page tab strips for the same thing |
| `ProductionSwitcher` | Dropdown of non-archived productions; marks the demo with a **Demo** badge |
| `ShortcutTooltip` / `shortcut-hint.tsx` | Tooltip with the formatted accelerator |
| `src/components/ui/*` | shadcn/Radix primitives (config in `components.json`); prefer these over hand-rolled controls |

Conventions: page titles via `PageHeader`; loading via `Skeleton`; destructive actions via `useConfirm`; user feedback via toast; no raw `zinc-*`/hex colours (below).

## Themes and tokens
Eight UI themes, chosen in **Settings → Appearance** and stored as `ui_theme` in the settings table.

| Piece | Location |
|---|---|
| Theme ids, labels, default (`albatross-mint`) | `src/lib/uiTheme/uiThemes.ts` |
| Apply + persist | `src/hooks/useUiTheme.ts` sets `<html data-ui-theme="...">` (called once in `AppLayout`) |
| Base tokens (Mint) | `src/index.css`: CSS variables (`--background`, `--card`, `--primary`, `--muted`, `--border`, `--sidebar-*`, ...) mapped to Tailwind colours in `@theme inline` |
| Other themes | `src/styles/themes/{bold,yuzu,sunset,signal,ledger,clay,night}.css`, each scoped to `:root[data-ui-theme="..."]`, imported in `src/main.tsx` |
| Shared themed component styling | `src/styles/themes/shared.css` reads `--ui-*` variables (radii, border width, shadows, patterns) that every theme file must define |
| Fixed-colour overrides | `src/styles/themes/overrides.css`, **generated** |

Rules:
- Use semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`) and the shadcn primitives so every theme applies. Do not hard-code `zinc-*` neutrals.
- Existing amber/emerald/red/mint status colours are remapped per theme by `overrides.css`. After adding new colour utility classes, regenerate it from the repo root: `python3 scripts/generate-theme-overrides.py` (scans `src/`; Mint is excluded). Do not edit it by hand.
- Adding a theme: add it to `UI_THEMES` and the preview map in `AppearanceSettingsSection.tsx`, create its CSS file defining all `--ui-*` variables, and import it in `src/main.tsx`.
- Stored ids that were renamed resolve through `RETIRED_UI_THEME_IDS`.

## Phone and touch layout
The iPhone build ([contributing.md](contributing.md#iphone-build)) uses the same pages with a few platform switches. Desktop rendering is unchanged.

| Piece | Where |
|---|---|
| Platform checks: `isIosPlatform`, `isMobilePlatform`, `hasNativeMenuBar`, `isPhoneViewport` (width up to 767 px, or height up to 500 px for a phone on its side; both come from `PHONE_VIEWPORT_QUERY`); `applyPlatformAttribute` sets `<html data-platform>` | `src/lib/platform/index.ts` |
| Viewport hooks: `useIsPhone` (width or height, follows rotation) is the single phone switch: the tab bar, the shadcn sidebar's sheet mode and the page layouts all use it, so a phone on its side gets the tab bar too. `usePhoneWidth` (width only) is for how a dialog or toolbar wraps | `src/hooks/use-is-phone.ts` |
| Safe areas (`--safe-top` etc., with `viewport-fit=cover` in `index.html`), no-hover controls, 44 pt menu rows and 40 pt buttons, inputs and selects on coarse pointers, 16 px field text so iOS does not zoom, full-screen sheets, dialog scrolling, page-sheet dialogs (`data-phone-sheet`), `data-touch-targets` pages | `src/styles/platform-mobile.css`, every rule scoped to `html[data-platform]` or a media query |
| Page fade, dialog and sheet motion, press feedback, reduced-motion fallback | `src/styles/motion.css` |

- **Navigation.** At phone width the sidebar is a sheet that starts closed, closes after a link is followed, and opens with a swipe right from the left edge (`SidebarSwipeGestures`; a swipe left on it closes it). `PhoneTabBar` sits at the bottom on iOS below 768 px: **More** (toggles the sidebar), **Home**, **Schedule**, **People**, **Tasks**. Each tab returns to the last page opened under it; a second tap goes to the tab's first page, then scrolls to the top. It slides away while a text field has focus or a dialog is open. Toasts and fixed controls leave room for it through `--phone-tab-bar-space`.
- **Top bar.** The shortcut hint and **Keyboard shortcuts** button are hidden on mobile; the shortcuts sheet is in the **App menu** ([above](#keyboard-shortcuts-command-palette-native-menu)). Section tabs scroll sideways and keep the current tab in view.
- **Dashboard.** `PhoneQuickActions` shows large links to **Call sheet**, **Stripboard**, **Movement order**, **Crew contacts** and, with experimental features on, **Script supervisor** and **Log a receipt**.
- **Drag and drop.** `usePlatformDragSensors(distance)` returns a pointer sensor on desktop and mouse plus touch sensors on mobile; a touch drag starts after a 250 ms press so swiping still scrolls. Use it instead of `PointerSensor` in new `@dnd-kit` code.
- **Files.** iOS has no save or folder dialog: `src/lib/files/` writes to `Documents/Exports` and opens the share sheet (`mobileShare.ts`); see [integrations.md](integrations.md#files-and-attachments).

Per-page layouts switch on `usePhoneWidth()` or `useIsPhone()`:

| Page | Phone behaviour |
|---|---|
| Schedule → Calendar | `PhoneMonthCalendar`: a compact date grid with a dot per unit, and the month's shoot days listed beneath; a card still drags onto a date |
| Schedule → Stripboard | **Unscheduled** starts collapsed; opening it or the boneyard closes the other |
| Script → Script Sections, Link script sections dialog | **Sections** / **Script** segmented control instead of two panes; tap the first and last line to set a range |
| Script → Script Breakdown | Scene picker with previous and next buttons instead of the scene list; press and hold to select words, with the category picker docked to the bottom of the screen |
| Script → Script Supervisor | Tablet layout always on; compact arrangement below 640 px ([features/script-supervisor.md](features/script-supervisor.md)) |
| People → Overtime | Crew shown as cards, filter as a menu |
| Settings | Section picker is a native select |
| Call Sheets, Movement Orders | `PdfPreview` fits the PDF to the screen width |

New phone layouts follow the same rules: gate on the hooks, not on user-agent checks in components, keep the desktop markup path unchanged, and give touch controls at least 40 pt.

## Keyboard shortcuts, command palette, native menu
- **Schema**: `src/app/menuSchema.ts` is the single definition of menu commands. `globalMenuCommands` and per-section `sectionMenuSpecs` carry ids and accelerators; `commandLabels` gives display names; `menuCommandTargets` maps a command to a route (`to`) and/or a window event (`browserEvent`); `navCommandIdByPath` links sidebar destinations to their ⌘-number shortcuts; `getAcceleratorConflicts` flags clashes (warned in dev).
- **Native menu**: built in Rust (`rebuild_menu` in `src-tauri/src/menu.rs`, desktop only) and must be kept in step with the schema; `menuSchema.test.ts` reads `menu.rs` and fails when an item's event name differs from `menuEventNameForCommand`. A menu click emits a Tauri event `albatross-menu-<id with dashes>`; `ApfMenuEventBridge` listens, navigates, and re-dispatches a browser event for page-level actions (for example "Add cast member" opens the form on the People page). The frontend calls `set_active_menu_section` on every route change so only the current section's menu (People, Budget, Schedule, Tasks, Locations, Documents, Deliverables) is shown, and `set_budget_duplicate_live_as_draft_enabled` to enable that item.
- **Help menu**: Help → Getting Started and Help → Keyboard Shortcuts (`help_getting_started`, `help_keyboard_shortcuts`) are `dispatch` targets in `menuCommandTargets` with no route. `ApfMenuEventBridge` re-dispatches them as window events, and `GlobalShortcutBridge` listens: Keyboard Shortcuts calls `onOpenShortcuts`, Getting Started calls `onOpenGettingStarted` (opens the tutorial home via `setPickerOpen(true)`; wired in `layout.tsx`).
- **In-app menu**: iOS has no menu bar (`src-tauri/src/menu_mobile.rs` accepts the menu commands and ignores them), so `AppActionsMenu` (the **App menu** button in the top bar) lists **New production**, **Import production**, **Export production**, **Publish to server** (when server publish is enabled), the current section's commands, **Settings**, **Keyboard shortcuts** and **Log out** (labels from `commandLabels`). Each item calls `runMenuCommand(id)`, which dispatches `RUN_MENU_COMMAND_EVENT`; `ApfMenuEventBridge` looks up the same handler the native event would run. It renders nothing when `hasNativeMenuBar()` is true.
- **Vocabulary**: native File items read "New Production…", "Import Production…", "Export Production…" (ids stay `new_project` etc.). There is no Open Recent submenu. ⌘5 goes to Cast Manager, the same as the sidebar's People item.
- **JS-handled keys** (`GlobalShortcutBridge`, so they can be suppressed while typing): ⌘K / Ctrl+K toggles search (also from text fields, but ignored while another dialog is open); `?` opens the shortcut cheat sheet unless typing or a dialog is open.
- **Cheat sheet**: `src/components/shortcut-cheat-sheet.tsx` is generated from the schema by `shortcutSections.ts` (Navigation, Create, View, General). Do not maintain a second list.
- **Palette**: [features/search.md](features/search.md). It reuses `menuCommandTargets`, so a new menu command with a target can be added to `CREATE_COMMAND_IDS` and appears in the palette.
- Accelerators are written `CmdOrCtrl+...`; `formatAccelerator` renders ⌘⇧D on macOS and Ctrl+Shift+D elsewhere.
- Adding a command: add it to the schema (id, accelerator, label, target), add the Rust menu item and `emit` arm in `src-tauri/src/menu.rs`, and handle the event in `ApfMenuEventBridge` or the page.

## URL state
State a user would expect to survive reload, back/forward or a copied link goes in search params; per-viewer preferences go in `localStorage`; shared or durable settings go in the `settings` table.

| Page | Params |
|---|---|
| Settings | `section` (legacy `tab` accepted); section changes push history |
| Budget | `tab` (`budget`, `cost_report`, `actualisation`, `floats`, `compare`), `floats`, `revisionId`; the last view mode is also kept in `localStorage` |
| Stripboard | `q`, `loc` (`none` = no location), `bloc` (default `all`), `day`; defaults are omitted (`src/features/schedule/stripboardUrlState.ts`) |
| Productions | `new=1` opens the new-production dialog |
| Search arrival | `highlight=<id>`, stripped after 2.5 s (`useHighlightParam`) |

Conventions: parse defensively (invalid values fall back to the default, never throw), omit defaults, use `setSearchParams(prev => ...)` functional updates so other params survive, and use `replace` for keystroke-level changes.
