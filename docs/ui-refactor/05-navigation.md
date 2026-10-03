# 05 - Navigation regroup, route naming, breadcrumbs, orphan cleanup

## Goal
A predictable sidebar: labelled collapsible groups (Plan / People / Money / Deliver / Tasks / Settings), distinct icons, route names that match labels (`/tasks`), logo in the header, a Script group, a per-section tab bar and breadcrumbs in the top bar. Orphan pages deleted. Native menu mapping stays in sync.

## Prerequisites
Steps 01-02 merged (top bar now has the production switcher; keep it). Step 04 merged is preferred (titles match nav labels: Calendar, Stripboard, Shot Lists, Storyboard, Script Import, Script Sections) but not required. Reads: `src/app/navigation.ts`, `src/components/app-sidebar.tsx`, `src/components/top-bar.tsx`, `src/app/router.tsx`, `src/app/menuSchema.ts`.

## Files to touch (exhaustive)
- `src/app/navigation.ts` (restructure; export new `navGroups`, keep `isNavGroup`, add `findNavTrail(pathname)` for breadcrumbs/tab bar).
- `src/components/app-sidebar.tsx` (labels, collapse, logo).
- `src/components/top-bar.tsx` (breadcrumbs; do not remove step-02 switcher or search from step 06).
- `src/components/section-tabs.tsx` (new) and mounted in `src/app/layout.tsx` (~line 345-352, above `<Outlet/>` inside `<main>`).
- `src/app/router.tsx` (add `tasks` route, `readiness` redirect, remove nothing else).
- `src/app/menuSchema.ts` (`resolveMenuSectionForPath` line ~105 `'/readiness'`), `src/features/productions/ApfMenuEventBridge.tsx` (lines 164 and 210: `'/readiness'`), `src/features/tutorial/tutorialSections.ts:119`, `src/features/dashboard/page.tsx` (lines 503, 1184).
- Delete (after verification): `src/features/bookings/page.tsx`, `src/features/day-out-of-days/page.tsx`, `src/features/people/page.tsx`.
- Tests: new `src/app/navigation.test.ts`, new `src/app/menuSchema.test.ts`; check `src/app/AppLayout.setupTransition.test.tsx` (mocks `app-sidebar` and `top-bar`, only update if a new import needs mocking).

## Reuse
`SidebarGroup/GroupLabel/GroupContent/Menu*/MenuSub*` in `src/components/ui/sidebar.tsx`; `AlbatrossLogo` (`src/components/AlbatrossLogo.tsx`, props `size` sm|md|lg are `size-12+`, so pass `className="size-6"` to override); lucide icons; `useLocation`; existing `ChevronRight` rotate animation in `app-sidebar.tsx`. No `@radix-ui/react-collapsible` dependency: use `useState`.

## Concrete tasks
1. Route decision: **rename route to `/tasks`, keep `/readiness` as a redirect** (`{ path: 'readiness', element: <Navigate to="/tasks" replace /> }` next to the existing `schedule`/`people` redirects in `router.tsx`; page file stays `features/readiness/page.tsx`, directory not renamed; `lib/**/*Readiness*` are wrap-production helpers and must NOT change). Update every reference: `navigation.ts:74`, `menuSchema.ts:105` (`startsWith('/tasks')`), `ApfMenuEventBridge.tsx:164,210`, `tutorialSections.ts:119`, `dashboard/page.tsx:503,1184`. Final `grep -rn "'/readiness'\|\"/readiness\"\|to=\"/readiness" src` must only hit the redirect and a comment. Keep `MenuSection` key `'tasks'` and event ids (`albatross-menu-view-go-tasks`, `tasks_new_task`) unchanged; Rust (`src-tauri/src/lib.rs`) needs no change.
2. Restructure `navigation.ts` into `navGroups: {id,label,items:NavItem[]}[]`:
   - (ungrouped top) Dashboard `/`, Productions `/productions`.
   - Plan: Schedule (sub Calendar, Stripboard, Shot Lists, Storyboard), Script (new NavItem group, `defaultChild '/schedule/script-import'`, sub Script Import, Script Sections; icon `ScrollText`), Locations, Equipment.
   - People: Cast Manager, Crew Manager, Bookings, Day Out of Days (keep as the existing `/people` group with sub list, label "People").
   - Money: Budget (sub Budget, Vendors).
   - Deliver: Call Sheets, Movement Orders, Documents, Deliverables (icon `PackageCheck`), Music & Archive.
   - Tasks: Tasks `/tasks` (icon `CheckSquare`, same icon is already used by tutorial).
   - Settings: Settings `/settings`.
   Script routes stay under `/schedule/script-*` (no URL change, avoids breaking `ApfMenuEventBridge` `schedule_parse_script_scenes` -> `/schedule/script-import` and menu section `schedule`). Active-state logic must treat `/schedule/script-*` as belonging to Script, not Schedule (compute via longest-prefix match in `findNavTrail`).
3. `app-sidebar.tsx`: render each group with a real `SidebarGroupLabel` (replace the single "Navigation" label). Per sub-group item: the label area is the `NavLink` to `defaultChild`; the chevron is a separate `<button aria-label="Collapse/Expand X" aria-expanded>` that only toggles. Keep expansion in `useState<Record<string,boolean>>`, initialised/auto-opened when the current path is inside the group; persist in `localStorage` key `albatross.sidebar.groups` wrapped in try/catch. Add `aria-hidden` handling: collapsed submenu must not be focusable (use `inert` or `hidden`; current grid-rows trick leaves links tabbable, fix it).
4. Header: replace the text-only span with `<AlbatrossLogo className="size-6" />` + "Albatross" (inside `SidebarHeader`, hidden label when sidebar is collapsed to icon mode if supported).
5. `findNavTrail(pathname)` returns `{group, item, sub?}` or null (detail routes `/people/:id`, `/people/crew/:id`, `/budget/vendors/:id`, `/documents/:category` fall back to the nearest parent). Unit test it.
6. `section-tabs.tsx`: when the trail's item has `sub.length > 1`, render a tab bar (reuse `components/ui/tabs.tsx` `TabsList` styling or `segmented-control.tsx` as `NavLink`s) above the page; hidden for detail routes; mounted in `layout.tsx`.
7. Breadcrumbs in `top-bar.tsx` (after `SidebarTrigger`): `Group > Item > Sub` from `findNavTrail`, last crumb `aria-current="page"`, earlier crumbs link where a route exists; hide below `md`. Detail pages show parent crumb only (page header carries the name).
8. Orphans: for each file run `grep -rn "features/bookings\|features/day-out-of-days\|features/people/page\|from './page'" src` (already checked pre-plan: no importers; `router.tsx` imports `features/people/pages/*`, a different directory) and confirm no dynamic `import()`/`lazy`. If zero, `git rm` the three files and remove empty dirs `src/features/bookings`, `src/features/day-out-of-days`. If any hit, stop and report.
9. Keep `menuSchema.ts` in sync: `resolveMenuSectionForPath` must resolve `/tasks` -> `tasks`, `/schedule/*` (incl. script) -> `schedule`; add `/equipment`, `/call-sheets`, `/movement-orders`, `/music-clearance` only if given sections (default `none`, unchanged).
10. Tests: `navigation.test.ts` (every `navItems` `to` and `sub.to` matches a path in `router.tsx` route table or a redirect; no duplicate `to`; no duplicate icon between Tasks and Deliverables; `findNavTrail` cases); `menuSchema.test.ts` (`resolveMenuSectionForPath('/tasks')==='tasks'`, `'/readiness'` -> `'none'` or `'tasks'` per your choice, `getAcceleratorConflicts` empty for every section).

## Out of scope
Search/shortcuts (06), onboarding (07), Settings layout (08), moving script routes to `/script/*`, renaming `features/readiness`, Rust menu changes.

## Acceptance checks
- `npm run build && npm test && npm run lint:ci` green vs baseline.
- Manual: sidebar shows labelled groups; each chevron collapses without navigating; clicking a group label navigates; reload keeps collapsed state; `/readiness` in the URL redirects to `/tasks`; Dashboard "Tasks" links and native menu View > Tasks (Cmd+9) go to `/tasks`; Tasks and Deliverables have different icons; breadcrumbs update on every route including `/people/:id` and `/budget/vendors/:id`; tab bar appears on Schedule/People/Budget/Script and not on Locations; Tab key skips collapsed groups; sidebar collapse (Cmd+B) still works; icon-only mode still usable.
- `grep -rn "readiness" src/app src/components` shows only the redirect.

## Commit message
`feat(ui): regroup sidebar, add breadcrumbs and section tabs, rename /readiness to /tasks, remove orphan pages`
