# Productions

Create, edit, duplicate, archive and permanently delete productions, pick the current one, and manage clients. Lives at **Productions** (`/productions`); the current-production switcher is in the top bar. Episodic productions (episodes and shooting blocs) are covered below.

## Code map
| Area | Location |
|---|---|
| Productions page, forms, dialogs | `src/features/productions/page.tsx` |
| Current-production context | `src/features/productions/context.tsx` (`ProductionProvider`, `useCurrentProduction`) |
| Switcher / no-production empty state | `src/components/production-switcher.tsx`, `src/components/require-production.tsx` |
| `.apf` import/export bridges | `src/features/productions/{useApfActions,apfImportFlow,ApfMenuEventBridge,ApfDesktopOpenBridge}.ts(x)` |
| Production repository | `src/lib/db/repositories/production.ts` |
| Templates | `src/lib/db/createProductionFromTemplate.ts`, `src/lib/db/seed/` |
| Duplicate | `src/lib/db/duplicateProduction.ts` |
| Clients | `src/lib/db/repositories/clients.ts`, `src/lib/clients/clientFieldValidation.ts`, `ClientContactCard.tsx` |
| Episodes / blocs | `src/lib/db/repositories/{episodes,shootingBlocs}.ts`, `episodeManagementService.ts`, `episodicProductionService.ts`, `shootingBlocAssociation.ts` |
| Episode and bloc settings UI | `src/features/settings/{EpisodesSettingsSection,ShootingBlocsSettingsSection}.tsx`, "Episodic production" card in `settings/page.tsx` |
| Sign-in checks | `src/lib/access/projectAccessService.ts` (`*ForActor` wrappers) |
| Data source | `src/lib/db/projectDataSource.ts`, `src/hooks/useEffectiveDataSourceForProduction.ts` |
| Tests | `ProductionsEpisodicInit.integration.test.tsx`, `NonEpisodicRegression.integration.test.tsx`, `src/test/apf/productionDeleteCascade.test.ts` |

## Data model
`productions`: `name`, `slug` (unique among live rows, 0003), `production_code` (optional, max 64 chars in the form, 0103), `currency_code` (default GBP), `notes`, `client_id` -> `clients` (`ON DELETE SET NULL`, 0068), `delivery_date`, `is_episodic` (0059), `created_from_template` (`demo` / `tutorial`, 0032), `archived_at` (0012), `wrapped_at` (0023), `deleted_at`.

- **Slug**: `slugify(name)` then `ensureUniqueSlug` appends `-2`, `-3`... inside `withSlugLock`, so concurrent create/duplicate cannot collide. It is an internal identifier (not in URLs); the built-in demo is found by `DEMO_SLUG`.
- **Clients** are instance-wide, not per production. With sign-in enabled, name, email and phone are encrypted at rest and need the data key to read (`EncryptionKeyUnavailableError`; the Client column shows "Unavailable"). Email must be lowercase and valid, phone digits only (`clientFieldValidation.ts`).
- `episodes`, `shooting_blocs` (both `ON DELETE CASCADE` from `productions`); `scenes`, `music_tracks`, `deliverables` carry nullable `episode_id`; `script_versions` and `script_sections` carry `episode_id` (`SET NULL`); `shoot_days.shooting_bloc_id` (`SET NULL`).

## Current production
Held in React state only (`ProductionProvider`), not persisted: every launch starts with none selected, and pages wrap content in `RequireProduction`. The provider loads active (non-archived) productions; sign-in users see only productions where they hold a membership (admins see all) via `listVisibleProjectsForActor`. If the current production is archived or deleted the selection is cleared. The switcher also offers **New production...** (`/productions?new=1`) and **Wrap production...** ([wrap-production.md](wrap-production.md)). Creating, duplicating or importing a production makes it current. Show archived is remembered in `localStorage` (`showArchivedProductions`).

## Create from a template
The **New production** dialog takes name, notes, template, optional client (existing, or add new) and delivery date, and an episodic switch. `createProductionFromTemplate`:

| Template | Seeds |
|---|---|
| Blank | Default chart of accounts and 10% contingency (`createProduction` defaults); no tasks or deliverables |
| Default | Demo-structure chart of accounts + totals, contingency, "Starter" task template, six starter deliverables ([tasks.md](tasks.md), [deliverables.md](deliverables.md)) |
| Demo | Full sample content (`seedDemoStyleContentIntoProduction`), marks `created_from_template = 'demo'`. Hidden in the dialog (`VISIBLE_TEMPLATE_OPTIONS`); creating another asks to override the existing demo copy |
| Tutorial | Default plus a small starter budget; used by the in-app tutorial only |

Everything for the production row, client, optional membership and (if episodic) first episode and bloc is written in one transaction; budget seeding runs after it, so a failure there leaves a created production without accounts. `createProduction` accepts `creatorUserId` to add an administrator membership, but the Productions page does not pass it.

## Edit, archive, delete
- **Edit**: name, production code, notes, client, delivery date. Currency and episodic mode cannot be changed here (`updateProduction` throws if asked to disable episodic).
- **Archive / Unarchive**: reversible, sets or clears `archived_at`; archived rows are hidden unless **Show archived** is on. Wrapping (`wrapped_at`) archives too.
- **Duplicate**: `duplicateProduction` copies an explicit list of tables (the `INSERT INTO` statements in the file) in one `executeBatch` transaction, with new ids, a new slug and copied attachment files. It does not write the outbox and does not copy archive/wrap state, budget revisions or server links. Archived source episodes become null on copied rows.
- **Delete permanently**: confirm dialog, then `permanentlyDeleteProduction`: list the production's documents, `DELETE` the `productions` row, then remove files under `attachments/`. Every child table must reference `productions` with `ON DELETE CASCADE` (SQLite runs with `PRAGMA foreign_keys = ON`); a table without it makes the delete fail with "FOREIGN KEY constraint failed" (migration 0105 fixed `crew_availability`). `productionDeleteCascade.test.ts` asserts every foreign key to `productions` and `people` has a delete action, so new tables need it too. `deleteProduction` (soft) exists but the UI uses the hard delete. With sign-in enabled, archive and delete require project administrator (`assertCanAdminProject`).

## Episodic productions
Turned on at creation (episodic switch plus first episode name) or later from Settings -> **Episodic production** ("Enable episodic mode"). Either way it is **irreversible**: `enableEpisodicProduction` creates the first episode and a default shooting bloc "Block A" (today for 90 days) and sets `is_episodic = 1` in one transaction; the UI warns twice and `updateProduction` refuses to turn it off.

- **Episodes** (`episodes`: name, `sort_order`, soft-delete) are managed in Settings: add, rename, reorder, archive, delete. The last active episode cannot be archived or deleted. Archive is `deleted_at`; delete is a hard delete that first sets `episode_id = NULL` on live scenes, music tracks and deliverables.
- **Scoping**: scenes require an episode on episodic productions (`createScene` throws otherwise; `updateScene` refuses null). Music tracks and deliverables are optional: null means project-wide. All writes reject archived or unknown episodes and any episode on a non-episodic production. Script versions and sections, call sheets, stripboard, calendar and sides show episode labels. Shots take their episode from the scene. See [music-archive.md](music-archive.md), [deliverables.md](deliverables.md), [schedule.md](schedule.md).
- **Shooting blocs** are date ranges (inclusive, never overlapping). `shoot_days.shooting_bloc_id` is system-managed from the shoot date by `shootingBlocAssociation.ts`; do not set it directly. Moving a bloc by the same span shifts its shoot days; shrinking deletes tagged days outside the range; deleting a bloc merges its days into the previous one and the first bloc cannot be deleted. Days outside every bloc show as "Outside blocs".
- Duplicate production remaps episodes, blocs and `episode_id`s.

## Data source (local vs linked)
`getEffectiveDataSourceForProduction` returns `local_sqlite` unless collaboration is enabled, the legacy server-runtime flag is on, and the production has a `linked_projects` row in state `linked`, `offline` or `conflict`; then it returns `remote_server`. A handful of repositories (schedule, script breakdown, script sections, coverage) branch on it; everything else reads local SQLite. The list shows a "Linked to Server" badge and **Unlink from server**. See [collaboration.md](../collaboration.md).

## Gotchas
- With sign-in enabled, a non-admin who creates a production gets no membership (see above), so `listVisibleProjectsForActor` will not return it.
- Duplicate is not synced; a duplicated production starts unlinked.
- Deleting an episode leaves episodic scenes with a null `episode_id` until reassigned, although normal writes forbid that state.
