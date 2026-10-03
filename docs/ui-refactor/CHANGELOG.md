# UI refactor changelog (`ui-experimental`)

Branch `ui-experimental`, based on `dev` 737f7db / baseline a81a90e. Steps 01-09 each landed as one commit; step 10 (this QA pass) is uncommitted in the working tree.

## Per step

### 01 Foundations
- Shared `PageHeader`, `EmptyState`, `DashboardCard`, `RequireProduction` components.
- Promise-based `ConfirmDialog` (`useConfirm`) and `sonner` toasts (themed).
- Test coverage for each primitive.

### 02 Production switcher
- Global production switcher in the top bar, available on every page.
- Pages that need a production use `RequireProduction` (shared empty state with the switcher) instead of ad-hoc "Select a production first" text.

### 03 Feedback and confirm
- `window.confirm` replaced by styled confirm dialogs (settings, tasks, budget, storyboard, project access).
- Banner-style success/error messages replaced by toasts.
- Stripboard "move to Unscheduled" shows an Undo toast.

### 04 Page shell and tokens
- Every route shows one `PageHeader` title; skeletons replace plain "Loading" text on Documents, Vendors, Storyboard.
- All `zinc` colour classes replaced by theme tokens, so dialogs and panels follow the selected UI theme (Mint, Bold, Yuzu, Sunset, Signal, Ledger, Clay).

### 05 Navigation
- Sidebar grouped with labelled, collapsible groups (collapsed state persisted); breadcrumbs; section tab bars on Schedule, People, Budget, Script.
- `/readiness` is now `/tasks` (old URL redirects). Tasks and Deliverables have distinct icons.
- Orphan Bookings / Day-out-of-days pages removed; People is one nav item with Cast Manager, Crew Manager, Bookings, Day Out of Days tabs.

### 06 Search and shortcuts
- Cmd/Ctrl+K command palette with "Go to" and "Create" actions; top-bar search shows the shortcut.
- `?` opens a keyboard shortcut cheat sheet (also in the palette and top bar).
- Native View menu gains Cmd+Alt+1..4 (Call Sheets, Movement Orders, Equipment, Music & Archive).
- Shortcut hints in sidebar tooltips.

### 07 Onboarding
- Dashboard "Get started" checklist (auto-ticks, hideable), demo production banner with Switch, per-page `?` help button opening that page's tutorial section.
- Top-bar global tutorial icon changed from HelpCircle to GraduationCap.

### 08 Settings and URL state
- Settings navigation grouped; `/settings?section=...` deep links with Back support.
- Developer section/API counters hidden until Developer mode is enabled.
- Stripboard `?view=day&q=...` URL state (Board view omitted from URL).

### 09 Dashboard
- Attention hero, consistent card loading/error/empty states, "Customise" menu to hide/reset cards (persisted).
- Wrap production moved into the production menu; red header button removed.

## Changes users will notice
- Routes: `/readiness` -> `/tasks` (redirect kept). `/people` now lands on Cast Manager (router redirect fixed in step 10; previously it still redirected to Bookings while the sidebar went to Cast Manager).
- Shortcuts: Cmd/Ctrl+K search/palette, `?` cheat sheet, Cmd+Alt+1..4 (native menu), existing Cmd+1-9 / Cmd+B / Cmd+T unchanged.
- Tutorial: global tutorial icon is now a graduation cap; `?` is per-page help.
- Confirmations are dialogs; success/failure feedback is toasts.

## QA fixes (step 10)
- `src/app/layout.tsx`: the "Open Tutorial Home" effect now preserves `location.search` when clearing router state (previously dropped `?section=`).
- `src/app/router.tsx`: `/people` redirects to `/people/cast-manager`.
- `src/components/section-tabs.tsx`: visible `focus-visible` ring on section tab links.
- `src/features/tutorial/PageHelpButton.test.tsx`: de-flaked the dialog test (generous async timeouts for cold lazy import under full-suite load; root cause was the 1s `findBy` default).

## Audit results (code-level)
- `window.confirm`: 0. `bg/border/text-zinc`: 0 in `src`, 0 `zinc` rules in `overrides.css`. `Schedule —` titles: 0. `FirstLaunchTutorial.tsx`, `features/bookings`, `features/day-out-of-days`: gone.
- `/readiness`: only the redirect, tutorial section matcher and tests (intentional).
- `<h1>`: only `PageHeader` plus auth/setup/error screens; Storyboard renders `PageHeader` in two mutually exclusive branches.
- "Select a production first": remains in thrown errors in `storyboard-page.tsx` and in `GlobalSearchDialog` empty text (not page guards).
- Icon-only buttons added in the refactor carry `aria-label` (search, shortcuts, page help, calendar colours, sidebar toggle, group chevrons). Section tabs and sidebar are native links/buttons, so keyboard reachable.
- All tokens used in new code are existing theme tokens; none undefined.
- All 23 test files added during the refactor passed 5/5 runs in isolation.

## Gate: baseline vs final
| Check | Baseline (a81a90e) | Final |
|---|---|---|
| `npm run build` | pass | pass |
| `npm test` failing files | 18 (16 tests) | 17 files / 15 tests, none outside BASELINE-failing-tests.txt |
| `npm run lint:ci` | 38 errors / 74 warnings | 37 errors / 73 warnings; no per-file error count worse (stripboard-page.tsx -1) |

## Known issues / follow-ups
See the Follow-ups list in `README.md` (copied here by reference). Additional items from step 10:
- Native menu View > People (`menuSchema.ts` `view_go_people`) and "Add booking" still target `/people/bookings`.
- Unused-but-exported types/constants from new modules (e.g. `SETTINGS_SECTIONS`, `ATTENTION_ITEM_LIMIT`, `*Props` types) are only used in tests or internally; left as is.
- Add-button shortcut tooltips (Add Location, New Task) still missing.
- Two "Unused eslint-disable directive" warnings in `stripboard-page.tsx` (lines ~265, ~300).

## How verified
- `npm run build`, `npm test`, `npm run lint:ci` via the gate script; `vitest run <file>` x5 per new test file.
- Code-level greps (see Audit results). No running app was available (see below).

## Not verified in a running app
The app needs the Tauri runtime and cannot render in a plain browser tab, so all manual checks from steps 02-10 were skipped:
- 02: switcher visible on stripboard/budget/cast-manager; switching production reloads data; empty states with working switcher; "New production" modal; dashboard empty state.
- 03: styled confirm dialogs for settings group, task section (moved-tasks message), budget template; Cancel/Escape no-op; stripboard Undo toast; account-colour toast; error toasts (e.g. "Move failed.").
- 04: every route shows one title; each UI theme (Mint, Bold, Yuzu, Sunset, Signal, Ledger, Clay) has no stuck dark panels in dialogs; skeletons on slow loads.
- 05: sidebar groups, chevron collapse without navigation, persistence on reload, `/readiness` redirect, Dashboard Tasks links, native View > Tasks (Cmd+9), breadcrumbs on detail routes, tab bars, Tab skipping collapsed groups, Cmd+B, icon-only sidebar mode.
- 06: Cmd/Ctrl+K from any page incl. inside text fields, suppressed in form dialogs; `?` not while typing; palette Create actions (navigate then dispatch event; pages mounting late may miss it); tooltip hints; **Tauri native menu accelerators Cmd+Alt+1..4 and no duplicates with Cmd+1-9 / Cmd+T**.
- 07: checklist ticks (new production 1/5, add cast ticks without reload), demo banner Switch, `?` page help on `/budget`, Esc closes, console clean.
- 08: `/settings?section=` deep link (incl. after "Open Tutorial Home", fixed in step 10 by code only), Back between sections, Developer mode gating, `/schedule/stripboard?view=day&q=` and reload/copy-URL.
- 09: card skeleton/error/empty states, desktop + 375px, production menu "Wrap production..." reaches `/wrap-production`, hide/reset cards persistence.
- 10: theme x desktop/mobile visual pass of all routes; flow pass; keyboard/a11y pass including focus rings on every control, dialog focus traps, stripboard dnd-kit keyboard drag with announcements, contrast ratios per theme, `prefers-reduced-motion`.
