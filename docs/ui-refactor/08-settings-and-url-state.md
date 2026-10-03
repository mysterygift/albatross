# 08 - Settings layout, developer-mode flag, URL-persisted view state

## Goal
Restructure `src/features/settings/page.tsx` (1700 lines) into a left-nav layout with groups Production / Appearance / Team & Access / Integrations / Advanced; hide Developer Tools and API call counters behind a developer-mode setting; persist Settings section, stripboard Board/Day view and stripboard filters in URL search params following Budget's `?tab=` pattern.

## Prerequisites
- Step 01 merged (PageHeader). Step 03 (ConfirmDialog) may or may not have landed; do not touch `window.confirm` here.
- Edit surgically: the settings page is large, move JSX blocks, do not rewrite them.

## Files to touch (exhaustive)
- EDIT `src/features/settings/page.tsx`
- NEW `src/features/settings/SettingsNav.tsx` (left nav; list on desktop, horizontal scroll or `Select` below `md`)
- NEW `src/features/settings/settingsSections.ts` (section ids, labels, groups, `parseSettingsSection(param)`)
- NEW `src/features/settings/settingsSections.test.ts`
- NEW `src/hooks/useDeveloperMode.ts` (+ test)
- EDIT `src/lib/db/repositories/settings.ts` (add `developer_mode: 'false'` to `DEFAULTS`, line ~13; export `DEVELOPER_MODE_SETTING_KEY = 'developer_mode'`)
- EDIT `src/features/schedule/stripboard-page.tsx` (view mode ~92-105 and 365-376, filters 328-332, 364, header 913-955)
- NEW `src/features/schedule/stripboardUrlState.ts` (+ `stripboardUrlState.test.ts`) pure parse/serialise helpers
- Do NOT edit `AppearanceSettingsSection.tsx` internals beyond mounting it in the Appearance group.

## Reuse
- Budget URL pattern: `src/features/budget/page.tsx` `tabParamToViewMode` (line 181), `useSearchParams` (line 250), param -> state effect (lines 308-317), `setSearchParams((prev) => {...})` functional updates (lines 398, 414), localStorage fallback `readStoredBudgetViewMode` (188).
- Settings storage: `getSetting/setSetting`, `ensureSettingsDefaults` (`src/lib/db/repositories/settings.ts:39,48,58`) and the react-query setting hook style in `src/hooks/useUiTheme.ts` (query key `['settings', key]`).
- Existing sections in `settings/page.tsx`: tabs `budget` (Currency, Episodic, Cost report groups, Chart of accounts: lines 420-664), `people` (666-690), `apis` (ORS key etc. 692-748), `developer_tools` (User Management, Project Access, Demo projects, Onboarding tutorial, `import.meta.env.DEV` Developer tools with `ApiCallTrackerPanel` 750-1008; panel fn at line 106); `AppearanceSettingsSection` mounted at line 410; other section components `ClientsSettingsSection`, `EpisodesSettingsSection`, `ShootingBlocsSettingsSection`, `TaxCreditsSettingsSection`, `CrewStructureEditor`.
- `Tabs` from `@/components/ui/tabs`; `segmented-control` in `components/ui` if a segmented control is wanted for Board/Day.

## Concrete tasks
1. Read the whole of `settings/page.tsx` lines 139-1010 and list every Card/section with its current tab. Define the mapping in `settingsSections.ts` (ids are URL values): `production` (Currency, Episodic, Clients, Episodes, Shooting blocs, Tax credits, Crew structure), `budget-accounts` (Cost report groups, Chart of accounts) both under group **Production**; `appearance` under **Appearance**; `people` (people settings), `users`, `project-access` under **Team & Access**; `integrations` (ORS key, API settings, currency API toggle) under **Integrations**; `demo-tutorial` (Demo projects, Onboarding tutorial) and `developer` under **Advanced**. Adjust to what is actually in the file; keep every existing card reachable.
2. **Developer mode flag lives in the existing `settings` table** (key `developer_mode`, default `'false'`), not localStorage, matching `ui_theme` and `enable_api_call_tracking`, so it syncs with the DB layer. `useDeveloperMode()` returns `{ developerMode, setDeveloperMode }` via react-query + `setSetting`. Show the toggle in the Advanced group ("Developer mode - shows diagnostics"). The `developer` section, `ApiCallTrackerPanel`, DB perf toggle and API-call tracking switch render only when `developerMode`; keep the `import.meta.env.DEV` guard as an additional condition for DEV-only tools already behind it (line 887). If `?section=developer` is requested while off, fall back to `production`.
3. Replace the `settingsTab` `useState` (line 162) with `const [searchParams, setSearchParams] = useSearchParams()`; `section = parseSettingsSection(searchParams.get('section'))` (invalid -> default); selecting a nav item calls `setSearchParams(prev => {const n=new URLSearchParams(prev); n.set('section', id); return n}, { replace: true })`. Accept legacy `?tab=budget|people|apis|developer_tools` and map to new ids. Render the nav (`SettingsNav`) and only the active section's content; keep the dialogs after the Tabs (line 1010+) mounted always. Use `aria-current="page"` on the active nav item. Keep the existing `navigate('/settings', { state: { openTutorialHome: true } })` working.
4. **Stripboard URL state** (`stripboardUrlState.ts`): `parseStripboardParams(sp)` -> `{ view: 'board'|'day', q, locationId, bloc, day }` and `applyStripboardParams(prev, patch)`. Params: `view` (`board` default omitted), `q` (search), `loc` (location id), `bloc` (episodic bloc filter, default `all` omitted), `day` (activeDayId in Day view). Omit defaults so the URL stays clean.
5. In `stripboard-page.tsx`: derive `viewMode`, `search`, `locationId`, `blocViewFilter`, `activeDayId` from `useSearchParams` (replace the `useState` at 328-329, 364-366). Precedence: URL param > localStorage (`VIEW_MODE_STORAGE_KEY`, line 93) > default; keep the guarded localStorage write at 370-376 as the fallback for when the URL has no `view`. Keep the `setBlocViewFilter('all')` reset on production change (378-380) but via params. Use `{ replace: true }` for text-search typing, push for view toggles. Do not touch `columnFilters` (Record state) or drag-and-drop code; `locationId === undefined` means "no filter" and `null` means "no location" - encode `loc=none` for null.
6. Tests: `settingsSections.test.ts` (invalid/legacy param mapping, group coverage so no section is orphaned), `stripboardUrlState.test.ts` (round trip, defaults omitted), `useDeveloperMode` default false. Existing `Stripboard*` tests (`StripboardDayView.test.tsx`) and `SettingsEpisodes.integration.test.tsx` must keep passing; wrap with `MemoryRouter` if they now need router context.

## Out of scope
Replacing `window.confirm` (03), page headers/title text (04), new settings, stripboard column filters/dnd behaviour, other pages' URL state, splitting `settings/page.tsx` into many files beyond the nav/sections helpers.

## Acceptance checks
- `npm run build`, `npm test`, `npm run lint:ci` vs baselines in `/private/tmp/claude-501/baseline-*.log`.
- Manual (Browser pane): `/settings?section=integrations` deep-links and survives reload; browser Back moves between sections; unknown section falls back; Developer section and API counters absent until Developer mode is toggled on, present after; `/schedule/stripboard?view=day&q=int` loads Day view with search prefilled; toggling Board/Day updates URL; reload keeps filters; copy URL into a second tab reproduces the view.
- No `bg-zinc-*` introduced.

## Commit message
`feat(ui): settings left-nav, developer mode flag, URL-persisted stripboard and settings state`
