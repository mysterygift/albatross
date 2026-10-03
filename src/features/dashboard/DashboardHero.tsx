import { CheckCircle2, AlertTriangle, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import type { DashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'
import type { AttentionItem } from './attentionItems'

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function DashboardHero({
  nextShootDay,
  nextShootDayLoading,
  nextShootDayError,
  attentionItems,
}: {
  nextShootDay: DashboardNextShootDayData | null | undefined
  nextShootDayLoading: boolean
  nextShootDayError?: boolean
  attentionItems: AttentionItem[]
}) {
  let left
  if (nextShootDayLoading) {
    left = <Skeleton className="h-16 w-full" data-testid="dashboard-hero-loading" />
  } else if (nextShootDayError) {
    left = <p className="text-destructive text-sm">Unable to load next shoot day.</p>
  } else if (!nextShootDay) {
    left = (
      <EmptyState
        icon={CalendarDays}
        title="No upcoming shoot days"
        description="Schedule a shoot day on the stripboard to see it here."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/schedule/stripboard">Open stripboard</Link>
          </Button>
        }
        className="p-4"
      />
    )
  } else {
    const { shootDay, events, strips } = nextShootDay
    const shotCount =
      events.length > 0
        ? events.reduce((sum, e) => sum + e.shotCount, 0)
        : strips.filter((s) => s.strip_type === 'SHOT' || s.strip_type === 'SCENE').length
    const callWrap = [shootDay.call_time, shootDay.wrap_time].filter(Boolean).join(' – ') || '—'
    left = (
      <div className="space-y-2">
        <p className="text-xl font-semibold">{formatDate(shootDay.shoot_date)}</p>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>Shoot Day {shootDay.day_number ?? '?'}</span>
          <span>Call – Wrap {callWrap}</span>
          <span>{shotCount} {shotCount === 1 ? 'shot' : 'shots'}</span>
        </div>
        <Link to="/schedule/calendar" className="text-sm underline-offset-4 hover:underline">
          View in calendar
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="dashboard-hero">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next shoot day</CardTitle>
        </CardHeader>
        <CardContent>{left}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attention needed</CardTitle>
        </CardHeader>
        <CardContent>
          {attentionItems.length === 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <span>All clear</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {attentionItems.map((item) => (
                <li key={item.id}>
                  <Link to={item.href} className="flex items-start gap-2 text-sm hover:underline">
                    <AlertTriangle
                      className={
                        item.severity === 'critical'
                          ? 'text-destructive mt-0.5 size-4 shrink-0'
                          : 'mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500'
                      }
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
