'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { getEffectiveCrewHierarchyOrDefault } from '@/lib/people/crewHierarchyResolver'
import {
  upsertCrewHierarchyConfig,
  resetCrewHierarchyConfigToDefault,
} from '@/lib/db/repositories/crewHierarchyConfig'
import { uuid } from '@/lib/db/client'
import type {
  CrewHierarchyConfig,
  CrewDepartmentConfig,
  CrewRoleConfig,
} from '@/lib/people/crewHierarchyTypes'
import {
  AlertCircle,
  Check,
  Crown,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'

function deepClone(config: CrewHierarchyConfig): CrewHierarchyConfig {
  return JSON.parse(JSON.stringify(config))
}

function configEqual(a: CrewHierarchyConfig, b: CrewHierarchyConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

type CrewConfigIssue = {
  departmentId: string
  /** Set when the issue belongs to a single role row rather than the department. */
  roleId?: string
  message: string
}

export type ValidationResult = { valid: boolean; errors: string[] }

function getCrewConfigIssues(config: CrewHierarchyConfig): CrewConfigIssue[] {
  const issues: CrewConfigIssue[] = []
  const deptNamesLower = new Set<string>()
  for (const dept of config.departments) {
    const name = dept.name?.trim()
    if (!name) {
      issues.push({ departmentId: dept.id, message: 'Name this department.' })
    } else {
      const key = name.toLowerCase()
      if (deptNamesLower.has(key)) {
        issues.push({
          departmentId: dept.id,
          message: `Another department is already named "${name}".`,
        })
      }
      deptNamesLower.add(key)
    }

    const roleNames = new Set<string>()
    for (const role of dept.roles) {
      const rn = role.name?.trim()
      if (!rn) {
        issues.push({ departmentId: dept.id, roleId: role.id, message: 'Name this role.' })
        continue
      }
      if (roleNames.has(rn)) {
        issues.push({
          departmentId: dept.id,
          roleId: role.id,
          message: `This department already has a role named "${rn}".`,
        })
      }
      roleNames.add(rn)
    }

    if (dept.hod_role_name != null && dept.hod_role_name.trim() !== '') {
      const hod = dept.hod_role_name.trim()
      if (!roleNames.has(hod)) {
        issues.push({
          departmentId: dept.id,
          message: `The HOD role "${hod}" is not one of this department's roles. Pick a new HOD below.`,
        })
      }
    }
  }
  return issues
}

export function validateCrewHierarchyConfig(
  config: CrewHierarchyConfig
): ValidationResult {
  const departmentLabels = new Map(
    config.departments.map((d) => [d.id, d.name?.trim() || `Department ${d.sort_order + 1}`])
  )
  const errors = getCrewConfigIssues(config).map(
    (i) => `"${departmentLabels.get(i.departmentId)}": ${i.message}`
  )
  return { valid: errors.length === 0, errors }
}

function trimNamesInConfig(config: CrewHierarchyConfig): CrewHierarchyConfig {
  return {
    ...config,
    departments: config.departments.map((d) => ({
      ...d,
      name: d.name?.trim() ?? d.name,
      hod_role_name: d.hod_role_name?.trim() || null,
      roles: d.roles.map((r) => ({ ...r, name: r.name?.trim() ?? r.name })),
    })),
  }
}

function renumberSortOrders(config: CrewHierarchyConfig): CrewHierarchyConfig {
  const departments = config.departments
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d, i) => ({
      ...d,
      sort_order: i,
      roles: d.roles
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r, j) => ({ ...r, sort_order: j })),
    }))
  return { ...config, departments }
}

function withRoleOrder(roles: CrewRoleConfig[]): CrewRoleConfig[] {
  return roles.map((r, i) => ({ ...r, sort_order: i }))
}

function isHodRole(dept: CrewDepartmentConfig, role: CrewRoleConfig): boolean {
  const hod = dept.hod_role_name?.trim()
  return !!hod && role.name.trim() === hod
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

type Props = {
  productionId: string
}

export function CrewStructureEditor({ productionId }: Props) {
  const queryClient = useQueryClient()
  const [editedConfig, setEditedConfig] = useState<CrewHierarchyConfig | null>(null)
  const [initialConfig, setInitialConfig] = useState<CrewHierarchyConfig | null>(null)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [justAddedDeptId, setJustAddedDeptId] = useState<string | null>(null)
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const { data: loadedConfig, isLoading } = useQuery({
    queryKey: ['crew-hierarchy', productionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(productionId),
    enabled: !!productionId,
  })

  useEffect(() => {
    if (loadedConfig) {
      const copy = renumberSortOrders(deepClone(loadedConfig))
      queueMicrotask(() => {
        setInitialConfig(copy)
        setEditedConfig(deepClone(copy))
      })
    }
  }, [loadedConfig])

  const hasChanges =
    editedConfig != null && initialConfig != null && !configEqual(editedConfig, initialConfig)
  const issues = useMemo(
    () => (editedConfig ? getCrewConfigIssues(editedConfig) : []),
    [editedConfig]
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editedConfig || issues.length > 0) return null
      const normalized = renumberSortOrders(trimNamesInConfig(editedConfig))
      await upsertCrewHierarchyConfig(productionId, normalized)
      return normalized
    },
    onSuccess: (normalized) => {
      if (!normalized) return
      queryClient.invalidateQueries({ queryKey: ['crew-hierarchy', productionId] })
      setInitialConfig(deepClone(normalized))
      setEditedConfig(deepClone(normalized))
      toast.success('Crew structure saved.')
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetCrewHierarchyConfigToDefault(productionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-hierarchy', productionId] })
    },
  })

  const revertToInitial = useCallback(() => {
    if (initialConfig) setEditedConfig(deepClone(initialConfig))
    setDeleteDeptId(null)
  }, [initialConfig])

  const updateDepartment = useCallback(
    (deptId: string, fn: (dept: CrewDepartmentConfig) => CrewDepartmentConfig) => {
      setEditedConfig((prev) =>
        prev
          ? { ...prev, departments: prev.departments.map((d) => (d.id === deptId ? fn(d) : d)) }
          : prev
      )
    },
    []
  )

  const addDepartment = () => {
    const newDept: CrewDepartmentConfig = {
      id: uuid(),
      name: 'New department',
      sort_order: editedConfig?.departments.length ?? 0,
      hod_role_name: null,
      task_department_labels: [],
      roles: [],
    }
    setEditedConfig((prev) =>
      prev ? { ...prev, departments: [...prev.departments, newDept] } : prev
    )
    setSelectedDeptId(newDept.id)
    setJustAddedDeptId(newDept.id)
  }

  const deleteDepartment = (deptId: string) => {
    if (!editedConfig) return
    const index = editedConfig.departments.findIndex((d) => d.id === deptId)
    const remaining = editedConfig.departments
      .filter((d) => d.id !== deptId)
      .map((d, i) => ({ ...d, sort_order: i }))
    setEditedConfig({ ...editedConfig, departments: remaining })
    setSelectedDeptId((remaining[index] ?? remaining[index - 1] ?? null)?.id ?? null)
  }

  const handleSave = () => {
    const firstIssue = issues[0]
    if (firstIssue) {
      setSelectedDeptId(firstIssue.departmentId)
      return
    }
    saveMutation.mutate()
  }

  if (isLoading || !loadedConfig) {
    return (
      <div
        role="status"
        aria-label="Loading crew structure"
        className="space-y-3 rounded-lg border border-border bg-card/80 p-6"
      >
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (editedConfig == null) {
    return null
  }

  const departments = editedConfig.departments
  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? departments[0] ?? null
  const deptToDelete = departments.find((d) => d.id === deleteDeptId) ?? null
  const deptIdsWithIssues = new Set(issues.map((i) => i.departmentId))

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <DepartmentRail
          departments={departments}
          selectedId={selectedDept?.id ?? null}
          idsWithIssues={deptIdsWithIssues}
          onSelect={setSelectedDeptId}
          onAdd={addDepartment}
        />
        {selectedDept ? (
          <DepartmentDetail
            key={selectedDept.id}
            dept={selectedDept}
            issues={issues.filter((i) => i.departmentId === selectedDept.id)}
            autoFocusName={justAddedDeptId === selectedDept.id}
            onNameFocused={() => setJustAddedDeptId(null)}
            onUpdate={(fn) => updateDepartment(selectedDept.id, fn)}
            onRequestDelete={() => setDeleteDeptId(selectedDept.id)}
          />
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="font-medium">Start your first department</p>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              Departments group roles on call sheets and in the Crew Manager.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={addDepartment}>
              Add department
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setResetConfirmOpen(true)}
        >
          <RotateCcw className="mr-1.5 size-4" />
          Reset to default
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {issues.length > 0 ? (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {issues.length} issue{issues.length === 1 ? '' : 's'} to fix
            </span>
          ) : hasChanges ? (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Check className="size-4" />
              All changes saved
            </span>
          )}
          {hasChanges && (
            <Button type="button" size="sm" variant="outline" onClick={revertToInitial}>
              Discard
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!hasChanges || saveMutation.isPending}
            onClick={handleSave}
            className="bg-mint-600 text-white hover:bg-mint-500"
          >
            <Save className="mr-2 size-4" />
            Save changes
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deptToDelete != null}
        onOpenChange={(open) => {
          if (!open) setDeleteDeptId(null)
        }}
        title={`Delete ${deptToDelete?.name.trim() || 'this department'}?`}
        description={
          deptToDelete
            ? `This will remove the department${
                deptToDelete.roles.length > 0
                  ? `, its ${deptToDelete.roles.length} role${deptToDelete.roles.length === 1 ? '' : 's'},`
                  : ''
              } and its task labels. This cannot be undone.`
            : undefined
        }
        confirmLabel="Confirm"
        destructive
        onConfirm={() => {
          if (deptToDelete) deleteDepartment(deptToDelete.id)
        }}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset to default"
        description="Replace this production's crew structure with the built-in default? This restores the standard departments, roles, HODs, and task mappings. Your current custom structure will be overwritten."
        confirmLabel="Reset to default"
        destructive
        onConfirm={() => resetMutation.mutateAsync()}
      />
    </div>
  )
}

function DepartmentRail({
  departments,
  selectedId,
  idsWithIssues,
  onSelect,
  onAdd,
}: {
  departments: CrewDepartmentConfig[]
  selectedId: string | null
  idsWithIssues: Set<string>
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col border-b border-border bg-muted/40 p-2 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
        <span>Departments</span>
        <span>{departments.length}</span>
      </div>
      <ul className="flex-1 space-y-0.5">
        {departments.map((d) => {
          const selected = d.id === selectedId
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  selected ? 'bg-mint-500/15 text-mint-400' : 'hover:bg-muted'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium',
                      !selected && 'text-foreground'
                    )}
                  >
                    {d.name.trim() || 'Untitled'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {d.roles.length} role{d.roles.length === 1 ? '' : 's'}
                  </span>
                </span>
                {idsWithIssues.has(d.id) && (
                  <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Needs attention" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onAdd}>
        <Plus className="mr-1.5 size-4" />
        Add department
      </Button>
    </div>
  )
}

function DepartmentDetail({
  dept,
  issues,
  autoFocusName,
  onNameFocused,
  onUpdate,
  onRequestDelete,
}: {
  dept: CrewDepartmentConfig
  issues: CrewConfigIssue[]
  autoFocusName: boolean
  onNameFocused: () => void
  onUpdate: (fn: (dept: CrewDepartmentConfig) => CrewDepartmentConfig) => void
  onRequestDelete: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!autoFocusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
    onNameFocused()
  }, [autoFocusName, onNameFocused])

  const roles = dept.roles
  const labels = dept.task_department_labels ?? []
  const hodRole = roles.find((r) => isHodRole(dept, r))
  const deptIssue = issues.find((i) => i.roleId == null)
  const roleIssues = new Map(
    issues.filter((i) => i.roleId != null).map((i) => [i.roleId as string, i.message])
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onUpdate((d) => {
      const from = d.roles.findIndex((r) => r.id === active.id)
      const to = d.roles.findIndex((r) => r.id === over.id)
      if (from < 0 || to < 0) return d
      return { ...d, roles: withRoleOrder(arrayMove(d.roles, from, to)) }
    })
  }

  const renameRole = (roleId: string, name: string) =>
    onUpdate((d) => {
      const old = d.roles.find((r) => r.id === roleId)
      if (!old) return d
      // The HOD is stored by role name, so keep it attached when the HOD role is renamed.
      const wasHod = d.hod_role_name != null && d.hod_role_name === old.name
      return {
        ...d,
        roles: d.roles.map((r) => (r.id === roleId ? { ...r, name } : r)),
        hod_role_name: wasHod ? name : d.hod_role_name,
      }
    })

  const toggleHod = (roleId: string) =>
    onUpdate((d) => {
      const role = d.roles.find((r) => r.id === roleId)
      if (!role) return d
      return { ...d, hod_role_name: isHodRole(d, role) ? null : role.name }
    })

  const removeRole = (roleId: string) =>
    onUpdate((d) => {
      const role = d.roles.find((r) => r.id === roleId)
      if (!role) return d
      return {
        ...d,
        roles: withRoleOrder(d.roles.filter((r) => r.id !== roleId)),
        hod_role_name: isHodRole(d, role) ? null : d.hod_role_name,
      }
    })

  const addRoles = (names: string[]) =>
    onUpdate((d) => ({
      ...d,
      roles: withRoleOrder([...d.roles, ...names.map((name) => ({ id: uuid(), name, sort_order: 0 }))]),
    }))

  const addLabels = (names: string[]) =>
    onUpdate((d) => {
      const current = d.task_department_labels ?? []
      const next = [...current]
      for (const n of names) {
        if (!next.some((l) => l.toLowerCase() === n.toLowerCase())) next.push(n)
      }
      return { ...d, task_department_labels: next }
    })

  const removeLabel = (label: string) =>
    onUpdate((d) => ({
      ...d,
      task_department_labels: (d.task_department_labels ?? []).filter((l) => l !== label),
    }))

  return (
    <div className="min-w-0 px-5 pb-5 pt-3">
      <div className="flex items-center gap-2">
        <Input
          ref={nameRef}
          value={dept.name}
          onChange={(e) => onUpdate((d) => ({ ...d, name: e.target.value }))}
          placeholder="Department name"
          aria-label="Department name"
          aria-invalid={deptIssue != null}
          className="-ml-2 h-10 border-transparent bg-transparent px-2 text-lg font-medium shadow-none hover:border-border"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onRequestDelete}
          aria-label="Delete department"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {deptIssue && <p className="text-xs text-destructive">{deptIssue.message}</p>}
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        {hodRole ? (
          <>
            <Crown className="size-3.5" />
            Head of department:
            <span className="font-medium text-foreground">{hodRole.name.trim()}</span>
          </>
        ) : (
          'No head of department. Mark one of the roles below.'
        )}
      </p>

      <section className="mt-5" aria-label="Roles">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Roles</h4>
          <span className="text-xs text-muted-foreground/80">Top to bottom is call sheet order</span>
        </div>
        {roles.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No roles yet. Add the first one below.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={roles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul>
                {roles.map((role) => (
                  <SortableRoleRow
                    key={role.id}
                    role={role}
                    isHod={isHodRole(dept, role)}
                    error={roleIssues.get(role.id)}
                    onRename={(name) => renameRole(role.id, name)}
                    onToggleHod={() => toggleHod(role.id)}
                    onRemove={() => removeRole(role.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        <AddListForm
          className="ml-6 mt-2"
          label="New role"
          placeholder="Add a role, or several separated by commas"
          buttonLabel="Add"
          onAdd={addRoles}
        />
      </section>

      <section className="mt-6" aria-label="Task labels">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Task labels</h4>
          <span className="text-right text-xs text-muted-foreground/80">
            Only needed when task names differ from this department
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary py-0.5 pl-2.5 pr-0.5 text-sm text-foreground"
            >
              {l}
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                onClick={() => removeLabel(l)}
                aria-label={`Remove label ${l}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <AddListForm
            label="New task label"
            placeholder="Add label"
            onAdd={addLabels}
            compact
          />
        </div>
      </section>
    </div>
  )
}

function SortableRoleRow({
  role,
  isHod,
  error,
  onRename,
  onToggleHod,
  onRemove,
}: {
  role: CrewRoleConfig
  isHod: boolean
  error?: string
  onRename: (name: string) => void
  onToggleHod: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: role.id })
  const label = role.name.trim() || 'role'

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition,
      }}
      className={cn(isDragging && 'relative z-10 rounded-md bg-card shadow-md')}
    >
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-muted/60">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={`Reorder ${label}. Press space, then use the arrow keys to move it.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <Input
          value={role.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Role name"
          aria-invalid={error != null}
          className="h-8 flex-1 border-transparent bg-transparent text-sm shadow-none hover:border-border focus-visible:bg-card"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={isHod}
          aria-label={`${isHod ? 'Unset' : 'Set'} ${label} as head of department`}
          disabled={!isHod && role.name.trim() === ''}
          onClick={onToggleHod}
          className={cn(
            'h-7 shrink-0 gap-1 px-2 text-xs',
            isHod
              ? 'border border-amber-500/40 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300'
              : 'text-muted-foreground'
          )}
        >
          <Crown className="size-3.5" />
          <span className={cn(!isHod && 'hidden group-focus-within:inline group-hover:inline')}>
            {isHod ? 'HOD' : 'Set as HOD'}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          <X className="size-4" />
        </Button>
      </div>
      {error && <p className="ml-7 pb-1 text-xs text-destructive">{error}</p>}
    </li>
  )
}

function AddListForm({
  label,
  placeholder,
  buttonLabel,
  onAdd,
  className,
  compact,
}: {
  label: string
  placeholder: string
  buttonLabel?: string
  onAdd: (values: string[]) => void
  className?: string
  compact?: boolean
}) {
  const [value, setValue] = useState('')
  const submit = () => {
    const values = splitList(value)
    if (values.length === 0) return
    onAdd(values)
    setValue('')
  }
  return (
    <form
      className={cn('flex gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(compact ? 'h-7 w-32 text-xs' : 'h-9 flex-1')}
      />
      {buttonLabel && (
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {buttonLabel}
        </Button>
      )}
    </form>
  )
}
