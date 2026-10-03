# UI refactor (`ui-experimental`) - plan index

Goal: make Albatross predictable and easy for new users (global production switcher, shared page shell, confirm dialogs and toasts, grouped navigation, search/shortcuts, onboarding, settings, dashboard). Overview: `/Users/arandavies/.claude/plans/create-a-series-of-zesty-catmull.md`.

Worktree: `/Users/arandavies/Development/albatross-ui-experimental` (branch `ui-experimental`, based on `dev` 737f7db).

| # | Step | Doc | Status |
|---|------|-----|--------|
| 01 | Foundations (PageHeader, EmptyState, ConfirmDialog, sonner, RequireProduction, DashboardCard) | [01-foundations.md](01-foundations.md) | done |
| 02 | Production switcher | [02-production-switcher.md](02-production-switcher.md) | done |
| 03 | Feedback and confirm | [03-feedback-confirm.md](03-feedback-confirm.md) | done |
| 04 | Page shell and tokens | [04-page-shell-and-tokens.md](04-page-shell-and-tokens.md) | done |
| 05 | Navigation | [05-navigation.md](05-navigation.md) | done |
| 06 | Search and shortcuts | [06-search-and-shortcuts.md](06-search-and-shortcuts.md) | done |
| 07 | Onboarding | [07-onboarding.md](07-onboarding.md) | done |
| 08 | Settings and URL state | [08-settings-and-url-state.md](08-settings-and-url-state.md) | done |
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
- (03) `DevPerfHud` still uses its own toast state (excluded by doc). `ApfMenuEventBridge` now renders nothing (toast only).
- (03) Stripboard Undo restores a strip to its prior day/unit/sort_index via a single `moveStrip`; sort_index may have shifted by other edits since.
- (04) `FirstLaunchTutorial.tsx` still has zinc classes (deleted in step 07); after that, re-run `python3 scripts/generate-theme-overrides.py` so the 4 remaining zinc rules in `overrides.css` drop.
- (04) Huge pages (budget, calendar, equipment, shot-list, settings, stripboard excluded) only had the `<h1>` swapped for `<PageHeader title=... />` in place; their header rows keep their old flex wrappers. Dashboard still has 5 other `animate-pulse` divs (lines ~433, 544, 637, 759, 887) for step 09.
- (04) `DocumentsCategoryPage` lost the category icon box beside the title (PageHeader title is a string). `actualisation/page.tsx` embedded guard now has no title (parent Budget owns the h1). `script-section-script-panel` `renderPageContentHighlights` param renamed `_variant` (unused, API kept).
- (04) Vendor/Cast/Crew detail pages keep their back-arrow button beside PageHeader; person/vendor metadata now sits in PageHeader `description`.
- (06) Add-button tooltips (Add Location, New Task) skipped: those buttons live on pages not touched this step. `?` icon added to top bar uses the Keyboard icon. Palette "Create" items for Add crew/booking/strip etc. navigate then dispatch the menu browser event; pages mounting after navigation may miss the event (same as native menu behaviour).
- (06) Cmd+Alt+1..4 are native accelerators only (Rust View menu); not verified on a running Tauri build.
- (07) Top-bar global tutorial button icon changed HelpCircle -> GraduationCap so the new per-page `?` (HelpCircle) is distinguishable. Dashboard still has its own page-level SectionTutorialPanel; `?` on `/` opens a second independent panel only when the guided tutorial does not own it.
- (07) "Get started" checklist has no way to re-show after Hide (doc: out of scope). Banner/checklist not verified in a running Tauri build.

## Baseline (recorded on ui-experimental at a81a90e, before any step)
`dev` is NOT green, so the per-step gate is **no new failures versus this baseline**, not "everything passes":
- `npm run build`: passes. It must keep passing.
- `npm test`: 18 test files / 16 tests fail (mostly `src/test/postgres/*`, which need a database, plus a few integration tests). Exact list: [BASELINE-failing-tests.txt](BASELINE-failing-tests.txt). A step must not add to it.
- `npm run lint:ci`: exits non-zero (38 errors, 74 warnings). Exact error list: [BASELINE-lint-errors.txt](BASELINE-lint-errors.txt). A step must introduce no new errors, and warnings must not exceed 74.
- Fixing baseline failures is out of scope unless the file is already being edited by the step. Note them under Follow-ups.
- (08) Settings: Crew structure lives in `people` (Team & Access) rather than under Production; `Clients` moved from the old Developer Tools tab into Production; developer-mode toggle card sits in the Advanced "Demo & tutorial" section. `layout.tsx` tutorial effect does `navigate(location.pathname, ...)` which drops search params (so `?section=` is lost after "Open Tutorial Home"). `PageHelpButton.test.tsx` is flaky under full-suite load (passes alone).
- (08) Stripboard `view=board` is omitted from the URL; explicit Board choice is preserved via localStorage. Column filters are still not URL-persisted (out of scope).
