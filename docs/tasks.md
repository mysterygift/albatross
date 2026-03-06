# Tasks

This document is both a **user guide** (how to use the Tasks feature) and a **developer guide** (architecture, data model, and implementation). It describes the production-scoped task management system for film and TV productions.

---

## Table of contents

**Part I — User guide**

- [1. Overview and purpose](#1-overview-and-purpose)
- [2. Key features](#2-key-features)
- [3. Fundamental workflow](#3-fundamental-workflow)
- [4. Dashboard integration](#4-dashboard-integration)
- [5. Film/TV production use cases](#5-filmtv-production-use-cases)
- [6. Relationships and connections to other pages](#6-relationships-and-connections-to-other-pages)

**Part II — Developer guide**

- [7. Architecture and file layout](#7-architecture-and-file-layout)
- [8. Data model](#8-data-model)
- [9. Repository functions](#9-repository-functions)
- [10. Tree helpers](#10-tree-helpers)
- [11. Query keys and invalidation](#11-query-keys-and-invalidation)
- [12. UI state (page only)](#12-ui-state-page-only)

**Part III — Reference**

- [13. Router and navigation](#13-router-and-navigation)
- [14. Departments](#14-departments)
- [15. Gaps and future work](#15-gaps-and-future-work)

---

## Part I — User guide

### 1. Overview and purpose

- **Purpose:** Tasks is a production-scoped task management system for tracking work items, deadlines, and completion status across a film or TV production.
- **Route:** `/readiness` (see [src/app/router.tsx](src/app/router.tsx)).
- **Navigation:** "Tasks" (FileCheck icon) in app nav ([src/app/navigation.ts](src/app/navigation.ts)).
- **Context:** Requires a current production. Shows "Select a production first." if none selected.
- **Scope:** All tasks are scoped to the current production. Tasks support nesting (parent/subtask), priority, department assignment, due dates, and notes.

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

### 4. Dashboard integration

| Card / element | Relationship |
|----------------|---------------|
| **Tasks Due Soon** | Shows incomplete tasks (high-priority first, then overdue, due soon). Displays up to ~6 tasks with priority badges (High/Medium/Low). "View all tasks" links to `/readiness`. |
| **Required items** | Shows completion of high-priority (priority 1) tasks: X% complete, Y / Z required. |
| **Outstanding required alert** | Lists incomplete high-priority tasks when any exist. |

### 5. Film/TV production use cases

| Use case | How Tasks supports it |
|----------|------------------------|
| **Pre-production checklist** | Create tasks for permits, contracts, location agreements, cast availability. Use departments (Locations, Legal, Cast) and due dates. |
| **Department handoffs** | Assign tasks to departments (Camera, Sound, Art Department). Track completion before shoot. |
| **Post-production deliverables** | Parent task "Final delivery" with subtasks: picture lock, sound mix, colour grade, QC, delivery to broadcaster. |
| **Wrap and closeout** | Tasks feed into Wrap Production readiness. High-priority tasks surface as "required" on Dashboard. |
| **Shoot-day prep** | Tasks for call sheets, equipment checks, crew call times. Filter by due soon. |
| **Compliance and legal** | Legal department tasks (contracts, clearances). Priority 1 for must-complete items. |

### 6. Relationships and connections to other pages

| Page | Relationship |
|------|--------------|
| **Dashboard** | Tasks Due Soon card, Required items card, Outstanding required alert. Entry to Tasks via "View all tasks". |
| **Wrap Production** | Task readiness is part of wrap checks (if integrated). Tasks can represent closeout items. |
| **Productions** | Tasks are production-scoped. Duplicating a production copies its tasks. |

---

## Part II — Developer guide

### 7. Architecture and file layout

```
src/
├── features/readiness/
│   └── page.tsx              # Tasks page: table, dialogs, filters, collapse state
├── lib/
│   ├── db/repositories/
│   │   └── tasks.ts          # CRUD, listTasksByProduction, listTasksByProductionWithFilters, listTasksDueSoonByProduction
│   ├── db/types.ts           # ProductionTask type
│   ├── productions/
│   │   └── departments.ts    # PRODUCTION_DEPARTMENTS constant
│   └── tasks/
│       └── tree.ts           # buildTaskTree, flattenTaskTreeForDisplay, getSubtaskProgress, getDescendantTaskIds
```

### 8. Data model

- **Table:** `production_tasks`
- **Columns:** id, production_id (FK CASCADE), description, is_complete (0/1), notes, due_date (YYYY-MM-DD), assigned_department, priority (1/2/3 or NULL), parent_task_id (self-ref, NULL = top-level), created_at, updated_at, deleted_at
- **ProductionTask type:** See [src/lib/db/types.ts](src/lib/db/types.ts).

### 9. Repository functions

| Function | Purpose |
|----------|---------|
| `listTasksByProduction(productionId)` | All tasks, default sort, no filters. |
| `listTasksByProductionWithFilters(productionId, filters)` | Filtered list (search, status, department, priority, due timing). |
| `listTasksDueSoonByProduction(productionId)` | Incomplete tasks, overdue/due soon first, limit 10. For Dashboard. |
| `createTask(data)` | Insert task. Supports parent_task_id for subtasks. |
| `updateTask(id, patch)` | Partial update. |
| `deleteTask(id)` | Soft-delete task and all descendants (runInSerializedTransaction + executeBatch). See [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md) for transaction patterns. |

### 10. Tree helpers

| Helper | Purpose |
|--------|---------|
| `buildTaskTree(tasks)` | Build parent-child tree from flat list. Orphaned subtasks treated as top-level. |
| `flattenTaskTreeForDisplay(nodes, depth)` | Flatten tree for display with depth. |
| `getSubtaskProgress(taskId, tasks)` | Return { complete, total } for a parent's subtasks. |
| `getDescendantTaskIds(taskId, tasks)` | Recursive list of descendant IDs. |

### 11. Query keys and invalidation

- **Read:** `['tasks', productionId]`, `['tasks', productionId, filters]`
- **Mutations:** `queryClient.invalidateQueries({ queryKey: ['tasks'] })` on create/update/delete.

### 12. UI state (page only)

- `collapsedTaskIds: Set<string>` — Parent task IDs whose subtasks are collapsed. UI-only; not persisted.
- Filtering of flattened tree: exclude tasks whose ancestor is in `collapsedTaskIds`.

---

## Part III — Reference

### 13. Router and navigation

- **Route:** `{ path: 'readiness', element: <ReadinessPage /> }` in [src/app/router.tsx](src/app/router.tsx).
- **Navigation:** "Tasks" at `/readiness`, FileCheck icon in [src/app/navigation.ts](src/app/navigation.ts).

### 14. Departments

- **Source:** [src/lib/productions/departments.ts](src/lib/productions/departments.ts).
- **Values:** Production, Producers, Direction, Camera, Grip, Electrical, Sound, Art Department, Locations, Wardrobe, Hair & Make-up, Special Effects, Post Production, Accounts, Legal, Publicity / Marketing, Transport, AD Department, Cast, Other.

### 15. Gaps and future work

- No task assignment to users.
- No recurring tasks.
- No drag-and-drop reordering.
- Expand/collapse state is not persisted.
- Wrap Production may integrate task readiness more deeply in future.

---

## Cross-references

- [docs/wrap-production.md](docs/wrap-production.md) — Wrap workflow and closeout checks.
- [docs/DATABASE_LAYER.md](docs/DATABASE_LAYER.md) — Transaction patterns for multi-statement writes.
- [docs/budget.md](docs/budget.md) — Budget and actualisation (if budget/task overlap exists).
