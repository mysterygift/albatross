import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, MousePointer2, Redo2, Spline, Square, Trash2, Type, Undo2, User, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  saveFloorPlanSetup,
  updateFloorPlan,
  type FloorPlan,
  type FloorPlanSetup,
} from '@/lib/db/repositories/floor-plans'
import type { Scene, Shot } from '@/lib/db/types'
import {
  normalizeAngle,
  type FloorPlanLayout,
  type FloorPlanMarker,
  type FloorPlanShape,
} from '@/lib/floor-plans/model'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import type { ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { cn } from '@/lib/utils'
import { FloorPlanCanvas, type FloorPlanTool } from './FloorPlanCanvas'
import { shotCameraDetails } from './floorPlanDisplay'
import { floorPlanSetupsQueryKey, floorPlansQueryKey } from './floorPlanQueries'
import { useAutosave, type AutosaveStatus } from './useAutosave'
import { useEditHistory } from './useEditHistory'
import { useSnapPreference } from './useSnapPreference'

// ─── Shared toolbar pieces ──────────────────────────────────────────────────

type ToolOption = { tool: FloorPlanTool; label: string; hint: string; icon: ReactNode }

function ToolButton({ option, active, onSelect }: { option: ToolOption; active: boolean; onSelect: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant={active ? 'secondary' : 'ghost'}
          aria-pressed={active}
          aria-label={option.label}
          onClick={onSelect}
          className={cn(active && 'ring-1 ring-primary/40')}
        >
          {option.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-medium">{option.label}</span>
        <span className="block text-xs opacity-80">{option.hint}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function SnapToggle({ snap, onChange }: { snap: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Checkbox id="floor-plan-snap" checked={snap} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor="floor-plan-snap" className="cursor-pointer text-sm font-normal">
        Snap to 90°
      </Label>
    </div>
  )
}

const STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: 'Saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
}

function SaveStatus({ status }: { status: AutosaveStatus }) {
  return (
    <span className={cn('ml-auto text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
      {STATUS_TEXT[status]}
    </span>
  )
}

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Floor plan tools" className="flex flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-1.5">
      {children}
    </div>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px bg-border" aria-hidden />

function AngleInput({ id, value, onChange }: { id: string; value: number; onChange: (deg: number) => void }) {
  return (
    <Input
      id={id}
      type="number"
      step={1}
      className="h-8 w-20"
      value={Math.round(value)}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (Number.isFinite(n)) onChange(normalizeAngle(n))
      }}
    />
  )
}

// ─── Layout ─────────────────────────────────────────────────────────────────

const LAYOUT_TOOLS: ToolOption[] = [
  { tool: 'select', label: 'Select', hint: 'Click to select; drag to move. Delete removes.', icon: <MousePointer2 /> },
  { tool: 'rect', label: 'Rectangle', hint: 'Click and drag to draw a room or furniture.', icon: <Square /> },
  { tool: 'path', label: 'Line', hint: 'Click point to point; double-click to finish.', icon: <Spline /> },
  { tool: 'text', label: 'Text', hint: 'Click to place a label.', icon: <Type /> },
]

/** Draw layout mode: edits the plan's shapes, saving as you go. */
export function LayoutEditor({ plan, productionId }: { plan: FloorPlan; productionId: string }) {
  const queryClient = useQueryClient()
  const history = useEditHistory<FloorPlanLayout>(plan.layout)
  const [tool, setTool] = useState<FloorPlanTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snap, setSnap] = useSnapPreference()
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  const autosave = useAutosave(
    history.value,
    async (layout) => {
      queryClient.setQueryData<FloorPlan[]>(floorPlansQueryKey(productionId), (plans) =>
        plans?.map((p) => (p.id === plan.id ? { ...p, layout } : p))
      )
      await updateFloorPlan(plan.id, { layout })
    },
    { paused: history.dragging }
  )

  /** Puts the cursor in the new label's text, after the placing click has moved focus to the canvas. */
  const focusLabelText = () =>
    setTimeout(() => {
      textInputRef.current?.focus()
      textInputRef.current?.select()
    }, 0)

  const selected = history.value.shapes.find((s) => s.id === selectedId) ?? null
  const updateShape = (shape: FloorPlanShape, transient = false) =>
    history.set({ shapes: history.value.shapes.map((s) => (s.id === shape.id ? shape : s)) }, transient)
  const remove = () => {
    if (!selected) return
    history.set({ shapes: history.value.shapes.filter((s) => s.id !== selected.id) })
    setSelectedId(null)
  }

  return (
    <div className="space-y-3">
      <Toolbar>
        {LAYOUT_TOOLS.map((option) => (
          <ToolButton key={option.tool} option={option} active={tool === option.tool} onSelect={() => setTool(option.tool)} />
        ))}
        <Divider />
        <SnapToggle snap={snap} onChange={setSnap} />
        <Divider />
        <IconAction label="Undo" onClick={history.undo} disabled={!history.canUndo}>
          <Undo2 />
        </IconAction>
        <IconAction label="Redo" onClick={history.redo} disabled={!history.canRedo}>
          <Redo2 />
        </IconAction>
        <IconAction label="Delete selected" onClick={remove} disabled={!selected}>
          <Trash2 />
        </IconAction>
        <SaveStatus status={autosave.status} />
      </Toolbar>

      <FloorPlanCanvas
        layout={history.value}
        onLayoutChange={history.set}
        tool={tool}
        onToolChange={setTool}
        snap={snap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUndo={history.undo}
        onRedo={history.redo}
        onTextCreated={focusLabelText}
      />

      {selected?.kind === 'text' ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="fp-text">Label text</Label>
            <Textarea
              id="fp-text"
              ref={textInputRef}
              rows={2}
              value={selected.text}
              // Typing is one undo step, committed when the box loses focus.
              onChange={(e) => updateShape({ ...selected, text: e.target.value }, true)}
              onBlur={() => history.set(history.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-text-size">Text size</Label>
            <Input
              id="fp-text-size"
              type="number"
              min={6}
              max={120}
              className="h-8 w-20"
              value={selected.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 6 && n <= 120) updateShape({ ...selected, fontSize: n })
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-text-rotation">Rotation (°)</Label>
            <AngleInput id="fp-text-rotation" value={selected.rotation} onChange={(rotation) => updateShape({ ...selected, rotation })} />
          </div>
        </div>
      ) : selected?.kind === 'path' && selected.points.length > 2 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <Checkbox
            id="fp-path-closed"
            checked={selected.closed}
            onCheckedChange={(v) => updateShape({ ...selected, closed: v === true })}
          />
          <Label htmlFor="fp-path-closed" className="font-normal">
            Closed shape
          </Label>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {LAYOUT_TOOLS.find((t) => t.tool === tool)?.hint} Arrow keys nudge the selection (Shift for bigger steps); ⌘Z / Ctrl+Z undoes.
        </p>
      )}
    </div>
  )
}

// ─── Setups ─────────────────────────────────────────────────────────────────

const SETUP_TOOLS: ToolOption[] = [
  { tool: 'select', label: 'Select', hint: 'Drag a marker to move it; drag its handle to turn it.', icon: <MousePointer2 /> },
  { tool: 'camera', label: 'Camera', hint: 'Click to place a camera.', icon: <Video /> },
  { tool: 'actor', label: 'Actor', hint: 'Click to place an actor.', icon: <User /> },
]

/** Plot setups mode: camera and actor positions for one scene or shot on this plan. */
export function SetupEditor({
  plan,
  productionId,
  scene,
  shot,
  setup,
  otherSetups,
  sources,
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
}) {
  const queryClient = useQueryClient()
  const history = useEditHistory<FloorPlanMarker[]>(setup?.markers ?? [])
  const [notes, setNotes] = useState(setup?.notes ?? '')
  const [tool, setTool] = useState<FloorPlanTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snap, setSnap] = useSnapPreference()

  const setupsKey = floorPlanSetupsQueryKey(productionId)
  const doc = useMemo(() => ({ markers: history.value, notes }), [history.value, notes])
  const autosave = useAutosave(
    doc,
    async ({ markers, notes: text }) => {
      const key = setupsKey
      const matches = (s: FloorPlanSetup) =>
        s.floor_plan_id === plan.id && s.scene_id === scene.id && (s.shot_id ?? null) === (shot?.id ?? null)
      const empty = markers.length === 0 && !text.trim()
      // Show the change straight away; the saved row replaces it below.
      queryClient.setQueryData<FloorPlanSetup[]>(key, (list = []) => {
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
      queryClient.setQueryData<FloorPlanSetup[]>(key, (list = []) => [...list.filter((s) => !matches(s)), ...(saved ? [saved] : [])])
    },
    { paused: history.dragging }
  )

  const castNames = useMemo(() => {
    const ids = (shot ? sources.castByShotId.get(shot.id) : undefined) ?? sources.castBySceneId.get(scene.id) ?? []
    const byId = new Map(sources.cast.map((p) => [p.id, p]))
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => p.role_name?.trim() || p.name)
  }, [sources, scene.id, shot])

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

  const locationName = (id: string | null) => (id ? sources.locations.find((l) => l.id === id)?.name : null)
  const heading = sceneSlugline(scene, locationName(scene.location_id))
  const description = shot ? shot.shot_description?.trim() || shot.subject?.trim() : scene.description?.trim() || scene.title?.trim()
  const details = shot ? shotCameraDetails(shot) : ''

  return (
    <div className="space-y-3">
      <Toolbar>
        {SETUP_TOOLS.map((option) => (
          <ToolButton key={option.tool} option={option} active={tool === option.tool} onSelect={() => setTool(option.tool)} />
        ))}
        <Divider />
        <SnapToggle snap={snap} onChange={setSnap} />
        <Divider />
        <IconAction label="Undo" onClick={history.undo} disabled={!history.canUndo}>
          <Undo2 />
        </IconAction>
        <IconAction label="Redo" onClick={history.redo} disabled={!history.canRedo}>
          <Redo2 />
        </IconAction>
        <IconAction label="Delete selected" onClick={remove} disabled={!selected}>
          <Trash2 />
        </IconAction>
        {otherSetups.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="gap-1">
                <Copy className="size-4" />
                Start from…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Replace the markers with a copy of</DropdownMenuLabel>
              {otherSetups.map(({ setup: other, label }) => (
                <DropdownMenuItem key={other.id} onClick={() => copyFrom(other)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <SaveStatus status={autosave.status} />
      </Toolbar>

      <FloorPlanCanvas
        layout={plan.layout}
        markers={history.value}
        onMarkersChange={history.set}
        tool={tool}
        onToolChange={setTool}
        snap={snap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUndo={history.undo}
        onRedo={history.redo}
      />

      {selected ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="fp-marker-label">{selected.kind === 'camera' ? 'Camera' : 'Actor or character'}</Label>
            <Input
              id="fp-marker-label"
              value={selected.label}
              list={selected.kind === 'actor' ? 'fp-cast-names' : undefined}
              placeholder={selected.kind === 'camera' ? 'e.g. A' : 'e.g. Marta'}
              onChange={(e) => updateMarker({ ...selected, label: e.target.value })}
            />
            <datalist id="fp-cast-names">
              {castNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-marker-rotation">Facing (°)</Label>
            <AngleInput id="fp-marker-rotation" value={selected.rotation} onChange={(rotation) => updateMarker({ ...selected, rotation })} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{SETUP_TOOLS.find((t) => t.tool === tool)?.hint}</p>
      )}

      <section aria-label="Shot details" className="space-y-3 rounded-lg border bg-card p-4">
        <div className="space-y-0.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Scene {scene.scene_number}
            {heading ? ` · ${heading}` : ''}
          </p>
          <h3 className="font-semibold">
            {shot ? `Shot ${shot.shot_number}` : 'Scene blocking'}
            {details ? <span className="ml-2 text-sm font-normal text-muted-foreground">{details}</span> : null}
          </h3>
        </div>
        <p className={cn('text-sm whitespace-pre-wrap', !description && 'text-muted-foreground')}>
          {description || (shot ? 'No description for this shot yet. Add one on the Shot Lists page.' : 'No scene description yet.')}
        </p>
        {castNames.length > 0 ? (
          <p className="text-xs text-muted-foreground">Cast: {castNames.join(', ')}</p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="fp-setup-notes">Setup notes</Label>
          <Textarea
            id="fp-setup-notes"
            rows={2}
            value={notes}
            placeholder="e.g. Dolly track along the counter; B camera on sticks by the door"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </section>
    </div>
  )
}
