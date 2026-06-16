import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { tasksTutorialSteps } from '@/features/tutorial/sections/tasksTutorial'
import {
  listTasksByProductionWithFilters,
  listTasksByProduction,
  createTask,
  updateTask,
  updateTaskSectionWithDescendants,
  deleteTask,
  type TaskFilters,
  type CreateTaskData,
  type UpdateTaskPatch,
} from '@/lib/db/repositories/tasks'
import {
  listTaskSectionsByProduction,
  createTaskSection,
  updateTaskSection,
  deleteTaskSection,
  type CreateTaskSectionData,
  type UpdateTaskSectionPatch,
} from '@/lib/db/repositories/taskSections'
import { applyTaskTemplateToProduction } from '@/lib/db/repositories/taskTemplates'
import {
  buildTaskTree,
  flattenTaskTreeForDisplay,
  getSubtaskProgress,
  resolveTaskSectionId,
} from '@/lib/tasks/tree'
import {
  TaskTemplatesSheet,
  TaskTemplateEditorSheet,
  ApplyTemplateDialog,
} from '@/features/readiness/task-template-ui'
import { PRODUCTION_DEPARTMENTS } from '@/lib/productions/departments'
import type { ProductionTask, ProductionTaskSection } from '@/lib/db/types'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Plus, Trash2, Pencil, ListTree, Search, X, ChevronDown, FolderInput, LayoutList, FileStack, Play } from 'lucide-react'
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

function TaskDescriptionLabel({
  description,
  isComplete,
  isStrikeAnimating,
  compact,
}: {
  description: string
  isComplete: boolean
  isStrikeAnimating: boolean
  compact?: boolean
}) {
  const showStrike = isComplete || isStrikeAnimating

  return (
    <span
      className={cn(
        'relative inline max-w-full font-medium transition-colors duration-200 ease-out',
        compact && 'text-sm',
        showStrike && 'text-muted-foreground'
      )}
    >
      {description}
      {showStrike && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0 top-[55%] h-px w-full origin-left -translate-y-1/2 bg-current opacity-75',
            isStrikeAnimating ? 'animate-task-strike-draw' : 'scale-x-100'
          )}
        />
      )}
    </span>
  )
}

export function ReadinessPage() {
  const { currentProductionId } = useCurrentProduction()
  const { progress, updateProgress } = useFirstLaunchTutorial()
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
  const [sectionsOpen, setSectionsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [strikeAnimatingTaskIds, setStrikeAnimatingTaskIds] = useState<Set<string>>(
    () => new Set()
  )

  const STRIKE_ANIMATION_MS = 400

  useEffect(() => {
    if (progress?.currentSection === 'tasks') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

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

  const { data: sections = [] } = useQuery({
    queryKey: ['taskSections', currentProductionId],
    queryFn: () => listTaskSectionsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

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

  const tasksGroupedBySection = useMemo(() => {
    const bySection = new Map<string | null, ProductionTask[]>()
    bySection.set(null, [])
    for (const s of sections) bySection.set(s.id, [])
    for (const t of filteredTasks) {
      const key = resolveTaskSectionId(t, taskById)
      if (!bySection.has(key)) bySection.set(key, [])
      bySection.get(key)!.push(t)
    }
    const result: Array<{
      sectionId: string | null
      sectionName: string
      tasks: Array<{ task: ProductionTask; depth: number }>
    }> = []
    for (const s of sections) {
      const groupTasks = bySection.get(s.id) ?? []
      if (groupTasks.length === 0) continue
      const tree = buildTaskTree(groupTasks)
      const flat = flattenTaskTreeForDisplay(tree)
      const visible = flat.filter(({ task, depth }) => !isTaskHiddenByCollapse(task, depth))
      if (visible.length === 0) continue
      result.push({ sectionId: s.id, sectionName: s.name, tasks: visible })
    }
    const unsectioned = bySection.get(null) ?? []
    if (unsectioned.length > 0) {
      const tree = buildTaskTree(unsectioned)
      const flat = flattenTaskTreeForDisplay(tree)
      const visible = flat.filter(({ task, depth }) => !isTaskHiddenByCollapse(task, depth))
      if (visible.length > 0) {
        result.push({ sectionId: null, sectionName: 'Unsectioned', tasks: visible })
      }
    }
    return result
  }, [filteredTasks, sections, collapsedTaskIds, taskById])

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
    onSuccess: (_task, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setCreateOpen(false)
      if (variables.parent_task_id) {
        setCollapsedTaskIds((prev) => {
          if (!prev.has(variables.parent_task_id!)) return prev
          const next = new Set(prev)
          next.delete(variables.parent_task_id!)
          return next
        })
      }
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

  function toggleTaskComplete(task: ProductionTask) {
    if (task.is_complete) {
      setStrikeAnimatingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
      updateMutation.mutate({ id: task.id, patch: { is_complete: 0 } })
      return
    }

    setStrikeAnimatingTaskIds((prev) => new Set(prev).add(task.id))
    updateMutation.mutate({ id: task.id, patch: { is_complete: 1 } })
    window.setTimeout(() => {
      setStrikeAnimatingTaskIds((prev) => {
        if (!prev.has(task.id)) return prev
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }, STRIKE_ANIMATION_MS)
  }

  const assignSectionMutation = useMutation({
    mutationFn: ({ taskId, sectionId }: { taskId: string; sectionId: string | null }) =>
      updateTaskSectionWithDescendants(taskId, sectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const createSectionMutation = useMutation({
    mutationFn: (data: CreateTaskSectionData) => createTaskSection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSections'] })
    },
  })

  const updateSectionMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskSectionPatch }) =>
      updateTaskSection(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSections'] })
    },
  })

  const deleteSectionMutation = useMutation({
    mutationFn: deleteTaskSection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSections'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const applyTemplateMutation = useMutation({
    mutationFn: applyTaskTemplateToProduction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['taskSections'] })
      setApplyTemplateOpen(false)
    },
  })

  useEffect(() => {
    const onMenuNewTask = () => {
      setCreateOpen(true)
      setAddSubtaskParent(null)
    }
    window.addEventListener('albatross-menu-tasks-new-task', onMenuNewTask)
    return () => {
      window.removeEventListener('albatross-menu-tasks-new-task', onMenuNewTask)
    }
  }, [])

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground text-sm">Production tasks and deadlines</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium tabular-nums">
            {score}% complete
          </Badge>
          <ManageSectionsSheet
            productionId={currentProductionId}
            sections={sections}
            filteredTasks={filteredTasks}
            onCreateSection={(data) => createSectionMutation.mutate(data)}
            onUpdateSection={(id, patch) => updateSectionMutation.mutate({ id, patch })}
            onDeleteSection={(id) => deleteSectionMutation.mutate(id)}
            isCreatePending={createSectionMutation.isPending}
            isUpdatePending={updateSectionMutation.isPending}
            isDeletePending={deleteSectionMutation.isPending}
            open={sectionsOpen}
            onOpenChange={setSectionsOpen}
          />
          <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} className="gap-1.5">
            <FileStack className="size-4" />
            Templates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setApplyTemplateOpen(true)} className="gap-1.5">
            <Play className="size-4" />
            Apply Template
          </Button>
          <NewTaskDialog
            productionId={currentProductionId}
            parentTaskId={addSubtaskParent?.id ?? null}
            sections={sections}
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

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 sm:max-w-[240px]">
          
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskFilters['status'])}>
            <SelectTrigger className="mt-1 h-8 w-[120px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Select
            value={departmentFilter ?? 'all'}
            onValueChange={(v) => setDepartmentFilter(v === 'all' ? null : v)}
          >
            <SelectTrigger className="mt-1 h-8 w-[140px]" aria-label="Filter by department">
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
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Priority</Label>
          <Select
            value={priorityFilter?.toString() ?? 'all'}
            onValueChange={(v) =>
              setPriorityFilter(v === 'all' ? null : (parseInt(v, 10) as 1 | 2 | 3))
            }
          >
            <SelectTrigger className="mt-1 h-8 w-[100px]" aria-label="Filter by priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="1">High</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Due</Label>
          <Select
            value={dueTimingFilter}
            onValueChange={(v) => setDueTimingFilter(v as TaskFilters['dueTiming'])}
          >
            <SelectTrigger className="mt-1 h-8 w-[120px]" aria-label="Filter by due date">
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
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 py-2">Description</TableHead>
              <TableHead className="w-[140px] py-2">Department</TableHead>
              <TableHead className="w-[110px] py-2">Due date</TableHead>
              <TableHead className="w-[90px] py-2">Priority</TableHead>
              <TableHead className="w-[100px] py-2">Status</TableHead>
              <TableHead className="w-[100px] pr-4 py-2 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasksGroupedBySection.length === 0 ? (
              <TableRow className="hover:bg-transparent border-0">
                <TableCell colSpan={6} className="py-12 text-center">
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
              tasksGroupedBySection.flatMap((group) => [
                <TableRow key={`section-${group.sectionId ?? 'unsectioned'}`} className="hover:bg-transparent border-0 bg-muted/30">
                  <TableCell colSpan={6} className="py-1.5 pl-4 text-sm font-medium text-muted-foreground">
                    {group.sectionName} ({group.tasks.length})
                  </TableCell>
                </TableRow>,
                ...group.tasks.map(({ task, depth }) => {
                const prog = getSubtaskProgress(task.id, filteredTasks)
                const isParent = prog.total > 0
                const isStrikeAnimating = strikeAnimatingTaskIds.has(task.id)
                const showCompleteStyle = task.is_complete === 1 || isStrikeAnimating
                return (
                  <TableRow
                    key={task.id}
                    className={cn(
                      'transition-opacity duration-200 ease-out',
                      showCompleteStyle && 'opacity-60',
                      !showCompleteStyle && 'opacity-100',
                      depth > 0 && 'bg-muted/15',
                      isParent && depth === 0 && 'bg-muted/10'
                    )}
                  >
                    <TableCell className="py-2 pl-4 align-top">
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
                          <TaskDescriptionLabel
                            description={task.description}
                            isComplete={task.is_complete === 1}
                            isStrikeAnimating={isStrikeAnimating}
                            compact={depth > 0}
                          />
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
                    <TableCell className="py-2 text-muted-foreground text-sm align-top">
                      {task.assigned_department ?? '—'}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm align-top">
                      {formatDueDate(task.due_date)}
                    </TableCell>
                    <TableCell className="py-2 align-top">
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
                    <TableCell className="py-2 align-top">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium transition-colors"
                        onClick={() => toggleTaskComplete(task)}
                      >
                        {task.is_complete ? 'Complete' : 'Incomplete'}
                      </Button>
                    </TableCell>
                    <TableCell className="py-2 pr-4 text-right align-top">
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
                        {task.parent_task_id === null && (
                          <AssignToSectionDropdown
                            task={task}
                            sections={sections}
                            onAssign={(sectionId) =>
                              assignSectionMutation.mutate({ taskId: task.id, sectionId })
                            }
                            isPending={assignSectionMutation.isPending}
                          />
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
            ])
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

      <TaskTemplatesSheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onEditTemplate={(id) => {
          setTemplatesOpen(false)
          setEditingTemplateId(id)
        }}
      />

      {editingTemplateId && (
        <TaskTemplateEditorSheet
          templateId={editingTemplateId}
          onClose={() => setEditingTemplateId(null)}
        />
      )}

      <ApplyTemplateDialog
        productionId={currentProductionId ?? ''}
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        onApply={(params) => applyTemplateMutation.mutate(params)}
        isPending={applyTemplateMutation.isPending}
      />
      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'tasks' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                tasks: prev.sections.tasks === 'not_started' ? 'in_progress' : prev.sections.tasks,
              },
            }))
          }
        }}
        sectionId="tasks"
        sectionTitle="Tasks"
        steps={tasksTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'tasks' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              tasks: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}

function AssignToSectionDropdown({
  task: _task,
  sections,
  onAssign,
  isPending,
}: {
  task: ProductionTask
  sections: ProductionTaskSection[]
  onAssign: (sectionId: string | null) => void
  isPending: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          title="Assign to section"
          aria-label="Assign to section"
          disabled={isPending}
        >
          <FolderInput className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAssign(null)}>
          No section
        </DropdownMenuItem>
        {sections.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => onAssign(s.id)}
          >
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ManageSectionsSheet({
  productionId,
  sections,
  filteredTasks,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  isCreatePending,
  isUpdatePending,
  isDeletePending,
  open,
  onOpenChange,
}: {
  productionId: string
  sections: ProductionTaskSection[]
  filteredTasks: ProductionTask[]
  onCreateSection: (data: CreateTaskSectionData) => void
  onUpdateSection: (id: string, patch: UpdateTaskSectionPatch) => void
  onDeleteSection: (id: string) => void
  isCreatePending: boolean
  isUpdatePending: boolean
  isDeletePending: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [newSectionName, setNewSectionName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const taskCountBySection = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of filteredTasks) {
      if (t.section_id) {
        counts.set(t.section_id, (counts.get(t.section_id) ?? 0) + 1)
      }
    }
    return counts
  }, [filteredTasks])

  const handleAddSection = () => {
    const name = newSectionName.trim()
    if (!name) return
    onCreateSection({ production_id: productionId, name })
    setNewSectionName('')
  }

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) return
    onUpdateSection(editingId, { name: editingName.trim() })
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = (id: string, name: string) => {
    const count = taskCountBySection.get(id) ?? 0
    if (count > 0 && !window.confirm(`Delete "${name}"? ${count} task${count !== 1 ? 's' : ''} will be moved to Unsectioned.`)) return
    if (count === 0 && !window.confirm(`Delete "${name}"?`)) return
    onDeleteSection(id)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <LayoutList className="size-4" />
          Manage Sections
        </Button>
      </SheetTrigger>
      <SheetContent side="right" variant="floating" className="w-[384px] flex flex-col">
        <SheetHeader className="px-6">
          <SheetTitle>Task Sections</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="flex gap-2">
            <Input
              placeholder="New section name"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
              className="flex-1"
            />
            <Button onClick={handleAddSection} disabled={!newSectionName.trim() || isCreatePending}>
              Add
            </Button>
          </div>
          <ul className="space-y-2">
            {sections.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                {editingId === s.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 h-8"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveEdit} disabled={!editingName.trim() || isUpdatePending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {taskCountBySection.get(s.id) ?? 0} tasks
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => handleStartEdit(s.id, s.name)}
                      aria-label="Rename section"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(s.id, s.name)}
                      disabled={isDeletePending}
                      aria-label="Delete section"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground">No sections yet. Add one above.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NewTaskDialog({
  productionId,
  parentTaskId,
  sections,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  productionId: string
  parentTaskId: string | null
  sections: ProductionTaskSection[]
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
  const [sectionId, setSectionId] = useState<string | null>(null)

  const handleSubmit = () => {
    onSubmit({
      production_id: productionId,
      description: description.trim(),
      notes: notes.trim() || null,
      due_date: dueDate || null,
      assigned_department: department || null,
      priority,
      parent_task_id: parentTaskId,
      ...(parentTaskId ? {} : { section_id: sectionId }),
    })
    setDescription('')
    setNotes('')
    setDueDate('')
    setDepartment(null)
    setPriority(null)
    setSectionId(null)
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
          {!parentTaskId && sections.length > 0 && (
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={sectionId ?? 'none'}
                onValueChange={(v) => setSectionId(v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
