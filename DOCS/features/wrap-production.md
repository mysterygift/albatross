# Wrap Production

Closeout check-and-balance before a production is completed and archived. Route `/wrap-production`; it is not in the sidebar. Reach it from the production switcher (**Wrap production...**, shown when a production is selected) or the Dashboard link ("Finished shooting? Wrap production").

## Code map
| Area | Location |
|---|---|
| Page (four collapsible sections, confirm dialog) | `src/features/wrap-production/page.tsx` |
| Budget readiness | `src/lib/budget/wrapReadiness.ts`, `src/lib/budget/reconciliation.ts` |
| Float reminders | `src/lib/budget/floatReminders.ts` |
| Schedule readiness | `src/lib/wrap-production/scheduleReadiness.ts` |
| Deliverables readiness | `src/lib/wrap-production/deliverablesReadiness.ts` |
| Completion | `completeAndArchiveProduction` in `src/lib/db/repositories/production.ts`; `completeAndArchiveProductionForActor` in `src/lib/access/projectAccessService.ts` |
| Columns | `productions.wrapped_at` (0023), `productions.archived_at` (0012) |

## How it works
All checks are read-only and computed in the page from the same queries other features use. Checks never block completion: the confirm dialog repeats each section's status and says outstanding items can be ignored.

| Section | Ready when | Reads |
|---|---|---|
| Budget and Actualisation | No unallocated or partly allocated spend, no unmatched line items, no overspent line items, **and** no outstanding petty cash floats | budget items, expenses, budget-item/expense links, accounts, floats and float-expense links, people (for float holders), for the selected budget revision |
| Schedule and Calendar | No shoot day dated after today (local date) | shoot days, calendar shoot-day events from today to +2 years (for the unit-level detail list) |
| Deliverables | At least one deliverable and every one signed off | all live deliverables |
| Archive Readiness | Placeholder, always "—" | nothing |

Budget extras shown but not part of the status: overspent and remaining-estimate rows and potential reallocation suggestions (`getPotentialReallocationOpportunities`, informational only). Floats outstanding for over 14 days (or overspent and stale) are flagged critical.

**Completing**: **Complete and Archive Production** opens the confirm dialog; confirming calls `completeAndArchiveProduction(id)`, which in one serialized transaction sets `wrapped_at = archived_at = updated_at = now` and writes an outbox update. The page then clears the current production, invalidates `['productions']` and navigates to `/` with `state.wrapSuccess`, which shows the Dashboard banner.

**Access**: when sign-in is supported, the button is disabled unless the user is a project administrator or instance admin (`getActorProductionActionCaps(...).canAdmin`); the repository call re-checks with `assertCanAdminProject`. See [security.md](../security.md).

## Connections
- Archived productions are hidden from the switcher and `/productions` unless **Show archived** is on; **Unarchive** clears `archived_at` but leaves `wrapped_at` set.
- Related pages that fix issues: Budget (actualisation and floats tabs), Schedule → Calendar, Deliverables. See [deliverables.md](deliverables.md), [productions.md](productions.md).
- Tasks are not read by the wrap check.

## Gotchas
- **Deliverables check cannot reach Ready from the UI.** `getDeliverableWrapStatus` only treats `signed_off`, `signed off`, `complete` and `completed` as done and `pending` as pending; the Deliverables page writes `not_started`, `preparing`, `qc`, `ready`, `delivered`, so `delivered` counts as "Not reviewed". Either map `delivered` to done or align the status values.
- With zero deliverables the section is "Needs review".
- "Future" is `shoot_date > today`; a shoot day dated today does not count.
