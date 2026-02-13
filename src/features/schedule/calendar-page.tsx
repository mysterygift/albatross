/**
 * Schedule Calendar — view shoot days in a month grid.
 *
 * Data model: shoot_days (shoot_date), shoot_day_units belongs to shoot_days,
 * stripboard_strips reference SHOTs and are assigned to shoot_day + shoot_day_unit.
 *
 * Offline-first: uses listShootDaysByProduction from schedule repository.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import type { ShootDay } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toYyyyMmDd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthGrid(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  const startDay = start.getDay()
  const daysInMonth = end.getDate()
  const leadingBlanks = startDay
  const cells = leadingBlanks + daysInMonth
  return { leadingBlanks, daysInMonth, cells }
}

function getShootDaysForDate(
  shootDays: ShootDay[],
  year: number,
  month: number,
  day: number
): ShootDay[] {
  const dateStr = toYyyyMmDd(year, month, day)
  return shootDays.filter((sd) => sd.shoot_date === dateStr)
}

export function ScheduleCalendarPage() {
  const { currentProductionId } = useCurrentProduction()
  const [viewDate, setViewDate] = useState(() => new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { leadingBlanks, daysInMonth } = useMemo(
    () => getMonthGrid(year, month),
    [year, month]
  )

  const goPrevMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const goNextMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  if (!currentProductionId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + month nav */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center font-medium">
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" onClick={goNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid — placeholder for rebuild */}
      <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2 font-medium">
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="min-h-[80px] rounded border p-2" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dayShootDays = getShootDaysForDate(shootDays, year, month, day)
          return (
            <div
              key={day}
              className="min-h-[80px] rounded border p-2 text-left"
            >
              <span className="text-foreground font-medium">{day}</span>
              {dayShootDays.length > 0 && (
                <div className="mt-1 space-y-1">
                  {dayShootDays.map((sd) => (
                    <div
                      key={sd.id}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs"
                    >
                      Day {sd.day_number ?? '—'}
                      {sd.call_time ? ` · ${sd.call_time}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
