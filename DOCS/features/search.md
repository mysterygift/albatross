# Search

The command palette opened with ⌘K / Ctrl+K or the top-bar **Search** field; it searches the current production's records and runs navigation and create commands.

## Code map
| Area | Location |
|---|---|
| Dialog (cmdk) | `src/features/search/GlobalSearchDialog.tsx`, mounted in `src/app/layout.tsx` |
| Result preview card | `src/features/search/GlobalSearchResultPreview.tsx` |
| Index build | `src/features/search/useGlobalSearchIndex.ts` |
| Entity filtering/grouping | `src/features/search/filterGlobalSearch.ts` |
| Commands (Go to / Create / General) | `src/features/search/commands.ts`, `src/features/search/filterCommands.ts` |
| Types, section labels/icons | `src/features/search/types.ts`, `src/features/search/sectionMeta.ts` |
| Row highlight on arrival | `src/features/search/useHighlightParam.ts` |
| Tests | `src/features/search/*.test.ts(x)` (including `useGlobalSearchIndex.privacy.test.tsx`) |

## How it works
- **Open/close**: `GlobalShortcutBridge` (`src/app/GlobalShortcutBridge.tsx`) toggles it on ⌘K / Ctrl+K, including from inside text fields. It is ignored while another dialog or sheet is open.
- **Index**: built client-side from existing repositories and shares their TanStack Query keys (`cast`, `crew`, `scenes`, `locations`, `equipment`, `vendors`, `vendor-purchase-orders-all`, plus documents). Nothing is queried until the dialog opens (`enabled: open`) and a production is selected.
- **Access check**: when auth is supported, the index waits for `requireProjectViewAccess` for the current user and production before running any query.
- **Entity types** (`GLOBAL_SEARCH_SECTIONS`): Cast, Crew, Scenes, Locations, Equipment, Documents, Vendors, Purchase Orders.
- **Matching**: case-insensitive substring of each result's pre-joined `searchText`. Empty query shows 5 per group; a query shows up to 8 per group plus a "more results" count.
- **Commands**: "Go to" entries come from `visibleNavGroups` (see [../ui.md](../ui.md)), so experimental pages appear only when the experimental flag is on. "Create" entries reuse `CREATE_COMMAND_IDS` and `menuCommandTargets` from `src/app/menuSchema.ts`, so they behave like the native menu. Create commands are disabled with a hint when no production is selected (except **New production**). A `>` prefix shows commands only.
- **Navigation**: selecting a result navigates to `result.to`. Some routes carry `?highlight=<id>`; the destination page calls `useHighlightParam()`, emphasises the row, and the hook strips the param after 2.5 s. Pages using it: Shot Lists, Locations, Equipment, Documents category, Vendor detail.
- **Preview**: a per-row preview button, or → at the end of the input, opens an anchored overview card built from `result.preview` (heading, subheading, label/value fields).

## Connections
- Adding a navigable page: add it to `src/app/navigation.ts` and it appears in "Go to" automatically.
- Adding a searchable entity: extend `GlobalSearchResultType`, `GLOBAL_SEARCH_SECTIONS`, `SECTION_ICON`/`SECTION_BADGE`, and the index hook; give it a `to` route.
- Shortcut cheat sheet and palette share `src/app/menuSchema.ts`.

## Gotchas
- The index contains names, contact details and addresses; keep the access gate in `useGlobalSearchIndex` intact.
- Create commands that dispatch a browser event after navigating can miss it if the target page mounts late (same as the native menu).
