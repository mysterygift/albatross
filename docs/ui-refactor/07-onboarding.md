# 07 - Onboarding: checklist, demo banner, dead modal, per-page help

## Goal
Make first-run progress visible and self-explanatory: a "Get started" checklist on the dashboard whose items tick themselves from real data, an unmistakable "Demo production" banner with a switch action, removal of the dead `FirstLaunchTutorial.tsx`, and a `?` help button on each tutorial-covered page that opens the existing `SectionTutorialPanel`.

## Prerequisites
- Step 01 merged (uses `DashboardCard`/`EmptyState`/toasts only if convenient; not required). Step 02 (production switcher) is helpful for the banner's "switch" wording but not required.
- Work only in the worktree `/Users/arandavies/Development/albatross-ui-experimental` (branch `ui-experimental`).

## Files to touch (exhaustive)
- NEW `src/features/onboarding/useOnboardingChecklist.ts` (+ `useOnboardingChecklist.test.ts`)
- NEW `src/features/onboarding/GetStartedChecklist.tsx` (+ `GetStartedChecklist.test.tsx`)
- NEW `src/features/onboarding/DemoProductionBanner.tsx` (+ test)
- NEW `src/features/tutorial/PageHelpButton.tsx` (+ test)
- NEW `src/features/tutorial/sectionSteps.ts` (map `TutorialSectionId` -> steps array)
- EDIT `src/features/dashboard/page.tsx` (render checklist + banner after the `wrapSuccess` Alert, ~line 1108-1135; keep header edits to step 09)
- EDIT `src/app/layout.tsx` (render `DemoProductionBanner` above `<Outlet/>`; `isDemoProductionCurrent` already computed at line 210, `DEMO_SLUG` imported at line 21)
- EDIT the 12 pages that own a `SectionTutorialPanel` only if the `?` button is mounted per page (see task 6); preferred approach mounts it once in the layout/top bar, so no page edits.
- EDIT `src/components/top-bar.tsx` (mount `PageHelpButton`) - coordinate with step 02/06 changes already there; edit surgically.
- DELETE `src/components/FirstLaunchTutorial.tsx`
- NO changes to `src/lib/db` or migrations.

## Reuse
- `useCurrentProduction()` (`src/features/productions/context.tsx:140`) -> `currentProductionId`, `currentProduction`, `setCurrentProductionId`.
- `useWorkingBudgetRevision(productionId)` (`src/hooks/useWorkingBudgetRevision.ts:9`) -> `.data?.id` revision.
- `useFirstLaunchTutorial()` (`src/hooks/useFirstLaunchTutorial.ts`) -> `progress`, `updateProgress`; tutorial progress persisted by `src/features/tutorial/progress.ts` (settings key `first_launch_tutorial_progress`).
- `ensureAndOpenDemoProductionForTutorial({ setCurrentProductionId })` (`src/features/tutorial/ensureAndOpenDemoProductionForTutorial.ts`) and `getProductionBySlug(DEMO_SLUG)` (`src/lib/db/repositories/production.ts:201`); `DEMO_SLUG` from `@/lib/db/seed/constants`.
- `SectionTutorialPanel` (`src/features/tutorial/SectionTutorialPanel.tsx`), step arrays in `src/features/tutorial/sections/*Tutorial.ts` (exports `dashboardTutorialSteps`, `scheduleTutorialSteps`, `budgetTutorialSteps`, `crewTutorialSteps`, `castTutorialSteps`, `equipmentTutorialSteps`, `locationsTutorialSteps`, `callSheetsTutorialSteps`, `movementOrdersTutorialSteps`, `tasksTutorialSteps`, `deliverablesTutorialSteps`, `musicArchiveTutorialSteps`), section ids/routes in `src/features/tutorial/tutorialSections.ts` (`TUTORIAL_SECTIONS`, `route` per id).
- Reference for panel usage + completion update: budget page `src/features/budget/page.tsx` lines ~2624-2650.
- Existing component tests: copy style from `src/components/ui/dialog.test.tsx` (`// @vitest-environment jsdom`, testing-library).

## Concrete tasks
1. **Completion detection hook** `useOnboardingChecklist(productionId, revisionId)` using `useQuery` with the SAME query keys as existing pages so caches are shared/invalidated naturally:
   - Create production: done when `currentProductionId` is set (checklist only renders then; item 1 is ticked, shown for orientation). If no production, dashboard shows its empty state (step 02/09) not the checklist.
   - Import script: `['script-versions', pid]` -> `listScriptVersionsByProduction(pid)` (`src/lib/db/repositories/scriptVersions.ts:27`); done when length > 0. Link `/schedule/script-import`. (Grep first for an existing key for this query; reuse it if one exists.)
   - Add cast: `['cast', pid]` -> `listCast(pid)` (`src/lib/db/repositories/person.ts:70`; same key used in `calendar-page.tsx:1301`); done when length > 0. Link `/people/cast-manager`.
   - Build a shoot day: `['shoot-days', pid]` -> `listShootDaysByProduction(pid)` (`src/lib/db/repositories/schedule.ts:217`; key used in `calendar-page.tsx:1277`); done when length > 0. Link `/schedule/stripboard`.
   - Set budget: `['budget-items', pid, revisionId]` -> `listBudgetItemsByProduction(pid, { revisionId })` (`src/lib/db/repositories/budget.ts:167`; key used in `wrap-production/page.tsx:170`), `enabled` only when `revisionId` defined; done when length > 0. Link `/budget`.
   - Return `{ items: {id,label,description,to,done,loading}[], doneCount, total, allDone }`. Pure derivation function `deriveChecklist(counts)` exported and unit-tested. People queries throw if sensitive data is locked; treat `isError` as "not done, not loading" (do not crash).
2. **`GetStartedChecklist`**: Card with title "Get started", progress text "2 of 5 done", an accessible `<ul>`; each item is a `Link` (react-router) with a check icon (`CheckCircle2`/`Circle` from lucide) - done items are muted/line-through but still linkable. Dismissible via "Hide" button persisting `onboarding_checklist_hidden` through `getSetting/setSetting` (`src/lib/db/repositories/settings.ts:39/48`) with a `['settings', key]` query (mirror `src/hooks/useUiTheme.ts`). Auto-hide (with a one-time "You're set up" line) when `allDone`; add a "Show getting started" link in the dashboard only if hidden manually is out of scope - skip it. Use semantic tokens only (no `zinc`).
3. **Dashboard integration**: render `<GetStartedChecklist/>` in `src/features/dashboard/page.tsx` between the `wrapSuccess` Alert (~1108-1124) and the card grid (~1139). Do not restructure other dashboard code (step 09 owns it); if step 09 already landed, place it above the hero.
4. **Demo banner**: `DemoProductionBanner` takes `isDemo: boolean` and the current production. When `currentProduction.slug === DEMO_SLUG` show an `Alert` (`src/components/ui/alert`): "You're viewing the Demo production - changes here are sample data." with a "Switch to my production" action: query `listProductions()` excluding `DEMO_SLUG`/archived; if one exists call `setCurrentProductionId(first.id)`, else navigate to `/productions`. Mount in `src/app/layout.tsx` above the routed content, driven by the existing `isDemoProductionCurrent`. When the user is NOT in demo and a demo exists, do nothing.
5. **Delete dead modal**: `grep -rn "components/FirstLaunchTutorial" src` returns nothing (verified: no importers; only `useFirstLaunchTutorial` hook and `FirstLaunchTutorialProgress` type share the name). Remove `src/components/FirstLaunchTutorial.tsx` (it also contains hard-coded `border-zinc-700 bg-zinc-900`, so step 04's token cleanup list should skip it). Re-grep after deletion to confirm build is clean.
6. **Per-page `?` help**: create `sectionSteps.ts` exporting `SECTION_STEPS: Record<TutorialSectionId, TutorialStep[]>` and a route->section resolver using `TUTORIAL_SECTIONS[].route` (prefix match; `/` exact; `/schedule/*` -> `schedule`; `/people/crew-manager` -> `crew`; `/readiness` -> `tasks`). `PageHelpButton` (ghost icon button, `HelpCircle`, `aria-label="Page help"`, tooltip) uses `useLocation()`; renders nothing when no section matches; opens `SectionTutorialPanel` with `progress/updateProgress` from `useFirstLaunchTutorial()`, and on close/complete applies the same progress updates as the budget page example (set section `in_progress` on close, `complete` on completion, clear `currentSection`). Mount once in `src/components/top-bar.tsx`. Existing per-page panels remain for the guided tutorial; the `?` button must not open two panels at once (if `progress.currentSection` equals the section, skip rendering the button's panel).

## Out of scope
Redesigning the tutorial hub/entry modal, rewriting tutorial copy, database or migration changes, dashboard cards/hero/Wrap button (step 09), switcher UI (step 02), tutorial sections for pages without one.

## Acceptance checks
- `npm run build`, `npm test`, `npm run lint:ci` pass versus baselines in `/private/tmp/claude-501/baseline-*.log`.
- New unit tests: `deriveChecklist`, checklist renders ticked/unticked items and links, demo banner shows only for `DEMO_SLUG`, `PageHelpButton` hidden on unmapped routes.
- Manual (Browser pane, `npm run dev`): new empty production shows 1/5 ticked; adding a cast member then returning to `/` ticks "Add cast" without reload; open Settings > Demo projects, open demo -> banner appears and "Switch" changes production; `?` on `/budget` opens the Budget tutorial and Esc closes; no console errors.
- `src/components/FirstLaunchTutorial.tsx` no longer exists.

## Commit message
`feat(ui): onboarding checklist, demo banner and per-page help`
