import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { exportFloorPlansPdf, shotIdsForShootDay, type FloorPlanExportRequest } from '@/features/schedule/scheduleExports'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import type { FloorPlan, FloorPlanSetup } from '@/lib/db/repositories/floor-plans'
import type { Location } from '@/lib/db/types'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import { buildFloorPlanPdfData, type FloorPlanExportScope } from '@/lib/pdf/floorPlan'
import type { ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'
import { formatShootDay } from './floorPlanDisplay'

/** New plan, or rename / move an existing one. */
export function FloorPlanDialog({
  open,
  onOpenChange,
  locations,
  plan,
  defaultLocationId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Pick<Location, 'id' | 'name'>[]
  plan: FloorPlan | null
  defaultLocationId: string | null
  onSubmit: (values: { name: string; locationId: string }) => Promise<void>
}) {
  const [name, setName] = useState(plan?.name ?? '')
  const [locationId, setLocationId] = useState(plan?.location_id ?? defaultLocationId ?? locations[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const valid = name.trim().length > 0 && locations.some((l) => l.id === locationId)

  const submit = async () => {
    if (!valid) return
    setPending(true)
    try {
      await onSubmit({ name: name.trim(), locationId })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit floor plan' : 'New floor plan'}</DialogTitle>
          <DialogDescription>A floor plan is a drawing of one space at a location, such as a room or a yard.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="floor-plan-name">Name</Label>
            <Input id="floor-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="floor-plan-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="floor-plan-location" className="w-full">
                <SelectValue placeholder="Choose a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {plan ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ScopeKind = FloorPlanExportRequest['kind']

const SCOPE_OPTIONS: Array<{ value: ScopeKind; label: string }> = [
  { value: 'day', label: 'Shoot day' },
  { value: 'location', label: 'Location' },
  { value: 'scene', label: 'Scene' },
  { value: 'shots', label: 'Shots' },
]

/** Export floor plans for a shoot day, a location, a scene, or chosen shots. */
export function ExportFloorPlansDialog({
  open,
  onOpenChange,
  productionId,
  sources,
  plans,
  setups,
  defaults,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  sources: ScheduleExportSources
  plans: FloorPlan[]
  setups: FloorPlanSetup[]
  defaults: { locationId: string | null; sceneId: string | null; shotId: string | null }
}) {
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const days = useMemo(() => [...sources.shootDays].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)), [sources])
  const scenes = useMemo(() => sortScenesByNumber(sources.scenes), [sources])
  const locations = useMemo(
    () => sources.locations.filter((l) => plans.some((p) => p.location_id === l.id)),
    [sources, plans]
  )
  const shotsWithSetups = useMemo(() => {
    const ids = new Set(setups.map((s) => s.shot_id).filter(Boolean))
    return scenes.flatMap((scene) =>
      sources.shots
        .filter((s) => s.scene_id === scene.id && ids.has(s.id))
        .sort((a, b) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true }))
        .map((shot) => ({ shot, scene }))
    )
  }, [sources, scenes, setups])

  const [kind, setKind] = useState<ScopeKind>(defaults.sceneId ? 'scene' : 'location')
  const [dayId, setDayId] = useState(days[0]?.id ?? '')
  const [locationId, setLocationId] = useState(defaults.locationId ?? locations[0]?.id ?? '')
  const [sceneId, setSceneId] = useState(defaults.sceneId ?? scenes[0]?.id ?? '')
  const [shotIds, setShotIds] = useState<Set<string>>(new Set(defaults.shotId ? [defaults.shotId] : []))

  const request = useMemo((): FloorPlanExportRequest | null => {
    if (kind === 'day') return dayId ? { kind, shootDayId: dayId } : null
    if (kind === 'location') return locationId ? { kind, locationId } : null
    if (kind === 'scene') return sceneId ? { kind, sceneId } : null
    const ids = shotsWithSetups.map((s) => s.shot.id).filter((id) => shotIds.has(id))
    return ids.length > 0 ? { kind, shotIds: ids } : null
  }, [kind, dayId, locationId, sceneId, shotIds, shotsWithSetups])

  // How many pages-worth will print, so an empty export is obvious before it is made.
  const entryCount = useMemo(() => {
    if (!request) return 0
    const scope: FloorPlanExportScope =
      request.kind === 'day' ? { kind: 'day', shotOrder: shotIdsForShootDay(sources, request.shootDayId) } : request
    return buildFloorPlanPdfData({
      productionName: '',
      scopeLabel: '',
      scope,
      plans,
      setups,
      scenes: sources.scenes,
      shots: sources.shots,
      locations: sources.locations,
    }).entries.length
  }, [request, sources, plans, setups])

  const exportMutation = useMutation({
    mutationFn: async (req: FloorPlanExportRequest) => {
      const actor =
        authSession.authSupported && authSession.currentUser ? { db: await getDb(), actor: authSession.currentUser } : null
      return exportFloorPlansPdf({ productionId, actor, request: req })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
      toast.success('Saved to Documents › Script & sides')
      onOpenChange(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export floor plans</DialogTitle>
          <DialogDescription>
            Each setup prints its floor plan with the camera and actor positions, and the shot details beneath.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SegmentedControl value={kind} onValueChange={setKind} options={SCOPE_OPTIONS} size="sm" ariaLabel="What to export" />
          {kind === 'day' ? (
            <ScopeSelect
              id="fp-export-day"
              label="Shoot day"
              hint="Every unit and location that day, in stripboard order."
              value={dayId}
              onChange={setDayId}
              options={days.map((d) => ({ value: d.id, label: formatShootDay(d) }))}
              empty="No shoot days yet."
            />
          ) : kind === 'location' ? (
            <ScopeSelect
              id="fp-export-location"
              label="Location"
              hint="Every floor plan at the location and all their setups."
              value={locationId}
              onChange={setLocationId}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              empty="No floor plans yet."
            />
          ) : kind === 'scene' ? (
            <ScopeSelect
              id="fp-export-scene"
              label="Scene"
              hint="Scene blocking, then each shot's setup."
              value={sceneId}
              onChange={setSceneId}
              options={scenes.map((s) => ({ value: s.id, label: [`Scene ${s.scene_number}`, s.title].filter(Boolean).join(' · ') }))}
              empty="No scenes yet."
            />
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Shots with a setup</p>
              {shotsWithSetups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shots have a setup yet.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {shotsWithSetups.map(({ shot, scene }) => (
                    <label key={shot.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={shotIds.has(shot.id)}
                        onCheckedChange={(checked) =>
                          setShotIds((prev) => {
                            const next = new Set(prev)
                            if (checked === true) next.add(shot.id)
                            else next.delete(shot.id)
                            return next
                          })
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">
                          Scene {scene.scene_number} · Shot {shot.shot_number}
                        </span>
                        {shot.shot_description?.trim() ? (
                          <span className="block text-xs text-muted-foreground">{shot.shot_description}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {request
              ? entryCount === 0
                ? 'Nothing to print for this selection yet.'
                : `${entryCount} ${entryCount === 1 ? 'floor plan' : 'floor plans'} will be printed.`
              : 'Choose what to export.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!request || entryCount === 0 || exportMutation.isPending} onClick={() => request && exportMutation.mutate(request)}>
            {exportMutation.isPending ? 'Exporting…' : 'Export PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScopeSelect({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  empty,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  empty: string
}) {
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={`Choose a ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
