# Tasks

This document is both a **user guide** (how to use the Tasks feature) and a **developer guide** (architecture, data model, and implementation). It describes the production-scoped task management system for film and TV productions.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Key features](#2-key-features)
- [3. Fundamental workflow](#3-fundamental-workflow)
- [4. Task templates](#4-task-templates)
- [5. Dashboard integration](#5-dashboard-integration)
- [6. Film/TV production use cases](#6-filmtv-production-use-cases)
- [7. Relationships and connections to other pages](#7-relationships-and-connections-to-other-pages)

**Part II — Developer guide**

- [8. Architecture and file layout](#8-architecture-and-file-layout)
- [9. Data model](#9-data-model)
- [10. Repository functions](#10-repository-functions)
- [11. Tree helpers](#11-tree-helpers)
- [12. Query keys and invalidation](#12-query-keys-and-invalidation)
- [13. UI state (page only)](#13-ui-state-page-only)

**Part III — Reference**

- [14. Router and navigation](#14-router-and-navigation)
- [15. Departments](#15-departments)
- [16. Gaps and future work](#16-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Tasks is a production-scoped task management system for tracking work items, deadlines, and completion status across a film or TV production.
- **Route:** `/readiness` (see [src/app/router.tsx](src/app/router.tsx)).
- **Navigation:** "Tasks" (FileCheck icon) in app nav ([src/app/navigation.ts](src/app/navigation.ts)).
- **Context:** Requires a current production. Shows "Select a production first." if none selected.
- **Scope:** All tasks are scoped to the current production. Tasks support nesting (parent/subtask), sections, priority, department assignment, due dates, and notes. Reusable **task templates** (global) can be applied from the Tasks page to create a batch of tasks at once.

### 2. Key features

| Feature | Description |
|---------|-------------|
| **Task creation** | Create top-level tasks or subtasks under existing tasks. Fields: description (required), notes, due date, department, priority (High/Medium/Low). |
| **Task editing** | Edit any task: description, notes, due date, department, priority, completion status. |
| **Completion toggle** | Quick toggle between Incomplete and Complete from the table. Completed tasks recede visually (opacity, line-through). |
| **Subtask hierarchy** | Parent tasks can have subtasks. Collapse/expand via chevron. Subtask progress shown (e.g. "2 / 4 subtasks complete"). |
| **Search** | Case-insensitive search on description and notes. |
| **Filters** | Status (all/incomplete/complete), Department, Priority, Due timing (all/overdue/due soon/no due date). Clear filters affordance when active. |
| **Default sort** | Incomplete first, then overdue, due soon, higher priority, due date ascending, description. |
| **Soft delete** | Deleting a task soft-deletes it and all its subtasks. |
| **Task templates** | Reusable templates (global, not production-scoped) with nested items. Each item can define description, notes, due offset (days), department, priority, and section name. |
| **Apply Template** | From the Tasks page, choose a template and optional anchor date to create a batch of production tasks. Parent/child structure and sections are preserved; due dates use anchor + offset when anchor is set. |

### 3. Fundamental workflow

**Create tasks**

1. Click "New task" in the header.
2. Fill description (required), optional notes, due date, department, priority.
3. Click Add.

**Add subtasks**

1. On a task row, click the ListTree icon (Add subtask).
2. The dialog opens with the parent pre-selected. Fill the form and Add.

**Manage and review**

3. Use search and filters to narrow the list.
4. Toggle completion from the Status column or via Edit.
5. Collapse/expand parent tasks to focus on top-level items.
6. Edit or delete tasks via the Actions column.

### 4. Task templates

**Purpose:** Task templates let you define a reusable set of tasks (with optional nested subtasks and section names) and apply them to the current production in one go. Templates are global—they are not tied to a specific production.

**Manage templates**

1. On the Tasks page, click **Templates** in the header.
2. In the sheet: add a new template (name only), rename or delete existing templates, or click **Edit items** to edit a template’s items.
3. In the template editor: add top-level items with **Add item**, or add subtasks under any item with the ListTree (Add subtask) icon.
4. For each template item you can set: description (required), notes, due offset (days), department, priority, and section name. Section names are used when applying the template: missing sections are created, and tasks are assigned to the matching section.

**Apply a template**

1. On the Tasks page, click **Apply Template**.
2. Choose a template (required) and optionally an **Anchor date** (for due-date offsets).
3. Click **Apply**. Tasks are created as normal production tasks; they appear in the existing Tasks list and respect section grouping and parent/child structure.

**Due dates when applying:** If you provide an anchor date, each template item’s due date is set to anchor date + its *due offset (days)* when that offset is set. If you leave the anchor date blank, tasks with offsets get no due date (null). Tasks created from a template are normal tasks and appear in Dashboard “Tasks Due Soon” like any other.

### 5. Dashboard integration

| Card / element | Relationship |
|----------------|---------------|
| **Tasks Due Soon** | Shows incomplete tasks (high-priority first, then overdue, due soon). Displays up to ~6 tasks with priority badges (High/Medium/Low). "View all tasks" links to `/readiness`. |
| **Required items** | Shows completion of high-priority (priority 1) tasks: X% complete, Y / Z required. |
| **Outstanding required alert** | Lists incomplete high-priority tasks when any exist. |

### 6. Film/TV production use cases

| Use case | How Tasks supports it |
|----------|------------------------|
| **Pre-production checklist** | Create tasks for permits, contracts, location agreements, cast availability. Use departments (Locations, Legal, Cast) and due dates. |
| **Department handoffs** | Assign tasks to departments (Camera, Sound, Art Department). Track completion before shoot. |
| **Post-production deliverables** | Parent task "Final delivery" with subtasks: picture lock, sound mix, colour grade, QC, delivery to broadcaster. |
| **Wrap and closeout** | Tasks feed into Wrap Production readiness. High-priority tasks surface as "required" on Dashboard. |
| **Shoot-day prep** | Tasks for call sheets, equipment checks, crew call times. Filter by due soon. |
| **Compliance and legal** | Legal department tasks (contracts, clearances). Priority 1 for must-complete items. |
| **Reusable checklists** | Create a template (e.g. "Pre-shoot checklist") with nested items and section names; apply it to each production to generate a consistent task set. Use anchor date for due offsets (e.g. shoot date −14 days). |

### 7. Relationships and connections to other pages

| Page | Relationship |
|------|--------------|
| **Dashboard** | Tasks Due Soon card, Required items card, Outstanding required alert. Entry to Tasks via "View all tasks". |
| **Wrap Production** | Task readiness is part of wrap checks (if integrated). Tasks can represent closeout items. |
| **Productions** | Tasks are production-scoped. Duplicating a production copies its tasks. Task templates are global; they are applied from the Tasks page to the current production. |

---

## Part II — Developer guide

### 8. Architecture and file layout

```
src/
├── features/readiness/
│   ├── page.tsx              # Tasks page: table, dialogs, filters, collapse state, template/apply buttons
│   └── task-template-ui.tsx  # TaskTemplatesSheet, TaskTemplateEditorSheet, ApplyTemplateDialog
├── lib/
│   ├── db/repositories/
│   │   ├── tasks.ts          # CRUD, listTasksByProduction, listTasksByProductionWithFilters, listTasksDueSoonByProduction
│   │   ├── taskSections.ts   # Section CRUD, listTaskSectionsByProduction
│   │   └── taskTemplates.ts # Template CRUD, template items, applyTaskTemplateToProduction
│   ├── db/types.ts           # ProductionTask, ProductionTaskSection, TaskTemplate, TaskTemplateItem
│   ├── productions/
│   │   └── departments.ts   # PRODUCTION_DEPARTMENTS constant
│   └── tasks/
│       ├── tree.ts           # buildTaskTree, flattenTaskTreeForDisplay, getSubtaskProgress, getDescendantTaskIds
│       └── templatesTree.ts  # buildTemplateItemTree, flattenTemplateItemTreeForDisplay
```

### 9. Data model

**Production tasks and sections**

- **Table:** `production_tasks`
- **Columns:** id, production_id (FK CASCADE), description, is_complete (0/1), notes, due_date (YYYY-MM-DD), assigned_department, priority (1/2/3 or NULL), parent_task_id (self-ref, NULL = top-level), section_id (FK to production_task_sections or NULL), created_at, updated_at, deleted_at
- **Table:** `production_task_sections` — id, production_id, name, sort_order, created_at, updated_at, deleted_at
- **Types:** ProductionTask, ProductionTaskSection — see [src/lib/db/types.ts](src/lib/db/types.ts).

**Task templates (global)**

- **Table:** `task_templates` — id, name, description (nullable), created_at, updated_at, deleted_at
- **Table:** `task_template_items` — id, task_template_id (FK), description, notes, due_offset_days, assigned_department, priority (1/2/3 or NULL), section_name (nullable), parent_template_item_id (self-ref, nullable), sort_order, created_at, updated_at, deleted_at
- **Types:** TaskTemplate, TaskTemplateItem — see [src/lib/db/types.ts](src/lib/db/types.ts). Templates are not production-scoped; items define section_name so that when a template is applied, sections can be created or matched by name.

### 10. Repository functions

**Tasks:** [src/lib/db/repositories/tasks.ts](src/lib/db/repositories/tasks.ts)

| Function | Purpose |
|----------|---------|
| `listTasksByProduction(productionId)` | All tasks, default sort, no filters. |
| `listTasksByProductionWithFilters(productionId, filters)` | Filtered list (search, status, department, priority, due timing). |
| `listTasksDueSoonByProduction(productionId)` | Incomplete tasks, overdue/due soon first, limit 10. For Dashboard. |
| `createTask(data)` | Insert task. Supports parent_task_id, section_id. |
| `updateTask(id, patch)` | Partial update. |
| `deleteTask(id)` | Soft-delete task and all descendants (runInSerializedTransaction + executeBatch). See [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md). |

**Task sections:** [src/lib/db/repositories/taskSections.ts](src/lib/db/repositories/taskSections.ts) — listTaskSectionsByProduction, createTaskSection, updateTaskSection, deleteTaskSection, assignTaskToSection (updateTaskSectionWithDescendants).

**Task templates:** [src/lib/db/repositories/taskTemplates.ts](src/lib/db/repositories/taskTemplates.ts)

| Function | Purpose |
|----------|---------|
| `listTaskTemplates()` | All non-deleted templates (global). |
| `getTaskTemplateWithItems(taskTemplateId)` | Template plus its items (non-deleted). |
| `createTaskTemplate({ name, description? })` | Create template. |
| `updateTaskTemplate(id, patch)` | Partial update (name, description). |
| `deleteTaskTemplate(id)` | Soft-delete template. |
| `createTaskTemplateItem(data)` | Add item (supports parent_template_item_id, section_name, due_offset_days, etc.). |
| `updateTaskTemplateItem(id, patch)` | Partial update. |
| `deleteTaskTemplateItem(id)` | Soft-delete item. |
| `applyTaskTemplateToProduction({ productionId, taskTemplateId, anchorDate? })` | Create production_tasks from template items; create/reuse sections by section_name; preserve parent/child; set due_date from anchorDate + due_offset_days when both present. Uses runInSerializedTransaction + executeBatch. |

### 11. Tree helpers

**Tasks:** [src/lib/tasks/tree.ts](src/lib/tasks/tree.ts)

| Helper | Purpose |
|--------|---------|
| `buildTaskTree(tasks)` | Build parent-child tree from flat list. Orphaned subtasks treated as top-level. |
| `flattenTaskTreeForDisplay(nodes, depth)` | Flatten tree for display with depth. |
| `getSubtaskProgress(taskId, tasks)` | Return { complete, total } for a parent's subtasks. |
| `getDescendantTaskIds(taskId, tasks)` | Recursive list of descendant IDs. |

**Templates:** [src/lib/tasks/templatesTree.ts](src/lib/tasks/templatesTree.ts)

| Helper | Purpose |
|--------|---------|
| `buildTemplateItemTree(items)` | Build tree from flat template items (parent_template_item_id). |
| `flattenTemplateItemTreeForDisplay(nodes, depth)` | Flatten for display with depth. |

### 12. Query keys and invalidation

- **Tasks:** `['tasks', productionId]`, `['tasks', productionId, filters]`. Invalidate `['tasks']` on task create/update/delete and after applying a template.
- **Sections:** `['taskSections', productionId]`. Invalidate on section changes and after applying a template.
- **Templates:** `['taskTemplates']` for list; `['taskTemplate', templateId]` for template + items. Invalidate on template/item CRUD.

### 13. UI state (page only)

- `collapsedTaskIds: Set<string>` — Parent task IDs whose subtasks are collapsed. UI-only; not persisted.
- Filtering of flattened tree: exclude tasks whose ancestor is in `collapsedTaskIds`.
- `templatesOpen`, `applyTemplateOpen`, `editingTemplateId` — control Templates sheet, Apply Template dialog, and Template Editor sheet.

---

## Part III — Reference

### 14. Router and navigation

- **Route:** `{ path: 'readiness', element: <ReadinessPage /> }` in [src/app/router.tsx](src/app/router.tsx).
- **Navigation:** "Tasks" at `/readiness`, FileCheck icon in [src/app/navigation.ts](src/app/navigation.ts).

### 15. Departments

- **Source:** [src/lib/productions/departments.ts](src/lib/productions/departments.ts).
- **Values:** Production, Producers, Direction, Camera, Grip, Electrical, Sound, Art Department, Locations, Wardrobe, Hair & Make-up, Special Effects, Post Production, Accounts, Legal, Publicity / Marketing, Transport, AD Department, Cast, Other.

### 16. Gaps and future work

- No task assignment to users.
- No task → entity linking (e.g. link task to a person, location, or document).
- Task templates are not yet integrated into production creation (templates are applied only from the Tasks page).
- No template sharing, import/export, or recurring task generation.
- No drag-and-drop reordering.
- Expand/collapse state is not persisted.
- Wrap Production may integrate task readiness more deeply in future.

---

## Cross-references

- [docs/wrap-production.md](docs/wrap-production.md) — Wrap workflow and closeout checks.
- [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md) — Transaction patterns for multi-statement writes.
- [docs/budget.md](docs/budget.md) — Budget and actualisation (if budget/task overlap exists).
