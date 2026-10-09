import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, Info, LayoutGrid, MoreHorizontal, Plus } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createFloorPlan,
  deleteFloorPlan,
  listFloorPlanSetupsByProduction,
  listFloorPlansByProduction,
  updateFloorPlan,
  type FloorPlan,
  type FloorPlanSetup,
} from '@/lib/db/repositories/floor-plans'
import type { Scene } from '@/lib/db/types'
import { loadScheduleExportSources, type ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'
import { cn } from '@/lib/utils'
import { ExportFloorPlansDialog, FloorPlanDialog } from './floor-plan-dialogs'
import { LayoutEditor, SetupEditor } from './FloorPlanEditor'
import { floorPlanSetupsQueryKey, floorPlansQueryKey } from './floorPlanQueries'
import { WHOLE_SCENE } from './floorPlanDisplay'

type Mode = 'layout' | 'setup'

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'layout', label: 'Draw layout' },
  { value: 'setup', label: 'Plot setups' },
]

export function FloorPlansPage() {
  return (
    <RequireProduction title="Floor Plans">
      <FloorPlansWorkspace />
    </RequireProduction>
  )
}

const DESCRIPTION =
  'Draw the spaces at each location, then mark where cameras and actors go for every scene and shot.'

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

  const locationName = (id: string) => sources?.locations.find((l) => l.id === id)?.name ?? 'Location'
  const groups = useMemo(() => {
    const byLocation = new Map<string, FloorPlan[]>()
    for (const p of plans) byLocation.set(p.location_id, [...(byLocation.get(p.location_id) ?? []), p])
    return [...byLocation.entries()]
      .map(([locationId, list]) => ({ locationId, name: sources?.locations.find((l) => l.id === locationId)?.name ?? '', plans: list }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [plans, sources])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: floorPlansQueryKey(productionId) })
    void queryClient.invalidateQueries({ queryKey: floorPlanSetupsQueryKey(productionId) })
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
  const locations = sources?.locations ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Floor Plans"
        description={DESCRIPTION}
        actions={
          <>
            <ExperimentalBadge />
            <Button variant="outline" size="sm" className="gap-1" disabled={!sources || plans.length === 0} onClick={() => setExportOpen(true)}>
              <FileDown className="size-4" />
              Export PDF
            </Button>
            <Button size="sm" className="gap-1" disabled={locations.length === 0} onClick={() => setPlanDialog({ plan: null, key: Date.now() })}>
              <Plus className="size-4" />
              New floor plan
            </Button>
          </>
        }
      />

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
          description="Draw a room or set at one of your locations, then plot camera and actor positions for each shot."
          action={<Button onClick={() => setPlanDialog({ plan: null, key: Date.now() })}>New floor plan</Button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="Floor plans" className="space-y-4">
            {groups.map((group) => (
              <div key={group.locationId} className="space-y-1">
                <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.name}</p>
                {group.plans.map((p) => (
                  <div key={p.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      aria-current={p.id === plan.id ? 'page' : undefined}
                      onClick={() => updateParams({ plan: p.id })}
                      className={cn(
                        'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                        p.id === plan.id && 'bg-muted font-medium'
                      )}
                    >
                      {p.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {setups.filter((s) => s.floor_plan_id === p.id).length || ''}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-xs" variant="ghost" aria-label={`Actions for ${p.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPlanDialog({ plan: p, key: Date.now() })}>Rename or move…</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(p)}>
                          Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ))}
          </nav>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">{locationName(plan.location_id)}</p>
              </div>
              <SegmentedControl
                value={mode}
                onValueChange={(m) => updateParams({ mode: m === 'setup' ? 'setup' : null })}
                options={MODE_OPTIONS}
                size="sm"
                className="w-64"
                ariaLabel="Editing mode"
              />
            </div>
            {mode === 'layout' ? (
              <LayoutEditor key={plan.id} plan={plan} productionId={productionId} />
            ) : (
              <SetupPane
                plan={plan}
                productionId={productionId}
                sources={sources}
                setups={setups}
                sceneParam={searchParams.get('scene')}
                shotParam={searchParams.get('shot')}
                onPick={(sceneId, shotId) => updateParams({ scene: sceneId, shot: shotId })}
              />
            )}
          </div>
        </div>
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
        description="The drawing and every camera and actor setup on it are deleted. Exported PDFs in Documents are kept."
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

/** Scene and shot pickers, then the setup editor for the pick. */
function SetupPane({
  plan,
  productionId,
  sources,
  setups,
  sceneParam,
  shotParam,
  onPick,
}: {
  plan: FloorPlan
  productionId: string
  sources: ScheduleExportSources
  setups: FloorPlanSetup[]
  sceneParam: string | null
  shotParam: string | null
  onPick: (sceneId: string, shotId: string) => void
}) {
  // Scenes set at this plan's location come first.
  const { here, elsewhere } = useMemo(() => {
    const sorted = sortScenesByNumber(sources.scenes)
    return {
      here: sorted.filter((s) => s.location_id === plan.location_id),
      elsewhere: sorted.filter((s) => s.location_id !== plan.location_id),
    }
  }, [sources.scenes, plan.location_id])
  const scene = sources.scenes.find((s) => s.id === sceneParam) ?? here[0] ?? null
  const sceneShots = useMemo(
    () =>
      scene
        ? sources.shots
            .filter((s) => s.scene_id === scene.id)
            .sort((a, b) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true }))
        : [],
    [sources.shots, scene]
  )
  const shot = sceneShots.find((s) => s.id === shotParam) ?? null
  const shotValue = shot ? shot.id : shotParam === WHOLE_SCENE || sceneShots.length === 0 ? WHOLE_SCENE : sceneShots[0]!.id
  const effectiveShot = shotValue === WHOLE_SCENE ? null : sceneShots.find((s) => s.id === shotValue) ?? null

  const onPlan = setups.filter((s) => s.floor_plan_id === plan.id)
  const hasSetup = (sceneId: string, shotId: string | null) =>
    onPlan.some((s) => s.scene_id === sceneId && (s.shot_id ?? null) === shotId && (s.markers.length > 0 || s.notes))
  const setup = scene
    ? onPlan.find((s) => s.scene_id === scene.id && (s.shot_id ?? null) === (effectiveShot?.id ?? null)) ?? null
    : null
  const shotLabel = (shotId: string | null) =>
    shotId ? `Shot ${sources.shots.find((s) => s.id === shotId)?.shot_number ?? '?'}` : 'Scene blocking'
  const otherSetups = scene
    ? onPlan
        .filter((s) => s.scene_id === scene.id && s !== setup && s.markers.length > 0)
        .map((s) => ({ setup: s, label: shotLabel(s.shot_id) }))
    : []

  const sceneLabel = (s: Scene) => [`Scene ${s.scene_number}`, s.title?.trim()].filter(Boolean).join(' · ')
  const marked = (has: boolean) => (has ? ' ●' : '')

  if (sources.scenes.length === 0) {
    return (
      <EmptyState
        title="No scenes yet"
        description="Add scenes and shots on the Shot Lists page (or import a script) to plot setups."
        action={
          <Button asChild variant="outline">
            <Link to="/schedule/shots">Go to Shot Lists</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fp-scene">Scene</Label>
          <Select value={scene?.id} onValueChange={(id) => onPick(id, WHOLE_SCENE)}>
            <SelectTrigger id="fp-scene" className="h-9 w-64">
              <SelectValue placeholder="Choose a scene" />
            </SelectTrigger>
            <SelectContent>
              {here.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>At this location</SelectLabel>
                  {here.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sceneLabel(s)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {elsewhere.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>{here.length > 0 ? 'Other scenes' : 'Scenes'}</SelectLabel>
                  {elsewhere.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sceneLabel(s)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        {scene ? (
          <div className="space-y-1.5">
            <Label htmlFor="fp-shot">Shot</Label>
            <Select value={shotValue} onValueChange={(id) => onPick(scene.id, id)}>
              <SelectTrigger id="fp-shot" className="h-9 w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_SCENE}>Whole scene (blocking){marked(hasSetup(scene.id, null))}</SelectItem>
                {sceneShots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {[`Shot ${s.shot_number}`, s.shot_size].filter(Boolean).join(' · ')}
                    {marked(hasSetup(scene.id, s.id))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <p className="pb-2 text-xs text-muted-foreground">● has a setup on this plan</p>
      </div>
      {scene ? (
        <SetupEditor
          key={`${plan.id}:${scene.id}:${effectiveShot?.id ?? WHOLE_SCENE}`}
          plan={plan}
          productionId={productionId}
          scene={scene}
          shot={effectiveShot}
          setup={setup}
          otherSetups={otherSetups}
          sources={sources}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Choose a scene to plot its setups.</p>
      )}
    </div>
  )
}
