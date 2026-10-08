# Tasks

Per-production to-do list with nesting, sections, departments and reusable templates, plus reminder tasks that other features generate. Lives at **Tasks** (`/tasks`; the old `/readiness` path redirects). The code still uses the name "readiness" (`src/features/readiness`, `ReadinessPage`).

## Code map
| Area | Location |
|---|---|
| Page (table, filters, sections, task dialogs) | `src/features/readiness/page.tsx` |
| Template UI (list sheet, editor sheet, apply dialog) | `src/features/readiness/task-template-ui.tsx` |
| Tree helpers | `src/lib/tasks/tree.ts`, `src/lib/tasks/templatesTree.ts` |
| Departments list | `src/lib/productions/departments.ts` (`PRODUCTION_DEPARTMENTS`) |
| Repositories | `src/lib/db/repositories/tasks.ts`, `taskSections.ts`, `taskTemplates.ts` |
| Reminder generators | `src/lib/db/vendorInvoiceReminderService.ts`, `vendorFinanceDocumentService.ts`, `equipmentReturnReminderService.ts` |
| Starter template seed | `src/lib/db/seed/defaultTaskTemplateSeed.ts` |
| Dashboard | `TasksDueSoonCard` and "Required items" in `src/features/dashboard/page.tsx` |
| Tables | `production_tasks` (0024, `parent_task_id` 0025, `section_id` 0027, `vendor_invoice_id` 0035, `equipment_id` 0045), `production_task_sections` (0026), `task_templates`, `task_template_items` (0028) |

## Data model
| Table | Key columns |
|---|---|
| `production_tasks` | `production_id` (cascade), `description`, `is_complete` (0/1), `notes`, `due_date` (YYYY-MM-DD), `assigned_department`, `priority` (1 High, 2 Medium, 3 Low, null), `parent_task_id` (self), `section_id`, `vendor_invoice_id`, `equipment_id`, soft-delete |
| `production_task_sections` | `production_id`, `name`, `sort_order`, soft-delete |
| `task_templates` / `task_template_items` | Global, not per production. Item: `description`, `notes`, `due_offset_days`, `assigned_department`, `priority`, `section_name`, `parent_template_item_id`, `sort_order` |

`vendor_invoice_id` and `equipment_id` each have a unique partial index, so one invoice or equipment item has at most one live reminder task.

## How it works
- **Required vs optional**: there is no separate flag. Priority 1 (High) is "required"; everything else is optional. The Dashboard "Required items" card shows `complete / total` for priority-1 tasks (100% when there are none) and lists incomplete ones in the "Outstanding required items" alert. The card list **Tasks Due Soon** shows up to six incomplete tasks, required first. Readiness here is derived on the Dashboard from `listTasksByProduction`; nothing is stored.
- **Ordering** (`getDefaultOrderSql`, SQLite and Postgres variants): incomplete first, then overdue, due within 7 days, other; then priority (null last), due date, description. Filters (search on description/notes, status, department, priority, due timing overdue / due soon / none) run in SQL in `listTasksByProductionWithFilters`.
- **Hierarchy**: subtasks via `parent_task_id`; `buildTaskTree` treats orphans as top-level. Collapsed state is UI-only. A subtask without its own section displays under its parent's (`resolveTaskSectionId`). Moving a task to a section moves its descendants (`updateTaskSectionWithDescendants`). `deleteTask` soft-deletes the task and all descendants in one transaction.
- **Sections**: created per production, rendered as groups plus an "Unsectioned" group. `deleteTaskSection` soft-deletes the section and sets `section_id = NULL` on its tasks.
- **Templates**: manage via **Templates**, apply via **Apply Template** with an optional anchor date (`due_date = anchor + due_offset_days`; no anchor, no due date). `applyTaskTemplateToProduction` creates missing sections by name, matches existing ones by trimmed name, keeps parent/child links and inserts everything in one transaction. The "Starter" template (Pre-Production, Principal Photography, Post-Production items) is created on demand by the Default production template.
- **Generated reminder tasks** (kept in sync inside the same transaction as the source row):
  - Vendor invoice with a due date: "Pay invoice N — Vendor", department Accounts, due date = invoice due date. Paid completes it, unpaid re-opens it, removing the due date clears the task's date, archiving the invoice soft-deletes the task.
  - Rented equipment with `return_due_date` and status not `returned`: "Return equipment — Name", department mapped from the crew hierarchy (fallback Production). Returned completes it; ceasing to be eligible or deleting the equipment soft-deletes it.

## Connections
- **Dashboard**: cards above. Query key `['tasks', productionId]`.
- **Budget -> Vendors** and **Equipment** create and update reminder tasks; see [equipment.md](equipment.md) and [budget.md](budget.md).
- **Productions**: the Default template applies the Starter tasks; Blank applies none ([productions.md](productions.md#create-from-a-template)). Duplicate production copies sections and tasks (not `vendor_invoice_id` / `equipment_id` links).
- **.apf**: `production_tasks` and `production_task_sections` are exported; templates are global and are not.
- Wrap Production does not read tasks ([wrap-production.md](wrap-production.md)).

## Gotchas
- Editing or deleting a reminder task by hand is allowed; the next change to the source invoice or equipment item may overwrite it.
- Priority is nullable; sort treats null as lowest, but "required" tests `=== 1` only.
- There is no task assignment to users and no drag-and-drop ordering.
