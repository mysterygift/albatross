# 04 - Page shell, titles, loading states and colour tokens

## Goal
Every page uses the shared `PageHeader` (one `<h1>`, optional description/actions/tabs) and `EmptyState`; loading states use `Skeleton`; titles are normalised; hard-coded `zinc` colours are replaced by semantic tokens so the UI themes (commit 737f7db) apply. No behaviour changes.

## Prerequisites
- Step 01 merged: `PageHeader`, `EmptyState`, `RequireProduction` exist (read their real paths/props first, e.g. `src/components/page-header.tsx`; do not invent props).
- Step 02 merged: pages no longer contain the `if (!currentProductionId) return <h1>…Select a production first.</h1>` early returns (now `RequireProduction`). If any remain (`grep -rn "Select a production first" src`), convert them here using `EmptyState`.
- Step 03 is independent. Baseline of build/test/lint:ci was recorded before step 01.

## Files to touch (exhaustive)
Pages (h1 -> `PageHeader`; line numbers are pre-step-02 anchors, re-grep `<h1`):
- Small first: `features/documents/DocumentsHub.tsx` (h1 @77/87, "Loading documents…" @105), `documents/DocumentsCategoryPage.tsx` (h1 @53/93 dynamic `category.label`, "Loading…" @104), `locations/page.tsx` (175/184), `music-clearance/page.tsx` (267/276, title "Music & Archive Clearance"), `schedule/script-import-page.tsx` (423/428), `schedule/script-sections-page.tsx` (515/520, "Loading script versions…" @526), `people/pages/DayOutOfDaysPage.tsx` (293/303), `people/pages/CastManagerPage.tsx` (287/297), `people/pages/BookingsPage.tsx` (469/483), `people/pages/CastDetailPage.tsx` (h1 @674 person name, "Loading…" @644), `people/pages/CrewDetailPage.tsx` (@380, "Loading…" @343), `people/crew-manager/page.tsx` (425/435), `budget/vendors/VendorsIndexPage.tsx` (h1 @117 "Vendor Management", loading @147), `budget/vendors/VendorDetailPage.tsx` (@694), `budget/actualisation/page.tsx` (no h1; @463 select-production only), `admin/ProjectAccessPage.tsx` (@171), `admin/UserManagementPage.tsx` (@251), `call-sheets/page.tsx` (967/975), `movement-orders/page.tsx` (559/567), `deliverables/page.tsx` (269/278), `readiness/page.tsx` (371/396, title "Tasks"), `wrap-production/page.tsx` (355/364), `productions/page.tsx` (938), `dashboard/page.tsx` (1092; has description, keep Wrap Production button as the `actions` slot; step 09 restyles it), `schedule/storyboard-page.tsx` (578/583/588, "Loading storyboard..." @632), `schedule/stripboard-page.tsx` (887/918).
- HUGE, surgical only (replace just the h1 line/wrapper, nothing else): `budget/page.tsx` (@1412/1426), `schedule/shot-list-page.tsx` (@1338/1343), `equipment/page.tsx` (@466/482; h1 sits inside a `Tabs` row with `TabsList` - pass the TabsList via the `tabs`/`actions` slot or leave the row and swap only the `<h1>` for `PageHeader title`; do not restructure), `schedule/calendar-page.tsx` (@1613/1619), `settings/page.tsx` (@408; keep text "Settings": tests `NonEpisodicRegression.integration.test.tsx:363` and `SettingsEpisodes…` query `heading name 'Settings'`/`'Episodes'`).
- Orphans (`bookings/page.tsx`, `day-out-of-days/page.tsx`, `people/page.tsx`): do NOT touch; step 05 deletes them.
- Not pages, leave alone: `App.tsx`, `app/layout.tsx` (auth gates), `auth/setup/SetupDoneScreen.tsx`.
Loading text -> `Skeleton`: `settings/ClientsSettingsSection.tsx:218`, `EpisodesSettingsSection.tsx:228`, `ShootingBlocsSettingsSection.tsx:303`, `CrewStructureEditor.tsx:384-387`, `schedule/smart-scheduling-insights-panel.tsx:161-164`; dashboard already uses `animate-pulse` divs @115/@309 (swap to `Skeleton`).
Zinc -> tokens (grep `zinc-` finds 14 files + generated CSS): `components/FirstLaunchTutorial.tsx` (5), `features/tutorial/{SectionTutorialPanel(4),TutorialHome(7),TutorialEntryModal(3)}.tsx`, `people/crew-manager/CrewSetupWizard.tsx` (10), `people/pages/CastDetailPage.tsx:791`, `schedule/{boneyard-panel(2),script-section-edit-dialog(10),script-section-script-panel(7),shot-script-section-link-dialog(17),stripboard-page(21),shot-list-page(139)}.tsx`, `settings/{CrewStructureEditor(21),page(3: lines 668-674)}.tsx`.
Generated: `src/styles/themes/overrides.css` (regenerate, do not hand-edit).

## Reuse
- Tokens in `src/index.css` (`@theme inline` lines 15-50; `:root` 55-90, `.dark` ~92+): `background foreground card card-foreground popover muted muted-foreground secondary accent primary destructive border input ring sidebar-*`. Theme files `src/styles/themes/{bold,yuzu,sunset,signal,ledger,clay}.css` add `--ui-warn --ui-success` etc.; `shared.css` styles `[data-slot=card|top-bar|...]` so use shadcn `Card`/`Dialog`/`Input`/`Button` primitives (they already carry the right tokens) instead of re-colouring them.
- `src/components/ui/skeleton.tsx`, `Card`, `Badge`, `DialogContent` defaults.
- `scripts/generate-theme-overrides.py` (scans `src/` for colour utilities; run `python3 scripts/generate-theme-overrides.py` after edits so unused zinc rules drop).

## Concrete tasks
1. Read step-01 primitives; write down their exact prop names in the PR notes.
2. Zinc mapping (apply mechanically): `bg-zinc-900|950` -> `bg-card`; `bg-zinc-800(/n)` -> `bg-muted(/n)`; `bg-zinc-700|600` -> `bg-secondary`; `bg-zinc-200/90` (light twin) -> `bg-muted`; `border-zinc-*` -> `border-border`; `text-zinc-100|200|300` -> `text-foreground`; `text-zinc-400|500` -> `text-muted-foreground`; `hover:bg-zinc-800` -> `hover:bg-muted`; `hover:text-zinc-200|300` -> `hover:text-foreground`; `bg-zinc-950/80` (TutorialHome overlay) -> `bg-background/80`. Drop redundant `border-zinc-700 bg-zinc-900 text-foreground` from `DialogContent` (default is already `bg-card`/`border`). Remove `dark:` zinc pairs in `boneyard-panel.tsx` (use `bg-muted border-border`; keep the amber drag-over classes, they are themed by the overrides file). `script-section-script-panel.tsx` `variant==='dark'` branches: collapse both branches to token classes (the dialog now uses `bg-card`), keep the prop for API compat. Keep `text-mint-*` classes (themed via overrides).
3. Do zinc files one at a time, smallest first; `shot-list-page.tsx` (139 hits, mostly `text-zinc-*`/`bg-zinc-*` in dialogs) with `sed` limited to those exact class tokens, then review `git diff --stat` shows only class-string changes.
4. Run `python3 scripts/generate-theme-overrides.py`; confirm `grep -c zinc src/styles/themes/overrides.css` is 0 (or only classes still used).
5. Titles: drop the `Schedule — ` prefix -> `Calendar`, `Stripboard`, `Shot Lists` (match sidebar label), `Storyboard`, `Script Import`, `Script Sections`; `Music & Archive Clearance` -> `Music & Archive`; `Vendor Management` -> `Vendors`; Tasks page title `Tasks`. Set `document.title`-style nothing; out of scope.
6. Per page, replace the loaded-state `<h1>` row with `<PageHeader title=… description=… actions={…} />`, moving the existing action buttons/selects into `actions` unchanged. Delete the leftover duplicate `<h1>` branches (the loading/no-production variant) - each page must render exactly one h1 (`grep -c "<h1" file` == 0 after, since PageHeader owns it). Dynamic titles (person name, category label) pass as `title`.
7. Replace plain "Loading…" `<p>` with `Skeleton` blocks sized like the content (list: 3 rows `h-10 w-full`; page: header skeleton + card). For pages whose body is gated on `isLoading`, keep `PageHeader` rendered so the title never flickers.
8. Replace page-level empty copy ("No cast members yet.", "No sections yet…", shots "Select a scene…") with `EmptyState` (title + hint + primary action reusing the page's existing add button handler). Only for whole-page/list empties, not inline table cells.
9. Huge pages: perform only steps 6 (h1) and 7/8 where a page-level loading/empty block already exists. No reformatting, no extraction.
10. Run gate; fix type errors from prop mismatch.

## Out of scope
Production switcher (02), confirm/toast (03), nav/routes (05), tutorial removal (07), Settings re-layout (08), dashboard cards (09), new themes, colour changes to amber/emerald/red (already handled by overrides).

## Acceptance checks
- `npm run build && npm test && npm run lint:ci` green vs baseline.
- `grep -rn "zinc-" src --include='*.tsx'` returns nothing (tests excluded); `grep -rn "<h1" src/features` only shows non-page cases or `PageHeader` internals; `grep -rn "Schedule — " src` empty.
- Manual (`npm run dev` / preview): visit every route in `src/app/router.tsx`; each shows one title; switch UI theme in Settings > Appearance through Mint, Bold, Yuzu, Sunset, Signal, Ledger, Clay and confirm dialogs (script-section edit, link sections, stripboard new shoot day, crew structure, tutorial) have no stuck dark-grey panels; throttle network/slow DB to see Skeletons on Documents, Vendors, Storyboard.
- Existing heading tests still pass (`Settings`, `Episodes`).

## Commit message
`feat(ui): adopt PageHeader/EmptyState, normalise titles and replace zinc with theme tokens`
