import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useEffect, type SetStateAction } from 'react'
import { useCurrentProduction } from '@/features/productions/context'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { createBooking, deleteBooking } from '@/lib/db/repositories/booking'
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
  DialogTrigger,
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
import { Plus, Trash2, ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react'
import type { Booking } from '@/lib/db/types'
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
  const [personId, setPersonId] = useState('')
  const [shootDayId, setShootDayId] = useState('')
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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setOpen(false)
      setPersonId('')
      setShootDayId('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBooking,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="bg-zinc-800 border border-zinc-700">
              <TabsTrigger value="calendar" className="gap-2 data-[state=active]:bg-mint-600 data-[state=active]:text-white">
                <Calendar className="size-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2 data-[state=active]:bg-mint-600 data-[state=active]:text-white">
                <List className="size-4" />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Add booking
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign person to shoot day</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Person</Label>
                  <Select value={personId} onValueChange={setPersonId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
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
                <div>
                  <Label>Shoot day</Label>
                  <Select value={shootDayId} onValueChange={setShootDayId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!personId || createMutation.isPending}
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === 'calendar' && (
        <BookingsCalendarView
          bookings={filteredBookings}
          shootDays={shootDays}
          personById={personById}
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
        />
      )}
    </div>
  )
}

function BookingsCalendarView({
  bookings,
  shootDays,
  personById,
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-sm whitespace-nowrap">Unit</Label>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-[140px]">
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
            <SelectTrigger className="w-[140px]">
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
            <SelectTrigger className="w-[120px]">
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1))
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center font-medium">
            {month.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1))
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 font-medium">
            {d}
          </div>
        ))}
        {blanks.map((_, i) => (
          <div key={`b-${i}`} className="min-h-[80px] rounded border border-zinc-700 p-2" />
        ))}
        {days.map((d) => {
          const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const dayBookings = bookingsByDate.get(dateStr) ?? []
          return (
            <div
              key={d}
              className="min-h-[80px] rounded border border-zinc-700 p-2 text-left"
            >
              <span className="text-foreground font-medium">{d}</span>
              {dayBookings.length > 0 && (
                <div className="mt-1 space-y-1">
                  {dayBookings.map((b) => (
                    <Badge
                      key={b.id}
                      variant="secondary"
                      className="block w-full justify-start text-xs"
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
        <Card className="border-zinc-700 bg-zinc-800/50">
          <CardHeader>
            <CardTitle>No bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add a booking to assign people to shoot days.
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
}) {
  type Row = Booking & { personName: string; department: string | null; dateLabel: string; unitLabel: string }
  const rows: Row[] = useMemo(
    () =>
      bookings.map((b) => ({
        ...b,
        personName: getPersonName(b.person_id),
        department: people.find((p) => p.id === b.person_id)?.department ?? null,
        dateLabel: getDayLabel(b.shoot_day_id),
        unitLabel: getUnitLabels(b.shoot_day_id),
      })),
    [bookings, people, getPersonName, getDayLabel, getUnitLabels]
  )

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
      { id: 'status', header: 'Status', cell: () => 'Booked' },
      {
        id: 'actions',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate(row.original.id)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        ),
      },
    ],
    [people, deleteMutation]
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
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <div className="rounded-md border border-zinc-700">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {typeof h.column.columnDef.header === 'string'
                      ? h.column.columnDef.header
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
