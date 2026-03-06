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
import { Plus, Trash2, Pencil } from 'lucide-react'

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
  const [editTask, setEditTask] = useState<ProductionTask | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskFilters['status']>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<1 | 2 | 3 | null>(null)
  const [dueTimingFilter, setDueTimingFilter] = useState<TaskFilters['dueTiming']>('all')

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

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', currentProductionId, filters],
    queryFn: () =>
      listTasksByProductionWithFilters(currentProductionId ?? '', filters),
    enabled: !!currentProductionId,
  })

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-muted-foreground">Production tasks and deadlines</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="secondary">Score: {score}%</Badge>
          <NewTaskDialog
            productionId={currentProductionId}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSubmit={(data) => createMutation.mutate(data)}
            isPending={createMutation.isPending}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskFilters['status'])}>
          <SelectTrigger className="w-[130px]">
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
          <SelectTrigger className="w-[160px]">
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
          <SelectTrigger className="w-[120px]">
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
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Due" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due_soon">Due soon</SelectItem>
            <SelectItem value="no_due_date">No due date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <span className="font-medium">{task.description}</span>
                  {task.notes && (
                    <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-[200px]">
                      {task.notes}
                    </p>
                  )}
                </TableCell>
                <TableCell>{task.assigned_department ?? '—'}</TableCell>
                <TableCell>{formatDueDate(task.due_date)}</TableCell>
                <TableCell>
                  {task.priority ? (
                    <Badge variant={task.priority === 1 ? 'destructive' : 'secondary'}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
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
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditTask(task)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(task.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  productionId: string
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Description (required)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Budget approved"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={2}
            />
          </div>
          <div>
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={department ?? 'none'} onValueChange={(v) => setDepartment(v === 'none' ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
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
          <div>
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
        <DialogFooter>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
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
          <div>
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-complete"
              checked={isComplete}
              onCheckedChange={(v) => setIsComplete(!!v)}
            />
            <Label htmlFor="edit-complete">Complete</Label>
          </div>
        </div>
        <DialogFooter>
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
