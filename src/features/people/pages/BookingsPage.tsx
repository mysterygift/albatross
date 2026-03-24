import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useEffect, type SetStateAction } from 'react'
import { useCurrentProduction } from '@/features/productions/context'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { createBooking, deleteBooking, updateBooking } from '@/lib/db/repositories/booking'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
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
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ChevronLeft, ChevronRight, Calendar, List, AlertTriangle, UserMinus, Pencil } from 'lucide-react'
import { getBookingCoverageByShootDay } from '@/lib/people/bookingIntelligence'
import type { Booking } from '@/lib/db/types'
import type { BookingIntelligenceSummary } from '@/lib/people/bookingIntelligence'
import type { Person } from '@/lib/db/types'
import type { ShootDay } from '@/lib/db/types'
import type { Unit } from '@/lib/db/types'

const PEOPLE_BOOKINGS_VIEW_KEY = 'peopleBookingsView'
type ViewMode = 'calendar' | 'list'

function getStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(PEOPLE_BOOKINGS_VIEW_KEY)
    if (v === 'calendar' || v === 'list') return v
  } catch {}
  return 'calendar'
}

function setStoredView(view: ViewMode) {
  try {
    localStorage.setItem(PEOPLE_BOOKINGS_VIEW_KEY, view)
  } catch {}
}

export function BookingsPage() {
  const { currentProductionId } = useCurrentProduction()
  const [view, setView] = useState<ViewMode>(getStoredView)
  const [open, setOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [personId, setPersonId] = useState('')
  const [shootDayId, setShootDayId] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [filterUnit, setFilterUnit] = useState<string>('all')
  const [filterDepartment, setFilterDepartment] = useState<string>('all')
  const [filterCastCrew, setFilterCastCrew] = useState<string>('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: false }])
  const [globalFilter, setGlobalFilter] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    setStoredView(view)
  }, [view])

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', currentProductionId],
    queryFn: () => listBookingsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: () => listPeopleByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: () => listUnitsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shootDayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', currentProductionId],
    queryFn: () => listShootDayUnitsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: bookingIntelligence } = useQuery({
    queryKey: ['booking-intelligence', currentProductionId],
    queryFn: () => getBookingCoverageByShootDay(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const shootDayById = useMemo(() => {
    const m = new Map<string, ShootDay>()
    for (const d of shootDays) m.set(d.id, d)
    return m
  }, [shootDays])

  const personById = useMemo(() => {
    const m = new Map<string, Person>()
    for (const p of people) m.set(p.id, p)
    return m
  }, [people])

  const unitById = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const u of units) m.set(u.id, u)
    return m
  }, [units])

  const shootDayToUnitIds = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const sdu of shootDayUnits) {
      const arr = m.get(sdu.shoot_day_id) ?? []
      if (!arr.includes(sdu.unit_id)) arr.push(sdu.unit_id)
      m.set(sdu.shoot_day_id, arr)
    }
    return m
  }, [shootDayUnits])

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
    mutationFn: () =>
      createBooking({
        production_id: currentProductionId!,
        person_id: personId,
        shoot_day_id: shootDayId || null,
        role: role.trim() || null,
        notes: notes.trim() || null,
      }),
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
    mutationFn: () => {
      if (!editingBooking) return Promise.reject(new Error('No booking to update'))
      return updateBooking(editingBooking.id, {
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

  const deleteMutation = useMutation({
    mutationFn: deleteBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking-intelligence', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['person-booking-need'] })
    },
  })

  const getPersonName = (id: string) => personById.get(id)?.name ?? '—'
  const getDayLabel = (id: string | null) =>
    id ? shootDayById.get(id)?.shoot_date ?? '—' : '—'
  const getUnitLabels = (shootDayId: string | null) => {
    if (!shootDayId) return '—'
    const ids = shootDayToUnitIds.get(shootDayId) ?? []
    return ids.map((id) => unitById.get(id)?.name ?? id).join(', ') || '—'
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people) if (p.department) set.add(p.department)
    return Array.from(set).sort()
  }, [people])

  const hasIntelligenceWarnings =
    bookingIntelligence &&
    (bookingIntelligence.totalMissingThisProduction > 0 ||
      bookingIntelligence.totalUnnecessaryThisProduction > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Bookings</h1>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="border border-border bg-muted/30">
              <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-mint-600 data-[state=active]:text-white data-[state=active]:border-transparent">
                <Calendar className="size-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2 data-[state=active]:bg-mint-600 data-[state=active]:text-white data-[state=active]:border-transparent">
                <List className="size-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
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
            <DialogContent className="rounded-lg border-border sm:max-w-md">
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
                          {p.name}
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
        </div>
      </div>

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

      {bookingIntelligence && bookingIntelligence.shootDays.length > 0 && (
        <Card className="rounded-lg border-border bg-card">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm font-medium text-foreground">Shoot Day Booking Overview</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs font-medium">Date</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Needed</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Booked</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Missing</TableHead>
                    <TableHead className="text-muted-foreground text-xs font-medium">Extra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookingIntelligence.shootDays.map((day) => {
                    const cov = bookingIntelligence.byShootDay.get(day.id)
                    if (!cov) return null
                    const hasIssue = cov.missingCount > 0 || cov.unnecessaryCount > 0
                    return (
                      <TableRow
                        key={day.id}
                        className={`border-border ${hasIssue ? 'bg-amber-500/5 dark:bg-amber-950/20' : ''}`}
                      >
                        <TableCell className="text-sm py-2 text-foreground">{day.shoot_date}</TableCell>
                        <TableCell className="text-sm py-2">{cov.neededPersonIds.size}</TableCell>
                        <TableCell className="text-sm py-2">{cov.bookedPersonIds.size}</TableCell>
                        <TableCell className="text-sm py-2">
                          {cov.missingCount > 0 ? (
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              {cov.missingCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {cov.unnecessaryCount > 0 ? (
                            <span className="text-muted-foreground">{cov.unnecessaryCount}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'calendar' && (
        <BookingsCalendarView
          bookings={filteredBookings}
          shootDays={shootDays}
          personById={personById}
          bookingIntelligence={bookingIntelligence ?? undefined}
          filterUnit={filterUnit}
          setFilterUnit={setFilterUnit}
          filterDepartment={filterDepartment}
          setFilterDepartment={setFilterDepartment}
          filterCastCrew={filterCastCrew}
          setFilterCastCrew={setFilterCastCrew}
          units={units}
          departments={departments}
        />
      )}

      {view === 'list' && (
        <BookingsListView
          bookings={filteredBookings}
          people={people}
          getPersonName={getPersonName}
          getDayLabel={getDayLabel}
          getUnitLabels={getUnitLabels}
          deleteMutation={deleteMutation}
          sorting={sorting}
          setSorting={setSorting}
          globalFilter={globalFilter}
          setGlobalFilter={setGlobalFilter}
          bookingIntelligence={bookingIntelligence ?? undefined}
          shootDayById={shootDayById}
          openAddBookingWithPrefill={(pId, dayId) => {
            setPersonId(pId)
            setShootDayId(dayId)
            setRole('')
            setNotes('')
            setEditingBooking(null)
            setOpen(true)
          }}
          onEditBooking={(booking) => {
            setEditingBooking(booking)
            setPersonId(booking.person_id)
            setShootDayId(booking.shoot_day_id ?? '')
            setRole(booking.role ?? '')
            setNotes(booking.notes ?? '')
            setOpen(true)
          }}
        />
      )}
    </div>
  )
}

function BookingsCalendarView({
  bookings,
  shootDays,
  personById,
  bookingIntelligence,
  filterUnit,
  setFilterUnit,
  filterDepartment,
  setFilterDepartment,
  filterCastCrew,
  setFilterCastCrew,
  units,
  departments,
}: {
  bookings: Booking[]
  shootDays: ShootDay[]
  personById: Map<string, Person>
  bookingIntelligence?: BookingIntelligenceSummary
  filterUnit: string
  setFilterUnit: (v: string) => void
  filterDepartment: string
  setFilterDepartment: (v: string) => void
  filterCastCrew: string
  setFilterCastCrew: (v: string) => void
  units: Unit[]
  departments: string[]
}) {
  const [month, setMonth] = useState(() => new Date())

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const startDay = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()
  const blanks = Array(startDay).fill(null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const bookingsByDate = useMemo(() => {
    const m = new Map<string, Booking[]>()
    for (const b of bookings) {
      const date = b.shoot_day_id ? shootDays.find((d) => d.id === b.shoot_day_id)?.shoot_date : null
      if (date) {
        const arr = m.get(date) ?? []
        arr.push(b)
        m.set(date, arr)
      }
    }
    return m
  }, [bookings, shootDays])

  const shootDayByDate = useMemo(() => {
    const m = new Map<string, ShootDay>()
    for (const d of shootDays) m.set(d.shoot_date, d)
    return m
  }, [shootDays])

  return (
    <>
      <Card className="rounded-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">Unit</Label>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger className="w-[140px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">Department</Label>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-[140px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm whitespace-nowrap">Cast/Crew</Label>
              <Select value={filterCastCrew} onValueChange={setFilterCastCrew}>
                <SelectTrigger className="w-[120px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="cast">Cast</SelectItem>
                  <SelectItem value="crew">Crew</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <Button
          variant="outline"
          size="icon"
          className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1))
          }
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[180px] text-center font-medium text-foreground">
          {month.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1))
          }
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-sm text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 font-medium">
            {d}
          </div>
        ))}
        {blanks.map((_, i) => (
          <div key={`b-${i}`} className="min-h-[88px] rounded-md border border-border bg-muted/20 p-2" />
        ))}
        {days.map((d) => {
          const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const dayBookings = bookingsByDate.get(dateStr) ?? []
          const shootDay = shootDayByDate.get(dateStr)
          const coverage =
            bookingIntelligence && shootDay
              ? bookingIntelligence.byShootDay.get(shootDay.id)
              : null
          const hasBookings = dayBookings.length > 0
          return (
            <div
              key={d}
              className={`min-h-[88px] rounded-md border p-2 text-left transition-colors ${
                hasBookings
                  ? 'border-mint-500/40 bg-mint-500/5 dark:bg-mint-500/10'
                  : 'border-border bg-muted/20'
              }`}
            >
              <span className="text-foreground font-medium">{d}</span>
              {coverage && (coverage.missingCount > 0 || coverage.unnecessaryCount > 0) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {coverage.missingCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      title={`${coverage.missingCount} needed but not booked`}
                    >
                      {coverage.missingCount} missing
                    </Badge>
                  )}
                  {coverage.unnecessaryCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-border bg-muted/50 text-muted-foreground"
                      title={`${coverage.unnecessaryCount} booked but not needed`}
                    >
                      {coverage.unnecessaryCount} extra
                    </Badge>
                  )}
                </div>
              )}
              {dayBookings.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {dayBookings.map((b) => (
                    <Badge
                      key={b.id}
                      variant="secondary"
                      className="block w-full justify-start text-xs bg-mint-500/15 text-mint-800 dark:text-mint-200 border-mint-500/30"
                    >
                      {personById.get(b.person_id)?.name ?? '—'}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {bookings.length === 0 && (
        <Card className="rounded-lg border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">No bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add a booking above to assign people to shoot days.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function BookingsListView({
  bookings,
  people,
  getPersonName,
  getDayLabel,
  getUnitLabels,
  deleteMutation,
  sorting,
  setSorting,
  globalFilter,
  setGlobalFilter,
  bookingIntelligence,
  shootDayById,
  openAddBookingWithPrefill,
  onEditBooking,
}: {
  bookings: Booking[]
  people: Person[]
  getPersonName: (id: string) => string
  getDayLabel: (id: string | null) => string
  getUnitLabels: (id: string | null) => string
  deleteMutation: { mutate: (id: string) => void; isPending: boolean }
  sorting: SortingState
  setSorting: (updaterOrValue: SetStateAction<SortingState>) => void
  globalFilter: string
  setGlobalFilter: (s: string) => void
  bookingIntelligence?: BookingIntelligenceSummary
  shootDayById: Map<string, ShootDay>
  openAddBookingWithPrefill: (personId: string, shootDayId: string) => void
  onEditBooking: (booking: Booking) => void
}) {
  type Row = Booking & {
    personName: string
    department: string | null
    dateLabel: string
    unitLabel: string
    bookingStatus: 'properly_booked' | 'booked_but_not_needed' | null
  }
  const rows: Row[] = useMemo(() => {
    const covByDay = bookingIntelligence?.byShootDay
    return bookings.map((b) => {
      const coverage = b.shoot_day_id && covByDay ? covByDay.get(b.shoot_day_id) : null
      const bookedButNotNeeded =
        coverage?.bookedButNotNeeded.has(b.person_id) ?? false
      const properlyBooked =
        coverage?.properlyBooked.has(b.person_id) ?? false
      let bookingStatus: Row['bookingStatus'] = null
      if (coverage) {
        if (bookedButNotNeeded) bookingStatus = 'booked_but_not_needed'
        else if (properlyBooked) bookingStatus = 'properly_booked'
      }
      return {
        ...b,
        personName: getPersonName(b.person_id),
        department: people.find((p) => p.id === b.person_id)?.department ?? null,
        dateLabel: getDayLabel(b.shoot_day_id),
        unitLabel: getUnitLabels(b.shoot_day_id),
        bookingStatus,
      }
    })
  }, [bookings, people, getPersonName, getDayLabel, getUnitLabels, bookingIntelligence])

  const neededButNotBookedList = useMemo(() => {
    if (!bookingIntelligence) return []
    const list: { personId: string; shootDayId: string; personName: string; dayLabel: string }[] = []
    for (const [dayId, cov] of bookingIntelligence.byShootDay) {
      const day = shootDayById.get(dayId)
      const dayLabel = day ? day.shoot_date : dayId
      for (const pid of cov.neededButNotBooked) {
        list.push({
          personId: pid,
          shootDayId: dayId,
          personName: getPersonName(pid),
          dayLabel,
        })
      }
    }
    return list
  }, [bookingIntelligence, shootDayById, getPersonName])

  const columns: ColumnDef<Row>[] = useMemo(
    () => [
      { accessorKey: 'personName', header: 'Person' },
      {
        id: 'roleDepartment',
        header: 'Role / Department',
        cell: ({ row }) => {
          const b = row.original
          const p = people.find((x) => x.id === b.person_id)
          const role = b.role ?? null
          const dept = p?.department ?? null
          if (!role && !dept) return '—'
          if (role && dept) return `${role} · ${dept}`
          return (role ?? dept) ?? '—'
        },
      },
      { accessorKey: 'dateLabel', header: 'Date / Range', id: 'date' },
      { accessorKey: 'unitLabel', header: 'Unit' },
      { accessorKey: 'notes', header: 'Notes', cell: ({ getValue }) => (getValue() as string) ?? '—' },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.bookingStatus
          if (s === 'properly_booked') return <span className="font-medium text-mint-600 dark:text-mint-400">Properly booked</span>
          if (s === 'booked_but_not_needed') return <span className="text-muted-foreground">Booked but not needed</span>
          return <span className="text-muted-foreground">Booked</span>
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onEditBooking(row.original)}
              aria-label="Edit booking"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate(row.original.id)}
              disabled={deleteMutation.isPending}
              aria-label="Delete booking"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [people, deleteMutation, onEditBooking]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <>
      {neededButNotBookedList.length > 0 && (
        <Card className="rounded-lg border-amber-500/30 bg-amber-500/5 dark:border-amber-600/40 dark:bg-amber-950/30">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Needed but not booked ({neededButNotBookedList.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="flex flex-wrap gap-2">
              {neededButNotBookedList.slice(0, 12).map((item) => (
                <Badge
                  key={`${item.personId}-${item.shootDayId}`}
                  variant="outline"
                  className="gap-1.5 pr-1 border-amber-500/40 bg-amber-500/10 text-foreground"
                >
                  <span className="truncate max-w-[120px]">{item.personName}</span>
                  <span className="text-muted-foreground">· {item.dayLabel}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-mint-600 dark:text-mint-400 hover:bg-mint-500/15 focus-visible:ring-mint-500/50"
                    onClick={() => openAddBookingWithPrefill(item.personId, item.shootDayId)}
                  >
                    Add booking
                  </Button>
                </Badge>
              ))}
              {neededButNotBookedList.length > 12 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{neededButNotBookedList.length - 12} more
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search people, date, unit..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
        />
      </div>
      <Card className="rounded-lg border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30 [&_tr]:border-border">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-border hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-foreground">
                    {typeof h.column.columnDef.header === 'string'
                      ? h.column.columnDef.header
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="[&_tr]:border-border">
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-border">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
