import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import { getDashboardBudgetHealthData } from '@/lib/dashboard/budgetHealth'
import { getDashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Clapperboard, Film, Truck, Phone, Utensils, Moon, StickyNote, ChevronRight } from 'lucide-react'
import type { StripboardStrip, StripType } from '@/lib/db/types'
import type { Scene, Shot } from '@/lib/db/types'
import type { DashboardBudgetHealthData } from '@/lib/dashboard/budgetHealth'
import type { DashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'
import type { ProductionTask } from '@/lib/db/types'

const STRIP_ICONS: Record<StripType, typeof Film> = {
  SHOT: Film,
  SCENE: Film,
  MOVE: Truck,
  CALL: Phone,
  LUNCH: Utensils,
  WRAP: Moon,
  NOTE: StickyNote,
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function StripPreviewRow({
  strip,
  scenes,
  shots,
}: {
  strip: StripboardStrip
  scenes: Scene[]
  shots: Shot[]
}) {
  const shot = strip.shot_id ? shots.find((s) => s.id === strip.shot_id) : null
  const scene = shot ? scenes.find((s) => s.id === shot.scene_id) : (strip.scene_id ? scenes.find((s) => s.id === strip.scene_id) : null)
  const Icon = STRIP_ICONS[strip.strip_type]
  const mins = strip.estimated_minutes ?? (shot?.estimated_shoot_minutes ?? null)

  const label =
    strip.strip_type === 'SHOT' && scene && shot
      ? `Scene ${scene.scene_number} / Shot ${shot.shot_number}`
      : strip.strip_type === 'SCENE' && scene
        ? `Scene ${scene.scene_number}`
        : strip.title ?? strip.strip_type

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded border border-border/60 bg-muted/30 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate flex-1">{label}</span>
      {mins != null && (
        <span className="shrink-0 text-muted-foreground text-xs">{mins}m</span>
      )}
    </div>
  )
}

function NextShootDayCard({
  data,
  isLoading,
  isError,
  onNavigate,
}: {
  data: DashboardNextShootDayData | null | undefined
  isLoading: boolean
  isError?: boolean
  onNavigate: () => void
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next Shoot Day</CardTitle>
          <CardDescription>The next scheduled shooting day for this production</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded bg-muted/50 animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next Shoot Day</CardTitle>
          <CardDescription>The next scheduled shooting day for this production</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-destructive/90">Unable to load next shoot day.</p>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next Shoot Day</CardTitle>
          <CardDescription>The next scheduled shooting day for this production</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No upcoming shoot days scheduled.</p>
        </CardContent>
      </Card>
    )
  }

  const { shootDay, events, strips, scenes, shots } = data
  const unitLabels = events.length > 0 ? events.map((e) => e.unitName).join(', ') : '—'
  const locationLabel =
    events.length > 0
      ? [...new Set(events.map((e) => e.primaryLocationName).filter(Boolean))].join(', ') || '—'
      : '—'
  const shotCount =
    events.length > 0
      ? events.reduce((sum, e) => sum + e.shotCount, 0)
      : strips.filter((s) => s.strip_type === 'SHOT' || s.strip_type === 'SCENE').length
  const estMinutes =
    events.length > 0
      ? events.reduce((sum, e) => sum + e.estMinutes, 0)
      : strips.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0)
  const callWrap = [shootDay.call_time, shootDay.wrap_time].filter(Boolean).join(' – ') || '—'

  // Group strips by unit for adjacent columns
  const unitColumns =
    events.length > 0
      ? events.map((ev) => ({
          unitName: ev.unitName,
          strips: strips
            .filter((s) => s.shoot_day_unit_id === ev.shootDayUnitId)
            .sort((a, b) => a.sort_index - b.sort_index),
        }))
      : [{ unitName: 'Schedule', strips }]

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30 hover:border-muted-foreground/20"
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      aria-label="Next shoot day — click to open Stripboard"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate()
        }
      }}
    >
      <CardHeader>
        <CardTitle>Next Shoot Day</CardTitle>
        <CardDescription>The next scheduled shooting day for this production</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="font-medium">{formatDate(shootDay.shoot_date)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Day</span>
            <p className="font-medium">Shoot Day {shootDay.day_number ?? '?'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Units</span>
            <p className="font-medium">{unitLabels}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Location</span>
            <p className="font-medium truncate max-w-[140px]">{locationLabel}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Call – Wrap</span>
            <p className="font-medium">{callWrap}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Shots</span>
            <p className="font-medium">{shotCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Est. runtime</span>
            <p className="font-medium">{estMinutes}m</p>
          </div>
        </div>

        {strips.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Stripboard preview</p>
            <div className="grid gap-3 max-h-40 overflow-y-auto" style={{ gridTemplateColumns: `repeat(${unitColumns.length}, minmax(0, 1fr))` }}>
              {unitColumns.map((col) => (
                <div key={col.unitName} className="min-w-0 flex flex-col">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 shrink-0">{col.unitName}</p>
                  <div className="space-y-1 flex-1 min-h-0 overflow-y-auto">
                    {col.strips.slice(0, 8).map((strip) => (
                      <StripPreviewRow key={strip.id} strip={strip} scenes={scenes} shots={shots} />
                    ))}
                    {col.strips.length > 8 && (
                      <p className="text-xs text-muted-foreground py-1">+{col.strips.length - 8} more</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Click to open Stripboard</p>
      </CardContent>
    </Card>
  )
}

function BudgetDoughnutChart({ percentageSpent }: { percentageSpent: number }) {
  const r = 36
  const stroke = 10
  const circumference = 2 * Math.PI * r
  const spent = Math.min(Math.max(percentageSpent, 0), 1) * circumference
  const remaining = circumference - spent
  return (
    <svg viewBox="0 0 100 100" className="size-20 shrink-0" aria-hidden>
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/40"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={`${spent} ${remaining}`}
        strokeDashoffset={-circumference * 0.25}
        className="text-primary"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BudgetHealthCard({
  data,
  isLoading,
  isError,
  format,
  productionCurrency,
  onNavigate,
}: {
  data: DashboardBudgetHealthData | null | undefined
  isLoading: boolean
  isError?: boolean
  format: (amount: number, currency: string) => { formatted: string }
  productionCurrency: string
  onNavigate: () => void
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Health Check</CardTitle>
          <CardDescription>A quick view of current budget spend and variance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-32 rounded bg-muted/50 animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Health Check</CardTitle>
          <CardDescription>A quick view of current budget spend and variance</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-destructive/90">Unable to load budget data.</p>
        </CardContent>
      </Card>
    )
  }

  const isEmpty = data && data.totalEstimated === 0 && data.totalActual === 0
  if (!data || isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Health Check</CardTitle>
          <CardDescription>A quick view of current budget spend and variance</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No budget data available yet.</p>
        </CardContent>
      </Card>
    )
  }

  const pctSpent = Math.min(100, Math.round(data.percentageSpent * 100))

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30 hover:border-muted-foreground/20"
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      aria-label="Budget Health Check — click to open Budget"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate()
        }
      }}
    >
      <CardHeader>
        <CardTitle>Budget Health Check</CardTitle>
        <CardDescription>A quick view of current budget spend and variance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <BudgetDoughnutChart percentageSpent={data.percentageSpent} />
            <div>
              <p className="text-2xl font-bold">{pctSpent}%</p>
              <p className="text-xs text-muted-foreground">spent</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm flex-1 min-w-0">
            <div>
              <span className="text-muted-foreground">Estimated</span>
              <p className="font-medium tabular-nums">{format(data.totalEstimated, productionCurrency).formatted}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Actual</span>
              <p className="font-medium tabular-nums">{format(data.totalActual, productionCurrency).formatted}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Variance</span>
              <p className={`font-medium tabular-nums ${data.variance < 0 ? 'text-destructive' : ''}`}>
                {format(data.variance, productionCurrency).formatted}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Unallocated spend</span>
              <p className="font-medium tabular-nums">{format(data.unallocatedSpend, productionCurrency).formatted}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Click to open Budget</p>
      </CardContent>
    </Card>
  )
}

const TASKS_DUE_SOON_LIMIT = 6

function TasksDueSoonCard({
  tasks,
  isLoading,
  isError,
  onNavigate,
}: {
  tasks: ProductionTask[]
  isLoading: boolean
  isError?: boolean
  onNavigate: () => void
}) {
  const requiredIncomplete = tasks.filter((t) => t.priority === 1 && t.is_complete === 0)
  const optionalIncomplete = tasks.filter((t) => t.priority !== 1 && t.is_complete === 0)
  const tasksDueSoon = [...requiredIncomplete, ...optionalIncomplete].slice(0, TASKS_DUE_SOON_LIMIT)
  const remainingCount = requiredIncomplete.length + optionalIncomplete.length - tasksDueSoon.length
  const allComplete = requiredIncomplete.length === 0 && optionalIncomplete.length === 0

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tasks Due Soon</CardTitle>
          <CardDescription>Tasks that still need attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded bg-muted/50 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tasks Due Soon</CardTitle>
          <CardDescription>Tasks that still need attention</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-destructive/90">Unable to load tasks.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30 hover:border-muted-foreground/20"
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      aria-label="Tasks Due Soon — click to view all tasks"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate()
        }
      }}
    >
      <CardHeader>
        <CardTitle>Tasks Due Soon</CardTitle>
        <CardDescription>Tasks that still need attention</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allComplete ? (
          <div className="flex items-center gap-2 py-2">
            <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm text-muted-foreground">All tasks complete.</p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {tasksDueSoon.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <Badge variant={task.priority === 1 ? 'destructive' : 'secondary'} className="shrink-0">
                    {task.priority === 1 ? 'Required' : 'Optional'}
                  </Badge>
                  <span className="min-w-0 truncate">{task.description}</span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground">+{remainingCount} more tasks</p>
            )}
            {requiredIncomplete.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {requiredIncomplete.length} required task{requiredIncomplete.length !== 1 ? 's' : ''} remaining
              </p>
            )}
          </>
        )}
        <Link
          to="/readiness"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
        >
          View all tasks
          <ChevronRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentProduction, currentProductionId } = useCurrentProduction()
  const { format, ensureRate } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const wrapSuccess = (location.state as { wrapSuccess?: boolean } | null)?.wrapSuccess === true

  useEffect(() => {
    if (currentProduction?.currency_code) ensureRate(currentProduction.currency_code)
  }, [currentProduction?.currency_code, ensureRate])

  const {
    data: tasks = [],
    isLoading: tasksLoading,
    isError: tasksError,
  } = useQuery({
    queryKey: ['tasks', currentProductionId],
    queryFn: () => listTasksByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const {
    data: nextShootDayData,
    isLoading: nextShootDayLoading,
    isError: nextShootDayError,
  } = useQuery({
    queryKey: ['dashboard-next-shoot-day', currentProductionId],
    queryFn: () => getDashboardNextShootDayData(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const {
    data: budgetHealthData,
    isLoading: budgetHealthLoading,
    isError: budgetHealthError,
  } = useQuery({
    queryKey: ['dashboard-budget-health', currentProductionId],
    queryFn: () => getDashboardBudgetHealthData(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const complete = tasks.filter((t) => t.is_complete === 1).length
  const total = tasks.length
  const required = tasks.filter((t) => t.priority === 1)
  const requiredComplete = required.filter((t) => t.is_complete === 1).length
  const score = total === 0 ? 100 : Math.round((complete / total) * 100)
  const requiredScore = required.length === 0 ? 100 : Math.round((requiredComplete / required.length) * 100)
  const warnings = tasks.filter((t) => t.priority === 1 && t.is_complete === 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            {currentProduction
              ? `${currentProduction.name} — production overview`
              : 'Select a production to see the dashboard.'}
          </p>
        </div>
        {currentProductionId && (
          <Button variant="destructive" asChild>
            <Link to="/wrap-production" className="inline-flex items-center gap-2">
              <Clapperboard className="size-4" />
              Wrap Production
            </Link>
          </Button>
        )}
      </div>

      {wrapSuccess && (
        <Alert className="border-green-600/50 bg-green-500 dark:bg-green-90/30 dark:border-green-80 py-3 px-4">
          <CheckCircle2 className="h-4 w-4 text-black dark:text-white" />
          <AlertTitle className="text-white dark:text-white">Production completed and archived.</AlertTitle>
          <AlertDescription className="text-white dark:text-white">
            The production has been wrapped and archived. You can view it in Productions with
            “Show archived” enabled.
          </AlertDescription>
          <button
            type="button"
            onClick={() => navigate(location.pathname, { replace: true, state: {} })}
            className="text-white mt-2 text-sm underline hover:no-underline"
          >
            Dismiss
          </button>
        </Alert>
      )}

      {!currentProductionId && !wrapSuccess && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No production selected</AlertTitle>
          <AlertDescription>
            Choose a production from the top bar or create one in Productions.
          </AlertDescription>
        </Alert>
      )}

      {currentProductionId && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Readiness score</CardTitle>
                <CardDescription>Overall task completion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold">{score}%</span>
                  <Badge variant={score === 100 ? 'default' : 'secondary'}>
                    {complete} / {total} items
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Required items</CardTitle>
                <CardDescription>Must complete before production</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold">{requiredScore}%</span>
                  <Badge variant={requiredScore === 100 ? 'default' : 'destructive'}>
                    {requiredComplete} / {required.length} required
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <NextShootDayCard
            data={nextShootDayData}
            isLoading={nextShootDayLoading}
            isError={nextShootDayError}
            onNavigate={() => navigate('/schedule/stripboard')}
          />

          <BudgetHealthCard
            data={budgetHealthData}
            isLoading={budgetHealthLoading}
            isError={budgetHealthError}
            format={format}
            productionCurrency={productionCurrency}
            onNavigate={() => navigate('/budget')}
          />

          <TasksDueSoonCard
            tasks={tasks}
            isLoading={tasksLoading}
            isError={tasksError}
            onNavigate={() => navigate('/readiness')}
          />

          {warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Outstanding required items</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc">
                  {warnings.map((w) => (
                    <li key={w.id}>{w.description}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
