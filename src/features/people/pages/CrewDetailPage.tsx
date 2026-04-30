'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, Navigate } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { getPersonById, updatePerson } from '@/lib/db/repositories/person'
import { listCrew } from '@/lib/db/repositories/person'
import { listBookingsByPerson } from '@/lib/db/repositories/booking'
import { getPersonBookingsSummary } from '@/lib/people/bookingsSummary'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import {
  getEffectiveCrewHierarchyOrDefault,
  getDefaultCrewHierarchyConfig,
  getResolvedCanonicalDepartmentName,
  getResolvedHodRoleForDepartment,
  getResolvedCrewRolesForDepartment,
  isResolvedHodRole,
} from '@/lib/people/crewHierarchyResolver'
import {
  getHodResponsibilitySummary,
  getTaskSummaryForCrewDepartment,
} from '@/lib/people/crewTaskIntegration'
import {
  getPersonByIdForActor,
  listBookingsByPersonForActor,
  listCrewForActor,
  listShootDaysByProductionForActor,
  listShootDayUnitsByProductionForActor,
  listTasksByProductionForActor,
  listUnitsByProductionForActor,
  updatePersonForActor,
} from '@/lib/access/projectDomainService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { ArrowLeft, Pencil, ExternalLink } from 'lucide-react'
import { CrewForm, type CrewFormValues } from '@/features/people/components/CrewForm'

function empty(s: string | null | undefined): string {
  const t = s?.trim()
  return t === '' || t == null ? '—' : t
}

const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()

export function CrewDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ['person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getPersonByIdForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return getPersonById(personId!)
    },
    enabled: !!personId,
  })

  const { data: crew = [] } = useQuery({
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

  const { data: bookingsSummary } = useQuery({
    queryKey: ['person-bookings-summary', currentProductionId, personId],
    queryFn: () => getPersonBookingsSummary(currentProductionId!, personId!),
    enabled: !!currentProductionId && !!personId,
  })

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-by-person', personId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByPersonForActor({
          db,
          actor: authSession.currentUser,
          personId: personId!,
        })
      }
      return listBookingsByPerson(personId!)
    },
    enabled: !!personId,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootDayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShootDayUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnitsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId,
  })
  const hierarchy = hierarchyData ?? defaultCrewHierarchy

  const shootDayById = useMemo(() => {
    const m = new Map<string, { shoot_date: string }>()
    for (const d of shootDays) m.set(d.id, { shoot_date: d.shoot_date })
    return m
  }, [shootDays])

  const unitNamesByShootDayId = useMemo(() => {
    const m = new Map<string, string[]>()
    const unitById = new Map(units.map((u) => [u.id, u.name]))
    for (const sdu of shootDayUnits) {
      const name = unitById.get(sdu.unit_id)
      if (name) {
        const arr = m.get(sdu.shoot_day_id) ?? []
        if (!arr.includes(name)) arr.push(name)
        m.set(sdu.shoot_day_id, arr)
      }
    }
    return m
  }, [shootDayUnits, units])

  const hodResponsibilitySummary = useMemo(
    () => getHodResponsibilitySummary(hierarchy, crew, tasks),
    [hierarchy, crew, tasks]
  )

  const canonicalDept = useMemo(
    () => (person ? getResolvedCanonicalDepartmentName(hierarchy, person.department) : null),
    [hierarchy, person]
  )

  const isHod = useMemo(
    () =>
      person && canonicalDept != null
        ? isResolvedHodRole(hierarchy, canonicalDept, person.role_name?.trim() ?? '')
        : false,
    [hierarchy, person, canonicalDept]
  )

  const deptTaskSummary = useMemo(
    () =>
      canonicalDept
        ? getTaskSummaryForCrewDepartment(hierarchy, tasks, canonicalDept)
        : null,
    [hierarchy, canonicalDept, tasks]
  )

  const deptHodRow = useMemo(
    () =>
      canonicalDept
        ? hodResponsibilitySummary.find((r) => r.crewDepartment === canonicalDept)
        : null,
    [canonicalDept, hodResponsibilitySummary]
  )

  const bookingsEnriched = useMemo(
    () =>
      bookings
        .map((b) => ({
          ...b,
          shoot_date: b.shoot_day_id ? shootDayById.get(b.shoot_day_id)?.shoot_date ?? null : null,
          unitNames: b.shoot_day_id ? unitNamesByShootDayId.get(b.shoot_day_id) ?? [] : [],
        }))
        .sort((a, b) => (a.shoot_date ?? a.start_date ?? '').localeCompare(b.shoot_date ?? b.start_date ?? '')),
    [bookings, shootDayById, unitNamesByShootDayId]
  )

  const upcomingBookings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return bookingsEnriched.filter((b) => (b.shoot_date ?? b.start_date ?? '') >= today).slice(0, 10)
  }, [bookingsEnriched])

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CrewFormValues }) => {
      const payload = {
        name: data.name.trim(),
        department: data.department?.trim() ?? null,
        role_name: data.role_name?.trim() ?? null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        phases: data.phases?.trim() || null,
        notes: data.notes?.trim() || null,
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
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
      queryClient.invalidateQueries({ queryKey: ['crew', currentProductionId] })
      setEditOpen(false)
    },
  })

  // Guards: no production, no personId
  if (!currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Select a production first.
      </div>
    )
  }

  if (!personId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        No crew member specified.
      </div>
    )
  }

  if (personLoading || person == null) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        {personLoading ? 'Loading…' : 'Crew member not found.'}
      </div>
    )
  }

  if (person.production_id !== currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Not found for this production.
      </div>
    )
  }

  // Cast record: redirect to Crew Manager
  if (person.is_cast === 1) {
    return <Navigate to="/people/crew-manager" replace />
  }

  const nextBooked =
    bookingsSummary?.start_date != null
      ? new Date(bookingsSummary.start_date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—'

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link to="/people/crew-manager" aria-label="Back to Crew Manager">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground truncate">{person.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {person.department && <span>{person.department}</span>}
            {person.role_name && <span>{person.role_name}</span>}
            {isHod && (
              <Badge variant="secondary" className="font-normal text-xs text-primary border-primary/40">
                HOD
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 size-4" />
          Edit
        </Button>
      </div>

      {/* Summary cards (dark, compact) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 min-w-0">
        <Card className="border border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 py-3 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Department</p>
            <p className="text-sm font-medium text-foreground truncate">{empty(person.department)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 py-3 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Role</p>
            <p className="text-sm font-medium text-foreground truncate">{empty(person.role_name)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 py-3 min-w-0">
            <p className="text-xs text-muted-foreground truncate">HOD / Team</p>
            <p className="text-sm font-medium text-foreground">
              {isHod ? 'HOD' : canonicalDept ? 'Team' : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 py-3 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Bookings</p>
            <p className="text-sm font-semibold text-foreground">
              {bookingsSummary?.booked_days_count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 py-3 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Next booked</p>
            <p className="text-sm font-medium text-foreground truncate" title={bookingsSummary?.start_date ?? undefined}>
              {nextBooked}
            </p>
          </CardContent>
        </Card>
        {canonicalDept && deptTaskSummary && (
          <Card className="border border-border bg-card min-w-0 overflow-hidden">
            <CardContent className="px-4 py-3 min-w-0">
              <p className="text-xs text-muted-foreground truncate">Dept tasks</p>
              <p className="text-sm font-medium text-foreground">
                {deptTaskSummary.incomplete} open
                {deptTaskSummary.overdue > 0 ? ` · ${deptTaskSummary.overdue} overdue` : ''}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main body: 2x2 card grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card A: Profile & contact */}
        <Card className="border border-border bg-card border-l-4 border-l-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Profile & contact</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{empty(person.name)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Department</dt>
                <dd className="font-medium">{empty(person.department)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{empty(person.role_name)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium tabular-nums">{empty(person.phone)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">{empty(person.email)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phases</dt>
                <dd className="font-medium">{empty(person.phases)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">HOD status</dt>
                <dd className="font-medium">{isHod ? 'HOD' : canonicalDept ? 'Team' : '—'}</dd>
              </div>
              {canonicalDept && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Canonical department</dt>
                  <dd className="font-medium text-muted-foreground text-xs">
                    Matches {canonicalDept} hierarchy
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Card B: Department & task responsibility */}
        <Card className="border border-border bg-card border-l-4 border-l-chart-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Department & responsibility</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            {canonicalDept ? (
              <>
                <p className="font-medium">{canonicalDept}</p>
                <p className="text-muted-foreground">
                  HOD role: {getResolvedHodRoleForDepartment(hierarchy, canonicalDept) || '—'}
                </p>
                {isHod ? (
                  <p className="text-primary font-medium">You are the departmental lead.</p>
                ) : (
                  <p className="text-muted-foreground">
                    {deptHodRow?.hodPerson ? (
                      <>HOD: {deptHodRow.hodPerson.name}</>
                    ) : (
                      <>No HOD assigned</>
                    )}
                  </p>
                )}
                {deptTaskSummary && (
                  <p className="text-muted-foreground">
                    {deptTaskSummary.total} total · {deptTaskSummary.incomplete} open
                    {deptTaskSummary.overdue > 0 ? ` · ${deptTaskSummary.overdue} overdue` : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                {person.department?.trim()
                  ? 'Department not in standard list.'
                  : 'No department set.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card C: Bookings */}
        <Card className="border border-border bg-card border-l-4 border-l-chart-3">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Bookings</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/people/bookings">
                <ExternalLink className="mr-1 size-3.5" />
                View in Bookings
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              {bookingsSummary?.booked_days_count ?? 0} booked shoot days
              {bookingsSummary?.start_date && ` · Next: ${nextBooked}`}
            </p>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Unit</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Role</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingBookings.map((b) => (
                    <TableRow key={b.id} className="border-border">
                      <TableCell className="text-sm">
                        {b.shoot_date
                          ? new Date(b.shoot_date).toLocaleDateString('en-GB')
                          : b.start_date ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.unitNames.length ? b.unitNames.join(', ') : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{empty(b.role)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                        {empty(b.notes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Card D: Notes & operational */}
        <Card className="border border-border bg-card border-l-4 border-l-muted-foreground/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Notes & status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-foreground whitespace-pre-wrap">{empty(person.notes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">
                Phases
              </p>
              <p className="text-foreground">{empty(person.phases)}</p>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              {!person.phone?.trim() && (
                <p className="text-amber-600 dark:text-amber-400 text-xs">Phone missing.</p>
              )}
              {!person.role_name?.trim() && (
                <p className="text-amber-600 dark:text-amber-400 text-xs">Role not set.</p>
              )}
              {person.department?.trim() && !canonicalDept && (
                <p className="text-muted-foreground text-xs">Department not in standard list.</p>
              )}
              {canonicalDept && person.role_name?.trim() && (
                (() => {
                  const roles = getResolvedCrewRolesForDepartment(hierarchy, canonicalDept)
                  const inHierarchy = roles.includes(person.role_name!.trim())
                  return !inHierarchy ? (
                    <p className="text-muted-foreground text-xs">
                      Role not in standard {canonicalDept} roles.
                    </p>
                  ) : null
                })()
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <CrewForm
            hierarchy={hierarchy}
            key={person.id}
            defaultValues={person}
            mode="edit"
            onSubmit={(d) => updateMutation.mutate({ id: person.id, data: d })}
            onCancel={() => setEditOpen(false)}
            isLoading={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
