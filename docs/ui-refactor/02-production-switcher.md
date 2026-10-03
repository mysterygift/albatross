# 02 Global production switcher

## Goal
Make the current production visible and switchable from every page, with New and Manage actions, and replace every hand-rolled "Select a production first." with `RequireProduction`. Update the dashboard empty state.

## Prerequisites
- Step 01 committed (provides `src/components/require-production.tsx`, `empty-state.tsx`, `page-header.tsx`).

## Files to touch (exhaustive)
Switcher:
- NEW `src/components/production-switcher.tsx` (+ `production-switcher.test.tsx`)
- `src/components/top-bar.tsx` (remove `isProductionsPage` gating, lines ~19-45; render `<ProductionSwitcher />` always, left of the right-hand button group)
- `src/features/productions/page.tsx` (read `?new=1` via `useSearchParams` to open the New production modal; the modal state is `const [open, setOpen] = useState(false)` at ~line 455; clear the param after opening)
- `src/components/require-production.tsx` (empty-state action: embed `<ProductionSwitcher />` + "New production")
Pages to adopt `RequireProduction` (all currently render the string; paths under `src/features/`):
- `schedule/script-import-page.tsx:424`, `schedule/calendar-page.tsx:1614`, `schedule/storyboard-page.tsx:579` (leave the three `throw new Error('Select a production first.')` at 320/439/507 as-is), `schedule/script-sections-page.tsx:516`, `schedule/shot-list-page.tsx:1339`, `schedule/stripboard-page.tsx:888`
- `deliverables/page.tsx:270`, `call-sheets/page.tsx:968`, `wrap-production/page.tsx:356`, `locations/page.tsx:176`, `equipment/page.tsx:467`, `music-clearance/page.tsx:268`, `movement-orders/page.tsx:560`, `readiness/page.tsx:372`, `budget/page.tsx:1413`, `budget/actualisation/page.tsx:463`
- `people/page.tsx:202`, `people/pages/CastManagerPage.tsx:288`, `people/pages/CastDetailPage.tsx:636`, `people/pages/CrewDetailPage.tsx:327`, `people/crew-manager/page.tsx:426`, `people/pages/BookingsPage.tsx:470`, `people/pages/DayOutOfDaysPage.tsx:294`
- `documents/DocumentsHub.tsx:78`, `documents/DocumentsCategoryPage.tsx:54`
- Orphans (not routed, but still contain the string): `bookings/page.tsx:152`, `day-out-of-days/page.tsx:265` -- adopt too (they are deleted in step 05) or skip; prefer skip and list in README follow-ups.
- `dashboard/page.tsx` (~1127-1136: the "No production selected" `Alert`)
- NOT changed: `search/GlobalSearchDialog.tsx:156` (search empty-text, not a page guard).
Re-run `grep -rn "Select a production first" src` at the start; the list above may have drifted.

## Reuse
- `useCurrentProduction()` in `src/features/productions/context.tsx` (`productions`, `currentProductionId`, `setCurrentProductionId`).
- The existing `Select` markup in `top-bar.tsx` (ui/select.tsx) as the switcher body; `DropdownMenu` (`ui/dropdown-menu.tsx`) not needed.
- `RequireProduction`, `EmptyState` from step 01.

## Concrete tasks
1. Create `ProductionSwitcher`: a `Select` listing `productions` (value = valid `currentProductionId`, placeholder "Select a production..."), plus a footer: "New production..." (`navigate('/productions?new=1')`) and "Manage productions" (`navigate('/productions')`) using `SelectSeparator`-style items kept outside the value list (implement as a trailing `Button` row in `SelectContent`, or switch to `DropdownMenu` radio group if Select cannot host actions; either is fine). Show a "Demo" badge when `currentProduction.slug` is the demo slug (see `DEMO_SLUG` imported in `src/app/layout.tsx`). Width `w-[240px]`, truncate long names, `aria-label="Current production"`.
2. In `top-bar.tsx` delete the `isProductionsPage`/`useLocation` code and the "Current Production" label; always render the switcher.
3. In `productions/page.tsx` open the New modal when `searchParams.get('new') === '1'`, then `setSearchParams({}, { replace: true })`.
4. Pages: for each listed file, replace the `!currentProductionId ? (<div>...Select a production first.</div>) : (...)` branch by wrapping the existing loaded content in `<RequireProduction title="<existing h1 text>">`. Edit surgically: do not restructure the large pages (`budget`, `shot-list`, `equipment`, `calendar`). Keep hooks above the guard (no hook order changes). For files whose guard is an early `return` (e.g. `CastDetailPage.tsx:~631`, `CrewDetailPage.tsx`), keep the `!personId` branch, and replace only the production branch with `<RequireProduction>{null}</RequireProduction>`-style early return.
5. Dashboard: replace the Alert at `dashboard/page.tsx:~1127` with `EmptyState` (title "Open a production to see your dashboard", action: the switcher + "New production" button).
6. Test `production-switcher.test.tsx`: lists productions, selecting calls `setCurrentProductionId`, "New production" navigates to `/productions?new=1` (MemoryRouter + mocked `useCurrentProduction`).

## Out of scope
Sidebar regrouping/breadcrumbs (05), `PageHeader` adoption beyond what `RequireProduction` renders (04), confirm/toast work (03), search shortcut (06).

## Acceptance checks
- `npm run build && npm test && npm run lint:ci` green.
- `grep -rn "Select a production first" src` returns only the storyboard `throw new Error`s, `GlobalSearchDialog`, and (if skipped) the two orphans.
- Manual (`npm run dev`): switcher visible on /schedule/stripboard, /budget, /people/cast-manager; switching production reloads page data; with no production selected each page shows the shared empty state with a working switcher; "New production" opens the modal on /productions; dashboard empty state works.

## Commit message
`feat(ui): global production switcher and RequireProduction adoption`
