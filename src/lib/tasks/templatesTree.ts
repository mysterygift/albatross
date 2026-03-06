import type { TaskTemplateItem } from '@/lib/db/types'

export type TemplateItemTreeNode = {
  item: TaskTemplateItem
  children: TemplateItemTreeNode[]
}

/**
 * Build a tree from a flat list of template items. Parents appear before children.
 * Orphaned items (parent not in list) are treated as top-level.
 */
export function buildTemplateItemTree(items: TaskTemplateItem[]): TemplateItemTreeNode[] {
  const byId = new Map<string, TaskTemplateItem>()
  for (const i of items) byId.set(i.id, i)

  const roots: TemplateItemTreeNode[] = []
  const byParent = new Map<string | null, TaskTemplateItem[]>()
  byParent.set(null, [])

  for (const i of items) {
    const parentId =
      i.parent_template_item_id && byId.has(i.parent_template_item_id)
        ? i.parent_template_item_id
        : null
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId)!.push(i)
  }

  function addChildren(parentId: string | null, parentList: TemplateItemTreeNode[]) {
    const children = byParent.get(parentId) ?? []
    for (const i of children) {
      const node: TemplateItemTreeNode = { item: i, children: [] }
      addChildren(i.id, node.children)
      parentList.push(node)
    }
  }

  addChildren(null, roots)
  return roots
}

/**
 * Flatten the tree for display, preserving parent-before-child order.
 * Returns items with their depth (0 = top-level, 1 = first level of subtask, etc.).
 */
export function flattenTemplateItemTreeForDisplay(
  nodes: TemplateItemTreeNode[],
  depth = 0
): Array<{ item: TaskTemplateItem; depth: number }> {
  const out: Array<{ item: TaskTemplateItem; depth: number }> = []
  for (const node of nodes) {
    out.push({ item: node.item, depth })
    out.push(...flattenTemplateItemTreeForDisplay(node.children, depth + 1))
  }
  return out
}
