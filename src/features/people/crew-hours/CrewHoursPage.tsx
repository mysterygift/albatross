import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Info, RotateCcw, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { getDayLog, saveDayLog } from '@/lib/db/repositories/scriptSupervisor'
import {
  CREW_HOURS_REMOTE_ERROR,
  getCrewHoursSettings,
  listCrewDayHours,
  listLabourDayRates,
  listOvertimeExemptPersonIds,
  setCrewDayTimes,
  setOvertimeExempt,
} from '@/lib/db/repositories/crewHours'
import {
  computeCrewHoursDay,
  crewForDay,
  formatDuration,
  formatOvertime,
  type CrewHoursRow,
} from '@/lib/crew-hours/crewHours'
import { pickDefaultShootDay } from '@/lib/script-supervisor/slatePanel'
import { localIsoDate } from '@/lib/dates/localIsoDate'
import { formatMoney } from '@/lib/money/formatMoney'
import { cn } from '@/lib/utils'
import { OvertimeRuleDialog } from './OvertimeRuleDialog'
import { TimeField } from './TimeField'

type Filter = 'all' | 'own' | 'no_rate' | 'short_rest'

export function CrewHoursPage() {
  return (
    <RequireProduction title="Crew Hours">
      <CrewHoursWorkspace />
    </RequireProduction>
  )
}

function formatShootDay(day: { day_number: number | null; shoot_date: string }): string {
  const date = new Date(day.shoot_date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return day.day_number != null ? `Day ${day.day_number} · ${date}` : date
}

function CrewHoursWorkspace() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const productionId = currentProductionId!
  const currency = currentProduction?.currency_code || 'GBP'
  const queryClient = useQueryClient()
  const { data: dataSource } = useEffectiveDataSourceForProduction(productionId)
  const isRemote = dataSource === 'remote_server'
  const { data: workingRevision } = useWorkingBudgetRevision(productionId)
  const revisionId = workingRevision?.id ?? null

  const [chosenDayId, setChosenDayId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [ruleOpen, setRuleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enabled = dataSource !== undefined && !isRemote
  const { data: days = [] } = useQuery({
    queryKey: ['shoot-days', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
    enabled,
  })
  const sortedDays = useMemo(() => [...days].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)), [days])
  const day = sortedDays.find((d) => d.id === chosenDayId) ?? pickDefaultShootDay(sortedDays, localIsoDate())
  const nextDay = day ? sortedDays.find((d) => d.shoot_date > day.shoot_date) ?? null : null

  const { data: people = [] } = useQuery({
    queryKey: ['people', productionId],
    queryFn: () => listPeopleByProduction(productionId),
    enabled,
  })
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', productionId],
    queryFn: () => listBookingsByProduction(productionId),
    enabled,
  })
  const dayIds = [day?.id, nextDay?.id].filter((x): x is string => !!x)
  const { data: dayHours = [] } = useQuery({
    queryKey: ['crew-hours', productionId, 'day-hours', dayIds.join(',')],
    queryFn: () => listCrewDayHours(dayIds),
    enabled: enabled && dayIds.length > 0,
  })
  const { data: dayLog = null } = useQuery({
    queryKey: ['script-supervisor', 'day-log', day?.id ?? null],
    queryFn: () => getDayLog(day!.id),
    enabled: enabled && !!day,
  })
  const { data: nextDayLog = null } = useQuery({
    queryKey: ['script-supervisor', 'day-log', nextDay?.id ?? null],
    queryFn: () => getDayLog(nextDay!.id),
    enabled: enabled && !!nextDay,
  })
  const { data: settings } = useQuery({
    queryKey: ['crew-hours', productionId, 'settings'],
    queryFn: () => getCrewHoursSettings(productionId),
    enabled,
  })
  const { data: exempt = new Set<string>() } = useQuery({
    queryKey: ['crew-hours', productionId, 'exempt'],
    queryFn: () => listOvertimeExemptPersonIds(productionId),
    enabled,
  })
  const { data: rates = new Map<string, number>() } = useQuery({
    queryKey: ['crew-hours', productionId, 'rates', revisionId],
    queryFn: () => listLabourDayRates(productionId, revisionId),
    enabled: enabled && workingRevision !== undefined,
  })

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const summary = useMemo(() => {
    if (!day || !settings) return null
    const own = new Map(dayHours.filter((h) => h.shoot_day_id === day.id).map((h) => [h.person_id, h]))
    const nextOwn = new Map(dayHours.filter((h) => h.shoot_day_id === nextDay?.id).map((h) => [h.person_id, h]))
    const crewIds = crewForDay({ people, bookings, day, personIdsWithHours: own.keys() })
    return computeCrewHoursDay({
      shootDate: day.shoot_date,
      scheduledCall: day.call_time,
      scheduledWrap: day.wrap_time,
      actualCall: dayLog?.call_time ?? null,
      actualWrap: dayLog?.wrap_time ?? null,
      nextShootDate: nextDay?.shoot_date ?? null,
      nextUnitCall: nextDayLog?.call_time ?? nextDay?.call_time ?? null,
      settings,
      people: crewIds.map((id) => ({
        personId: id,
        ownCall: own.get(id)?.call_time ?? null,
        ownWrap: own.get(id)?.wrap_time ?? null,
        dayRate: rates.get(id) ?? null,
        overtimeExempt: exempt.has(id),
        nextOwnCall: nextOwn.get(id)?.call_time ?? null,
      })),
    })
  }, [day, nextDay, settings, dayHours, people, bookings, dayLog, nextDayLog, rates, exempt])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crew-hours', productionId] })
  }
  const onError = (e: Error) => setError(e.message)

  const unitTimes = useMutation({
    mutationFn: (patch: { call_time?: string | null; wrap_time?: string | null }) =>
      saveDayLog(productionId, day!.id, patch),
    onSuccess: () => {
      setError(null)
      // Shared with Script Supervisor's Daily Progress Report.
      queryClient.invalidateQueries({ queryKey: ['script-supervisor', 'day-log'] })
      queryClient.invalidateQueries({ queryKey: ['script-supervisor', 'progress'] })
    },
    onError,
  })
  const personTimes = useMutation({
    mutationFn: (v: { personId: string; callTime?: string | null; wrapTime?: string | null }) =>
      setCrewDayTimes({ productionId, shootDayId: day!.id, ...v }),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError,
  })
  const buyout = useMutation({
    mutationFn: (v: { personId: string; exempt: boolean }) => setOvertimeExempt(productionId, v.personId, v.exempt),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError,
  })

  if (isRemote) {
    return (
      <div className="space-y-4">
        <PageHeader title="Crew Hours" actions={<ExperimentalBadge />} />
        <div role="status" className="flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{CREW_HOURS_REMOTE_ERROR}</span>
        </div>
      </div>
    )
  }

  const rows = summary?.rows ?? []
  const visibleRows = rows.filter((r) => {
    if (filter === 'own') return r.ownTimes
    if (filter === 'no_rate') return r.dayRate == null && !r.overtimeExempt
    if (filter === 'short_rest') return r.shortRest
    return true
  })
  const noRateCount = rows.filter((r) => r.dayRate == null && !r.overtimeExempt).length
  const restHours = settings ? formatDuration(settings.minimum_rest_minutes) : ''

  return (
    <div className="space-y-5">
      <PageHeader
        title="Crew Hours"
        description="Everyone wraps with the unit unless you record their own call or wrap. Overtime is priced from day rates on the budget's labour lines."
        actions={
          <>
            <ExperimentalBadge />
            <Button type="button" variant="outline" className="h-10" onClick={() => setRuleOpen(true)} disabled={!settings}>
              <Settings2 aria-hidden />
              Overtime rule
            </Button>
          </>
        }
      />

      {sortedDays.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add shoot days on the stripboard to record crew hours.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ch-day">Shoot day</Label>
            <Select value={day?.id} onValueChange={setChosenDayId}>
              <SelectTrigger id="ch-day" className="h-11 w-60 text-base md:text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedDays.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatShootDay(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {day ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ch-unit-call">Unit call</Label>
                <TimeField
                  id="ch-unit-call"
                  value={dayLog?.call_time ?? null}
                  placeholder={day.call_time}
                  onCommit={(v) => unitTimes.mutate({ call_time: v })}
                  className="w-32"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-unit-wrap">Unit wrap</Label>
                <TimeField
                  id="ch-unit-wrap"
                  value={dayLog?.wrap_time ?? null}
                  placeholder={day.wrap_time}
                  onCommit={(v) => unitTimes.mutate({ wrap_time: v })}
                  className="w-32"
                />
              </div>
              <p className="pb-2.5 text-xs text-muted-foreground">
                Planned {day.call_time ?? '—'}–{day.wrap_time ?? '—'}. Shared with Script Supervisor’s daily progress report.
              </p>
            </>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {summary && settings ? (
        <>
          {summary.projected ? (
            <div role="status" className="flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>No unit wrap logged yet, so these figures use the planned wrap ({summary.unitWrap ?? '—'}).</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Crew on the day" value={String(summary.crewCount)} note={`${summary.ownTimesCount} with their own call or wrap`} />
            <Tile
              label="Unit overtime"
              value={formatOvertime(summary.unitOvertime.billedOvertimeMinutes) === '—' ? 'None' : formatOvertime(summary.unitOvertime.billedOvertimeMinutes)}
              note={
                summary.unitOvertime.overtimeMinutes > 0
                  ? `${formatDuration(summary.unitOvertime.overtimeMinutes)} over, billed per ${settings.overtime_increment_minutes || 1} min`
                  : 'Within the day'
              }
            />
            <Tile
              label="Overtime cost"
              value={formatMoney(summary.overtimeCost, currency)}
              note={
                summary.unpricedCount > 0
                  ? `${summary.unpricedCount} with overtime but no day rate`
                  : `${summary.pricedEligibleCount} of ${summary.eligibleCount} eligible crew have a rate`
              }
              warn={summary.unpricedCount > 0}
            />
            <Tile
              label="Short rest before next day"
              value={nextDay ? String(summary.shortRestCount) : '—'}
              note={nextDay ? `Under ${restHours} before ${formatShootDay(nextDay)}` : 'No later shoot day'}
              danger={summary.shortRestCount > 0}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Filter>
              value={filter}
              onValueChange={setFilter}
              ariaLabel="Show"
              className="max-w-xl"
              options={[
                { value: 'all', label: `All ${rows.length}` },
                { value: 'own', label: `Own times ${summary.ownTimesCount}` },
                { value: 'no_rate', label: `No rate ${noRateCount}` },
                { value: 'short_rest', label: `Short rest ${summary.shortRestCount}` },
              ]}
            />
          </div>

          <Card className="py-0">
            <CardContent className="px-0">
              {visibleRows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  {rows.length === 0
                    ? 'No crew booked on this day. Book crew in People → Bookings.'
                    : 'Nobody matches this filter.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[60rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Name</th>
                        <th className="px-2 py-2.5 font-medium">Call</th>
                        <th className="px-2 py-2.5 font-medium">Wrap</th>
                        <th className="px-2 py-2.5 font-medium">Hours</th>
                        <th className="px-2 py-2.5 font-medium">Overtime</th>
                        <th className="px-2 py-2.5 text-right font-medium">Cost</th>
                        <th className="px-2 py-2.5 text-right font-medium">Rest to next day</th>
                        <th className="px-4 py-2.5 font-medium">Buyout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => {
                        const person = personById.get(r.personId)
                        return (
                          <CrewRow
                            key={r.personId}
                            row={r}
                            name={person?.name ?? 'Unknown'}
                            role={[person?.role_name, person?.department].filter(Boolean).join(' · ')}
                            unitCall={summary.unitCall}
                            unitWrap={summary.unitWrap}
                            currency={currency}
                            onTimes={(v) => personTimes.mutate({ personId: r.personId, ...v })}
                            onBuyout={(v) => buyout.mutate({ personId: r.personId, exempt: v })}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Overtime rule: day rate ÷ {settings.hourly_rate_divisor} × {settings.overtime_multiplier} an hour,
            {settings.overtime_increment_minutes > 0
              ? ` billed per started ${settings.overtime_increment_minutes} min,`
              : ' billed by the minute,'}{' '}
            from{' '}
            {settings.overtime_basis === 'scheduled_wrap'
              ? 'the planned wrap'
              : `${formatDuration(settings.standard_day_minutes)} after each call`}
            . People on a buyout get no overtime.
          </p>
        </>
      ) : null}

      {settings ? (
        <OvertimeRuleDialog
          open={ruleOpen}
          onOpenChange={setRuleOpen}
          productionId={productionId}
          settings={settings}
        />
      ) : null}
    </div>
  )
}

function Tile({ label, value, note, warn, danger }: { label: string; value: string; note: string; warn?: boolean; danger?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card px-4 py-3',
        danger && 'border-destructive/60 bg-destructive/10'
      )}
    >
      <span className={cn('text-xs font-medium text-muted-foreground', danger && 'text-destructive')}>{label}</span>
      <span className={cn('font-mono text-2xl font-semibold tabular-nums', danger && 'text-destructive')}>{value}</span>
      <span className={cn('flex items-center gap-1 text-xs text-muted-foreground', warn && 'font-medium text-amber-600')}>
        {warn ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> : null}
        {note}
      </span>
    </div>
  )
}

function CrewRow({
  row,
  name,
  role,
  unitCall,
  unitWrap,
  currency,
  onTimes,
  onBuyout,
}: {
  row: CrewHoursRow
  name: string
  role: string
  unitCall: string | null
  unitWrap: string | null
  currency: string
  onTimes: (v: { callTime?: string | null; wrapTime?: string | null }) => void
  onBuyout: (exempt: boolean) => void
}) {
  let cost: ReactNode
  if (row.overtimeExempt) cost = <span className="text-muted-foreground">Buyout</span>
  else if (row.billedOvertimeMinutes === 0) cost = <span className="text-muted-foreground">—</span>
  else if (row.overtimeCost == null) cost = <span className="text-xs font-medium text-amber-600">No day rate</span>
  else cost = formatMoney(row.overtimeCost, currency)

  return (
    <tr className={cn('border-b last:border-b-0', row.ownTimes && 'bg-primary/5')}>
      <td className="px-4 py-2">
        <div className="font-medium">{name}</div>
        {role ? <div className="text-xs text-muted-foreground">{role}</div> : null}
      </td>
      <td className="px-2 py-2">
        <TimeField
          aria-label={`${name} call`}
          value={row.ownCall}
          placeholder={unitCall}
          onCommit={(v) => onTimes({ callTime: v })}
          className="w-28"
        />
      </td>
      <td className="px-2 py-2">
        <TimeField
          aria-label={`${name} wrap`}
          value={row.ownWrap}
          placeholder={unitWrap}
          onCommit={(v) => onTimes({ wrapTime: v })}
          className="w-28"
        />
      </td>
      <td className="px-2 py-2 font-mono tabular-nums">{formatDuration(row.workedMinutes)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{formatOvertime(row.billedOvertimeMinutes)}</td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{cost}</td>
      <td
        className={cn(
          'px-2 py-2 text-right font-mono tabular-nums',
          row.shortRest && 'font-semibold text-destructive'
        )}
      >
        {row.shortRest ? <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-label="Short rest" /> : null}
        {formatDuration(row.restMinutes)}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-5 rounded border-border"
            aria-label={`${name} is on a buyout (no overtime)`}
            checked={row.overtimeExempt}
            onChange={(e) => onBuyout(e.target.checked)}
          />
          {row.ownTimes ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Reset ${name} to the unit's call and wrap`}
              title="Back to unit times"
              onClick={() => onTimes({ callTime: null, wrapTime: null })}
            >
              <RotateCcw aria-hidden />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
