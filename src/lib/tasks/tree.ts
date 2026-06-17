import type { ProductionTask } from '@/lib/db/types'

export type TaskTreeNode = {
  task: ProductionTask
  children: TaskTreeNode[]
}

/**
 * Build a tree from a flat list of tasks. Parents appear before children.
 * Orphaned subtasks (parent not in list) are treated as top-level.
 */
export function buildTaskTree(tasks: ProductionTask[]): TaskTreeNode[] {
  const byId = new Map<string, ProductionTask>()
  for (const t of tasks) byId.set(t.id, t)

  const roots: TaskTreeNode[] = []
  const byParent = new Map<string | null, ProductionTask[]>()
  byParent.set(null, [])

  for (const t of tasks) {
    // If parent is not in the list (e.g. filtered out), treat as top-level
    const parentId =
      t.parent_task_id && byId.has(t.parent_task_id) ? t.parent_task_id : null
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId)!.push(t)
  }

  function addChildren(parentId: string | null, parentList: TaskTreeNode[]) {
    const children = byParent.get(parentId) ?? []
    for (const t of children) {
      const node: TaskTreeNode = { task: t, children: [] }
      addChildren(t.id, node.children)
      parentList.push(node)
    }
  }

  addChildren(null, roots)
  return roots
}

/**
 * Flatten the tree for display, preserving parent-before-child order.
 * Returns tasks with their depth (0 = top-level, 1 = first level of subtask, etc.).
 */
export function flattenTaskTreeForDisplay(
  nodes: TaskTreeNode[],
  depth = 0
): Array<{ task: ProductionTask; depth: number }> {
  const out: Array<{ task: ProductionTask; depth: number }> = []
  for (const node of nodes) {
    out.push({ task: node.task, depth })
    out.push(...flattenTaskTreeForDisplay(node.children, depth + 1))
  }
  return out
}

/**
 * Get all descendant task IDs for a given task (recursive).
 */
export function getDescendantTaskIds(taskId: string, tasks: ProductionTask[]): string[] {
  const ids: string[] = []
  const children = tasks.filter((t) => t.parent_task_id === taskId)
  for (const c of children) {
    ids.push(c.id)
    ids.push(...getDescendantTaskIds(c.id, tasks))
  }
  return ids
}

/**
 * Resolve which section a task belongs to for display grouping.
 * Subtasks without a section inherit their parent's section.
 */
export function resolveTaskSectionId(
  task: ProductionTask,
  tasksById: Map<string, ProductionTask>
): string | null {
  const visited = new Set<string>()
  let current: ProductionTask | undefined = task
  while (current) {
    if (current.section_id) return current.section_id
    if (!current.parent_task_id || visited.has(current.id)) return null
    visited.add(current.id)
    current = tasksById.get(current.parent_task_id)
  }
  return null
}

/**
 * Get subtask progress for a parent task: { complete, total }.
 */
export function getSubtaskProgress(taskId: string, tasks: ProductionTask[]): { complete: number; total: number } {
  const children = tasks.filter((t) => t.parent_task_id === taskId)
  if (children.length === 0) return { complete: 0, total: 0 }
  const complete = children.filter((t) => t.is_complete === 1).length
  return { complete, total: children.length }
}
