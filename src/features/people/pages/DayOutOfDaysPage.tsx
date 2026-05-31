import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  getCastIdsBySceneIdsForActor,
  getScheduledSceneIdsByShootDayForActor,
  listAvailabilityByProductionForActor,
  listCastForActor,
  listShootDaysByProductionForActor,
} from '@/lib/access/projectDomainService'
import { listCast } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { getScheduledSceneIdsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import {
  listAvailabilityByProduction,
  isUnavailableOnDate,
} from '@/lib/db/repositories/cast-availability'
import { generateDoodPdf, type DoodCellStatus } from '@/lib/pdf/dood'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Search, AlertTriangle, Download, FileDown } from 'lucide-react'

type CellStatus = 'WORK' | 'HOLD' | 'OFF' | 'CLASH'

interface DoodRow {
  personId: string
  personName: string
  start: string
  finish: string
  workDays: number
  holdDays: number
  clashCount: number
  cells: CellStatus[]
}

export function DayOutOfDaysPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const authSession = useAuthSession()
  const [search, setSearch] = useState('')
  const [onlyWithClashes, setOnlyWithClashes] = useState(false)

  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCast(currentProductionId)
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

  const { data: sceneIdsByDay = new Map<string, string[]>() } = useQuery({
    queryKey: ['dood-scenes-by-day', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return new Map<string, string[]>()
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return getScheduledSceneIdsByShootDayForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return getScheduledSceneIdsByShootDay(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const allSceneIds = useMemo(() => {
    const set = new Set<string>()
    for (const ids of sceneIdsByDay.values()) {
      for (const id of ids) set.add(id)
    }
    return Array.from(set)
  }, [sceneIdsByDay])

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene', allSceneIds.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: allSceneIds,
        })
      }
      return getCastIdsBySceneIds(allSceneIds)
    },
    enabled: allSceneIds.length > 0,
  })

  const { data: availabilityList = [] } = useQuery({
    queryKey: ['cast-availability', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listAvailabilityByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listAvailabilityByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const availabilityByPerson = useMemo(() => {
    const m = new Map<string, typeof availabilityList>()
    for (const a of availabilityList) {
      const arr = m.get(a.person_id) ?? []
      arr.push(a)
      m.set(a.person_id, arr)
    }
    return m
  }, [availabilityList])

  const dates = useMemo(
    () => shootDays.map((d: { shoot_date: string }) => d.shoot_date).sort(),
    [shootDays]
  )

  const workDatesByPerson = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const day of shootDays) {
      const sceneIds = sceneIdsByDay.get(day.id) ?? []
      const personIds = new Set<string>()
      for (const sid of sceneIds) {
        for (const pid of castBySceneId.get(sid) ?? []) personIds.add(pid)
      }
      for (const pid of personIds) {
        const set = m.get(pid) ?? new Set()
        set.add(day.shoot_date)
        m.set(pid, set)
      }
    }
    return m
  }, [shootDays, sceneIdsByDay, castBySceneId])

  const matrixRows = useMemo((): DoodRow[] => {
    return cast.map((p: { id: string; name: string }) => {
      const workDates = workDatesByPerson.get(p.id)
      const workDateList = workDates ? Array.from(workDates).sort() : []
      const start = workDateList[0] ?? '—'
      const finish = workDateList[workDateList.length - 1] ?? '—'
      const av = availabilityByPerson.get(p.id) ?? []
      const cells: CellStatus[] = dates.map((date: string) => {
        const isWork = workDateList.includes(date)
        const inRange = start !== '—' && finish !== '—' && date >= start && date <= finish
        const clash = isWork && isUnavailableOnDate(av, date)
        if (clash) return 'CLASH'
        if (isWork) return 'WORK'
        if (inRange) return 'HOLD'
        return 'OFF'
      })
      const holdDays = cells.filter((c) => c === 'HOLD').length
      const clashCount = cells.filter((c) => c === 'CLASH').length
      return {
        personId: p.id,
        personName: p.name,
        start,
        finish,
        workDays: workDateList.length,
        holdDays,
        clashCount,
        cells,
      }
    })
  }, [cast, dates, workDatesByPerson, availabilityByPerson])

  const filteredRows = useMemo(() => {
    let rows = matrixRows
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => r.personName.toLowerCase().includes(q))
    }
    if (onlyWithClashes) rows = rows.filter((r) => r.clashCount > 0)
    return rows
  }, [matrixRows, search, onlyWithClashes])

  const handleExportPdf = async () => {
    const productionName = currentProduction?.name ?? 'Production'
    const data = {
      productionName,
      dates,
      rows: filteredRows.map((r) => ({
        personName: r.personName,
        start: r.start,
        finish: r.finish,
        workDays: r.workDays,
        holdDays: r.holdDays,
        clashCount: r.clashCount,
        cells: r.cells as DoodCellStatus[],
      })),
    }
    const bytes = await generateDoodPdf(data)
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `day-out-of-days-${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    const headers = ['Name', ...dates, 'Start', 'Finish', 'Work Days', 'Hold Days', 'Clash Count']
    const lines = [
      headers.join(','),
      ...filteredRows.map((r) =>
        [
          `"${r.personName.replace(/"/g, '""')}"`,
          ...r.cells.map((c) => (c === 'CLASH' ? 'CLASH' : c)),
          r.start,
          r.finish,
          r.workDays,
          r.holdDays,
          r.clashCount,
        ].join(',')
      ),
    ]
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `day-out-of-days-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Day Out of Days</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Day Out of Days</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search cast..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 pl-8 bg-input border-border"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithClashes}
                onChange={(e) => setOnlyWithClashes(e.target.checked)}
                className="rounded border-border"
              />
              Only with clashes
            </label>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <FileDown className="mr-2 size-4" />
              CSV
            </Button>
            <Button size="sm" onClick={handleExportPdf}>
              <Download className="mr-2 size-4" />
              PDF
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          Cast-only. WORK = scheduled that day (from stripboard scenes). HOLD = between start/finish, not working. CLASH = working but marked unavailable. Unavailable dates are edited from Cast Manager or cast person detail.
        </p>

        <div className="overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-40 sticky left-0 z-10 bg-card border-r">Name</TableHead>
                {dates.map((d: string) => (
                  <TableHead key={d} className="text-center min-w-[3rem]">
                    {d}
                  </TableHead>
                ))}
                <TableHead className="text-center">Start</TableHead>
                <TableHead className="text-center">Finish</TableHead>
                <TableHead className="text-center">Work</TableHead>
                <TableHead className="text-center">Hold</TableHead>
                <TableHead className="text-center">Clash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.personId}>
                  <TableCell className="font-medium sticky left-0 z-10 bg-card border-r">
                    {r.personName}
                  </TableCell>
                  {r.cells.map((status, i) => (
                    <TableCell key={i} className="p-0 text-center">
                      <DoodCell status={status} date={dates[i]} />
                    </TableCell>
                  ))}
                  <TableCell className="text-muted-foreground text-sm">{r.start}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.finish}</TableCell>
                  <TableCell className="text-sm">{r.workDays}</TableCell>
                  <TableCell className="text-sm">{r.holdDays}</TableCell>
                  <TableCell>
                    {r.clashCount > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {r.clashCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredRows.length === 0 && (
          <p className="text-muted-foreground">
            {cast.length === 0
              ? 'No cast. Mark people as cast to see DOOD.'
              : 'No rows match filters.'}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}

function DoodCell({ status, date }: { status: CellStatus; date: string }) {
  const label = status === 'WORK' ? 'W' : status === 'HOLD' ? 'H' : status === 'CLASH' ? '!' : '—'
  const isClash = status === 'CLASH'

  const cell = (
    <span
      className={`
        inline-block min-w-[2.5rem] py-1 text-xs font-medium
        ${isClash ? 'bg-destructive/20 text-destructive border-l-2 border-destructive' : ''}
        ${status === 'WORK' && !isClash ? 'text-primary' : ''}
        ${status === 'HOLD' ? 'text-muted-foreground' : ''}
        ${status === 'OFF' ? 'text-muted-foreground/60' : ''}
      `}
    >
      {isClash && <AlertTriangle className="inline size-3 mr-0.5 align-middle" />}
      {label}
    </span>
  )

  if (isClash) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent>
          <p>Clash: scheduled to work on {date} but marked unavailable</p>
        </TooltipContent>
      </Tooltip>
    )
  }
  return cell
}
