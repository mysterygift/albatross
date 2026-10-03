# 09 - Dashboard: DashboardCard states, hero, wrap action relocation, card customisation

## Goal
Make the dashboard (`src/features/dashboard/page.tsx`, 1261 lines) consistent and actionable: every card uses `DashboardCard` for loading/error/empty; a hero shows "Next shoot day / Attention needed"; the destructive red Wrap Production button moves out of the page header into the production menu/switcher; optionally let users show/hide cards, persisted locally.

## Prerequisites
- Step 01 merged (`DashboardCard`, `PageHeader`, `EmptyState` exist - read their real props in `src/components/` first). Step 02 merged for the production menu location (read `docs/ui-refactor/02-production-switcher.md` and the resulting component). Step 07 may have added `GetStartedChecklist` to this page; preserve it.

## Files to touch (exhaustive)
- EDIT `src/features/dashboard/page.tsx`
- NEW `src/features/dashboard/DashboardHero.tsx` (+ test)
- NEW `src/features/dashboard/dashboardLayoutPrefs.ts` (+ test) - localStorage prefs
- NEW `src/features/dashboard/CustomiseDashboardMenu.tsx`
- EDIT the production switcher/menu component created in step 02 (path per that step; likely under `src/components/`) to add "Wrap production..." menu item
- Possibly EDIT `src/features/dashboard/page.tsx` imports only; no changes to `src/lib/dashboard/*`.

## Reuse
- Cards in the file, each with duplicated loading/error/empty `<Card>` blocks: `NextShootDayCard` (96, blocks at 109/123/137), `BudgetHealthCard` (286; 303/317/332), `TasksDueSoonCard` (402; 421/439), `RiskWatchCard` (517; 532/550), vendor-finance card (~620-717; 625/643/657), `PettyCashFloatsCard` (721; 749/763), `DeliverablesCard` (857; 877/891). Main content `<Card>` per card follows each trio.
- Data: queries at lines 982-1075 (`tasks`, `dashboard-next-shoot-day`, `dashboard-budget-health`, `deliverables`, vendor finance, risk watch, floats, float links, people), `required/requiredScore/warnings` derived at ~1077-1081, `getDashboardNextShootDayData` (`src/lib/dashboard/nextShootDay.ts`), `getDashboardBudgetHealthData`.
- Header + Wrap button at 1090-1106 (`<Link to="/wrap-production">`, `variant="destructive"`); route `wrap-production` in `src/app/router.tsx:39`; `wrapSuccess` router-state Alert 1108-1124; no-production Alert 1126-1135 (step 02 replaces with RequireProduction/EmptyState).
- `PageHeader` (step 01) replaces the h1 block at 1092-1100 (title "Dashboard", description from `currentProduction`).

## Concrete tasks
1. Read the real `DashboardCard` API from step 01. Refactor each card component to pass `loading`, `error`, `empty` (+ `emptyMessage`/action) into `DashboardCard` and delete the duplicated loading/error/empty `<Card>` blocks. Keep each card's rendered content, links and `data-testid`s identical; do it card by card, running `npm test` between. The Float card uses combined `floatCardLoading/floatCardError` (~1083).
2. **Hero** `DashboardHero({ nextShootDay, nextShootDayLoading, warnings, ... })`: left side "Next shoot day" (date, day number, call/wrap, scene/shot counts from `DashboardNextShootDayData`, link `/schedule/calendar` or `/call-sheets`); if none, an EmptyState with action to `/schedule/stripboard`. Right side "Attention needed": up to 3 highest-signal items derived from existing data (incomplete required tasks `warnings`, overdue/at-risk items from `riskWatchItems`, deliverables overdue) each linking to its page, or "All clear". Pure helper `buildAttentionItems(...)` exported and unit-tested. Place hero above the card grid (below any step-07 checklist). The old `NextShootDayCard` stays in the grid only if not redundant: remove it from the grid if the hero fully covers its content, otherwise keep and note in the commit.
3. **Move Wrap Production**: delete the destructive `Button` from the header; add a "Wrap production..." item (with `Clapperboard` icon, text-destructive styling inside the menu, separated by a divider, only when a production is selected) to the production menu/switcher from step 02 that navigates to `/wrap-production`. Add a regression test that the dashboard no longer renders a destructive Wrap button and the menu item navigates.
4. **Optional customisation**: `dashboardLayoutPrefs.ts` stores `{ hidden: DashboardCardId[] }` in localStorage key `albatross.dashboard.hiddenCards`, every access in try/catch (follow `readStoredViewMode` in `src/features/schedule/stripboard-page.tsx:96`). `CustomiseDashboardMenu` (DropdownMenu with checkbox items, from `components/ui`) in the PageHeader actions toggles card ids: `nextShootDay` (if kept), `budgetHealth`, `tasksDue`, `riskWatch`, `vendorFinance`, `floats`, `deliverables`. A "Reset" item clears. The hero and checklist are not hideable. If effort runs long, skip the menu and record it under README Follow-ups; tasks 1-3 are mandatory.
5. Replace remaining hard-coded colours touched here (e.g. `bg-green-500 dark:bg-green-90/30` wrap-success Alert at ~1110) with semantic tokens/`Alert` variants if step 01 provides one; otherwise leave.

## Out of scope
New data queries or schema, changing budget health/risk calculations, page-wide token cleanup (04), onboarding checklist/demo banner (07), the switcher component itself (02) beyond adding one menu item, drag-to-reorder cards.

## Acceptance checks
- `npm run build`, `npm test`, `npm run lint:ci` vs baselines in `/private/tmp/claude-501/baseline-*.log`.
- Unit tests: `buildAttentionItems`, layout prefs read/write/corrupt-JSON fallback, hero empty/loaded rendering.
- Manual (Browser pane, desktop + 375px): each card shows a skeleton then content; force an error (offline/throw in devtools) shows consistent error state; empty production shows empty states with actions; header has no red button; production menu has "Wrap production..." and it reaches `/wrap-production`; wrapping still returns with the success Alert; hiding a card persists across reload and Reset restores it.

## Commit message
`feat(ui): dashboard cards on DashboardCard, next-day hero, wrap action in production menu`
