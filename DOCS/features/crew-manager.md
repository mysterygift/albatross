# Crew Manager

The production's crew list with departments, roles and Heads of Department (HODs), a first-run setup wizard and a per-production crew structure. UI: **People → Crew Manager** (`/people/crew-manager`), crew detail at `/people/crew/:personId`.

## Code map
| Area | Location |
|---|---|
| Pages/UI | `src/features/people/crew-manager/page.tsx`, `CrewSetupWizard.tsx`; `src/features/people/pages/CrewDetailPage.tsx`; form `src/features/people/components/CrewForm.tsx` |
| Structure editor | `src/features/settings/CrewStructureEditor.tsx` (**Settings → Crew structure**) |
| Hierarchy logic | `src/lib/people/crewDepartments.ts` (built-in vocabulary), `defaultCrewHierarchy.ts`, `crewHierarchyResolver.ts`, `crewHierarchyTypes.ts` |
| Task link | `src/lib/people/crewTaskIntegration.ts` |
| Call-sheet crew | `src/lib/call-sheets/crewRequirements.ts` |
| Repositories | `person.ts` (`listCrew`, `createPerson`, `updatePerson`, `deletePerson`), `crewHierarchyConfig.ts`, `crew-availability.ts` |
| Tables | `people` (crew = `is_cast = 0`), `production_crew_hierarchy_configs` (0043), `crew_availability` (0074, 0103) |
| Tests | `src/features/settings/CrewStructureEditor.test.tsx`, `src/lib/call-sheets/crewRequirements.test.ts`, `src/lib/people/*.test.ts` |

## Data model
- Crew have no table of their own: they are `people` rows with `is_cast = 0`. `department` and `role_name` are free text; the UI offers values from the hierarchy.
- **HOD is derived, never stored.** A person is the HOD of a department when `department` is a department in the hierarchy and `role_name` equals that department's `hod_role_name`.
- `production_crew_hierarchy_configs`: one row per production (`UNIQUE(production_id)`), `config_json` holds a `CrewHierarchyConfig` (`version`, ordered `departments`, each with `hod_role_name`, optional `task_department_labels`, ordered `roles`; types in `crewHierarchyTypes.ts`). Cascades on production delete.

## How it works
### Department and role vocabulary
`CREW_DEPARTMENTS` in `src/lib/people/crewDepartments.ts` is the built-in vocabulary: ten departments in canonical order (Development, Production, Finance, Locations, Art, Camera, Lighting, Grip, Sound, Post-Production), each with an HOD role and an ordered role list. Role order is meaningful: it sorts crew inside a department and on call sheets. `CREW_TO_TASK_DEPARTMENT_MAP` maps crew departments to task `assigned_department` labels where they differ (Lighting to Electrical, Finance to Accounts, Art to Art Department, Post-Production to Post Production, Development to Producers and Direction). To change the built-in list edit that file only; do not copy it elsewhere.

### Effective hierarchy
`getEffectiveCrewHierarchyOrDefault(productionId)` returns the stored config if it parses and validates, otherwise `buildDefaultCrewHierarchyConfig()` (the built-in vocabulary serialised). It never throws. Every consumer (Crew Manager, `CrewForm`, wizard, crew detail, task integration, call sheets, Calendar, Movement Orders contacts, equipment and invoice ingestion, demo seeds) works from this resolved object through the `getResolved*` helpers, not from `crewDepartments.ts` directly. Query key `['crew-hierarchy', productionId]`. `CrewStructureEditor` writes through `upsertCrewHierarchyConfig` / `resetCrewHierarchyConfigToDefault`. Role and department ids are slugs; names are what people rows reference, so renaming a department or role in the editor does not update existing people.

### Crew Manager page
- Summary strip: crew, departments, HODs, missing department, missing role.
- Department task responsibility table (open and overdue tasks per department, assigned HOD, flags departments with tasks but no HOD) from `crewTaskIntegration.ts` using `['tasks', productionId]`.
- Filters: search, department (including "Other / unset"), HOD only or not, missing department, missing role, has unavailability. Sorted by department order, HOD first, role order, name.
- Add/edit use `CrewForm`; department and role are required together. Email and phone use the shared validation in [people.md](people.md). The calendar icon opens `PersonUnavailabilityDialog` (`crew_availability`).
- Delete uses `deletePerson`, which soft-deletes the person and their bookings, availability and cast links; the page invalidates the bookings and booking-intelligence queries.

### Setup wizard
`CrewSetupWizard` opens automatically once per production per visit when the crew query has loaded with zero crew (`hasAutoOpenedWizardRef`; reset when the production changes). Dismissal is not persisted. Step 1 is an intro; step 2 lists the department names from the resolved hierarchy so the user can pick departments and enter an HOD (name, role defaulting to the HOD role, email, phone). Each HOD is created through the same `createPerson` mutation as **Add crew**. The empty state also offers **Add crew manually**.

### Crew detail
Cards: Profile and contact, Department and responsibility (HOD badge, department task context), Bookings (count and link to **Bookings**), Unavailable dates (`crew_availability`, not used in Day Out of Days), Notes and status. Back goes to Crew Manager.

### Crew hours
Per-person call/wrap overrides and overtime live on **People → Overtime** (experimental, see [overtime.md](overtime.md); `src/features/people/overtime/`, `src/lib/overtime/`, `src/lib/db/repositories/overtime.ts`; tables from migration 0102: `production_crew_hours_settings`, `crew_day_hours`, `crew_hours_person_settings`). It lists crew booked on a shoot day via `bookings`. Crew Manager does not edit hours.

## Connections
- **Call sheets**: `getCallSheetCrewRequirements` takes crew who have a booking on the shoot day for the unit (or for the whole day; `bookingsForShootDayUnit`), groups by hierarchy department, puts the HOD first, then role order, then name; people with no or unknown department go in an "Other" group at the end. See [call-sheets.md](call-sheets.md).
- **Tasks**: department labels from the hierarchy decide which tasks count towards a department.
- **Duplicate production** copies `production_crew_hierarchy_configs` and `people`, but not bookings.
- Equipment and Movement Orders read crew departments for contact lists and ownership ([equipment.md](equipment.md), [movement-orders.md](movement-orders.md)).

## Gotchas
- Header comments in `crewHierarchyConfig.ts`, `crewHierarchyResolver.ts` and `crewDepartments.ts` say consumers have not migrated to the resolver; they have. Trust the code.
- `CrewDetailPage` redirects to Crew Manager when the person is cast; `CastDetailPage` redirects crew the other way.
- Departments or roles that are not in the effective hierarchy still save (free text) and group under "Other"; they are never HOD.
