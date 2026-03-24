# Budget Versioning: Current Implementation (BV1-BV14)

This document describes what is currently implemented for budget versioning in Albatross, based on the live codebase.

---

## Scope Summary

Budget versioning currently includes:

- Revision schema + migration backfill foundations
- Live revision resolution and one-live invariant
- Revision-aware repository reads/writes across budget-integrated data
- Revision selection state + fallback behavior
- Revision selector UI in Budget workspace
- Full create-revision modal flow (blank + copy-from-existing)
- Live revision toggle UI with confirmation
- Budget menu item for "Duplicate live as draft" (native app menu)
- Duplicate-live shortcut flow (service + menu orchestration)
- Context-aware native menu enable/disable + browser/dev event parity for duplicate action
- Compare Revisions view (summary-first, read-only)
- Hardening pass on revision-aware query identity and key invalidation paths
- Added tests across migration/repository/service/orchestration helpers
- Added focused rendered React integration tests for core versioning UX flows

---

## What Is Implemented

## 1) Data Model + Migration Foundations

Implemented:

- `budget_revisions` table and revision IDs on revision-scoped budget tables
- Backfill migration creates default `"Current budget"` revision and marks it live
- Unique partial index enforces one live revision per production
- Migration tests exist in `src/test/apf/budgetRevisionsMigration.test.ts`

Coverage includes:

- Backfill wiring of revision-scoped rows
- Live uniqueness invariant
- Shared production-scoped tables remaining intact
- Orphan checks for revision-scoped FK usage

---

## 2) Repository/Service Behavior

Implemented in `src/lib/db/repositories/budgetRevisions.ts`:

- Live resolver (`getLiveBudgetRevisionForProduction`)
- Live ID resolver with default creation (`getOrCreateLiveBudgetRevisionIdForProduction`)
- Explicit-or-live resolver (`resolveBudgetRevisionId`)
- Selected-or-live resolver (`resolveSelectedBudgetRevision`)
- List revisions by production (`listBudgetRevisionsByProduction`)
- Transactional live switch (`setLiveBudgetRevisionForProduction`)

Implemented in `src/lib/db/budgetRevisionService.ts`:

- Blank revision creation
- Clone from existing revision (deep copy/remap of revision-scoped entities)
- Duplicate-live orchestration (`duplicateLiveBudgetRevisionAsDraft`)
- Deterministic duplicate naming (`buildDuplicateLiveDraftName`)

Key tests:

- `src/lib/db/repositories/budgetRevisions.test.ts`
- `src/lib/db/budgetRevisionService.test.ts`
- `src/lib/db/repositories/revisionAwareBudgetRepositories.test.ts`

---

## 3) Revision Selection State + Sync

Implemented:

- Production-scoped selected revision store in `ProductionContext`
- `useWorkingBudgetRevision(...)` as central selected/fallback resolver
- Explicit selection via `revisionId` query param support
- Safe clear/fallback behavior when selected revision becomes invalid

Cross-surface usage:

- Budget, Cost Report, Actualisation, Floats, Dashboard/Wrap budget widgets are revision-aware through shared selected revision resolution and revision-aware keys.

---

## 4) Budget Workspace UI

Implemented in `src/features/budget/page.tsx`:

- Revision dropdown shows current revision + statuses
- Revision switching updates selected revision + search param
- Live/draft context badge near selector
- Create revision modal flow:
  - opens from `Create budget revision...`
  - requires revision name
  - supports `Start from scratch` and `Copy from existing revision`
  - copy mode requires source revision selection
  - success closes modal and selects created revision
- Live toggle flow in revision list:
  - radio-style live affordance per revision row
  - selected revision and live revision remain distinct
  - confirmation dialog before switching live
  - post-success live state refreshes via existing mutation invalidation
- Compare tab added as a budget subview

Implemented compare view:

- Base + Compare selectors (same production revisions only)
- Summary rows:
  - Estimate
  - Actuals
  - Variance
  - Derived costs
  - Float exposure
- Delta direction is consistent (`compare - base`)
- Self-compare and sparse/empty states handled

Helper logic:

- `src/features/budget/compareRevisions.ts`
- tests in `src/features/budget/compareRevisions.test.ts`

---

## 5) Budget Menu + Duplicate Live as Draft

Implemented:

- Native top-level `Budget` menu in Tauri menu builder (`src-tauri/src/lib.rs`)
- `Duplicate live as draft` menu item (no shortcut)
- Context-aware native enablement:
  - disabled when no active production
  - disabled when no live revision is resolvable
  - disabled while duplicate action is in-flight
- Runtime guards remain in place for stale/race conditions
- Event bridge handles menu event and runs duplication flow:
  - live revision resolved as source (not selected draft)
  - clone created as non-live draft
  - selected revision switched to new draft
  - key query families invalidated
- Browser/dev parity:
  - local event fallback path mirrors native action semantics/guards

Orchestration helper:

- `src/features/productions/budgetMenuActions.ts`
- tests in `src/features/productions/budgetMenuActions.test.ts`

---

## 6) Hardening (BV9/BV10)

Implemented hardening highlights:

- Explicit revision filtering added for float-expense-by-expense query paths where revision context is explicit
- Revision-aware query keys tightened in actualisation/float reconciliation paths
- Fixed missing revision dimension in one production invalidation key path
- Added orchestration-level tests for duplicate action guard/success/failure behavior

---

## 7) Focused React Integration Coverage (BV14)

Added focused rendered integration tests for highest-value user workflows:

- `src/features/budget/BudgetVersioning.integration.test.tsx`
  1. Create revision modal flow (open -> choose mode -> submit -> selected revision updates)
  2. Live revision switching flow (affordance -> confirm -> live status updates)
  3. Duplicate-live-as-draft flow (duplicates live source, keeps live unchanged, selects new draft)
  4. Compare view isolation (compare selectors do not mutate normal workspace selection)

These tests are intentionally compact and focus on user-visible wiring/state transitions rather than exhaustive UI matrix coverage.

---

## Behavioral Contracts (Current)

- Exactly one live revision per production is enforced in schema + service behavior.
- Explicit revision contexts should remain explicit; live fallback is only for unresolved/default contexts.
- Duplicate-live-as-draft uses the live revision as source and keeps live unchanged.
- After duplicate success, selected revision switches to the new draft.
- Live-switch requires explicit confirmation before applying.
- Live-switch updates live status without silently forcing unrelated selected-revision jumps.
- Compare view is read-only and summary-first.
- Compare selectors are isolated from normal workspace selection state.

---

## File Map (Primary)

- Schema/migration:
  - `src-tauri/migrations/0054_budget_revisions.sql`
  - `src/test/apf/budgetRevisionsMigration.test.ts`
- Repository/service:
  - `src/lib/db/repositories/budgetRevisions.ts`
  - `src/lib/db/budgetRevisionService.ts`
  - `src/lib/db/repositories/floatReconciliation.ts`
- State/hooks:
  - `src/features/productions/context.tsx`
  - `src/hooks/useWorkingBudgetRevision.ts`
- Budget UI:
  - `src/features/budget/page.tsx`
  - `src/features/budget/compareRevisions.ts`
  - `src/features/budget/createBudgetRevisionActions.ts`
  - `src/features/budget/liveBudgetRevisionActions.ts`
  - `src/features/budget/revisionSelectorHelpers.ts`
  - `src/features/budget/BudgetVersioning.integration.test.tsx`
- Menu/action:
  - `src-tauri/src/lib.rs`
  - `src/features/productions/ApfMenuEventBridge.tsx`
  - `src/features/productions/budgetMenuActions.ts`

---

