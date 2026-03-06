import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listTasksByProductionWithFilters,
  listTasksByProduction,
  createTask,
  updateTask,
  deleteTask,
  type TaskFilters,
  type CreateTaskData,
  type UpdateTaskPatch,
} from '@/lib/db/repositories/tasks'
import { buildTaskTree, flattenTaskTreeForDisplay, getSubtaskProgress } from '@/lib/tasks/tree'
import { PRODUCTION_DEPARTMENTS } from '@/lib/productions/departments'
import type { ProductionTask } from '@/lib/db/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Pencil, ListTree, Search, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
}

function formatDueDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

export function ReadinessPage() {
  const { currentProductionId } = useCurrentProduction()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [addSubtaskParent, setAddSubtaskParent] = useState<ProductionTask | null>(null)
  const [editTask, setEditTask] = useState<ProductionTask | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskFilters['status']>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<1 | 2 | 3 | null>(null)
  const [dueTimingFilter, setDueTimingFilter] = useState<TaskFilters['dueTiming']>('all')
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set())

  const filters: TaskFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter,
      department: departmentFilter,
      priority: priorityFilter,
      dueTiming: dueTimingFilter,
    }),
    [search, statusFilter, departmentFilter, priorityFilter, dueTimingFilter]
  )

  const { data: filteredTasks = [] } = useQuery({
    queryKey: ['tasks', currentProductionId, filters],
    queryFn: () =>
      listTasksByProductionWithFilters(currentProductionId ?? '', filters),
    enabled: !!currentProductionId,
  })

  const taskTree = useMemo(() => buildTaskTree(filteredTasks), [filteredTasks])
  const flattenedTasks = useMemo(
    () => flattenTaskTreeForDisplay(taskTree),
    [taskTree]
  )

  const taskById = useMemo(
    () => new Map(filteredTasks.map((t) => [t.id, t])),
    [filteredTasks]
  )

  function isTaskHiddenByCollapse(task: ProductionTask, depth: number): boolean {
    if (depth === 0) return false
    let pid: string | null = task.parent_task_id
    while (pid) {
      if (collapsedTaskIds.has(pid)) return true
      const p = taskById.get(pid)
      if (!p) break
      pid = p.parent_task_id
    }
    return false
  }

  const tasksForDisplay = useMemo(
    () =>
      flattenedTasks.filter(
        ({ task, depth }) => !isTaskHiddenByCollapse(task, depth)
      ),
    [flattenedTasks, collapsedTaskIds, taskById]
  )

  function toggleCollapsed(taskId: string) {
    setCollapsedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', currentProductionId],
    queryFn: () => listTasksByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const complete = allTasks.filter((t) => t.is_complete === 1).length
  const total = allTasks.length
  const score = total === 0 ? 100 : Math.round((complete / total) * 100)

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskData) => createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskPatch }) =>
      updateTask(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditTask(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  const hasActiveFilters =
    search.trim() ||
    statusFilter !== 'all' ||
    departmentFilter ||
    priorityFilter ||
    dueTimingFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setDepartmentFilter(null)
    setPriorityFilter(null)
    setDueTimingFilter('all')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground text-sm">Production tasks and deadlines</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-medium tabular-nums">
            {score}% complete
          </Badge>
          <NewTaskDialog
            productionId={currentProductionId}
            parentTaskId={addSubtaskParent?.id ?? null}
            open={createOpen || !!addSubtaskParent}
            onOpenChange={(open) => {
              setCreateOpen(open)
              if (!open) setAddSubtaskParent(null)
            }}
            onSubmit={(data) => {
              createMutation.mutate(data)
              setAddSubtaskParent(null)
            }}
            isPending={createMutation.isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskFilters['status'])}>
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={departmentFilter ?? 'all'}
            onValueChange={(v) => setDepartmentFilter(v === 'all' ? null : v)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {PRODUCTION_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter?.toString() ?? 'all'}
            onValueChange={(v) =>
              setPriorityFilter(v === 'all' ? null : (parseInt(v, 10) as 1 | 2 | 3))
            }
          >
            <SelectTrigger className="h-9 w-[100px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={dueTimingFilter}
            onValueChange={(v) => setDueTimingFilter(v as TaskFilters['dueTiming'])}
          >
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue placeholder="Due" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_soon">Due soon</SelectItem>
              <SelectItem value="no_due_date">No due date</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Description</TableHead>
              <TableHead className="w-[140px]">Department</TableHead>
              <TableHead className="w-[110px]">Due date</TableHead>
              <TableHead className="w-[90px]">Priority</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[100px] pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasksForDisplay.length === 0 ? (
              <TableRow className="hover:bg-transparent border-0">
                <TableCell colSpan={6} className="py-16 text-center">
                  {allTasks.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground font-medium">No tasks yet.</p>
                      <p className="text-muted-foreground text-sm">
                        Create your first task to get started.
                      </p>
                    </div>
                  ) : total > 0 && complete === total ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground font-medium">All tasks complete.</p>
                      <p className="text-muted-foreground text-sm">
                        Great work. Clear filters to see all tasks.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground font-medium">No tasks match the current filters.</p>
                      <p className="text-muted-foreground text-sm">
                        Try adjusting your search or filters.
                      </p>
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1">
                        Clear filters
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              tasksForDisplay.map(({ task, depth }) => {
                const prog = getSubtaskProgress(task.id, filteredTasks)
                const isParent = prog.total > 0
                return (
                  <TableRow
                    key={task.id}
                    className={cn(
                      'transition-opacity duration-200 ease-out',
                      task.is_complete && 'opacity-60',
                      !task.is_complete && 'opacity-100',
                      depth > 0 && 'bg-muted/15',
                      isParent && depth === 0 && 'bg-muted/10'
                    )}
                  >
                    <TableCell className="py-3 pl-4 align-top">
                      <div
                        className="flex items-start gap-2"
                        style={
                          depth > 0
                            ? {
                                paddingLeft: `${depth * 16}px`,
                                borderLeft: '1px solid var(--border)',
                                marginLeft: '8px',
                              }
                            : undefined
                        }
                      >
                        {depth > 0 && (
                          <span className="text-muted-foreground/70 shrink-0 mt-0.5" aria-hidden>
                            <ListTree className="size-3.5" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <span
                            className={`
                              font-medium transition-all duration-200 ease-out
                              ${task.is_complete ? 'line-through text-muted-foreground' : ''}
                              ${depth > 0 ? 'text-sm' : ''}
                            `}
                          >
                            {task.description}
                          </span>
                          {isParent && (
                            <p className="text-muted-foreground text-xs mt-1">
                              {prog.complete} / {prog.total} subtasks complete
                            </p>
                          )}
                          {task.notes && (
                            <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-[220px]">
                              {task.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground text-sm align-top">
                      {task.assigned_department ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground text-sm align-top">
                      {formatDueDate(task.due_date)}
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      {task.priority ? (
                        <Badge
                          variant={task.priority === 1 ? 'destructive' : 'secondary'}
                          className="font-normal text-xs"
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium transition-colors"
                        onClick={() =>
                          updateMutation.mutate({
                            id: task.id,
                            patch: { is_complete: task.is_complete ? 0 : 1 },
                          })
                        }
                      >
                        {task.is_complete ? 'Complete' : 'Incomplete'}
                      </Button>
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        {isParent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => toggleCollapsed(task.id)}
                            aria-expanded={!collapsedTaskIds.has(task.id)}
                            aria-label={
                              collapsedTaskIds.has(task.id)
                                ? 'Expand subtasks'
                                : 'Collapse subtasks'
                            }
                            title={
                              collapsedTaskIds.has(task.id)
                                ? 'Expand subtasks'
                                : 'Collapse subtasks'
                            }
                          >
                            <ChevronDown
                              className={`size-4 transition-transform duration-150 ease-out ${
                                collapsedTaskIds.has(task.id) ? '-rotate-90' : ''
                              }`}
                              aria-hidden
                            />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => setAddSubtaskParent(task)}
                          title="Add subtask"
                          aria-label="Add subtask"
                        >
                          <ListTree className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEditTask(task)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(task.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {editTask && (
        <EditTaskDialog
          task={editTask}
          onClose={() => setEditTask(null)}
          onSave={(patch) =>
            updateMutation.mutate({ id: editTask.id, patch })
          }
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  )
}

function NewTaskDialog({
  productionId,
  parentTaskId,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  productionId: string
  parentTaskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateTaskData) => void
  isPending: boolean
}) {
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [department, setDepartment] = useState<string | null>(null)
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(null)

  const handleSubmit = () => {
    onSubmit({
      production_id: productionId,
      description: description.trim(),
      notes: notes.trim() || null,
      due_date: dueDate || null,
      assigned_department: department || null,
      priority,
      parent_task_id: parentTaskId,
    })
    setDescription('')
    setNotes('')
    setDueDate('')
    setDepartment(null)
    setPriority(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-1.5">
          <DialogTitle>{parentTaskId ? 'Add subtask' : 'New task'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-desc">Description (required)</Label>
            <Input
              id="new-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Budget approved"
              className="transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-notes">Notes</Label>
            <Textarea
              id="new-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={2}
              className="resize-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-due">Due date</Label>
              <Input
                id="new-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={department ?? 'none'} onValueChange={(v) => setDepartment(v === 'none' ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
            </div>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={priority?.toString() ?? 'none'}
              onValueChange={(v) =>
                setPriority(v === 'none' ? null : (parseInt(v, 10) as 1 | 2 | 3))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="1">High</SelectItem>
                <SelectItem value="2">Medium</SelectItem>
                <SelectItem value="3">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isPending}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTaskDialog({
  task,
  onClose,
  onSave,
  isPending,
}: {
  task: ProductionTask
  onClose: () => void
  onSave: (patch: UpdateTaskPatch) => void
  isPending: boolean
}) {
  const [description, setDescription] = useState(task.description)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [department, setDepartment] = useState<string | null>(task.assigned_department)
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(task.priority)
  const [isComplete, setIsComplete] = useState(task.is_complete === 1)

  const handleSave = () => {
    onSave({
      description: description.trim(),
      notes: notes.trim() || null,
      due_date: dueDate || null,
      assigned_department: department || null,
      priority,
      is_complete: isComplete ? 1 : 0,
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-1.5">
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-due">Due date</Label>
              <Input
                id="edit-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={department ?? 'none'} onValueChange={(v) => setDepartment(v === 'none' ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={priority?.toString() ?? 'none'}
              onValueChange={(v) =>
                setPriority(v === 'none' ? null : (parseInt(v, 10) as 1 | 2 | 3))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="1">High</SelectItem>
                <SelectItem value="2">Medium</SelectItem>
                <SelectItem value="3">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="edit-complete"
              checked={isComplete}
              onCheckedChange={(v) => setIsComplete(!!v)}
              className="transition-opacity"
            />
            <Label htmlFor="edit-complete" className="text-sm font-medium cursor-pointer">
              Mark as complete
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!description.trim() || isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
