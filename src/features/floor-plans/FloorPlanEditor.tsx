import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Copy,
  Image as ImageIcon,
  Lamp,
  LayoutGrid,
  MousePointer2,
  Plus,
  Redo2,
  Spline,
  Square,
  Sun,
  Type,
  Undo2,
  User,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  saveFloorPlanSetup,
  updateFloorPlan,
  type FloorPlan,
  type FloorPlanSetup,
} from '@/lib/db/repositories/floor-plans'
import type { Scene, ShootDay, Shot } from '@/lib/db/types'
import type { CatalogItem, EquipmentCategory } from '@/lib/floor-plans/catalog'
import type { FloorPlanGeo, FloorPlanLayout, FloorPlanMarker, FloorPlanShape } from '@/lib/floor-plans/model'
import { formatClock, localTimeZone, sunDay, sunOverlay, type SunOverlay } from '@/lib/floor-plans/sun'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import type { ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { isIosPlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { BackgroundDialog, LocationDialog } from './BackgroundDialog'
import { EquipmentLibrary } from './EquipmentLibrary'
import { FloorPlanCanvas, type FloorPlanTool } from './FloorPlanCanvas'
import { WHOLE_SCENE, formatShootDay, shotCameraDetails } from './floorPlanDisplay'
import { floorPlanSetupsQueryKey, floorPlansQueryKey } from './floorPlanQueries'
import { SelectionPopover, type CastOption } from './SelectionPopover'
import { useAutosave, type AutosaveStatus } from './useAutosave'
import { useEditHistory } from './useEditHistory'
import { useSnapPreference } from './useSnapPreference'

/** Sun settings shared by both modes, kept by the page so they survive switching shots. */
export type SunSettings = {
  enabled: boolean
  date: string
  minutes: number
  setEnabled: (on: boolean) => void
  setDate: (date: string) => void
  setMinutes: (minutes: number) => void
  days: ShootDay[]
}

const LAYOUT_CATEGORIES: EquipmentCategory[] = ['lighting', 'grip', 'camera-support', 'unit-base']
const LIGHT_CATEGORIES: EquipmentCategory[] = ['lighting']
const GRIP_CATEGORIES: EquipmentCategory[] = ['grip', 'camera-support', 'unit-base']

// ─── Toolbar pieces ─────────────────────────────────────────────────────────

function ToolButton({
  label,
  icon,
  active,
  onClick,
  showLabel,
}: {
  label: string
  icon: ReactNode
  active: boolean
  onClick?: () => void
  showLabel?: boolean
}) {
  const button = (
    <Button
      type="button"
      size={showLabel ? 'sm' : 'icon-sm'}
      variant={active ? 'secondary' : 'ghost'}
      aria-pressed={active}
      aria-label={showLabel ? undefined : label}
      onClick={onClick}
      className={cn('h-9', showLabel ? 'gap-1.5 px-3' : 'w-9', active && 'ring-1 ring-primary/40')}
    >
      {icon}
      {showLabel ? label : null}
    </Button>
  )
  if (showLabel) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px bg-border" aria-hidden />

function SnapToggle({ snap, onChange }: { snap: boolean; onChange: (on: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={snap ? 'secondary' : 'ghost'}
          aria-pressed={snap}
          aria-label="Snap to 90°"
          onClick={() => onChange(!snap)}
          className="h-9 px-2.5 font-semibold"
        >
          90°
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{snap ? 'Snapping to 90°' : 'Free angles'}</TooltipContent>
    </Tooltip>
  )
}

function HistoryButtons({ history }: { history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } }) {
  return (
    <>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Undo" onClick={history.undo} disabled={!history.canUndo} className="size-9">
        <Undo2 />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Redo" onClick={history.redo} disabled={!history.canRedo} className="size-9">
        <Redo2 />
      </Button>
    </>
  )
}

const STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: 'Saved',
  pending: 'Unsaved',
  saving: 'Saving…',
  error: 'Not saved',
}

function SaveStatus({ status }: { status: AutosaveStatus }) {
  return (
    <span className={cn('inline-block min-w-16 px-1 text-right text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
      {STATUS_TEXT[status]}
    </span>
  )
}

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Floor plan tools" className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5">
      {children}
    </div>
  )
}

/** "Placing M18": shown while a tool waits for a click on the plan. */
function PlacingChip({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <span className="flex h-9 items-center gap-1 rounded-md bg-primary/15 pr-1 pl-3 text-sm">
      {label}
      <Button type="button" size="icon-xs" variant="ghost" aria-label="Cancel" onClick={onCancel}>
        <X />
      </Button>
    </span>
  )
}

function LibraryButton({
  label,
  icon,
  categories,
  onPick,
}: {
  label: string
  icon: ReactNode
  categories: EquipmentCategory[]
  onPick: (item: CatalogItem) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={open ? 'secondary' : 'ghost'} className="h-9 gap-1.5 px-3">
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-3"
        data-touch-targets
        data-floor-plans
        // On iOS, focusing the search box would bring up the keyboard over the list.
        onOpenAutoFocus={(e) => {
          if (isIosPlatform()) e.preventDefault()
        }}
      >
        <EquipmentLibrary
          categories={categories}
          onPick={(item) => {
            setOpen(false)
            onPick(item)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

type SunDayInfo = ReturnType<typeof sunDay>

/** Sun on/off, the day and the time of day. Without a location, offers to set one. */
function SunControl({ sun, day, onSetLocation }: { sun: SunSettings; day: SunDayInfo | null; onSetLocation: () => void }) {
  const toggle = (
    <Button
      type="button"
      size="icon-sm"
      variant={sun.enabled ? 'secondary' : 'ghost'}
      aria-pressed={sun.enabled}
      aria-label="Sun path"
      onClick={() => sun.setEnabled(!sun.enabled)}
      className={cn('size-9', sun.enabled && 'text-amber-400')}
    >
      <Sun />
    </Button>
  )
  if (!sun.enabled) return toggle
  if (!day) {
    return (
      <span className="flex items-center gap-1">
        {toggle}
        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={onSetLocation}>
          Set location
        </Button>
      </span>
    )
  }
  const min = day.sunrise ?? 0
  const max = day.sunset ?? 1439
  const value = Math.min(max, Math.max(min, sun.minutes))
  const isShootDay = sun.days.some((d) => d.shoot_date === sun.date)
  return (
    <span className="flex flex-wrap items-center gap-2 text-amber-400">
      {toggle}
      <Select value={sun.date} onValueChange={sun.setDate}>
        <SelectTrigger size="sm" className="h-9 min-w-40 text-foreground" aria-label="Day">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sun.days.map((d) => (
            <SelectItem key={d.id} value={d.shoot_date}>
              {formatShootDay(d)}
            </SelectItem>
          ))}
          {!isShootDay ? <SelectItem value={sun.date}>{sun.date}</SelectItem> : null}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2">
        <span className="sr-only">Time of day</span>
        <input
          type="range"
          min={min}
          max={max}
          step={5}
          value={value}
          onChange={(e) => sun.setMinutes(Number(e.target.value))}
          className="w-28 accent-amber-400 lg:w-36"
        />
        <span className="w-12 text-sm text-foreground tabular-nums">{formatClock(value)}</span>
      </label>
    </span>
  )
}

function useSunOverlay(geo: FloorPlanGeo | null, sun: SunSettings): { day: SunDayInfo | null; overlay: SunOverlay | null } {
  const day = useMemo(
    () => (geo && sun.enabled ? sunDay(sun.date, geo.lat, geo.lon, geo.timezone ?? localTimeZone()) : null),
    [geo, sun.enabled, sun.date]
  )
  const overlay = useMemo(() => {
    if (!day) return null
    const minutes = Math.min(day.sunset ?? 1439, Math.max(day.sunrise ?? 0, sun.minutes))
    return sunOverlay(day, minutes)
  }, [day, sun.minutes])
  return { day, overlay }
}

// ─── Layout ─────────────────────────────────────────────────────────────────

/** Layout mode: draw the space, place permanent equipment, set background, scale and north. */
export function LayoutEditor({
  plan,
  productionId,
  sun,
  locationQuery,
  onBackgroundImage,
}: {
  plan: FloorPlan
  productionId: string
  sun: SunSettings
  locationQuery: string
  onBackgroundImage: (dataUrl: string | null) => Promise<void>
}) {
  const queryClient = useQueryClient()
  const history = useEditHistory<FloorPlanLayout>(plan.layout)
  const [tool, setTool] = useState<FloorPlanTool>('select')
  const [placingItem, setPlacingItem] = useState<CatalogItem | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snap, setSnap] = useSnapPreference()
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [measured, setMeasured] = useState<number | null>(null)
  const [measuredMetres, setMeasuredMetres] = useState('')
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const layout = history.value

  const autosave = useAutosave(
    layout,
    async (next) => {
      queryClient.setQueryData<FloorPlan[]>(floorPlansQueryKey(productionId), (plans) =>
        plans?.map((p) => (p.id === plan.id ? { ...p, layout: next } : p))
      )
      await updateFloorPlan(plan.id, { layout: next })
    },
    { paused: history.dragging }
  )
  const { day, overlay } = useSunOverlay(layout.geo, sun)

  const selected = layout.shapes.find((s) => s.id === selectedId) ?? null
  const updateShape = (shape: FloorPlanShape, transient = false) =>
    history.set({ ...layout, shapes: layout.shapes.map((s) => (s.id === shape.id ? shape : s)) }, transient)
  const remove = () => {
    if (!selected) return
    history.set({ ...layout, shapes: layout.shapes.filter((s) => s.id !== selected.id) })
    setSelectedId(null)
  }
  const pickTool = (next: FloorPlanTool) => {
    setTool(next)
    if (next !== 'item') setPlacingItem(null)
    if (next !== 'measure') setMeasured(null)
  }
  /** Puts the cursor in a new label's text, after the placing click has moved focus to the canvas. */
  const focusLabelText = () =>
    setTimeout(() => {
      textInputRef.current?.focus()
      textInputRef.current?.select()
    }, 0)

  const applyMeasurement = () => {
    const metres = Number(measuredMetres)
    if (!measured || !Number.isFinite(metres) || metres <= 0) return
    history.set({ ...layout, unitsPerMetre: measured / metres })
    setMeasuredMetres('')
    pickTool('select')
  }

  return (
    <div className="space-y-3">
      <Toolbar>
        <ToolButton label="Select" icon={<MousePointer2 />} active={tool === 'select'} onClick={() => pickTool('select')} />
        <ToolButton label="Rectangle" icon={<Square />} active={tool === 'rect'} onClick={() => pickTool('rect')} />
        <ToolButton label="Line" icon={<Spline />} active={tool === 'path'} onClick={() => pickTool('path')} />
        <ToolButton label="Text" icon={<Type />} active={tool === 'text'} onClick={() => pickTool('text')} />
        <LibraryButton
          label="Add"
          icon={<Plus />}
          categories={LAYOUT_CATEGORIES}
          onPick={(item) => {
            setPlacingItem(item)
            setTool('item')
          }}
        />
        <Divider />
        <ToolButton label="Background" icon={<ImageIcon />} active={backgroundOpen || tool === 'background'} onClick={() => setBackgroundOpen(true)} />
        <SnapToggle snap={snap} onChange={setSnap} />
        <SunControl sun={sun} day={day} onSetLocation={() => setBackgroundOpen(true)} />
        {tool === 'item' && placingItem ? <PlacingChip label={placingItem.short} onCancel={() => pickTool('select')} /> : null}
        {tool === 'measure' && !measured ? <PlacingChip label="Draw along a known length" onCancel={() => pickTool('select')} /> : null}
        {tool === 'background' ? <PlacingChip label="Drag the background" onCancel={() => pickTool('select')} /> : null}
        <div className="flex-1" />
        <SaveStatus status={autosave.status} />
        <HistoryButtons history={history} />
      </Toolbar>

      <FloorPlanCanvas
        layout={layout}
        backgroundImage={plan.background_image}
        onLayoutChange={history.set}
        tool={tool}
        onToolChange={pickTool}
        placingItem={placingItem?.id ?? null}
        snap={snap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUndo={history.undo}
        onRedo={history.redo}
        onTextCreated={focusLabelText}
        onMeasure={(length) => {
          setMeasured(length)
          setMeasuredMetres('')
        }}
        sun={overlay}
      >
        {selected && tool === 'select' ? (
          <SelectionPopover
            entity={selected}
            unitsPerMetre={layout.unitsPerMetre}
            onChange={(next, transient) => updateShape(next as FloorPlanShape, transient)}
            onDelete={remove}
            textInputRef={textInputRef}
            onTextCommit={() => history.set(history.value)}
          />
        ) : null}
        {measured ? (
          <form
            className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover p-2 shadow-lg"
            onSubmit={(e) => {
              e.preventDefault()
              applyMeasurement()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <label className="flex items-center gap-2 text-sm">
              Length
              <Input autoFocus type="number" min={0.01} step="any" className="h-8 w-24" value={measuredMetres} onChange={(e) => setMeasuredMetres(e.target.value)} />
              m
            </label>
            <Button type="submit" size="sm" disabled={!(Number(measuredMetres) > 0)}>
              Set scale
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => pickTool('select')}>
              <X />
            </Button>
          </form>
        ) : null}
      </FloorPlanCanvas>

      <BackgroundDialog
        open={backgroundOpen}
        onOpenChange={setBackgroundOpen}
        layout={layout}
        onLayoutChange={(next) => history.set(next)}
        hasImage={!!plan.background_image}
        onImage={onBackgroundImage}
        locationQuery={locationQuery}
        onArmTool={(next) => {
          setBackgroundOpen(false)
          pickTool(next)
        }}
      />
    </div>
  )
}

// ─── Setups ─────────────────────────────────────────────────────────────────

export type ShotStrip = {
  scenesHere: Scene[]
  scenesElsewhere: Scene[]
  shots: Shot[]
  hasSetup: (sceneId: string, shotId: string | null) => boolean
  onPick: (sceneId: string, shotId: string) => void
}

/** Setups mode: cameras, cast and equipment for one scene (blocking) or shot on this plan. */
export function SetupEditor({
  plan,
  productionId,
  scene,
  shot,
  setup,
  otherSetups,
  sources,
  cast,
  actorColor,
  strip,
  sun,
  locationQuery,
}: {
  plan: FloorPlan
  productionId: string
  scene: Scene
  /** Null: blocking for the whole scene. */
  shot: Shot | null
  setup: FloorPlanSetup | null
  /** Other setups on this plan, to start from. */
  otherSetups: Array<{ setup: FloorPlanSetup; label: string }>
  sources: ScheduleExportSources
  cast: CastOption[]
  actorColor: (personId: string | null) => string
  strip: ShotStrip
  sun: SunSettings
  locationQuery: string
}) {
  const queryClient = useQueryClient()
  const history = useEditHistory<FloorPlanMarker[]>(setup?.markers ?? [])
  const [notes, setNotes] = useState(setup?.notes ?? '')
  const [tool, setTool] = useState<FloorPlanTool>('select')
  const [placingItem, setPlacingItem] = useState<CatalogItem | null>(null)
  const [placingPerson, setPlacingPerson] = useState<{ personId: string | null; label: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snap, setSnap] = useSnapPreference()
  const [locationOpen, setLocationOpen] = useState(false)
  const { day, overlay } = useSunOverlay(plan.layout.geo, sun)

  const setupsKey = floorPlanSetupsQueryKey(productionId)
  const doc = useMemo(() => ({ markers: history.value, notes }), [history.value, notes])
  const autosave = useAutosave(
    doc,
    async ({ markers, notes: text }) => {
      const matches = (s: FloorPlanSetup) =>
        s.floor_plan_id === plan.id && s.scene_id === scene.id && (s.shot_id ?? null) === (shot?.id ?? null)
      const empty = markers.length === 0 && !text.trim()
      // Show the change straight away; the saved row replaces it below.
      queryClient.setQueryData<FloorPlanSetup[]>(setupsKey, (list = []) => {
        const rest = list.filter((s) => !matches(s))
        if (empty) return rest
        const existing = list.find(matches)
        const ts = new Date().toISOString()
        return [
          ...rest,
          existing
            ? { ...existing, markers, notes: text.trim() || null }
            : {
                id: `pending:${plan.id}:${scene.id}:${shot?.id ?? ''}`,
                production_id: productionId,
                floor_plan_id: plan.id,
                scene_id: scene.id,
                shot_id: shot?.id ?? null,
                markers,
                notes: text.trim() || null,
                created_at: ts,
                updated_at: ts,
                deleted_at: null,
              },
        ]
      })
      const saved = await saveFloorPlanSetup({
        productionId,
        floorPlanId: plan.id,
        sceneId: scene.id,
        shotId: shot?.id ?? null,
        markers,
        notes: text,
      })
      queryClient.setQueryData<FloorPlanSetup[]>(setupsKey, (list = []) => [...list.filter((s) => !matches(s)), ...(saved ? [saved] : [])])
    },
    { paused: history.dragging }
  )

  const saveGeo = async (geo: FloorPlanGeo) => {
    const layout = { ...plan.layout, geo }
    queryClient.setQueryData<FloorPlan[]>(floorPlansQueryKey(productionId), (plans) => plans?.map((p) => (p.id === plan.id ? { ...p, layout } : p)))
    await updateFloorPlan(plan.id, { layout })
  }

  const selected = history.value.find((m) => m.id === selectedId) ?? null
  const updateMarker = (marker: FloorPlanMarker) => history.set(history.value.map((m) => (m.id === marker.id ? marker : m)))
  const remove = () => {
    if (!selected) return
    history.set(history.value.filter((m) => m.id !== selected.id))
    setSelectedId(null)
  }
  const copyFrom = (source: FloorPlanSetup) => {
    history.set(source.markers.map((m) => ({ ...m, id: crypto.randomUUID() })))
    setSelectedId(null)
  }
  const pickTool = (next: FloorPlanTool) => {
    setTool(next)
    if (next !== 'item') setPlacingItem(null)
    if (next !== 'actor') setPlacingPerson(null)
  }
  const placeItem = (item: CatalogItem) => {
    setPlacingItem(item)
    setTool('item')
  }

  const placedPeople = new Set(history.value.flatMap((m) => (m.kind === 'actor' && m.personId ? [m.personId] : [])))
  const castInScene = cast.filter((c) => c.inScene)
  const castOthers = cast.filter((c) => !c.inScene)
  const castGroups = [
    { label: 'In this scene', people: castInScene },
    { label: castInScene.length > 0 ? 'Other cast' : 'Cast', people: castOthers },
  ].filter((g) => g.people.length > 0)

  return (
    <div className="space-y-3">
      <Toolbar>
        <ToolButton label="Select" icon={<MousePointer2 />} active={tool === 'select'} onClick={() => pickTool('select')} />
        <ToolButton label="Camera" showLabel icon={<Video />} active={tool === 'camera'} onClick={() => pickTool('camera')} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant={tool === 'actor' ? 'secondary' : 'ghost'} className="h-9 gap-1.5 px-3">
              <User />
              Cast
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
            {castGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{group.label}</DropdownMenuLabel>
                {group.people.map((c) => (
                  <DropdownMenuItem
                    key={c.personId}
                    onClick={() => {
                      setPlacingPerson({ personId: c.personId, label: c.name })
                      setTool('actor')
                    }}
                  >
                    <span className="size-3 rounded-full border border-black/20" style={{ background: c.color }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {placedPeople.has(c.personId) ? <Check className="size-3.5 text-muted-foreground" /> : null}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            {castGroups.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onClick={() => {
                setPlacingPerson(null)
                setTool('actor')
              }}
            >
              <span className="size-3 rounded-full bg-slate-500" />
              Someone else
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <LibraryButton label="Lights" icon={<Lamp />} categories={LIGHT_CATEGORIES} onPick={placeItem} />
        <LibraryButton label="Grip" icon={<LayoutGrid />} categories={GRIP_CATEGORIES} onPick={placeItem} />
        <Divider />
        <SnapToggle snap={snap} onChange={setSnap} />
        <SunControl sun={sun} day={day} onSetLocation={() => setLocationOpen(true)} />
        {tool === 'item' && placingItem ? <PlacingChip label={placingItem.short} onCancel={() => pickTool('select')} /> : null}
        {tool === 'actor' ? <PlacingChip label={placingPerson?.label ?? 'Cast'} onCancel={() => pickTool('select')} /> : null}
        {tool === 'camera' ? <PlacingChip label="Camera" onCancel={() => pickTool('select')} /> : null}
        {otherSetups.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5 px-3">
                <Copy />
                Copy from
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {otherSetups.map(({ setup: other, label }) => (
                <DropdownMenuItem key={other.id} onClick={() => copyFrom(other)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <div className="flex-1" />
        <SaveStatus status={autosave.status} />
        <HistoryButtons history={history} />
      </Toolbar>

      <FloorPlanCanvas
        layout={plan.layout}
        backgroundImage={plan.background_image}
        markers={history.value}
        onMarkersChange={history.set}
        tool={tool}
        onToolChange={pickTool}
        placingItem={placingItem?.id ?? null}
        placingPerson={placingPerson}
        snap={snap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUndo={history.undo}
        onRedo={history.redo}
        actorColor={actorColor}
        sun={overlay}
      >
        {selected && tool === 'select' ? (
          <SelectionPopover
            entity={selected}
            unitsPerMetre={plan.layout.unitsPerMetre}
            cast={cast}
            onChange={(next) => updateMarker(next as FloorPlanMarker)}
            onDelete={remove}
          />
        ) : null}
      </FloorPlanCanvas>

      <ShotStripView scene={scene} shot={shot} strip={strip} sources={sources} notes={notes} onNotes={setNotes} />

      <LocationDialog
        open={locationOpen}
        onOpenChange={setLocationOpen}
        geo={plan.layout.geo}
        defaultQuery={locationQuery}
        onGeo={(geo) => void saveGeo(geo)}
      />
    </div>
  )
}

/** Scene picker and the scene's shots as cards; the chosen one shows its description and notes. */
function ShotStripView({
  scene,
  shot,
  strip,
  sources,
  notes,
  onNotes,
}: {
  scene: Scene
  shot: Shot | null
  strip: ShotStrip
  sources: ScheduleExportSources
  notes: string
  onNotes: (notes: string) => void
}) {
  const locationName = (id: string | null) => (id ? sources.locations.find((l) => l.id === id)?.name : null)
  const sceneLabel = (s: Scene) => [`Scene ${s.scene_number}`, s.title?.trim()].filter(Boolean).join(' | ')
  const heading = sceneSlugline(scene, locationName(scene.location_id))
  const description = shot ? shot.shot_description?.trim() || shot.subject?.trim() : scene.description?.trim() || scene.title?.trim()
  const details = shot ? shotCameraDetails(shot) : ''
  const cards: Array<{ id: string; shotId: string | null; title: string; sub: string }> = [
    { id: WHOLE_SCENE, shotId: null, title: 'Blocking', sub: 'Whole scene' },
    ...strip.shots.map((s) => ({ id: s.id, shotId: s.id, title: s.shot_number, sub: s.shot_size ?? '' })),
  ]
  const selectedId = shot?.id ?? WHOLE_SCENE

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1" role="group" aria-label="Shots">
      <div className="flex shrink-0 flex-col justify-center gap-1 rounded-lg border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">Scene</span>
        <Select value={scene.id} onValueChange={(id) => strip.onPick(id, WHOLE_SCENE)}>
          <SelectTrigger size="sm" className="h-8 w-52" aria-label="Scene">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {strip.scenesHere.length > 0 ? (
              <SelectGroup>
                <SelectLabel>At this location</SelectLabel>
                {strip.scenesHere.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {sceneLabel(s)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {strip.scenesElsewhere.length > 0 ? (
              <SelectGroup>
                <SelectLabel>{strip.scenesHere.length > 0 ? 'Other scenes' : 'Scenes'}</SelectLabel>
                {strip.scenesElsewhere.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {sceneLabel(s)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      {cards.map((card) => {
        const has = strip.hasSetup(scene.id, card.shotId)
        if (card.id === selectedId) {
          return (
            <section
              key={card.id}
              aria-label={card.shotId ? `Shot ${card.title}` : 'Scene blocking'}
              aria-current="true"
              className="grid min-w-[26rem] flex-1 grid-cols-[minmax(0,1fr)_minmax(0,14rem)] gap-3 rounded-lg border border-primary bg-primary/5 px-3 py-2"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-xs text-muted-foreground">{[`Scene ${scene.scene_number}`, heading].filter(Boolean).join(' | ')}</p>
                <p className="font-semibold">{[card.shotId ? card.title : 'Blocking', details].filter(Boolean).join(' | ')}</p>
                <p className={cn('text-sm whitespace-pre-wrap', !description && 'text-muted-foreground')}>{description || 'No description'}</p>
              </div>
              <Textarea
                aria-label="Notes"
                rows={3}
                value={notes}
                placeholder="Notes"
                onChange={(e) => onNotes(e.target.value)}
                className="min-h-0 resize-none text-sm"
              />
            </section>
          )
        }
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => strip.onPick(scene.id, card.id)}
            className={cn(
              'flex w-24 shrink-0 flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 text-left hover:bg-muted',
              has ? 'bg-card' : 'border-dashed text-muted-foreground'
            )}
          >
            <span className="truncate font-semibold">{card.title}</span>
            <span className="truncate text-xs text-muted-foreground">{card.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
