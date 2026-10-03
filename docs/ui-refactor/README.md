# UI refactor (`ui-experimental`) - plan index

Goal: make Albatross predictable and easy for new users (global production switcher, shared page shell, confirm dialogs and toasts, grouped navigation, search/shortcuts, onboarding, settings, dashboard). Overview: `/Users/arandavies/.claude/plans/create-a-series-of-zesty-catmull.md`.

Worktree: `/Users/arandavies/Development/albatross-ui-experimental` (branch `ui-experimental`, based on `dev` 737f7db).

| # | Step | Doc | Status |
|---|------|-----|--------|
| 01 | Foundations (PageHeader, EmptyState, ConfirmDialog, sonner, RequireProduction, DashboardCard) | [01-foundations.md](01-foundations.md) | done |
| 02 | Production switcher | [02-production-switcher.md](02-production-switcher.md) | done |
| 03 | Feedback and confirm | [03-feedback-confirm.md](03-feedback-confirm.md) | pending |
| 04 | Page shell and tokens | [04-page-shell-and-tokens.md](04-page-shell-and-tokens.md) | pending |
| 05 | Navigation | [05-navigation.md](05-navigation.md) | pending |
| 06 | Search and shortcuts | [06-search-and-shortcuts.md](06-search-and-shortcuts.md) | pending |
| 07 | Onboarding | [07-onboarding.md](07-onboarding.md) | pending |
| 08 | Settings and URL state | [08-settings-and-url-state.md](08-settings-and-url-state.md) | pending |
| 09 | Dashboard | [09-dashboard.md](09-dashboard.md) | pending |
| 10 | Final QA | [10-final-qa.md](10-final-qa.md) | pending |

## Dependencies
- 01 blocks everything.
- 02, 03, 04, 05 need 01 (run in numeric order).
- 06, 07, 08, 09 are independent of each other (09 prefers 02 for the production menu; 07 touches dashboard/top-bar lightly, 09 should preserve it).
- 10 is last.

## Gate (every step)
Run in the worktree: `npm run build`, `npm test`, `npm run lint:ci`. All must pass and be no worse than the baselines: `/private/tmp/claude-501/baseline-build.log`, `baseline-test.log`, `baseline-lint.log`. One commit per step (message in each doc). On failure: stop and report, do not continue.

## Executor rules
- One fresh subagent per step. Read this README and the step doc; implement only that doc's scope.
- Stay in scope. No refactors, renames or cleanups beyond the doc.
- No push, no PR, no merge.
- Never touch the `dev` branch or the main checkout `/Users/arandavies/Development/albatross` (it holds uncommitted stripboard/passkey work).
- Edit big files surgically (`budget/page.tsx`, `schedule/shot-list-page.tsx`, `equipment/page.tsx`, `schedule/calendar-page.tsx`, `settings/page.tsx`, `schedule/stripboard-page.tsx`).
- Out-of-scope findings go in the Follow-ups section below, not into code.

## Follow-ups
- (02) Orphan pages `src/features/bookings/page.tsx:152` and `src/features/day-out-of-days/page.tsx:265` still render "Select a production first." (deleted in step 05).
- (02) `budget/actualisation/page.tsx` is a sub-tab: its guard now renders an h1 title via RequireProduction (was h2); revisit in step 04.
- (02) `CastDetailPage` missing-`personId` fallback text changed to "Select a person first."

## Baseline (recorded on ui-experimental at a81a90e, before any step)
`dev` is NOT green, so the per-step gate is **no new failures versus this baseline**, not "everything passes":
- `npm run build`: passes. It must keep passing.
- `npm test`: 18 test files / 16 tests fail (mostly `src/test/postgres/*`, which need a database, plus a few integration tests). Exact list: [BASELINE-failing-tests.txt](BASELINE-failing-tests.txt). A step must not add to it.
- `npm run lint:ci`: exits non-zero (38 errors, 74 warnings). Exact error list: [BASELINE-lint-errors.txt](BASELINE-lint-errors.txt). A step must introduce no new errors, and warnings must not exceed 74.
- Fixing baseline failures is out of scope unless the file is already being edited by the step. Note them under Follow-ups.
