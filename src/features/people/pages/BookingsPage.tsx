import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useEffect } from 'react'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createBookingForActor,
  deleteBookingForActor,
  getBookingCoverageByShootDayForActor,
  listBookingsByProductionForActor,
  listPeopleByProductionForActor,
  listShootDayUnitsByProductionForActor,
  listShootDaysByProductionForActor,
  listUnitsByProductionForActor,
  updateBookingForActor,
} from '@/lib/access/projectDomainService'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { createBooking, deleteBooking, updateBooking } from '@/lib/db/repositories/booking'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus, AlertTriangle, UserMinus, Settings } from 'lucide-react'
import { getBookingCoverageByShootDay } from '@/lib/people/bookingIntelligence'
import type { Booking } from '@/lib/db/types'
import type { Person } from '@/lib/db/types'
import { BookingsCalendarView, type BookingChanges } from '@/features/people/components/bookings/BookingsCalendarView'
import { BookingColorSettingsDialog } from '@/features/people/components/bookings/BookingColorSettingsDialog'
import {
  getDefaultColorConfig,
  loadColorConfig,
  mergeConfigWithDefaults,
  saveColorConfig,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'

function formatPersonBookingLabel(person: Person): string {
  const meta = [
    person.is_cast ? 'Cast' : 'Crew',
    person.department?.trim(),
    person.role_name?.trim(),
  ].filter(Boolean)
  return meta.length > 0 ? `${person.name} · ${meta.join(' · ')}` : person.name
}

export function BookingsPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const [open, setOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [personId, setPersonId] = useState('')
  const [shootDayId, setShootDayId] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [filterUnit, setFilterUnit] = useState<string>('all')
  const [filterDepartment, setFilterDepartment] = useState<string>('all')
  const [filterCastCrew, setFilterCastCrew] = useState<string>('all')
  const [colorOverride, setColorOverride] = useState<{
    productionId: string
    config: BookingColorConfig
  } | null>(null)
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listBookingsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listPeopleByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listPeopleByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootDayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDayUnitsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShootDayUnitsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: bookingIntelligence } = useQuery({
    queryKey: ['booking-intelligence', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getBookingCoverageByShootDayForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return getBookingCoverageByShootDay(currentProductionId!)
    },
    enabled: !!currentProductionId,
  })

  const personById = useMemo(() => {
    const m = new Map<string, Person>()
    for (const p of people) m.set(p.id, p)
    return m
  }, [people])

  const filteredBookings = useMemo(() => {
    let list = bookings
    if (filterUnit !== 'all') {
      const shootDayIdsWithUnit = new Set(
        shootDayUnits.filter((sdu) => sdu.unit_id === filterUnit).map((sdu) => sdu.shoot_day_id)
      )
      list = list.filter((b) => b.shoot_day_id && shootDayIdsWithUnit.has(b.shoot_day_id))
    }
    if (filterDepartment !== 'all') {
      list = list.filter((b) => {
        const p = personById.get(b.person_id)
        return p?.department === filterDepartment
      })
    }
    if (filterCastCrew === 'cast') {
      list = list.filter((b) => personById.get(b.person_id)?.is_cast === 1)
    } else if (filterCastCrew === 'crew') {
      list = list.filter((b) => personById.get(b.person_id)?.is_cast !== 1)
    }
    return list
  }, [bookings, filterUnit, filterDepartment, filterCastCrew, shootDayUnits, personById])

  const createMutation = useMutation({
    mutationFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createBookingForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId!,
          personId,
          shootDayId: shootDayId || null,
          role: role.trim() || null,
          notes: notes.trim() || null,
        })
      }
      return createBooking({
        production_id: currentProductionId!,
        person_id: personId,
        shoot_day_id: shootDayId || null,
        role: role.trim() || null,
        notes: notes.trim() || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking-intelligence', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['person-booking-need'] })
      setOpen(false)
      setEditingBooking(null)
      setPersonId('')
      setShootDayId('')
      setRole('')
      setNotes('')
    },
  })

  useEffect(() => {
    const onAddBooking = () => {
      setEditingBooking(null)
      setPersonId('')
      setShootDayId('')
      setRole('')
      setNotes('')
      setOpen(true)
    }
    window.addEventListener('albatross-menu-people-add-booking', onAddBooking)
    return () => window.removeEventListener('albatross-menu-people-add-booking', onAddBooking)
  }, [])

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingBooking) return Promise.reject(new Error('No booking to update'))
      const data = {
        person_id: personId,
        shoot_day_id: shootDayId || null,
        role: role.trim() || null,
        notes: notes.trim() || null,
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updateBookingForActor({ db, actor: authSession.currentUser, bookingId: editingBooking.id, data })
      }
      return updateBooking(editingBooking.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking-intelligence', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['person-booking-need'] })
      setOpen(false)
      setEditingBooking(null)
      setPersonId('')
      setShootDayId('')
      setRole('')
      setNotes('')
    },
  })

  const storedColorConfig = useMemo(
    () =>
      currentProductionId
        ? loadColorConfig(currentProductionId, people)
        : getDefaultColorConfig(people),
    [currentProductionId, people]
  )

  const activeColorConfig = useMemo(() => {
    if (colorOverride && colorOverride.productionId === currentProductionId) {
      return mergeConfigWithDefaults(colorOverride.config, people)
    }
    return storedColorConfig
  }, [colorOverride, currentProductionId, people, storedColorConfig])

  const handleSaveColors = (cfg: BookingColorConfig) => {
    if (currentProductionId) {
      saveColorConfig(currentProductionId, cfg)
      setColorOverride({ productionId: currentProductionId, config: cfg })
    }
  }

  const applyBookingChanges = async (changes: BookingChanges) => {
    const useActor = authSession.authSupported && !!authSession.currentUser
    const db = useActor ? await getDb() : null
    for (const u of changes.updates ?? []) {
      if (useActor) {
        await updateBookingForActor({
          db: db!,
          actor: authSession.currentUser!,
          bookingId: u.bookingId,
          data: { shoot_day_id: u.shootDayId },
        })
      } else {
        await updateBooking(u.bookingId, { shoot_day_id: u.shootDayId })
      }
    }
    for (const c of changes.creates ?? []) {
      if (useActor) {
        await createBookingForActor({
          db: db!,
          actor: authSession.currentUser!,
          productionId: currentProductionId!,
          personId: c.personId,
          shootDayId: c.shootDayId,
          role: c.role,
          notes: c.notes,
        })
      } else {
        await createBooking({
          production_id: currentProductionId!,
          person_id: c.personId,
          shoot_day_id: c.shootDayId,
          role: c.role,
          notes: c.notes,
        })
      }
    }
    for (const id of changes.deletes ?? []) {
      if (useActor) {
        await deleteBookingForActor({ db: db!, actor: authSession.currentUser!, bookingId: id })
      } else {
        await deleteBooking(id)
      }
    }
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    queryClient.invalidateQueries({ queryKey: ['booking-intelligence', currentProductionId] })
    queryClient.invalidateQueries({ queryKey: ['person-booking-need'] })
  }

  const openEditBooking = (booking: Booking) => {
    setEditingBooking(booking)
    setPersonId(booking.person_id)
    setShootDayId(booking.shoot_day_id ?? '')
    setRole(booking.role ?? '')
    setNotes(booking.notes ?? '')
    setOpen(true)
  }

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people) if (p.department) set.add(p.department)
    return Array.from(set).sort()
  }, [people])

  const neededBookingRows = useMemo(() => {
    if (!bookingIntelligence) return []
    const rows: { key: string; date: string; role: string; name: string }[] = []
    for (const day of bookingIntelligence.shootDays) {
      const cov = bookingIntelligence.byShootDay.get(day.id)
      if (!cov) continue
      for (const pid of cov.neededButNotBooked) {
        const p = personById.get(pid)
        rows.push({
          key: `${day.id}-${pid}`,
          date: day.shoot_date,
          role: p?.role_name?.trim() || '—',
          name: p?.name ?? '—',
        })
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    return rows
  }, [bookingIntelligence, personById])

  if (!currentProductionId) {
    return (
      <RequireProduction title="Bookings">{null}</RequireProduction>
    )
  }

  const hasIntelligenceWarnings =
    bookingIntelligence &&
    (bookingIntelligence.totalMissingThisProduction > 0 ||
      bookingIntelligence.totalUnnecessaryThisProduction > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
              onClick={() => setColorSettingsOpen(true)}
              aria-label="Calendar color settings"
              title="Calendar colors"
            >
              <Settings className="size-4" />
            </Button>
            <Button data-tutorial="bookings-add"
              className="bg-mint-600 text-white hover:bg-mint-700 focus-visible:ring-mint-500/50"
              onClick={() => {
                setEditingBooking(null)
                setPersonId('')
                setShootDayId('')
                setRole('')
                setNotes('')
                setOpen(true)
              }}
            >
              <Plus className="mr-2 size-4" />
              Add booking
            </Button>
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o)
                if (!o) {
                  setEditingBooking(null)
                  setPersonId('')
                  setShootDayId('')
                  setRole('')
                  setNotes('')
                }
              }}
            >
              <DialogContent className="rounded-lg sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-lg">
                    {editingBooking ? 'Edit booking' : 'Assign person to shoot day'}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-foreground">Person</Label>
                    <Select value={personId} onValueChange={setPersonId}>
                      <SelectTrigger className="w-full focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                        <SelectValue placeholder="Select person..." />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {formatPersonBookingLabel(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Shoot day</Label>
                    <Select value={shootDayId} onValueChange={setShootDayId}>
                      <SelectTrigger className="w-full focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                        <SelectValue placeholder="Select shoot day..." />
                      </SelectTrigger>
                      <SelectContent>
                        {shootDays.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.shoot_date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Role (optional)</Label>
                    <Input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Lead"
                      className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Notes (optional)</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes"
                      className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen(false)
                      setEditingBooking(null)
                    }}
                  >
                    Cancel
                  </Button>
                  {editingBooking ? (
                    <Button
                      className="bg-mint-600 text-white hover:bg-mint-700 focus-visible:ring-mint-500/50"
                      onClick={() => updateMutation.mutate()}
                      disabled={!personId || updateMutation.isPending}
                    >
                      Save changes
                    </Button>
                  ) : (
                    <Button
                      className="bg-mint-600 text-white hover:bg-mint-700 focus-visible:ring-mint-500/50"
                      onClick={() => createMutation.mutate()}
                      disabled={!personId || createMutation.isPending}
                    >
                      Add booking
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {bookingIntelligence && hasIntelligenceWarnings && (
        <Card className="rounded-lg border-amber-500/30 bg-amber-500/5 dark:border-amber-600/40 dark:bg-amber-950/30">
          <CardContent className="py-2 px-4">
            <div className="flex flex-wrap items-center gap-8 text-sm">
              {bookingIntelligence.totalMissingThisProduction > 0 && (
                <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <strong>{bookingIntelligence.totalMissingThisProduction}</strong>
                  {bookingIntelligence.totalMissingThisProduction === 1
                    ? ' cast needed but not booked'
                    : ' cast needed but not booked'}
                </span>
              )}
              {bookingIntelligence.totalUnnecessaryThisProduction > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <UserMinus className="size-4 shrink-0" />
                  <strong>{bookingIntelligence.totalUnnecessaryThisProduction}</strong>
                  {bookingIntelligence.totalUnnecessaryThisProduction === 1
                    ? ' person booked but not needed'
                    : ' people booked but not needed'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {neededBookingRows.length > 0 && (
        <Card className="rounded-lg border-border bg-card">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Cast needed but not booked
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs font-medium">Date</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Role</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Cast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {neededBookingRows.map((row) => (
                    <TableRow key={row.key} className="border-border">
                      <TableCell className="text-sm py-2 text-foreground">{row.date}</TableCell>
                      <TableCell className="text-sm py-2 text-muted-foreground">{row.role}</TableCell>
                      <TableCell className="text-sm py-2 text-foreground">{row.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <BookingsCalendarView
          bookings={filteredBookings}
          allBookings={bookings}
          shootDays={shootDays}
          people={people}
          personById={personById}
          colorConfig={activeColorConfig}
          bookingIntelligence={bookingIntelligence ?? undefined}
          filterUnit={filterUnit}
          setFilterUnit={setFilterUnit}
          filterDepartment={filterDepartment}
          setFilterDepartment={setFilterDepartment}
          filterCastCrew={filterCastCrew}
          setFilterCastCrew={setFilterCastCrew}
          units={units}
          departments={departments}
          onApplyChanges={applyBookingChanges}
          onEditBooking={openEditBooking}
        />

      <BookingColorSettingsDialog
        open={colorSettingsOpen}
        onOpenChange={setColorSettingsOpen}
        people={people}
        config={activeColorConfig}
        onSave={handleSaveColors}
      />
    </div>
  )
}
