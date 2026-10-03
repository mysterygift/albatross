# 10 - Final QA (fixes only)

## Goal
Verify the whole `ui-experimental` refactor end to end and fix defects found. No new features, no scope creep: every change must correct a regression, inconsistency or accessibility defect introduced or exposed by steps 01-09. Record the outcome in `docs/ui-refactor/CHANGELOG.md`.

## Prerequisites
- Steps 01-09 all committed on `ui-experimental` (check `git log --oneline` and the README status table). Clean worktree at `/Users/arandavies/Development/albatross-ui-experimental`.
- Baselines: `/private/tmp/claude-501/baseline-build.log`, `baseline-test.log`, `baseline-lint.log`.

## Files to touch (exhaustive)
- NEW `docs/ui-refactor/CHANGELOG.md`
- EDIT `docs/ui-refactor/README.md` (status column for step 10 only after completion; Follow-ups list)
- EDIT any file under `src/` strictly to fix a defect found by the checks below (list each in the changelog under "QA fixes")
- Theme CSS under `src/styles/themes/` (`bold.css`, `clay.css`, `ledger.css`, `overrides.css`, `shared.css`, `signal.css`, `sunset.css`, `yuzu.css`) only for contrast/token fixes
- Never touch `dev`, `/Users/arandavies/Development/albatross`, migrations, or `src-tauri/`.

## Reuse
- Gate scripts in `package.json`: `build` (`tsc -b && vite build`), `test` (`vitest run`), `lint:ci` (`eslint . --max-warnings 60`).
- Theme switcher: `AppearanceSettingsSection` (Settings > Appearance), `src/lib/uiTheme/uiThemes.ts` (`applyUiTheme`, `UI_THEME_SETTING_KEY`); theme id list is in that file and mirrors `src/styles/themes/*.css`.
- Browser pane tools (`preview_start`, `resize_window` presets desktop/mobile 375x812/tablet, `read_page`, `computer` screenshot), `npm run dev`.
- Stripboard dnd keyboard sensors: `src/features/schedule/stripboard-page.tsx` (`@dnd-kit` `useSensors`/`KeyboardSensor`).

## Concrete tasks
1. **Gate**: run `npm run build`, `npm test`, `npm run lint:ci`; compare to baselines. Fix any new failure/warning above baseline (lint warning budget is 60).
2. **Leftover audit** (grep, fix findings): `window.confirm` in `src` (expect 0); `Select a production first` (expect 0 outside `RequireProduction`); `bg-zinc-`/`border-zinc-`/`text-zinc-` in `src` (expect 0 or documented exceptions); `Schedule —` titles; orphan pages `features/bookings/page.tsx`, `features/day-out-of-days/page.tsx`, `features/people/page.tsx` gone; no duplicate `<h1>` per page; `components/FirstLaunchTutorial.tsx` gone.
3. **Visual pass** with `npm run dev` in the Browser pane: for EVERY UI theme (each id in `uiThemes.ts`, light and dark if supported) at desktop (default) and mobile (375x812) visit: `/`, `/productions`, `/budget`, `/schedule/calendar`, `/schedule/stripboard` (Board and Day), `/schedule/shots`, `/people/cast-manager`, `/people/crew-manager`, `/locations`, `/equipment`, `/call-sheets`, `/deliverables`, `/readiness`, `/settings` (each section). Check: no horizontal page scroll, sidebar collapses/opens on mobile, text legible, no hard-coded dark panels in light themes, empty states and toasts themed, PageHeader wraps cleanly. Reset viewport with preset `desktop` afterwards. Capture notes only; fix defects.
4. **Flow pass**: switch production from the global switcher; trigger a ConfirmDialog (e.g. delete in Settings) and cancel/confirm; see a toast and an undo toast; collapse/expand a sidebar group; Cmd/Ctrl+K opens search; `?` shortcut cheat-sheet; dashboard checklist ticks; Settings deep link `?section=`; stripboard `?view=day`; Wrap Production reachable from production menu.
5. **Keyboard/a11y pass**: Tab through shell (switcher, search, sidebar groups, top bar) - visible focus ring on every control (`focus-visible`), logical order, Esc closes dialogs/popovers and returns focus; dialogs trap focus; stripboard dnd-kit: focus a strip, Space to pick up, arrows to move, Space to drop, Esc to cancel, with announcements; icon-only buttons have `aria-label`; colour contrast >= 4.5:1 for body text and 3:1 for UI borders/icons in every theme (check muted-foreground on background/card with devtools); `prefers-reduced-motion` respected.
6. Fix defects in small commits' worth of edits (one final commit only); re-run the gate after fixes.
7. Write `CHANGELOG.md`: sections per step 01-09 (3-6 bullets each, user-visible), "QA fixes", "Known issues/Follow-ups" (copy README follow-ups), and "How verified" (commands + themes/widths covered).

## Out of scope
New features, refactors, performance work, dependency upgrades, backend/Tauri/migration changes, redesigns of themes, fixing issues present in the baseline logs (list them as Follow-ups instead).

## Acceptance checks
- `npm run build`, `npm test`, `npm run lint:ci` all green and no worse than baselines.
- Audit greps in task 2 clean; every theme x {desktop, mobile} page list visited with no unresolved defects (or logged as Follow-ups with reason).
- Keyboard and dnd-kit checks pass; `CHANGELOG.md` exists and is accurate; `git status` clean after the commit; `dev` branch untouched.

## Commit message
`chore(ui): final QA fixes and changelog for UI refactor`
