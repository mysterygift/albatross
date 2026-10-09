import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, FileDown, Info, LayoutGrid } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { loadColorConfig, resolvePersonColor } from '@/features/people/lib/bookingCalendarColors'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createFloorPlan,
  deleteFloorPlan,
  listFloorPlanSetupsByProduction,
  listFloorPlansByProduction,
  setFloorPlanBackgroundImage,
  updateFloorPlan,
  type FloorPlan,
  type FloorPlanSetup,
} from '@/lib/db/repositories/floor-plans'
import { localIsoDate } from '@/lib/dates/localIsoDate'
import { DEFAULT_ACTOR_COLOR } from '@/lib/floor-plans/model'
import { loadScheduleExportSources, type ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'
import { ExportFloorPlansDialog, FloorPlanDialog } from './floor-plan-dialogs'
import { LayoutEditor, SetupEditor, type SunSettings } from './FloorPlanEditor'
import { WHOLE_SCENE, castOptionsFor, defaultSunDate } from './floorPlanDisplay'
import { floorPlanSetupsQueryKey, floorPlansQueryKey } from './floorPlanQueries'

type Mode = 'layout' | 'setup'

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'layout', label: 'Layout' },
  { value: 'setup', label: 'Setups' },
]

const SUN_STORAGE_KEY = 'albatross.floorPlans.sun'

export function FloorPlansPage() {
  return (
    <RequireProduction title="Floor Plans">
      <FloorPlansWorkspace />
    </RequireProduction>
  )
}

function useSunSettings(sources: ScheduleExportSources | undefined, plan: FloorPlan | null): SunSettings {
  const [enabled, setEnabledState] = useState(() => {
    try {
      return localStorage.getItem(SUN_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [date, setDate] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(12 * 60)
  const days = useMemo(
    () => [...(sources?.shootDays ?? [])].filter((d) => !d.deleted_at).sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)),
    [sources]
  )
  const fallback = useMemo(
    () => (sources && plan ? defaultSunDate(sources, plan.location_id, localIsoDate()) : localIsoDate()),
    [sources, plan]
  )
  return {
    enabled,
    date: date ?? fallback,
    minutes,
    setEnabled: (on) => {
      setEnabledState(on)
      try {
        localStorage.setItem(SUN_STORAGE_KEY, on ? 'true' : 'false')
      } catch {
        // Storage unavailable: the choice lasts for this session only.
      }
    },
    setDate,
    setMinutes,
    days,
  }
}

/** Each cast member's booking calendar colour. */
function actorColorMap(productionId: string, sources: ScheduleExportSources): Map<string, string> {
  const config = loadColorConfig(productionId, sources.cast)
  return new Map(sources.cast.map((p) => [p.id, resolvePersonColor(p, config)]))
}

function FloorPlansWorkspace() {
  const { currentProductionId } = useCurrentProduction()
  const productionId = currentProductionId!
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const { data: dataSource } = useEffectiveDataSourceForProduction(productionId)
  const isRemote = dataSource === 'remote_server'
  const [searchParams, setSearchParams] = useSearchParams()

  const getActor = async () =>
    authSession.authSupported && authSession.currentUser ? { db: await getDb(), actor: authSession.currentUser } : null

  // Scenes, shots, locations, cast and days: the same rows the PDF export reads.
  const sourcesQuery = useQuery({
    queryKey: ['floor-plans-schedule', productionId],
    queryFn: async () => loadScheduleExportSources(productionId, await getActor()),
    enabled: dataSource !== undefined && !isRemote,
  })
  const plansQuery = useQuery({
    queryKey: floorPlansQueryKey(productionId),
    queryFn: () => listFloorPlansByProduction(productionId),
    enabled: dataSource !== undefined && !isRemote,
  })
  const setupsQuery = useQuery({
    queryKey: floorPlanSetupsQueryKey(productionId),
    queryFn: () => listFloorPlanSetupsByProduction(productionId),
    enabled: dataSource !== undefined && !isRemote,
  })
  const sources = sourcesQuery.data
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const setups = useMemo(() => setupsQuery.data ?? [], [setupsQuery.data])

  const plan = plans.find((p) => p.id === searchParams.get('plan')) ?? plans[0] ?? null
  const mode: Mode = searchParams.get('mode') === 'setup' ? 'setup' : 'layout'
  const updateParams = (patch: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v == null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true }
    )

  const [planDialog, setPlanDialog] = useState<{ plan: FloorPlan | null; key: number } | null>(null)
  const [deleting, setDeleting] = useState<FloorPlan | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const sun = useSunSettings(sources, plan)

  const locations = useMemo(() => sources?.locations ?? [], [sources])
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? 'Location'
  const groups = useMemo(() => {
    const byLocation = new Map<string, FloorPlan[]>()
    for (const p of plans) byLocation.set(p.location_id, [...(byLocation.get(p.location_id) ?? []), p])
    return [...byLocation.entries()]
      .map(([locationId, list]) => ({ locationId, name: locations.find((l) => l.id === locationId)?.name ?? '', plans: list }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [plans, locations])
  const planLocation = plan ? locations.find((l) => l.id === plan.location_id) : undefined
  const locationQuery = planLocation?.address?.trim() || planLocation?.name || ''

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: floorPlansQueryKey(productionId) })
    void queryClient.invalidateQueries({ queryKey: floorPlanSetupsQueryKey(productionId) })
  }

  const saveBackgroundImage = async (dataUrl: string | null) => {
    if (!plan) return
    await setFloorPlanBackgroundImage(plan.id, dataUrl)
    queryClient.setQueryData<FloorPlan[]>(floorPlansQueryKey(productionId), (list) =>
      list?.map((p) => (p.id === plan.id ? { ...p, background_image: dataUrl } : p))
    )
  }

  if (isRemote) {
    return (
      <div className="space-y-4">
        <PageHeader title="Floor Plans" actions={<ExperimentalBadge />} />
        <div role="status" className="flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Floor plans work on productions stored on this computer only.</span>
        </div>
      </div>
    )
  }

  const loading = !sources || plansQuery.isLoading || setupsQuery.isLoading
  const newPlan = () => setPlanDialog({ plan: null, key: Date.now() })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {plan ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="h-10 max-w-full gap-2 px-2 text-xl font-semibold">
                <h1 className="truncate">
                  {locationName(plan.location_id)} | {plan.name}
                </h1>
                <ChevronDown className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
              {groups.map((group) => (
                <DropdownMenuGroup key={group.locationId}>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{group.name}</DropdownMenuLabel>
                  {group.plans.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => updateParams({ plan: p.id })}>
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.id === plan.id ? <Check className="size-4" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={newPlan}>New floor plan…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPlanDialog({ plan, key: Date.now() })}>Rename or move…</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(plan)}>
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <h1 className="text-2xl font-semibold">Floor Plans</h1>
        )}
        <ExperimentalBadge />
        <div className="flex-1" />
        {plan ? (
          <SegmentedControl
            value={mode}
            onValueChange={(m) => updateParams({ mode: m === 'setup' ? 'setup' : null })}
            options={MODE_OPTIONS}
            size="sm"
            className="w-56"
            ariaLabel="Mode"
          />
        ) : null}
        <Button variant="outline" size="sm" className="gap-1" disabled={!sources || plans.length === 0} onClick={() => setExportOpen(true)}>
          <FileDown className="size-4" />
          Export PDF
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Add a location first"
          description="Every floor plan belongs to a location."
          action={
            <Button asChild variant="outline">
              <Link to="/locations">Go to Locations</Link>
            </Button>
          }
        />
      ) : !plan ? (
        <EmptyState
          icon={LayoutGrid}
          title="No floor plans yet"
          description="Draw a set or a unit base, then plot cameras, cast and kit for each shot."
          action={<Button onClick={newPlan}>New floor plan</Button>}
        />
      ) : mode === 'layout' ? (
        <LayoutEditor
          key={plan.id}
          plan={plan}
          productionId={productionId}
          sun={sun}
          locationQuery={locationQuery}
          onBackgroundImage={saveBackgroundImage}
        />
      ) : (
        <SetupPane
          plan={plan}
          productionId={productionId}
          sources={sources}
          setups={setups}
          sceneParam={searchParams.get('scene')}
          shotParam={searchParams.get('shot')}
          onPick={(sceneId, shotId) => updateParams({ scene: sceneId, shot: shotId })}
          sun={sun}
          locationQuery={locationQuery}
        />
      )}

      {planDialog ? (
        <FloorPlanDialog
          key={planDialog.key}
          open
          onOpenChange={(open) => !open && setPlanDialog(null)}
          locations={locations}
          plan={planDialog.plan}
          defaultLocationId={plan?.location_id ?? null}
          onSubmit={async ({ name, locationId }) => {
            if (planDialog.plan) {
              await updateFloorPlan(planDialog.plan.id, { name, locationId })
            } else {
              const created = await createFloorPlan({ productionId, locationId, name })
              updateParams({ plan: created.id, mode: null })
            }
            invalidate()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'floor plan'}?`}
        description="The drawing and every setup on it are deleted. Exported PDFs in Documents are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteFloorPlan(deleting.id)
            if (deleting.id === plan?.id) updateParams({ plan: null })
            invalidate()
            setDeleting(null)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e))
            throw e
          }
        }}
      />

      {exportOpen && sources ? (
        <ExportFloorPlansDialog
          open
          onOpenChange={setExportOpen}
          productionId={productionId}
          sources={sources}
          plans={plans}
          setups={setups}
          actorColors={actorColorMap(productionId, sources)}
          defaults={{
            locationId: plan?.location_id ?? null,
            sceneId: mode === 'setup' ? searchParams.get('scene') : null,
            shotId: mode === 'setup' ? searchParams.get('shot') : null,
          }}
        />
      ) : null}
    </div>
  )
}

/** Picks the scene and shot (from the URL), then the setup editor for them. */
function SetupPane({
  plan,
  productionId,
  sources,
  setups,
  sceneParam,
  shotParam,
  onPick,
  sun,
  locationQuery,
}: {
  plan: FloorPlan
  productionId: string
  sources: ScheduleExportSources
  setups: FloorPlanSetup[]
  sceneParam: string | null
  shotParam: string | null
  onPick: (sceneId: string, shotId: string) => void
  sun: SunSettings
  locationQuery: string
}) {
  // Scenes set at this plan's location come first.
  const { here, elsewhere } = useMemo(() => {
    const sorted = sortScenesByNumber(sources.scenes)
    return {
      here: sorted.filter((s) => s.location_id === plan.location_id),
      elsewhere: sorted.filter((s) => s.location_id !== plan.location_id),
    }
  }, [sources.scenes, plan.location_id])
  const scene = sources.scenes.find((s) => s.id === sceneParam) ?? here[0] ?? elsewhere[0] ?? null
  const sceneShots = useMemo(
    () =>
      scene
        ? sources.shots
            .filter((s) => s.scene_id === scene.id)
            .sort((a, b) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true }))
        : [],
    [sources.shots, scene]
  )
  const shot =
    shotParam === WHOLE_SCENE ? null : sceneShots.find((s) => s.id === shotParam) ?? (shotParam ? null : sceneShots[0] ?? null)
  const colors = useMemo(() => actorColorMap(productionId, sources), [productionId, sources])
  const actorColor = (personId: string | null) => (personId ? colors.get(personId) : undefined) ?? DEFAULT_ACTOR_COLOR

  if (!scene) {
    return (
      <EmptyState
        title="No scenes yet"
        description="Add scenes and shots on Shot Lists (or import a script) to plot setups."
        action={
          <Button asChild variant="outline">
            <Link to="/schedule/shots">Go to Shot Lists</Link>
          </Button>
        }
      />
    )
  }

  const onPlan = setups.filter((s) => s.floor_plan_id === plan.id)
  const setup = onPlan.find((s) => s.scene_id === scene.id && (s.shot_id ?? null) === (shot?.id ?? null)) ?? null
  const shotLabel = (shotId: string | null) => (shotId ? `Shot ${sources.shots.find((s) => s.id === shotId)?.shot_number ?? '?'}` : 'Blocking')
  const otherSetups = onPlan
    .filter((s) => s.scene_id === scene.id && s !== setup && s.markers.length > 0)
    .map((s) => ({ setup: s, label: shotLabel(s.shot_id) }))

  return (
    <SetupEditor
      key={`${plan.id}:${scene.id}:${shot?.id ?? WHOLE_SCENE}`}
      plan={plan}
      productionId={productionId}
      scene={scene}
      shot={shot}
      setup={setup}
      otherSetups={otherSetups}
      sources={sources}
      cast={castOptionsFor(sources, scene.id, shot?.id ?? null, (id) => colors.get(id) ?? DEFAULT_ACTOR_COLOR)}
      actorColor={actorColor}
      sun={sun}
      locationQuery={locationQuery}
      strip={{
        scenesHere: here,
        scenesElsewhere: elsewhere,
        shots: sceneShots,
        hasSetup: (sceneId, shotId) =>
          onPlan.some((s) => s.scene_id === sceneId && (s.shot_id ?? null) === shotId && (s.markers.length > 0 || !!s.notes)),
        onPick,
      }}
    />
  )
}
