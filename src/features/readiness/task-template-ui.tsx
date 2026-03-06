'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTaskTemplates,
  getTaskTemplateWithItems,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  createTaskTemplateItem,
  updateTaskTemplateItem,
  deleteTaskTemplateItem,
  type CreateTaskTemplateData,
  type UpdateTaskTemplatePatch,
  type CreateTaskTemplateItemData,
  type UpdateTaskTemplateItemPatch,
} from '@/lib/db/repositories/taskTemplates'
import {
  buildTemplateItemTree,
  flattenTemplateItemTreeForDisplay,
} from '@/lib/tasks/templatesTree'
import { PRODUCTION_DEPARTMENTS } from '@/lib/productions/departments'
import type { TaskTemplateItem } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Pencil, Trash2, ListTree } from 'lucide-react'

export function TaskTemplatesSheet({
  open,
  onOpenChange,
  onEditTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditTemplate: (templateId: string) => void
}) {
  const queryClient = useQueryClient()
  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: listTaskTemplates,
    enabled: open,
  })
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskTemplateData) => createTaskTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTemplates'] })
      setNewName('')
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskTemplatePatch }) =>
      updateTaskTemplate(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTemplates'] })
      setEditingId(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteTaskTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taskTemplates'] }),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Task Templates</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex gap-2">
            <Input
              placeholder="New template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && createMutation.mutate({ name: newName.trim() })
              }
            />
            <Button
              onClick={() => createMutation.mutate({ name: newName.trim() })}
              disabled={!newName.trim() || createMutation.isPending}
            >
              Add
            </Button>
          </div>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                {editingId === t.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          updateMutation.mutate({
                            id: t.id,
                            patch: { name: editingName.trim() },
                          })
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({
                          id: t.id,
                          patch: { name: editingName.trim() },
                        })
                      }
                      disabled={
                        !editingName.trim() || updateMutation.isPending
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm font-medium">
                      {t.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditTemplate(t.id)}
                    >
                      Edit items
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => {
                        setEditingId(t.id)
                        setEditingName(t.name)
                      }}
                      aria-label="Rename"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() =>
                        window.confirm('Delete this template?') &&
                        deleteMutation.mutate(t.id)
                      }
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No templates yet. Add one above.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function TaskTemplateEditorSheet({
  templateId,
  onClose,
}: {
  templateId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['taskTemplate', templateId],
    queryFn: () => getTaskTemplateWithItems(templateId),
    enabled: !!templateId,
  })
  const [addFormParentId, setAddFormParentId] = useState<
    string | null | undefined
  >(undefined)
  const [editItem, setEditItem] = useState<TaskTemplateItem | null>(null)

  const createItemMutation = useMutation({
    mutationFn: (d: CreateTaskTemplateItemData) => createTaskTemplateItem(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTemplate', templateId] })
      setAddFormParentId(undefined)
    },
  })
  const updateItemMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: UpdateTaskTemplateItemPatch
    }) => updateTaskTemplateItem(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTemplate', templateId] })
    },
  })
  const deleteItemMutation = useMutation({
    mutationFn: deleteTaskTemplateItem,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['taskTemplate', templateId] }),
  })

  const tree = useMemo(
    () => (data?.items ? buildTemplateItemTree(data.items) : []),
    [data?.items]
  )
  const flat = useMemo(
    () => flattenTemplateItemTreeForDisplay(tree),
    [tree]
  )

  if (isLoading || !data) {
    return (
      <Sheet open onOpenChange={() => onClose()}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Loading...</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit template: {data.template.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setAddFormParentId(null)}
              disabled={createItemMutation.isPending}
            >
              Add item
            </Button>
          </div>
          {addFormParentId === null && (
            <NewTemplateItemForm
              templateId={templateId}
              parentId={null}
              onCancel={() => setAddFormParentId(undefined)}
              onSubmit={(d) => {
                createItemMutation.mutate(d)
                setAddFormParentId(undefined)
              }}
              isPending={createItemMutation.isPending}
            />
          )}
          <ul className="space-y-1">
            {flat.map(({ item, depth }) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded border p-2"
                style={{ marginLeft: depth * 16 }}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{item.description}</span>
                  {item.section_name && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {item.section_name}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setAddFormParentId(item.id)}
                  title="Add subtask"
                  aria-label="Add subtask"
                >
                  <ListTree className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setEditItem(item)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  onClick={() => deleteItemMutation.mutate(item.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          {addFormParentId !== undefined && addFormParentId !== null && (
            <NewTemplateItemForm
              templateId={templateId}
              parentId={addFormParentId}
              onCancel={() => setAddFormParentId(undefined)}
              onSubmit={(d) => {
                createItemMutation.mutate(d)
                setAddFormParentId(undefined)
              }}
              isPending={createItemMutation.isPending}
            />
          )}
          {editItem && (
            <EditTemplateItemDialog
              item={editItem}
              onClose={() => setEditItem(null)}
              onSave={(patch) =>
                updateItemMutation.mutate({ id: editItem.id, patch })
              }
              isPending={updateItemMutation.isPending}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NewTemplateItemForm({
  templateId,
  parentId,
  onCancel,
  onSubmit,
  isPending,
}: {
  templateId: string
  parentId: string | null
  onCancel: () => void
  onSubmit: (data: CreateTaskTemplateItemData) => void
  isPending: boolean
}) {
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [dueOffsetDays, setDueOffsetDays] = useState('')
  const [department, setDepartment] = useState<string | null>(null)
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(null)
  const [sectionName, setSectionName] = useState('')

  const handleSubmit = () => {
    onSubmit({
      task_template_id: templateId,
      description: description.trim(),
      notes: notes.trim() || null,
      due_offset_days: dueOffsetDays ? parseInt(dueOffsetDays, 10) : null,
      assigned_department: department,
      priority,
      section_name: sectionName.trim() || null,
      parent_template_item_id: parentId,
    })
    setDescription('')
    setNotes('')
    setDueOffsetDays('')
    setDepartment(null)
    setPriority(null)
    setSectionName('')
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {parentId ? 'Add subtask' : 'Add template item'}
      </p>
      <Input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <Input
          placeholder="Due offset (days)"
          type="number"
          value={dueOffsetDays}
          onChange={(e) => setDueOffsetDays(e.target.value)}
        />
        <Input
          placeholder="Section name"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
        />
      </div>
      <Select
        value={department ?? 'none'}
        onValueChange={(v) => setDepartment(v === 'none' ? null : v)}
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {PRODUCTION_DEPARTMENTS.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={priority?.toString() ?? 'none'}
        onValueChange={(v) =>
          setPriority(v === 'none' ? null : (parseInt(v, 10) as 1 | 2 | 3))
        }
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="1">High</SelectItem>
          <SelectItem value="2">Medium</SelectItem>
          <SelectItem value="3">Low</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!description.trim() || isPending}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function EditTemplateItemDialog({
  item,
  onClose,
  onSave,
  isPending,
}: {
  item: TaskTemplateItem
  onClose: () => void
  onSave: (patch: UpdateTaskTemplateItemPatch) => void
  isPending: boolean
}) {
  const [description, setDescription] = useState(item.description)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [dueOffsetDays, setDueOffsetDays] = useState(
    item.due_offset_days?.toString() ?? ''
  )
  const [department, setDepartment] = useState<string | null>(
    item.assigned_department
  )
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(item.priority)
  const [sectionName, setSectionName] = useState(item.section_name ?? '')

  const handleSave = () => {
    onSave({
      description,
      notes: notes || null,
      due_offset_days: dueOffsetDays ? parseInt(dueOffsetDays, 10) : null,
      assigned_department: department,
      priority,
      section_name: sectionName || null,
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit template item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Due offset (days)</Label>
            <Input
              type="number"
              value={dueOffsetDays}
              onChange={(e) => setDueOffsetDays(e.target.value)}
            />
          </div>
          <div>
            <Label>Section name</Label>
            <Input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
            />
          </div>
          <Select
            value={department ?? 'none'}
            onValueChange={(v) => setDepartment(v === 'none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {PRODUCTION_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priority?.toString() ?? 'none'}
            onValueChange={(v) =>
              setPriority(v === 'none' ? null : (parseInt(v, 10) as 1 | 2 | 3))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!description.trim() || isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ApplyTemplateDialog({
  productionId,
  open,
  onOpenChange,
  onApply,
  isPending,
}: {
  productionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (params: {
    productionId: string
    taskTemplateId: string
    anchorDate?: string | null
  }) => void
  isPending: boolean
}) {
  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: listTaskTemplates,
    enabled: open,
  })
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [anchorDate, setAnchorDate] = useState('')

  const handleApply = () => {
    onApply({
      productionId,
      taskTemplateId: selectedTemplateId,
      anchorDate: anchorDate || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Template</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create tasks from a template. Optional anchor date for due offsets.
          </p>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Template</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Anchor date (optional)</Label>
            <Input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              If omitted, tasks with due offsets get null due dates.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedTemplateId || isPending}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
