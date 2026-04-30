'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { crewTutorialSteps } from '@/features/tutorial/sections/crewTutorial'
import { listCrew, createPerson, updatePerson } from '@/lib/db/repositories/person'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import {
  createPersonForActor,
  listCrewForActor,
  listTasksByProductionForActor,
  updatePersonForActor,
} from '@/lib/access/projectDomainService'
import {
  getEffectiveCrewHierarchyOrDefault,
  getDefaultCrewHierarchyConfig,
  getResolvedCrewDepartmentNames,
  getResolvedCrewRolesForDepartment,
  isResolvedHodRole,
} from '@/lib/people/crewHierarchyResolver'
import type { CrewHierarchyConfig } from '@/lib/people/crewHierarchyTypes'
import {
  getHodResponsibilitySummary,
  getDepartmentsWithTasksButNoHod,
} from '@/lib/people/crewTaskIntegration'
import type { Person } from '@/lib/db/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Search, Plus, Pencil, Eye } from 'lucide-react'
import { CrewForm, type CrewFormValues } from '@/features/people/components/CrewForm'
import { CrewSetupWizard } from '@/features/people/crew-manager/CrewSetupWizard'

function getCanonicalDepartment(
  hierarchy: CrewHierarchyConfig,
  person: Person
): string | null {
  const d = person.department?.trim()
  if (!d) return null
  const set = new Set(getResolvedCrewDepartmentNames(hierarchy))
  return set.has(d) ? d : null
}

function isPersonHod(hierarchy: CrewHierarchyConfig, person: Person): boolean {
  const dept = getCanonicalDepartment(hierarchy, person)
  if (!dept) return false
  return isResolvedHodRole(hierarchy, dept, person.role_name?.trim() ?? '')
}

function getRoleOrderIndex(
  hierarchy: CrewHierarchyConfig,
  person: Person
): number {
  const dept = getCanonicalDepartment(hierarchy, person)
  if (!dept) return 999
  const roles = getResolvedCrewRolesForDepartment(hierarchy, dept)
  const role = person.role_name?.trim() ?? ''
  const idx = roles.indexOf(role)
  if (idx === -1) return 999
  return idx
}

function isRoleInCanonicalHierarchy(
  hierarchy: CrewHierarchyConfig,
  person: Person
): boolean {
  const dept = getCanonicalDepartment(hierarchy, person)
  if (!dept) return false
  const roles = getResolvedCrewRolesForDepartment(hierarchy, dept)
  return roles.includes(person.role_name?.trim() ?? '')
}

function trimOrNull(s: string | undefined): string | null {
  const t = s?.trim()
  return t === '' ? null : t ?? null
}

type DepartmentFilter = 'all' | 'other' | string
type HodFilter = 'all' | 'hod_only' | 'non_hod'
type MissingFilter = 'all' | 'missing_department' | 'missing_role'

const defaultHierarchy = getDefaultCrewHierarchyConfig()

export function CrewManagerPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all')
  const [hodFilter, setHodFilter] = useState<HodFilter>('all')
  const [missingFilter, setMissingFilter] = useState<MissingFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const hasAutoOpenedWizardRef = useRef(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (progress?.currentSection === 'crew') {
      queueMicrotask(() => setTutorialOpen(true))
    }
  }, [progress?.currentSection])

  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId,
  })
  const hierarchy = hierarchyData ?? defaultHierarchy

  const { data: crew = [], isLoading: crewLoading } = useQuery({
    queryKey: ['crew', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCrewForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listCrew(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listTasksByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listTasksByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: async (d: CrewFormValues) => {
      const data = {
        production_id: currentProductionId!,
        name: d.name.trim(),
        is_cast: 0 as const,
        department: trimOrNull(d.department) ?? null,
        role_name: trimOrNull(d.role_name) ?? null,
        email: trimOrNull(d.email),
        phone: trimOrNull(d.phone),
        phases: trimOrNull(d.phases),
        notes: trimOrNull(d.notes),
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createPersonForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId!,
          data,
        })
      }
      return createPerson(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setAddOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CrewFormValues }) => {
      const payload = {
        name: data.name.trim(),
        department: trimOrNull(data.department) ?? null,
        role_name: trimOrNull(data.role_name) ?? null,
        email: trimOrNull(data.email),
        phone: trimOrNull(data.phone),
        phases: trimOrNull(data.phases),
        notes: trimOrNull(data.notes),
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updatePersonForActor({
          db,
          actor: authSession.currentUser,
          personId: id,
          data: payload,
        })
      }
      return updatePerson(id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setEditingId(null)
    },
  })

  const summary = useMemo(() => {
    const total = crew.length
    const canonicalDepts = new Set(
      crew.map((p) => getCanonicalDepartment(hierarchy, p)).filter(Boolean)
    )
    const hodCount = crew.filter((p) => isPersonHod(hierarchy, p)).length
    const missingDept = crew.filter((p) => !p.department?.trim()).length
    const missingRole = crew.filter((p) => !p.role_name?.trim()).length
    const nonStandardRole = crew.filter(
      (p) =>
        p.role_name?.trim() &&
        getCanonicalDepartment(hierarchy, p) &&
        !isRoleInCanonicalHierarchy(hierarchy, p)
    ).length
    return {
      total,
      departmentCount: canonicalDepts.size,
      hodCount,
      missingDept,
      missingRole,
      nonStandardRole,
    }
  }, [crew, hierarchy])

  const filteredCrew = useMemo(() => {
    let list = crew

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => {
        const name = (p.name ?? '').toLowerCase()
        const dept = (p.department ?? '').toLowerCase()
        const role = (p.role_name ?? '').toLowerCase()
        const email = (p.email ?? '').toLowerCase()
        const phone = (p.phone ?? '').toLowerCase()
        return (
          name.includes(q) ||
          dept.includes(q) ||
          role.includes(q) ||
          email.includes(q) ||
          phone.includes(q)
        )
      })
    }

    if (departmentFilter !== 'all') {
      if (departmentFilter === 'other') {
        list = list.filter((p) => !getCanonicalDepartment(hierarchy, p))
      } else {
        list = list.filter(
          (p) => getCanonicalDepartment(hierarchy, p) === departmentFilter
        )
      }
    }

    if (hodFilter === 'hod_only')
      list = list.filter((p) => isPersonHod(hierarchy, p))
    else if (hodFilter === 'non_hod')
      list = list.filter((p) => !isPersonHod(hierarchy, p))

    if (missingFilter === 'missing_department') list = list.filter((p) => !p.department?.trim())
    else if (missingFilter === 'missing_role') list = list.filter((p) => !p.role_name?.trim())

    return list
  }, [crew, hierarchy, search, departmentFilter, hodFilter, missingFilter])

  const sortedCrew = useMemo(() => {
    const canonicalNames = getResolvedCrewDepartmentNames(hierarchy)
    const deptOrder = new Map<string, number>()
    canonicalNames.forEach((name, i) => deptOrder.set(name, i))
    deptOrder.set('other', canonicalNames.length)

    return [...filteredCrew].sort((a, b) => {
      const deptA = getCanonicalDepartment(hierarchy, a) ?? 'other'
      const deptB = getCanonicalDepartment(hierarchy, b) ?? 'other'
      const orderA = deptOrder.get(deptA) ?? 999
      const orderB = deptOrder.get(deptB) ?? 999
      if (orderA !== orderB) return orderA - orderB

      const hodA = isPersonHod(hierarchy, a) ? -1 : getRoleOrderIndex(hierarchy, a)
      const hodB = isPersonHod(hierarchy, b) ? -1 : getRoleOrderIndex(hierarchy, b)
      if (hodA !== hodB) return hodA - hodB

      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [filteredCrew, hierarchy])

  const hodResponsibilitySummary = useMemo(
    () => getHodResponsibilitySummary(hierarchy, crew, tasks),
    [hierarchy, crew, tasks]
  )
  const departmentsWithTasksButNoHod = useMemo(
    () => getDepartmentsWithTasksButNoHod(hierarchy, crew, tasks),
    [hierarchy, crew, tasks]
  )
  const departmentRowsWithTasks = useMemo(
    () => hodResponsibilitySummary.filter((row) => row.taskSummary.total > 0),
    [hodResponsibilitySummary]
  )

  // Reset auto-open when switching production so wizard can show once per production when empty
  const prevProductionRef = useRef<string | null>(null)
  useEffect(() => {
    if (currentProductionId !== prevProductionRef.current) {
      prevProductionRef.current = currentProductionId ?? null
      hasAutoOpenedWizardRef.current = false
    }
  }, [currentProductionId])

  // Auto-open setup wizard when production has no crew (first entry to Crew Manager in empty state)
  useEffect(() => {
    if (
      currentProductionId &&
      !crewLoading &&
      crew.length === 0 &&
      !hasAutoOpenedWizardRef.current
    ) {
      hasAutoOpenedWizardRef.current = true
      queueMicrotask(() => setWizardOpen(true))
    }
  }, [currentProductionId, crewLoading, crew.length])

  useEffect(() => {
    const onAddCrew = () => setAddOpen(true)
    window.addEventListener('albatross-menu-people-add-crew', onAddCrew)
    return () => window.removeEventListener('albatross-menu-people-add-crew', onAddCrew)
  }, [])

  if (!currentProductionId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Crew Manager</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Crew Manager</h1>
          <p className="text-muted-foreground text-sm">
            View and manage crew for this production. Department and role are aligned with the
            canonical crew hierarchy for task and call-sheet integration.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add crew
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Crew</p>
            <p className="text-lg font-medium">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Departments</p>
            <p className="text-lg font-medium">{summary.departmentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">HODs</p>
            <p className="text-lg font-medium">{summary.hodCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Missing dept</p>
            <p className="text-lg font-medium">{summary.missingDept}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Missing role</p>
            <p className="text-lg font-medium">{summary.missingRole}</p>
          </CardContent>
        </Card>
      </div>

      {summary.nonStandardRole > 0 && (
        <p className="text-muted-foreground text-xs">
          {summary.nonStandardRole} crew member{summary.nonStandardRole !== 1 ? 's have' : ' has'} a
          role not in the canonical hierarchy for their department.
        </p>
      )}

      {/* Department task responsibility — read-only integration with Tasks */}
      {departmentRowsWithTasks.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2 border-b border-border">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Department task responsibility
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Open and overdue counts by department; HODs are responsible for departmental task completion.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-40">Department</TableHead>
                  <TableHead className="w-20 text-right">Open</TableHead>
                  <TableHead className="w-20 text-right">Overdue</TableHead>
                  <TableHead>HOD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departmentRowsWithTasks.map((row) => (
                  <TableRow key={row.crewDepartment}>
                    <TableCell className="font-medium">{row.crewDepartment}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.taskSummary.incomplete}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.taskSummary.overdue > 0 ? (
                        <span className="text-destructive/90">{row.taskSummary.overdue}</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.hasHod && row.hodPerson ? (
                        row.hodPerson.name
                      ) : (
                        <span className="text-muted-foreground/80">No HOD assigned</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {departmentsWithTasksButNoHod.length > 0 && (
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground/90">
            {departmentsWithTasksButNoHod.length} department
            {departmentsWithTasksButNoHod.length !== 1 ? 's have' : ' has'} open tasks but no HOD
            assigned:
          </span>{' '}
          {departmentsWithTasksButNoHod
            .map((row) => `${row.crewDepartment} (${row.taskSummary.incomplete} open)`)
            .join(', ')}
        </p>
      )}

      {/* Toolbar: search + filters (hidden when no crew) */}
      {crew.length > 0 && (
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, department, role, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Select
          value={departmentFilter}
          onValueChange={(v) => setDepartmentFilter(v as DepartmentFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {getResolvedCrewDepartmentNames(hierarchy).map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
            <SelectItem value="other">Other / unset</SelectItem>
          </SelectContent>
        </Select>
        <Select value={hodFilter} onValueChange={(v) => setHodFilter(v as HodFilter)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="HOD" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="hod_only">HOD only</SelectItem>
            <SelectItem value="non_hod">Non-HOD</SelectItem>
          </SelectContent>
        </Select>
        <Select value={missingFilter} onValueChange={(v) => setMissingFilter(v as MissingFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Completeness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="missing_department">Missing department</SelectItem>
            <SelectItem value="missing_role">Missing role</SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Crew table or empty state */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {crew.length === 0 ? (
            <div className="py-12 px-6 text-center max-w-md mx-auto">
              <p className="font-medium text-foreground">Crew Manager</p>
              <p className="text-muted-foreground text-sm mt-2">
                Organise crew by department, assign Heads of Department, manage contact details, and
                support tasks and call sheets. Add your first crew to get started.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                  className="bg-primary/90 hover:bg-primary"
                >
                  Start setup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="border-border"
                >
                  Add crew manually
                </Button>
              </div>
            </div>
          ) : sortedCrew.length === 0 ? (
            <div className="py-12 px-4 text-center text-muted-foreground text-sm">
              No crew match the current search or filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-16">HOD</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCrew.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to={`/people/crew/${p.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.department?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.role_name?.trim() || '—'}
                    </TableCell>
                    <TableCell>
                      {isPersonHod(hierarchy, p) ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="font-normal text-xs">
                            HOD
                          </Badge>
                          {(() => {
                            const dept = getCanonicalDepartment(hierarchy, p)
                            if (!dept) return null
                            const row = hodResponsibilitySummary.find(
                              (r) => r.crewDepartment === dept
                            )
                            const open = row?.taskSummary.incomplete ?? 0
                            const overdue = row?.taskSummary.overdue ?? 0
                            if (open === 0 && overdue === 0) return null
                            return (
                              <span className="text-muted-foreground text-xs">
                                {overdue > 0 ? (
                                  <span className="text-destructive/90">{overdue} overdue</span>
                                ) : null}
                                {overdue > 0 && open > 0 ? ' · ' : null}
                                {open > 0 ? `${open} open` : null}
                              </span>
                            )
                          })()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.phone?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.email?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link to={`/people/crew/${p.id}`} aria-label="View">
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingId(p.id)}
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen || !!editingId}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false)
            setEditingId(null)
          }
        }}
      >
        <DialogContent>
          <CrewForm
            hierarchy={hierarchy}
            key={editingId ?? 'add'}
            defaultValues={editingId ? crew.find((c) => c.id === editingId) ?? {} : {}}
            mode={editingId ? 'edit' : 'add'}
            onSubmit={(d) =>
              editingId
                ? updateMutation.mutate({ id: editingId, data: d })
                : createMutation.mutate(d)
            }
            onCancel={() => {
              setAddOpen(false)
              setEditingId(null)
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <CrewSetupWizard
        hierarchy={hierarchy}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreateCrew={async (values) => {
          await createMutation.mutateAsync(values)
        }}
      />

      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'crew' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                crew: prev.sections.crew === 'not_started' ? 'in_progress' : prev.sections.crew,
              },
            }))
          }
        }}
        sectionId="crew"
        sectionTitle="Crew Management"
        steps={crewTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'crew' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              crew: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
