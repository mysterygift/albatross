# Wrap Production

This document is both a **user guide** (how to use the Wrap Production closeout workflow) and a **developer guide** (architecture, data flow, and integrations). It describes the feature as a check and balance when completing a project.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Fundamental workflow](#2-fundamental-workflow)
- [3. Section descriptions](#3-section-descriptions)
- [4. Relationships and connections to other pages](#4-relationships-and-connections-to-other-pages)

**Part II — Developer guide**

- [5. Architecture and file layout](#5-architecture-and-file-layout)
- [6. Data flow and dependencies](#6-data-flow-and-dependencies)
- [7. Production model extension](#7-production-model-extension)
- [8. Query keys and invalidation](#8-query-keys-and-invalidation)
- [9. Readiness logic](#9-readiness-logic)

**Part III — Reference**

- [10. Router and navigation](#10-router-and-navigation)
- [11. Gaps and future work](#11-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Wrap Production is a closeout workflow that acts as a **check and balance** when completing a project. It surfaces outstanding financial, scheduling, and delivery items before a production is marked complete and archived.
- **Route:** `/wrap-production` (not in sidebar; reached via Dashboard button or direct URL).
- **Entry point:** Red "Wrap Production" button on the Dashboard (visible only when a current production is selected).
- **Context:** Requires a current production. Shows "Select a production first." if none selected.

### 2. Fundamental workflow

**Entry**

1. From Dashboard, click "Wrap Production" (with a production selected).
2. You land on the Wrap Production page.

**Review**

3. Expand the four collapsible sections. Each shows a readiness status (Ready / Needs review) and, when expanded, summary metrics and detail lists.
4. Fix issues by following links to Budget, Match Expenses, Schedule, or Deliverables as needed.

**Complete**

5. Click "Complete and Archive Production" to open the confirmation modal.
6. Review the modal summary (warnings do not block). Click "Complete and Archive Production" to confirm or "Cancel" to close.
7. On success, the production is archived, current production is cleared, and you are redirected to the Dashboard with a success message.

### 3. Section descriptions

| Section | Purpose | Ready when | Fix issues in |
|---------|---------|------------|---------------|
| Budget and Actualisation | Reconciliation of spend vs budget | No unallocated spend, no unmatched line items, no overspent items | Budget, Match Expenses |
| Schedule and Calendar | No future production activity | No future shoot days | Schedule |
| Deliverables | Post-production sign-off | All deliverables signed off | Deliverables |
| Archive Readiness | Placeholder for future actions | — | — |

### 4. Relationships and connections to other pages

| Page | Relationship |
|------|--------------|
| **Dashboard** | Entry point. Red "Wrap Production" button; success message after wrap. |
| **Budget** | Source of budget items, expenses, reconciliation links. Fix unallocated spend, overspent/underspent line items. |
| **Match Expenses** (Budget tab) | Same data as Budget; fix allocation of spend to line items. |
| **Schedule / Calendar** | Source of shoot days and calendar events. Fix future schedule items. |
| **Deliverables** | Source of deliverables. Fix pending or unsigned-off items. |
| **Productions** | Archived productions appear when "Show archived" is enabled. Current production context is cleared after wrap. |

---

## Part II — Developer guide

### 5. Architecture and file layout

```
src/
├── features/wrap-production/
│   └── page.tsx              # Main page component
├── lib/
│   ├── budget/
│   │   └── wrapReadiness.ts   # Budget/actualisation readiness
│   └── wrap-production/
│       ├── scheduleReadiness.ts
│       └── deliverablesReadiness.ts
└── lib/db/repositories/
    └── production.ts          # completeAndArchiveProduction()
```

### 6. Data flow and dependencies

- **Budget readiness:** Uses `listBudgetItemsByProduction`, `listExpensesByProduction`, `listBudgetItemExpenseLinksByProduction`, `listAccounts`. Relies on [lib/budget/reconciliation.ts](src/lib/budget/reconciliation.ts) for derived state.
- **Schedule readiness:** Uses `listShootDaysByProduction`, `listCalendarShootDayEvents` (future date range). Compares `shoot_date` to today (YYYY-MM-DD).
- **Deliverables readiness:** Uses `listDeliverablesByProduction`. Maps `status` to `signed_off` | `pending` | `unknown`.

### 7. Production model extension

- **`wrapped_at`** (TEXT, nullable): Set when production is completed via Wrap Production. Migration: `0023_productions_wrapped_at.sql`.
- **`archived_at`** (existing): Set together with `wrapped_at` by `completeAndArchiveProduction()`.
- **Repository:** `completeAndArchiveProduction(id)` — atomic UPDATE (wrapped_at, archived_at, updated_at) + outbox, via `runInSerializedTransaction` + `executeBatch`. See [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md) for transaction patterns.

### 8. Query keys and invalidation

- **Read:** `['budget-items', productionId]`, `['expenses', productionId]`, `['budget-item-expense-links', productionId]`, `['budget-accounts', productionId]`, `['shoot-days', productionId]`, `['calendar-events-wrap', productionId, today, end]`, `['deliverables', productionId]`.
- **Post-wrap:** `queryClient.invalidateQueries({ queryKey: ['productions'] })`, `setCurrentProductionId(null)`, `navigate('/', { state: { wrapSuccess: true } })`.

### 9. Readiness logic

All readiness logic is read-only; no mutations.

- **Budget:** `getWrapBudgetReadiness()`, `getOverspentBudgetItems()`, `getUnderspentBudgetItems()`, `getPotentialReallocationOpportunities()` — in [lib/budget/wrapReadiness.ts](src/lib/budget/wrapReadiness.ts).
- **Schedule:** `getScheduleReadiness()`, `getFutureScheduleRows()` — in [lib/wrap-production/scheduleReadiness.ts](src/lib/wrap-production/scheduleReadiness.ts). Compare dates; no writes.
- **Deliverables:** `getDeliverablesReadiness()`, `getDeliverableReviewRows()` — in [lib/wrap-production/deliverablesReadiness.ts](src/lib/wrap-production/deliverablesReadiness.ts). Map status; no writes.

For budget reconciliation concepts, see [docs/budget.md](docs/budget.md).

---

## Part III — Reference

### 10. Router and navigation

- **Route:** `{ path: 'wrap-production', element: <WrapProductionPage /> }` in [src/app/router.tsx](src/app/router.tsx).
- **Sidebar:** Wrap Production is **not** in [src/app/navigation.ts](src/app/navigation.ts); it is a hidden route.

### 11. Gaps and future work

- Archive Readiness section is a placeholder.
- Readiness checks are warnings only; no hard-blocking.
- Reallocation opportunities are informational; no transfer/balance actions.
