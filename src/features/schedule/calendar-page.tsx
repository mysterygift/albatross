import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export function ScheduleCalendarPage() {
  const { currentProductionId } = useCurrentProduction()
  const [month, setMonth] = useState(() => new Date())
  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const startDay = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()
  const blanks = Array(startDay).fill(null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const getShootDaysForDate = (d: number) => {
    const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return shootDays.filter((sd) => sd.shoot_date === dateStr)
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
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
          <div key={`b-${i}`} className="min-h-[80px] rounded border p-2" />
        ))}
        {days.map((d) => {
          const sd = getShootDaysForDate(d)
          return (
            <div
              key={d}
              className="min-h-[80px] rounded border p-2 text-left"
            >
              <span className="text-foreground font-medium">{d}</span>
              {sd.length > 0 && (
                <div className="mt-1 space-y-1">
                  {sd.map((s) => (
                    <Badge key={s.id} variant="secondary" className="block w-full justify-start text-xs">
                      Day {s.day_number ?? '—'} {s.call_time ? `· ${s.call_time}` : ''}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {shootDays.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No shoot days</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add shoot days from the Stripboard or Shot List page to see them on the calendar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
