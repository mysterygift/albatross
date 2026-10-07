# UI

How the app shell, navigation, shared components, themes, shortcuts and URL state are put together, and the conventions new pages should follow.

## App shell
`AppLayout` (`src/app/layout.tsx`) is the route element for everything. It first runs the auth/unlock gate (see [architecture.md](architecture.md)), then renders `AppLayoutShell`:

| Piece | Component |
|---|---|
| Providers around the shell | `TutorialProvider` (see [features/tutorial.md](features/tutorial.md)), shadcn `SidebarProvider` |
| Sidebar | `src/components/app-sidebar.tsx` |
| Top bar | `src/components/top-bar.tsx`: sidebar toggle, breadcrumbs, `ProductionSwitcher`, **Search** (⌘K), keyboard-shortcuts button, tutorial menu |
| Collaboration banner | `src/features/server/ServerCollabBanner.tsx` |
| Section tabs | `src/components/section-tabs.tsx` |
| Page body | `<main>` with `DemoProductionBanner` and the routed page (`<Outlet />`) |
| Overlays | `GlobalSearchDialog` ([features/search.md](features/search.md)), `ShortcutCheatSheet`, dev-only `DevPerfHud` |
| Bridges (render nothing) | `GlobalShortcutBridge`, `ApfMenuEventBridge`, `ApfDesktopOpenBridge`, `MenuSidebarBridge` |

Every page renders inside this shell, scoped to the **current production** chosen in the top bar. Pages that need one are wrapped in `RequireProduction`.

## Navigation
`src/app/navigation.ts` is the single source for the sidebar, breadcrumbs, section tabs and the search "Go to" commands.

- `navGroups` is a list of groups (`top`, `plan`, `people`, `money`, `deliver`, `tasks`, `settings`) of items; an item with `sub` + `defaultChild` is a parent with child pages (Schedule, Script, People, Budget).
- `experimental: true` on an item or sub-item hides it from the sidebar, section tabs and search unless **Settings → Developer → Show experimental features** is on (`visibleNavGroups(showExperimental)`, `useShowExperimental`). Routes stay registered, so direct links still work. Currently Script Supervisor and Overtime.
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

## Keyboard shortcuts, command palette, native menu
- **Schema**: `src/app/menuSchema.ts` is the single definition of menu commands. `globalMenuCommands` and per-section `sectionMenuSpecs` carry ids and accelerators; `commandLabels` gives display names; `menuCommandTargets` maps a command to a route (`to`) and/or a window event (`browserEvent`); `navCommandIdByPath` links sidebar destinations to their ⌘-number shortcuts; `getAcceleratorConflicts` flags clashes (warned in dev).
- **Native menu**: built in Rust (`rebuild_menu` in `src-tauri/src/lib.rs`) and must be kept in step with the schema. A menu click emits a Tauri event `albatross-menu-<id with dashes>`; `ApfMenuEventBridge` listens, navigates, and re-dispatches a browser event for page-level actions (for example "Add cast member" opens the form on the People page). The frontend calls `set_active_menu_section` on every route change so only the current section's menu (People, Budget, Schedule, Tasks, Locations, Documents, Deliverables) is shown, and `set_budget_duplicate_live_as_draft_enabled` to enable that item.
- **JS-handled keys** (`GlobalShortcutBridge`, so they can be suppressed while typing): ⌘K / Ctrl+K toggles search (also from text fields, but ignored while another dialog is open); `?` opens the shortcut cheat sheet unless typing or a dialog is open.
- **Cheat sheet**: `src/components/shortcut-cheat-sheet.tsx` is generated from the schema by `shortcutSections.ts` (Navigation, Create, View, General). Do not maintain a second list.
- **Palette**: [features/search.md](features/search.md). It reuses `menuCommandTargets`, so a new menu command with a target can be added to `CREATE_COMMAND_IDS` and appears in the palette.
- Accelerators are written `CmdOrCtrl+...`; `formatAccelerator` renders ⌘⇧D on macOS and Ctrl+Shift+D elsewhere.
- Adding a command: add it to the schema (id, accelerator, label, target), add the Rust menu item and `emit` arm in `src-tauri/src/lib.rs`, and handle the event in `ApfMenuEventBridge` or the page.

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
