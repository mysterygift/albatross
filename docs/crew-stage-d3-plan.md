# FEATURE — CREW STAGE D3: Implementation Plan  
## Dedicated Crew detail/profile page — dark UI, two-card horizontal layout

This document is the implementation plan for adding a **Crew detail/profile page** with a tighter, more colourful dark UI and a two-card horizontal layout. It does not redesign the People area or Crew Manager beyond linking into the new page.

---

## 1) Audit: current person detail patterns and crew-related data sources

### 1.1 Current state (from codebase audit)

| Area | Finding |
|------|--------|
| **Generic person detail** | `PersonDetailPage` at `/people/:personId` serves both cast and crew. It shows header (name, type, department), summary cards (bookings, next booked, clashes, availability, plus cast-only cards), then vertical cards: Overview (dl grid), Bookings (table + link to Bookings), Availability, Scene/Shot cast sections for cast, etc. Uses `getPersonById`, `listBookingsByPerson`, `getPersonBookingsSummary`, shoot days/units for booking dates. |
| **Crew Manager** | Links to `/people/${p.id}` (generic person detail) from name and Eye action. Uses `listCrew(productionId)`, `listTasksByProduction`, `getHodResponsibilitySummary`, `getDepartmentsWithTasksButNoHod` from `crewTaskIntegration`, and local helpers `getCanonicalDepartment`, `isPersonHod`, etc. from `crewDepartments`. |
| **People repos** | `getPersonById(id)`, `listCrew(productionId)`, `listCast(productionId)`. Person has `is_cast`, `department`, `role_name`, `phone`, `email`, `phases`, `notes`, etc. |
| **Bookings** | `listBookingsByPerson(personId)`, `listBookingsByShootDay`, `listBookingsByProduction`. `getPersonBookingsSummary(productionId, personId)` returns `booked_days_count`, `start_date`, `end_date`. Booking has `shoot_day_id`, `start_date`, `role`, `notes`. |
| **C1 crew hierarchy** | `crewDepartments.ts`: `getCrewDepartmentNames()`, `getCrewRolesForDepartment(dept)`, `getHodRoleForDepartment(dept)`, `isHodRole(dept, roleName)`, `getTaskDepartmentsForCrewDepartment(dept)`. |
| **C5 task integration** | `crewTaskIntegration.ts`: `getTasksForCrewDepartment(tasks, crewDepartment)`, `getTaskSummaryForCrewDepartment(tasks, crewDepartment)` → `TaskSummary` (total, incomplete, complete, overdue), `getHodResponsibilitySummary(crew, tasks)` → `HodResponsibilityRow[]` (crewDepartment, taskSummary, hasHod, hodPerson), `getDepartmentsWithTasksButNoHod(crew, tasks)`. |
| **Layout patterns** | Person detail uses `Card` + `CardHeader`/`CardContent`, `bg-card`, `border-border`, summary grid `grid-cols-2 sm:grid-cols-4 lg:grid-cols-6`, then single-column cards. No dedicated crew-only layout. |

### 1.2 Decisions

- **Dedicated crew detail page** (recommended): Add a **crew-only** profile at `/people/crew/:personId`. Keeps crew UX focused (department/HOD/tasks/bookings) without cast/availability/scene-cast complexity. Reuse person + bookings + C1/C5 logic only.
- **Generic person page** remains unchanged for cast and for any direct links to `/people/:personId`. Crew Manager will link to the **new** route for crew so crew users see the crew-focused page.
- **Data to use (no new schema)**:
  - Person: `getPersonById(personId)`; validate `production_id === currentProductionId` and `is_cast !== 1` (crew only).
  - Bookings: `listBookingsByPerson(personId)`; for dates/units use same pattern as PersonDetailPage: `listShootDaysByProduction` + `listShootDayUnitsByProduction` + `listUnitsByProduction` to build `shootDayById` and `unitNamesByShootDayId`.
  - Summary: `getPersonBookingsSummary(currentProductionId, personId)` for booked_days_count and next/start_date.
  - C1: `getHodRoleForDepartment(dept)`, `isHodRole(dept, person.role_name)` (or reuse Crew Manager’s local `getCanonicalDepartment` / `isPersonHod` pattern).
  - C5: `getHodResponsibilitySummary(crew, tasks)` then find row for this person’s department; `getTaskSummaryForCrewDepartment(tasks, crewDepartment)` for this dept; show `hodPerson` for “who is HOD” when not this person.
- **Crew Manager link**: Change name and Eye links from `/people/${p.id}` to `/people/crew/${p.id}` so crew rows open the new Crew detail page.

---

## 2) Routing and navigation

### 2.1 New route

- **Path**: `people/crew/:personId`
- **Component**: New page component, e.g. `CrewDetailPage` (new file under `src/features/people/pages/` or `src/features/people/crew-manager/`).
- **Router**: Add route **before** `people/:personId` so `crew` is not interpreted as personId:
  - `{ path: 'people/crew/:personId', element: <CrewDetailPage /> }`
  - `{ path: 'people/:personId', element: <PersonDetailPage /> }`

### 2.2 Safe behaviour for non-crew / not-found

- **No personId / no production**: Show “Select a production” or “Not found” (consistent with app).
- **Person not found** (`getPersonById` null): “Crew member not found.”
- **Wrong production** (`person.production_id !== currentProductionId`): “Not found for this production.”
- **Cast record** (`person.is_cast === 1`): Do **not** show crew profile. Either:
  - **Option A**: Redirect to `/people/crew-manager` with a toast/query “This person is cast, not crew.”
  - **Option B**: Show an inline “This person is cast; use the main People profile” with a link to `/people/:personId`.
- Recommendation: **Redirect to Crew Manager** (Option A) for consistency and to avoid confusion.

---

## 3) Page header and top summary cards

- **Header** (above summary cards):
  - Back link to `/people/crew-manager` (ArrowLeft).
  - Crew member name (h1).
  - Subtitle line: department, role, and “HOD” badge when applicable (using C1 `isHodRole`).
  - Optional: Edit button that opens existing `CrewForm` in a dialog (reuse Crew Manager edit pattern) — keeps scope minimal; can be “Edit” linking to same dialog pattern.

- **Summary cards** (compact strip, **not** part of the “two cards” rule):
  - Use a single row grid, e.g. `grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3`.
  - Cards (compact, dark — see §5):
    - **Department**: person.department ?? '—'
    - **Role**: person.role_name ?? '—'
    - **HOD / Team**: “HOD” if HOD, else “Team” (or “—” if no canonical dept)
    - **Bookings**: count from `getPersonBookingsSummary` (booked_days_count)
    - **Next booked**: start_date from summary, formatted; or “—” if none
  - Optional 6th card: **Department tasks** (for this person’s department only): open count from `getTaskSummaryForCrewDepartment` (incomplete) and optionally overdue; only if department is canonical.

- **Styling**: Summary cards must use **dark surfaces** (no white/stone). See §5.

---

## 4) Main layout: two cards horizontally

- **Rule**: After the summary cards, the main content is **two columns on desktop** (two cards per row). Two rows of two cards = four cards total.

- **Row 1**
  - **Card A**: Crew profile / contact information (§6).
  - **Card B**: Department / task responsibility context (§7).

- **Row 2**
  - **Card C**: Bookings / schedule context (§8).
  - **Card D**: Notes / operational information (§9).

- **Layout**:
  - Container: e.g. `grid grid-cols-1 lg:grid-cols-2 gap-4` (or gap-6) for the main body.
  - Each slot is one Card. So structure is:
    - Row 1: [Card A | Card B]
    - Row 2: [Card C | Card D]
  - **Responsive**: On narrow widths (e.g. below `lg`), stack vertically: A, B, C, D. Do **not** use a single long vertical stack on desktop.

- **No** top summary cards in this grid; they stay in their own row above.

---

## 5) Dark accent styling (no white/stone cards)

- **Constraints**:
  - **No** white, cream, or stone card backgrounds.
  - Use **dark card surfaces** only (e.g. existing `--card` or darker, e.g. `bg-card` or a dedicated class like `bg-zinc-900/80` / `bg-[var(--card)]` with border).
  - **Readability**: Sufficient contrast for text (e.g. `text-foreground`, `text-muted-foreground`).
  - **Accent colours**: Restrained but visible (borders, top rules, or small badges) to give structure.

- **Concrete approach**:
  - Page background: keep app background (dark).
  - All cards: dark background only (e.g. `bg-card`, or a slightly darker variant). **No** `bg-white`, `bg-stone-*`, `bg-zinc-50`, etc.
  - Accent differentiation (optional but recommended):
    - **Card A (Profile)**: subtle left or top border using `border-primary/40` or `chart-1`.
    - **Card B (Department / tasks)**: different accent, e.g. `border-chart-2` or `border-primary/30`; HOD badge can use `primary` or `chart-1`.
    - **Card C (Bookings)**: e.g. `border-chart-3` or another chart colour.
    - **Card D (Notes)**: e.g. `border-muted` or a fourth accent.
  - Section titles inside cards: bold, small, readable; optional thin accent rule under title.
  - Avoid low-contrast pastels; prefer existing design tokens (`--primary`, `--chart-*`, `--muted`).

- **Summary cards**: Same dark-only rule; optional very subtle border (e.g. `border-border`) and no white/stone.

---

## 6) Card A: Crew profile / contact information

- **Content** (label + value pairs, compact):
  - Full name  
  - Department  
  - Role  
  - Phone  
  - Email  
  - Phases  
  - HOD status (derived: “HOD” or “Team” / “—” using C1)
  - Optional one line: “Canonical department” note if department is in C1 list (e.g. “Matches Camera department hierarchy”).

- **Display**: Use a compact `<dl>` grid (e.g. two columns on small screens). Missing values as “—”. No large padding; compact spacing.

- **Data**: All from `person`; HOD from `isHodRole(getCanonicalDepartment(person), person.role_name)` (reuse Crew Manager helper pattern or import from a small shared util to avoid duplication).

---

## 7) Card B: Department / task responsibility context

- **Purpose**: Read-only view of how this crew member fits in the department and task structure (C1 + C5).

- **Data**:
  - From **C1**: Department name, `getHodRoleForDepartment(dept)` (canonical HOD role name).
  - From **C5**: For this person’s department only:
    - `getTaskSummaryForCrewDepartment(tasks, crewDepartment)` → total, incomplete, complete, overdue.
    - From `getHodResponsibilitySummary(crew, tasks)` the row for `crewDepartment`: `hasHod`, `hodPerson`.

- **Content**:
  - Department name (bold).
  - Canonical HOD role for that department (e.g. “HOD role: Director of Photography”).
  - **If this person is HOD**: “You are the departmental lead” (or “HOD for this department”).
  - **If this person is not HOD**: “HOD: [hodPerson.name]” if `hodPerson` exists, else “No HOD assigned” or “Missing HOD coverage.”
  - Department task summary: Total tasks, Open (incomplete), Overdue (count). Optional: one line “X open, Y overdue.”

- **No mutations**: Do not change task ownership or schema; display only.

---

## 8) Card C: Bookings / schedule context

- **Data**:
  - `listBookingsByPerson(personId)`.
  - `getPersonBookingsSummary(productionId, personId)` for count and next date.
  - For each booking, resolve shoot date and unit names: same as PersonDetailPage — `shootDays`, `listShootDayUnitsByProduction`, `listUnitsByProduction`; build `shootDayById`, `unitNamesByShootDayId` by shoot_day_id.

- **Content**:
  - Short summary line: “X booked shoot days” and “Next: [date]” (or “—”).
  - List of **recent/upcoming** bookings (e.g. next 10 by date, or “upcoming” then “past” with limited rows). Columns: Date, Unit(s), Role (booking.role), Notes (truncated).
  - Optional: “View all in Bookings” link to `/people/bookings` (filtered by person if the Bookings page supports it; otherwise just link to Bookings).

- **Scope**: Existing booking data and repos only; no schema or UI redesign of the Bookings feature.

---

## 9) Card D: Notes / operational information

- **Content**:
  - **Notes**: person.notes ?? '—' (multiline if present).
  - **Phases**: person.phases ?? '—' (if not already in Card A; otherwise reference or keep in one place).
  - **Data completeness** (optional, restrained):
    - Missing phone: small warning “Phone missing.”
    - Missing role: “Role not set.”
    - Department not in canonical list: “Department not in standard list.”
  - **Role/department validation**: If department is canonical, “Role in [Department] hierarchy” or list canonical HOD role; if role not in `getCrewRolesForDepartment(dept)`, subtle “Role not in standard [Department] roles.”

- Keep the card concise; avoid clutter.

---

## 10) Reuse C1/C5 logic (no duplication)

- **C1**: Use `@/lib/people/crewDepartments`: `getCrewDepartmentNames`, `getHodRoleForDepartment`, `getCrewRolesForDepartment`, `isHodRole`. Optionally `getCanonicalDepartment` as in Crew Manager (same logic: person.department in CANONICAL_SET).
- **C5**: Use `@/lib/people/crewTaskIntegration`: `getHodResponsibilitySummary(crew, tasks)`, `getTaskSummaryForCrewDepartment(tasks, crewDepartment)`. Do not reimplement task filtering or HOD detection.
- **People / bookings**: `getPersonById`, `listBookingsByPerson`, `getPersonBookingsSummary`; schedule data via existing repos for shoot days and units.

---

## 11) Crew Manager link to Crew detail page

- In **Crew Manager** table:
  - Change **name** link from `to={/people/${p.id}}` to `to={/people/crew/${p.id}}`.
  - Change **Eye** action link from `to={/people/${p.id}}` to `to={/people/crew/${p.id}}`.
- No other Crew Manager changes (filters, table columns, edit dialog, add crew).

---

## 12) Visual tightness and production-grade feel

- **Spacing**: Compact padding in cards (`p-4` or similar), tight gaps between sections.
- **Hierarchy**: Clear card titles (e.g. “Profile & contact”, “Department & responsibility”, “Bookings”, “Notes & status”); small, bold section headings inside cards if needed.
- **Dark surfaces**: All cards dark; no washed-out or pale cards.
- **Accents**: Restrained borders or top rules for structure; no badge overload.
- **Copy**: Short, scannable labels; “—” for empty values.

---

## 13) Verification checklist (post-implementation)

1. Dedicated Crew detail page exists at `/people/crew/:personId`.
2. Crew Manager name and Eye links go to `/people/crew/:personId`.
3. Non-crew or not-found: redirect or clear message (no crash).
4. Top summary cards render (Department, Role, HOD/Team, Bookings count, Next booked; optional tasks).
5. Main body: two cards per row on large screens (A|B, then C|D); vertical stack on small.
6. No white/stone card backgrounds anywhere on the page.
7. Accent colours used for structure; readability maintained.
8. Card A: profile and contact clearly shown.
9. Card B: department, HOD role, HOD person or “no HOD”, task summary using C1/C5 only.
10. Card C: bookings list and summary using existing APIs.
11. Card D: notes, phases, optional completeness/validation hints.
12. No changes to task schema, booking schema, or call-sheet generation.

---

## File and dependency summary

| Action | Item |
|--------|------|
| **New file** | `CrewDetailPage` component (e.g. `src/features/people/pages/CrewDetailPage.tsx` or under `crew-manager/`). |
| **Edit** | `src/app/router.tsx`: add `people/crew/:personId` route before `people/:personId`. |
| **Edit** | Crew Manager page: change Link `to` from `/people/${p.id}` to `/people/crew/${p.id}` (name + Eye). |
| **Use (no new)** | `getPersonById`, `listCrew`, `listBookingsByPerson`, `getPersonBookingsSummary`, `listShootDaysByProduction`, `listShootDayUnitsByProduction`, `listUnitsByProduction`; `crewDepartments` (C1); `crewTaskIntegration` (C5). |
| **Optional** | Shared helper for “canonical department + is HOD” used by both Crew Manager and CrewDetailPage to avoid duplication (e.g. in `crewDepartments` or a tiny `crewPersonUtils.ts`). |

---

## Out of scope (do not do in D3)

- Redesign of the whole People area.
- Redesign of Crew Manager beyond the two link changes.
- Any change to bookings or task schema.
- Any change to call-sheet generation.
- White/stone card backgrounds on this page.
