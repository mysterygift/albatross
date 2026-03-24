'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  RotateCcw,
  Save,
} from 'lucide-react'

/** Sentinel for "no HOD" in Select; Radix forbids SelectItem value="". */
const HOD_NONE_VALUE = '__crew_hod_none__'

function deepClone(config: CrewHierarchyConfig): CrewHierarchyConfig {
  return JSON.parse(JSON.stringify(config))
}

function configEqual(a: CrewHierarchyConfig, b: CrewHierarchyConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export type ValidationResult = { valid: boolean; errors: string[] }

export function validateCrewHierarchyConfig(
  config: CrewHierarchyConfig
): ValidationResult {
  const errors: string[] = []
  const deptNamesLower = new Set<string>()
  for (const dept of config.departments) {
    const name = dept.name?.trim()
    if (!name) {
      errors.push(`Department at position ${dept.sort_order + 1} has no name.`)
      continue
    }
    const key = name.toLowerCase()
    if (deptNamesLower.has(key)) {
      errors.push(`Duplicate department name: "${name}".`)
    }
    deptNamesLower.add(key)

    const roleNames = new Set<string>()
    for (const role of dept.roles) {
      const rn = role.name?.trim()
      if (!rn) {
        errors.push(`"${name}": a role has no name.`)
        continue
      }
      if (roleNames.has(rn)) {
        errors.push(`"${name}": duplicate role "${rn}".`)
      }
      roleNames.add(rn)
    }

    if (dept.hod_role_name != null && dept.hod_role_name.trim() !== '') {
      const hod = dept.hod_role_name.trim()
      if (!roleNames.has(hod)) {
        errors.push(
          `"${name}": HOD role "${hod}" is not in the department's role list.`
        )
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  }
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

type Props = {
  productionId: string
}

export function CrewStructureEditor({ productionId }: Props) {
  const queryClient = useQueryClient()
  const [editedConfig, setEditedConfig] = useState<CrewHierarchyConfig | null>(
    null
  )
  const [initialConfig, setInitialConfig] = useState<CrewHierarchyConfig | null>(
    null
  )
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const { data: loadedConfig, isLoading } = useQuery({
    queryKey: ['crew-hierarchy', productionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(productionId),
    enabled: !!productionId,
  })

  useEffect(() => {
    if (loadedConfig) {
      const copy = deepClone(loadedConfig)
      queueMicrotask(() => {
        setInitialConfig(copy)
        setEditedConfig(copy)
      })
    }
  }, [loadedConfig])

  const hasChanges =
    editedConfig != null &&
    initialConfig != null &&
    !configEqual(editedConfig, initialConfig)
  const validation =
    editedConfig != null ? validateCrewHierarchyConfig(editedConfig) : null
  const canSave =
    hasChanges && validation?.valid === true && editedConfig != null

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editedConfig || !validation?.valid) return
      const trimmed = trimNamesInConfig(editedConfig)
      const normalized = renumberSortOrders(trimmed)
      await upsertCrewHierarchyConfig(productionId, normalized)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-hierarchy', productionId] })
      if (loadedConfig && editedConfig) {
        const trimmed = trimNamesInConfig(editedConfig)
        const normalized = renumberSortOrders(trimmed)
        setInitialConfig(deepClone(normalized))
        setEditedConfig(deepClone(normalized))
      }
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetCrewHierarchyConfigToDefault(productionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-hierarchy', productionId] })
      setResetConfirmOpen(false)
    },
  })

  const revertToInitial = useCallback(() => {
    if (initialConfig) setEditedConfig(deepClone(initialConfig))
  }, [initialConfig])

  const updateDepartments = useCallback(
    (fn: (depts: CrewDepartmentConfig[]) => CrewDepartmentConfig[]) => {
      setEditedConfig((prev) => {
        if (!prev) return prev
        return { ...prev, departments: fn(prev.departments) }
      })
    },
    []
  )

  const moveDepartment = (index: number, dir: -1 | 1) => {
    if (!editedConfig) return
    const depts = [...editedConfig.departments].sort(
      (a, b) => a.sort_order - b.sort_order
    )
    const j = index + dir
    if (j < 0 || j >= depts.length) return
    const reordered = [...depts]
    ;[reordered[index], reordered[j]] = [reordered[j], reordered[index]]
    const withNewOrder = reordered.map((d, i) => ({ ...d, sort_order: i }))
    setEditedConfig({ ...editedConfig, departments: withNewOrder })
  }

  const setDepartmentName = (deptIndex: number, name: string) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      return depts.map((x) =>
        x.id === d.id ? { ...x, name: name.trim() || x.name } : x
      )
    })
  }

  const setHodRole = (deptIndex: number, hodRoleName: string | null) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      return depts.map((x) =>
        x.id === d.id ? { ...x, hod_role_name: hodRoleName } : x
      )
    })
  }

  const addRole = (deptIndex: number) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      const newRole: CrewRoleConfig = {
        id: uuid(),
        name: 'New role',
        sort_order: d.roles.length,
      }
      return depts.map((x) =>
        x.id === d.id
          ? { ...x, roles: [...x.roles, newRole] }
          : x
      )
    })
  }

  const removeRole = (deptIndex: number, roleId: string) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      const roles = d.roles.filter((r) => r.id !== roleId)
      const newHod =
        d.hod_role_name &&
        roles.some((r) => r.name === d.hod_role_name)
          ? d.hod_role_name
          : null
      return depts.map((x) =>
        x.id === d.id ? { ...x, roles, hod_role_name: newHod } : x
      )
    })
  }

  const setRoleName = (
    deptIndex: number,
    roleId: string,
    name: string
  ) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      return depts.map((x) =>
        x.id === d.id
          ? {
              ...x,
              roles: x.roles.map((r) =>
                r.id === roleId ? { ...r, name: name === '' ? r.name : name } : r
              ),
            }
          : x
      )
    })
  }

  const moveRole = (deptIndex: number, roleIndex: number, dir: -1 | 1) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      const roles = [...d.roles].sort((a, b) => a.sort_order - b.sort_order)
      const j = roleIndex + dir
      if (j < 0 || j >= roles.length) return depts
      const reordered = [...roles]
      ;[reordered[roleIndex], reordered[j]] = [reordered[j], reordered[roleIndex]]
      const rolesWithNewOrder = reordered.map((r, i) => ({ ...r, sort_order: i }))
      return depts.map((x) =>
        x.id === d.id ? { ...x, roles: rolesWithNewOrder } : x
      )
    })
  }

  const setTaskLabels = (deptIndex: number, labels: string[]) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const d = sorted[deptIndex]
      if (!d) return depts
      return depts.map((x) =>
        x.id === d.id
          ? { ...x, task_department_labels: labels.filter(Boolean) }
          : x
      )
    })
  }

  const addTaskLabel = (deptIndex: number, label: string) => {
    if (!editedConfig) return
    const sorted = [...editedConfig.departments].sort(
      (a, b) => a.sort_order - b.sort_order
    )
    const d = sorted[deptIndex]
    if (!d) return
    const current = d.task_department_labels ?? []
    if (label.trim() && !current.includes(label.trim())) {
      setTaskLabels(deptIndex, [...current, label.trim()])
    }
  }

  const removeTaskLabel = (deptIndex: number, label: string) => {
    const sorted = [...editedConfig!.departments].sort(
      (a, b) => a.sort_order - b.sort_order
    )
    const d = sorted[deptIndex]
    if (!d) return
    const current = d.task_department_labels ?? []
    setTaskLabels(
      deptIndex,
      current.filter((l) => l !== label)
    )
  }

  const deleteDepartment = (deptIndex: number) => {
    updateDepartments((depts) => {
      const sorted = [...depts].sort((a, b) => a.sort_order - b.sort_order)
      const toRemove = sorted[deptIndex]
      if (!toRemove) return depts
      const next = depts
        .filter((x) => x.id !== toRemove.id)
        .map((d, i) => ({ ...d, sort_order: i }))
      return next
    })
  }

  const addDepartment = () => {
    const newDept: CrewDepartmentConfig = {
      id: uuid(),
      name: 'New department',
      sort_order: editedConfig?.departments.length ?? 0,
      hod_role_name: null,
      task_department_labels: [],
      roles: [{ id: uuid(), name: 'New role', sort_order: 0 }],
    }
    setEditedConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        departments: [...prev.departments, newDept],
      }
    })
  }

  if (isLoading || !loadedConfig) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-6 text-center text-muted-foreground text-sm">
        Loading crew structure…
      </div>
    )
  }

  if (editedConfig == null) {
    return null
  }

  const sortedDepts = [...editedConfig.departments].sort(
    (a, b) => a.sort_order - b.sort_order
  )

  return (
    <div className="space-y-4">
      {validation && !validation.valid && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium mb-1">Fix before saving:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!canSave || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="bg-mint-600 hover:bg-mint-500 text-white"
        >
          <Save className="mr-2 size-4" />
          Save changes
        </Button>
        {hasChanges && (
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            onClick={revertToInitial}
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          onClick={() => setResetConfirmOpen(true)}
          disabled={resetMutation.isPending}
        >
          <RotateCcw className="mr-2 size-4" />
          Reset to default
        </Button>
      </div>

      <div className="space-y-3">
        {sortedDepts.map((dept, deptIndex) => {
          const roles = [...dept.roles].sort((a, b) => a.sort_order - b.sort_order)
          const taskLabels = dept.task_department_labels ?? []
          return (
            <div
              key={dept.id}
              className="rounded-lg border border-zinc-700 bg-zinc-800/90 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                    onClick={() => moveDepartment(deptIndex, -1)}
                    disabled={deptIndex === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                    onClick={() => moveDepartment(deptIndex, 1)}
                    disabled={deptIndex === sortedDepts.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
                <Input
                  value={dept.name}
                  onChange={(e) => setDepartmentName(deptIndex, e.target.value)}
                  className="max-w-[220px] bg-zinc-900 border-zinc-600 text-foreground font-medium"
                  placeholder="Department name"
                />
                <span className="text-muted-foreground text-xs">
                  {roles.length} role{roles.length !== 1 ? 's' : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                  onClick={() => deleteDepartment(deptIndex)}
                  aria-label="Delete department"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="pl-10 space-y-3">
                <div className="rounded-md border-l-2 border-mint-500/60 bg-mint-500/5 pl-3 pr-3 py-2">
                  <Label className="text-xs font-medium text-mint-400">
                    Head of Department (HOD)
                  </Label>
                  <Select
                    value={
                      dept.hod_role_name == null || dept.hod_role_name === ''
                        ? HOD_NONE_VALUE
                        : dept.hod_role_name
                    }
                    onValueChange={(v) =>
                      setHodRole(
                        deptIndex,
                        v === HOD_NONE_VALUE ? null : v
                      )
                    }
                  >
                    <SelectTrigger className="mt-1.5 bg-zinc-900 border-zinc-600 text-foreground">
                      <SelectValue placeholder="Select HOD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={HOD_NONE_VALUE}>None</SelectItem>
                      {roles
                        .filter((r) => (r.name ?? '').trim() !== '')
                        .map((r) => (
                          <SelectItem key={r.id} value={(r.name ?? '').trim()}>
                            {r.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Task department labels
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1.5 max-w-md">
                    Link this crew department to task assignments elsewhere. Use when the crew department name differs from the task department name used on tasks.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {taskLabels.map((l) => (
                      <span
                        key={l}
                        className="inline-flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200"
                      >
                        {l}
                        <button
                          type="button"
                          className="text-zinc-400 hover:text-zinc-200"
                          onClick={() => removeTaskLabel(deptIndex, l)}
                          aria-label={`Remove ${l}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <AddTaskLabelControl
                      onAdd={(label) => addTaskLabel(deptIndex, label)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Roles</Label>
                  <ul className="space-y-1.5">
                    {roles.map((role, roleIndex) => (
                      <li
                        key={role.id}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <div className="inline-flex flex-col gap-0 rounded border border-zinc-600 bg-zinc-900/50 p-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                            onClick={() => moveRole(deptIndex, roleIndex, -1)}
                            disabled={roleIndex === 0}
                            aria-label="Move role up"
                          >
                            <ChevronUp className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                            onClick={() => moveRole(deptIndex, roleIndex, 1)}
                            disabled={roleIndex === roles.length - 1}
                            aria-label="Move role down"
                          >
                            <ChevronDown className="size-3" />
                          </Button>
                        </div>
                        <Input
                          value={role.name}
                          onChange={(e) =>
                            setRoleName(deptIndex, role.id, e.target.value)
                          }
                          className="h-8 w-48 bg-zinc-900 border-zinc-600 text-sm text-foreground"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-500 hover:text-destructive"
                          onClick={() => removeRole(deptIndex, role.id)}
                          aria-label="Remove role"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                    onClick={() => addRole(deptIndex)}
                  >
                    <Plus className="mr-1 size-3" />
                    Add role
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
        onClick={addDepartment}
      >
        <Plus className="mr-2 size-4" />
        Add department
      </Button>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-md border-zinc-700 bg-zinc-900 text-foreground">
          <DialogHeader>
            <DialogTitle>Reset to default</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Replace this production&apos;s crew structure with the built-in
            default? This restores the standard departments, roles, HODs, and
            task mappings. Your current custom structure will be overwritten.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-zinc-600"
              onClick={() => setResetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
            >
              {resetMutation.isPending ? 'Resetting…' : 'Reset to default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AddTaskLabelControl({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (value.trim()) {
              onAdd(value.trim())
              setValue('')
            }
          }
        }}
        placeholder="Add task label"
        className="h-7 w-28 bg-zinc-900 border-zinc-600 text-xs text-foreground"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-zinc-400"
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim())
            setValue('')
          }
        }}
      >
        <Plus className="size-3" />
      </Button>
    </span>
  )
}
