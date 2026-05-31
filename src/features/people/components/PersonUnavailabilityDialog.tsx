import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createCastAvailabilityForActor,
  createCrewAvailabilityForActor,
  deleteCastAvailabilityForActor,
  deleteCrewAvailabilityForActor,
  listAvailabilityByPersonForActor,
  listCrewAvailabilityByPersonForActor,
  updateCastAvailabilityForActor,
  updateCrewAvailabilityForActor,
} from '@/lib/access/projectDomainService'
import {
  createAvailability as createCastAvailability,
  deleteAvailability as deleteCastAvailability,
  listAvailabilityByPerson,
  updateAvailability as updateCastAvailability,
} from '@/lib/db/repositories/cast-availability'
import {
  createCrewAvailability,
  deleteCrewAvailability,
  listCrewAvailabilityByPerson,
  updateCrewAvailability,
} from '@/lib/db/repositories/crew-availability'
import { personRecentActivityQueryKey } from '@/lib/db/repositories/personActivity'
import type { CastAvailability, CrewAvailability, Person } from '@/lib/db/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type PersonUnavailabilityKind = 'cast' | 'crew'

type AvailabilityWindow = CastAvailability | CrewAvailability

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB')
}

function castAvailabilityQueryKey(personId: string) {
  return ['availability-by-person', personId] as const
}

function crewAvailabilityQueryKey(personId: string) {
  return ['crew-availability-by-person', personId] as const
}

function validateDateRange(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Start and end dates are required.'
  if (startDate > endDate) return 'Start date must be on or before end date.'
  return null
}

function invalidateUnavailabilityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: PersonUnavailabilityKind,
  productionId: string,
  personId: string
) {
  if (kind === 'cast') {
    queryClient.invalidateQueries({ queryKey: castAvailabilityQueryKey(personId) })
    queryClient.invalidateQueries({ queryKey: ['cast-availability', productionId] })
  } else {
    queryClient.invalidateQueries({ queryKey: crewAvailabilityQueryKey(personId) })
    queryClient.invalidateQueries({ queryKey: ['crew-availability', productionId] })
  }
  queryClient.invalidateQueries({ queryKey: personRecentActivityQueryKey(productionId, personId) })
}

export function PersonUnavailabilityDialog({
  open,
  onOpenChange,
  person,
  productionId,
  kind,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person | null
  productionId: string
  kind: PersonUnavailabilityKind
}) {
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const personId = person?.id ?? ''

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const queryKey = kind === 'cast' ? castAvailabilityQueryKey(personId) : crewAvailabilityQueryKey(personId)

  const { data: windows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!personId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        if (kind === 'cast') {
          return listAvailabilityByPersonForActor({ db, actor: authSession.currentUser, personId })
        }
        return listCrewAvailabilityByPersonForActor({ db, actor: authSession.currentUser, personId })
      }
      if (kind === 'cast') {
        return listAvailabilityByPerson(personId)
      }
      return listCrewAvailabilityByPerson(personId)
    },
    enabled: open && !!personId,
  })

  const unavailableWindows = useMemo(
    () => windows.filter((w) => w.availability === 'UNAVAILABLE'),
    [windows]
  )

  useEffect(() => {
    if (!open) {
      setFormOpen(false)
      setEditingId(null)
      setStartDate('')
      setEndDate('')
      setNotes('')
      setFormError(null)
    }
  }, [open])

  const resetForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setStartDate('')
    setEndDate('')
    setNotes('')
    setFormError(null)
  }

  const startAdd = () => {
    setEditingId(null)
    setStartDate('')
    setEndDate('')
    setNotes('')
    setFormError(null)
    setFormOpen(true)
  }

  const startEdit = (entry: AvailabilityWindow) => {
    setEditingId(entry.id)
    setStartDate(entry.start_date)
    setEndDate(entry.end_date)
    setNotes(entry.notes ?? '')
    setFormError(null)
    setFormOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error('No person selected')
      const err = validateDateRange(startDate, endDate)
      if (err) throw new Error(err)

      const payload = {
        start_date: startDate,
        end_date: endDate,
        availability: 'UNAVAILABLE' as const,
        notes: notes.trim() || null,
      }

      if (editingId) {
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          if (kind === 'cast') {
            return updateCastAvailabilityForActor({
              db,
              actor: authSession.currentUser,
              availabilityId: editingId,
              data: payload,
            })
          }
          return updateCrewAvailabilityForActor({
            db,
            actor: authSession.currentUser,
            availabilityId: editingId,
            data: payload,
          })
        }
        if (kind === 'cast') {
          return updateCastAvailability(editingId, payload)
        }
        return updateCrewAvailability(editingId, payload)
      }

      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        if (kind === 'cast') {
          return createCastAvailabilityForActor({
            db,
            actor: authSession.currentUser,
            productionId,
            personId,
            startDate,
            endDate,
            notes: payload.notes,
          })
        }
        return createCrewAvailabilityForActor({
          db,
          actor: authSession.currentUser,
          productionId,
          personId,
          startDate,
          endDate,
          notes: payload.notes,
        })
      }

      if (kind === 'cast') {
        return createCastAvailability({
          production_id: productionId,
          person_id: personId,
          start_date: startDate,
          end_date: endDate,
          availability: 'UNAVAILABLE',
          notes: payload.notes,
        })
      }
      return createCrewAvailability({
        production_id: productionId,
        person_id: personId,
        start_date: startDate,
        end_date: endDate,
        availability: 'UNAVAILABLE',
        notes: payload.notes,
      })
    },
    onSuccess: () => {
      invalidateUnavailabilityQueries(queryClient, kind, productionId, personId)
      resetForm()
    },
    onError: (err: Error) => {
      setFormError(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (availabilityId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        if (kind === 'cast') {
          return deleteCastAvailabilityForActor({ db, actor: authSession.currentUser, availabilityId })
        }
        return deleteCrewAvailabilityForActor({ db, actor: authSession.currentUser, availabilityId })
      }
      if (kind === 'cast') {
        return deleteCastAvailability(availabilityId)
      }
      return deleteCrewAvailability(availabilityId)
    },
    onSuccess: () => {
      if (personId) {
        invalidateUnavailabilityQueries(queryClient, kind, productionId, personId)
      }
    },
  })

  const helperText =
    kind === 'cast'
      ? 'Marks dates this person cannot work. Clashes appear in Day Out of Days when they are scheduled to work.'
      : 'Marks dates this crew member cannot work.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unavailable dates</DialogTitle>
          <DialogDescription>
            {person ? `${person.name} — ${helperText}` : helperText}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={startAdd} disabled={formOpen}>
              <Plus className="mr-2 size-4" />
              Add unavailable dates
            </Button>
          </div>

          {formOpen && (
            <div className="rounded-md border border-border p-4 space-y-3">
              <p className="text-sm font-medium">{editingId ? 'Edit entry' : 'New entry'}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unavail-start">Start date</Label>
                  <Input
                    id="unavail-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unavail-end">End date</Label>
                  <Input
                    id="unavail-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unavail-notes">Notes (optional)</Label>
                <Textarea
                  id="unavail-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. holiday, other commitment"
                />
              </div>
              {formError && <p className="text-destructive text-sm">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {editingId ? 'Save changes' : 'Add entry'}
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : unavailableWindows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unavailable dates recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-24 text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unavailableWindows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.start_date)}</TableCell>
                    <TableCell>{formatDate(entry.end_date)}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{entry.notes ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => startEdit(entry)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function countUnavailableWindows(
  windows: Array<{ person_id: string; availability: string }>,
  personId: string
): number {
  return windows.filter((w) => w.person_id === personId && w.availability === 'UNAVAILABLE').length
}
