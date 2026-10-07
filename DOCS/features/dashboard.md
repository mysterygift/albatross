# Dashboard

The landing page (`/`) with a production overview: next shoot day, items needing attention, budget health, tasks, deliverables, vendor finance, floats and risks.

## Code map
| Area | Location |
|---|---|
| Page and card components | `src/features/dashboard/page.tsx` (cards are local components in this file) |
| Hero (next shoot day + attention list) | `src/features/dashboard/DashboardHero.tsx` |
| Attention ranking | `src/features/dashboard/attentionItems.ts` |
| Card visibility prefs | `src/features/dashboard/dashboardLayoutPrefs.ts`, `src/features/dashboard/CustomiseDashboardMenu.tsx` |
| Card shell | `src/components/dashboard-card.tsx` (see [../ui.md](../ui.md)) |
| Data helpers | `src/lib/dashboard/nextShootDay.ts`, `src/lib/dashboard/budgetHealth.ts`, `src/lib/dashboard/vendorFinance.ts`, `src/lib/budget/vendors/riskWatch.ts` |
| Getting-started checklist | `src/features/onboarding/GetStartedChecklist.tsx` (see [tutorial.md](tutorial.md)) |
| Tests | `src/features/dashboard/*.test.ts(x)` |

## How it works
- **Read-only**: the page writes nothing except the card-visibility preference. All figures are derived from other features' repositories; there are no dashboard tables.
- **Scoping**: every query is keyed by `currentProductionId` (and the working budget revision where relevant). With no production selected the page shows an `EmptyState` with the production switcher and **New production**.
- **Layout, top to bottom**: page header with **Customise**; "Get started" checklist; hero; **Required items** score; cards; outstanding-required-items alert; **Wrap production** link to `/wrap-production`.
- **Required items**: percentage of tasks with `priority === 1` that are complete (100% when there are none).
- **Hero**: next shoot day (`getNextShootDayForProduction`, with call/wrap times and shot count) and up to 3 attention items, ranked critical risks, overdue deliverables, incomplete required tasks, other risks (`buildAttentionItems`).
- **Cards** (ids in `DASHBOARD_CARD_OPTIONS`): `nextShootDay`, `budgetHealth`, `tasksDue`, `riskWatch`, `vendorFinance`, `floats`, `deliverables`. Each uses `DashboardCard` states (loading, error with retry, empty, ready), so one failing query does not block the others.
- **Budget health**: estimated total from budget items of the working revision, actual from expenses, variance and percentage spent via the shared reconciliation summary, so it matches the Budget page.
- **Customise**: hidden card ids are stored per viewer in `localStorage` key `albatross.dashboard.hiddenCards` (guarded; falls back to session-only). It is not synced between devices or users.
- **Wrap success**: `/wrap-production` returns with router state `wrapSuccess`, which shows a dismissible banner in place of the checklist.

## Connections
- Query keys reused from other pages: `tasks`, `deliverables`, `floats`, `people`, plus `dashboard-next-shoot-day` and `dashboard-budget-health`. Mutations elsewhere that invalidate those keys refresh the dashboard.
- Tutorial anchors: `data-tutorial="dashboard-checklist"` and `dashboard-tasks`.

## Gotchas
- Cards link out with `navigate`/`Link`; the floats card links to `/budget?tab=floats&floats=outstanding`, which depends on the Budget page's URL-state parsing.
