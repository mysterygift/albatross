import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { castTutorialSteps } from '@/features/tutorial/sections/castTutorial'
import { listCast, createPerson, updatePerson } from '@/lib/db/repositories/person'
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
import { Search, Plus, Pencil, Eye } from 'lucide-react'
import type { Person } from '@/lib/db/types'
import { CastForm, type CastFormValues } from '@/features/people/components/CastForm'

const CONTRIBUTOR_FORM_LABELS: Record<Person['contributor_form_status'], string> = {
  not_requested: 'Not requested',
  requested: 'Requested',
  signed: 'Signed',
  expired: 'Expired',
}

type ContributorFilter = 'all' | Person['contributor_form_status']
type MissingFilter = 'all' | 'missing_role' | 'missing_cast_number' | 'missing_agent'

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
  const queryClient = useQueryClient()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [search, setSearch] = useState('')
  const [contributorFilter, setContributorFilter] = useState<ContributorFilter>('all')
  const [missingFilter, setMissingFilter] = useState<MissingFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (progress?.currentSection === 'cast') {
      queueMicrotask(() => setTutorialOpen(true))
    }
  }, [progress?.currentSection])

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: () => listCast(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const summary = useMemo(() => {
    const total = cast.length
    const missingCastNumber = cast.filter((p) => !hasCastNumber(p)).length
    const missingRole = cast.filter((p) => !hasRole(p)).length
    const missingAgent = cast.filter((p) => !hasAgentInfo(p)).length
    return { total, missingCastNumber, missingRole, missingAgent }
  }, [cast])

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

    return list
  }, [cast, search, contributorFilter, missingFilter])

  const createMutation = useMutation({
    mutationFn: (d: CastFormValues) =>
      createPerson({
        production_id: currentProductionId!,
        name: d.name.trim(),
        is_cast: 1,
        cast_number: trimOrNull(d.cast_number),
        role_name: trimOrNull(d.role_name),
        email: trimOrNull(d.email),
        phone: trimOrNull(d.phone),
        agent_name: trimOrNull(d.agent_name),
        agent_email: trimOrNull(d.agent_email),
        agent_phone: trimOrNull(d.agent_phone),
        contributor_form_status: d.contributor_form_status,
        notes: trimOrNull(d.notes),
        phases: trimOrNull(d.phases),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cast'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setAddOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CastFormValues }) =>
      updatePerson(id, {
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
        phases: trimOrNull(data.phases),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cast'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setEditingId(null)
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground text-xs">Cast</p>
            <p className="text-lg font-medium">{summary.total}</p>
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
                  <TableHead className="w-24 text-right">Actions</TableHead>
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
