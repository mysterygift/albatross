import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { listChecklistByProduction } from '@/lib/db/repositories/checklist'
import { getDashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Clapperboard, Film, Truck, Phone, Utensils, Moon, StickyNote } from 'lucide-react'
import type { StripboardStrip, StripType } from '@/lib/db/types'
import type { Scene, Shot } from '@/lib/db/types'
import type { DashboardNextShootDayData } from '@/lib/dashboard/nextShootDay'

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

export function DashboardPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentProduction, currentProductionId } = useCurrentProduction()
  const wrapSuccess = (location.state as { wrapSuccess?: boolean } | null)?.wrapSuccess === true
  const { data: checklist = [] } = useQuery({
    queryKey: ['checklist', currentProductionId],
    queryFn: () => listChecklistByProduction(currentProductionId ?? ''),
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

  const complete = checklist.filter((c) => c.status === 'complete').length
  const total = checklist.length
  const required = checklist.filter((c) => c.is_required === 1)
  const requiredComplete = required.filter((c) => c.status === 'complete').length
  const score = total === 0 ? 100 : Math.round((complete / total) * 100)
  const requiredScore = required.length === 0 ? 100 : Math.round((requiredComplete / required.length) * 100)
  const warnings = checklist.filter((c) => c.is_required === 1 && c.status !== 'complete')

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
                <CardDescription>Overall checklist completion</CardDescription>
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

          {warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Outstanding required items</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc">
                  {warnings.map((w) => (
                    <li key={w.id}>{w.title}</li>
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
