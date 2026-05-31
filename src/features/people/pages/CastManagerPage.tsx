import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { castTutorialSteps } from '@/features/tutorial/sections/castTutorial'
import { listCast, createPerson, updatePerson, deletePerson } from '@/lib/db/repositories/person'
import { listAvailabilityByProduction } from '@/lib/db/repositories/cast-availability'
import {
  createPersonForActor,
  deletePersonForActor,
  listAvailabilityByProductionForActor,
  listCastForActor,
  updatePersonForActor,
} from '@/lib/access/projectDomainService'
import { serializePhases } from '@/lib/people/productionPhases'
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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, Pencil, Eye, Trash2, CalendarOff } from 'lucide-react'
import type { Person } from '@/lib/db/types'
import { CastForm, type CastFormValues } from '@/features/people/components/CastForm'
import { PersonDeleteConfirmDialog } from '@/features/people/components/PersonDeleteConfirmDialog'
import {
  countUnavailableWindows,
  PersonUnavailabilityDialog,
} from '@/features/people/components/PersonUnavailabilityDialog'

const CONTRIBUTOR_FORM_LABELS: Record<Person['contributor_form_status'], string> = {
  not_requested: 'Not requested',
  requested: 'Requested',
  signed: 'Signed',
  expired: 'Expired',
}

type ContributorFilter = 'all' | Person['contributor_form_status']
type MissingFilter = 'all' | 'missing_role' | 'missing_cast_number' | 'missing_agent' | 'has_unavailability'

function hasRole(p: Person): boolean {
  return !!p.role_name?.trim()
}

function hasCastNumber(p: Person): boolean {
  return !!p.cast_number?.trim()
}

function hasAgentInfo(p: Person): boolean {
  return !!(p.agent_name?.trim() || p.agent_phone?.trim() || p.agent_email?.trim())
}

function contactDisplay(p: Person): string {
  const phone = p.phone?.trim()
  const email = p.email?.trim()
  if (phone && email) return `${phone} · ${email}`
  return phone || email || '—'
}

function trimOrNull(s: string | undefined): string | null {
  const t = s?.trim()
  return t === '' ? null : t ?? null
}

export function CastManagerPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [search, setSearch] = useState('')
  const [contributorFilter, setContributorFilter] = useState<ContributorFilter>('all')
  const [missingFilter, setMissingFilter] = useState<MissingFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null)
  const [unavailabilityPerson, setUnavailabilityPerson] = useState<Person | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (progress?.currentSection === 'cast') {
      queueMicrotask(() => setTutorialOpen(true))
    }
  }, [progress?.currentSection])

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listCast(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: availabilityList = [] } = useQuery({
    queryKey: ['cast-availability', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listAvailabilityByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listAvailabilityByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const summary = useMemo(() => {
    const total = cast.length
    const missingCastNumber = cast.filter((p) => !hasCastNumber(p)).length
    const missingRole = cast.filter((p) => !hasRole(p)).length
    const missingAgent = cast.filter((p) => !hasAgentInfo(p)).length
    const withUnavailability = cast.filter(
      (p) => countUnavailableWindows(availabilityList, p.id) > 0
    ).length
    return { total, missingCastNumber, missingRole, missingAgent, withUnavailability }
  }, [cast, availabilityList])

  const filteredCast = useMemo(() => {
    let list = cast

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => {
        const name = (p.name ?? '').toLowerCase()
        const role = (p.role_name ?? '').toLowerCase()
        const castNum = (p.cast_number ?? '').toLowerCase()
        const agent = (p.agent_name ?? '').toLowerCase()
        return name.includes(q) || role.includes(q) || castNum.includes(q) || agent.includes(q)
      })
    }

    if (contributorFilter !== 'all') {
      list = list.filter((p) => p.contributor_form_status === contributorFilter)
    }

    if (missingFilter === 'missing_role') list = list.filter((p) => !hasRole(p))
    else if (missingFilter === 'missing_cast_number') list = list.filter((p) => !hasCastNumber(p))
    else if (missingFilter === 'missing_agent') list = list.filter((p) => !hasAgentInfo(p))
    else if (missingFilter === 'has_unavailability') {
      list = list.filter((p) => countUnavailableWindows(availabilityList, p.id) > 0)
    }

    return list
  }, [cast, search, contributorFilter, missingFilter, availabilityList])

  const createMutation = useMutation({
    mutationFn: async (d: CastFormValues) => {
      const data = {
        production_id: currentProductionId!,
        name: d.name.trim(),
        is_cast: 1 as const,
        cast_number: trimOrNull(d.cast_number),
        role_name: trimOrNull(d.role_name),
        email: trimOrNull(d.email),
        phone: trimOrNull(d.phone),
        agent_name: trimOrNull(d.agent_name),
        agent_email: trimOrNull(d.agent_email),
        agent_phone: trimOrNull(d.agent_phone),
        contributor_form_status: d.contributor_form_status,
        notes: trimOrNull(d.notes),
        phases: serializePhases(d.phases),
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
      queryClient.invalidateQueries({ queryKey: ['cast'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setAddOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CastFormValues }) => {
      const payload = {
        name: data.name.trim(),
        cast_number: trimOrNull(data.cast_number),
        role_name: trimOrNull(data.role_name),
        email: trimOrNull(data.email),
        phone: trimOrNull(data.phone),
        agent_name: trimOrNull(data.agent_name),
        agent_email: trimOrNull(data.agent_email),
        agent_phone: trimOrNull(data.agent_phone),
        contributor_form_status: data.contributor_form_status,
        notes: trimOrNull(data.notes),
        phases: serializePhases(data.phases),
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
      queryClient.invalidateQueries({ queryKey: ['cast'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (personId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return deletePersonForActor({
          db,
          actor: authSession.currentUser,
          personId,
        })
      }
      return deletePerson(personId)
    },
    onSuccess: (_data, personId) => {
      queryClient.invalidateQueries({ queryKey: ['cast'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking-intelligence'] })
      queryClient.invalidateQueries({ queryKey: ['cast-by-scene'] })
      queryClient.invalidateQueries({ queryKey: ['shot-cast-by-shot-ids'] })
      queryClient.invalidateQueries({ queryKey: ['scene-cast-by-person'] })
      queryClient.invalidateQueries({ queryKey: ['dood-scenes-by-day', currentProductionId] })
      setPersonToDelete(null)
      if (editingId === personId) {
        setEditingId(null)
        setAddOpen(false)
      }
    },
  })

  const dialogOpen = addOpen || !!editingId
  const editPerson = editingId ? cast.find((p) => p.id === editingId) : null

  useEffect(() => {
    const onAddCast = () => setAddOpen(true)
    window.addEventListener('albatross-menu-people-add-cast', onAddCast)
    return () => window.removeEventListener('albatross-menu-people-add-cast', onAddCast)
  }, [])

  if (!currentProductionId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Cast Manager</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cast Manager</h1>
          <p className="text-muted-foreground text-sm">
            Manage cast members and their roles for this production.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add cast
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Cast</p>
            <p className="text-lg font-medium">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">With unavailability</p>
            <p className="text-lg font-medium">{summary.withUnavailability}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Missing cast #</p>
            <p className="text-lg font-medium">{summary.missingCastNumber}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Missing role</p>
            <p className="text-lg font-medium">{summary.missingRole}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Missing agent info</p>
            <p className="text-lg font-medium">{summary.missingAgent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, role, cast #, agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
        <Select value={contributorFilter} onValueChange={(v) => setContributorFilter(v as ContributorFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Contributor form" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(CONTRIBUTOR_FORM_LABELS) as Person['contributor_form_status'][]).map((s) => (
              <SelectItem key={s} value={s}>
                {CONTRIBUTOR_FORM_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={missingFilter} onValueChange={(v) => setMissingFilter(v as MissingFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Completeness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="missing_role">Missing role</SelectItem>
            <SelectItem value="missing_cast_number">Missing cast #</SelectItem>
            <SelectItem value="missing_agent">Missing agent info</SelectItem>
            <SelectItem value="has_unavailability">Has unavailability</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cast table */}
      <Card>
        <CardContent className="p-0">
          {cast.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <p className="text-muted-foreground">No cast members yet.</p>
              <p className="text-muted-foreground text-sm mt-1">
                Add people as cast from the People list to see them here.
              </p>
            </div>
          ) : filteredCast.length === 0 ? (
            <div className="py-12 px-4 text-center text-muted-foreground text-sm">
              No cast match the current search or filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-20">Cast #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Agent name</TableHead>
                  <TableHead>Agent phone</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-32">Contributor form</TableHead>
                  <TableHead className="w-24">Unavailable</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCast.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-muted-foreground text-sm">
                      {p.cast_number?.trim() || '—'}
                    </TableCell>
                    <TableCell>
                      <Link to={`/people/${p.id}`} className="font-medium text-primary hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.role_name?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.agent_name?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.agent_phone?.trim() || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contactDisplay(p)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {CONTRIBUTOR_FORM_LABELS[p.contributor_form_status]}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {countUnavailableWindows(availabilityList, p.id) || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link to={`/people/${p.id}`} aria-label="View">
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUnavailabilityPerson(p)}
                          aria-label="Unavailable dates"
                        >
                          <CalendarOff className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingId(p.id)}
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPersonToDelete(p)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4 text-destructive" />
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

      <PersonDeleteConfirmDialog
        open={personToDelete != null}
        person={personToDelete}
        kind="cast"
        onOpenChange={(open) => {
          if (!open) setPersonToDelete(null)
        }}
        onConfirm={() => {
          if (personToDelete) deleteMutation.mutate(personToDelete.id)
        }}
        isPending={deleteMutation.isPending}
      />

      {currentProductionId && (
        <PersonUnavailabilityDialog
          open={!!unavailabilityPerson}
          onOpenChange={(open) => {
            if (!open) setUnavailabilityPerson(null)
          }}
          person={unavailabilityPerson}
          productionId={currentProductionId}
          kind="cast"
        />
      )}

      {/* Add / Edit cast dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false)
            setEditingId(null)
          }
        }}
      >
        <DialogContent>
          <CastForm
            key={editingId ?? 'add'}
            defaultValues={editPerson ?? {}}
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

      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'cast' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                cast: prev.sections.cast === 'not_started' ? 'in_progress' : prev.sections.cast,
              },
            }))
          }
        }}
        sectionId="cast"
        sectionTitle="Cast Management"
        steps={castTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'cast' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              cast: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
