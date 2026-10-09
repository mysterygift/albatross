import { useContext } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { catalogItem, isArmGlyph } from '@/lib/floor-plans/catalog'
import {
  DEFAULT_SHAPE_FILL_OPACITY,
  cameraColor,
  itemColor,
  normalizeAngle,
  textCentre,
  type FloorPlanMarker,
  type FloorPlanPath,
  type FloorPlanRect,
  type FloorPlanShape,
  type FloorPlanShapeStyle,
  type Point,
} from '@/lib/floor-plans/model'
import { cn } from '@/lib/utils'
import { formatItemSize } from './floorPlanDisplay'
import { PlanViewContext, planToViewFraction } from './planView'

export type CastOption = { personId: string; name: string; color: string; inScene: boolean }

/** Anchor point of a selected shape or marker, in plan units. */
function selectionAnchor(entity: FloorPlanShape | FloorPlanMarker): Point {
  if (entity.kind === 'rect') return { x: entity.x + entity.width, y: entity.y + entity.height }
  if (entity.kind === 'path') return entity.points[entity.points.length - 1]!
  if (entity.kind === 'text') return textCentre(entity)
  return { x: entity.x, y: entity.y }
}

function AngleField({ id, value, onChange }: { id: string; value: number; onChange: (deg: number) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        Facing (°)
      </Label>
      <Input
        id={id}
        type="number"
        step={1}
        className="h-8"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(normalizeAngle(n))
        }}
      />
    </div>
  )
}

/** Quick colours for lines and fills; `null` is the theme's own. Any other comes from the picker. */
const SHAPE_SWATCHES: Array<{ color: string | null; name: string }> = [
  { color: null, name: 'Default' },
  { color: '#ffffff', name: 'White' },
  { color: '#64748b', name: 'Grey' },
  { color: '#ef4444', name: 'Red' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#22c55e', name: 'Green' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#8b5cf6', name: 'Violet' },
]

/** A row of swatches plus a picker for any colour. */
function ColourRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string | undefined
  /** Shown in the picker when the theme colour is in use. */
  fallback: string
  onChange: (color: string | undefined) => void
}) {
  const custom = value != null && !SHAPE_SWATCHES.some((s) => s.color === value)
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center justify-between">
        {SHAPE_SWATCHES.map((s) => {
          const checked = (value ?? null) === s.color
          return (
            <button
              key={s.name}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={s.name}
              title={s.name}
              onClick={() => onChange(s.color ?? undefined)}
              className={cn(
                'size-6 shrink-0 rounded-full border border-border',
                checked && 'ring-2 ring-primary ring-offset-1 ring-offset-popover',
                s.color == null && 'bg-[linear-gradient(135deg,var(--foreground)_50%,var(--muted)_50%)]'
              )}
              style={s.color ? { backgroundColor: s.color } : undefined}
            />
          )
        })}
        <label
          title="Other colour"
          className={cn(
            'relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]',
            custom && 'ring-2 ring-primary ring-offset-1 ring-offset-popover'
          )}
          style={custom ? { background: value } : undefined}
        >
          <span className="sr-only">Other {label.toLowerCase()} colour</span>
          <input
            type="color"
            value={value ?? fallback}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}

/** Line colour, and for rectangles and closed shapes the fill colour and how opaque it is. */
function ShapeColours({
  shape,
  filled,
  onChange,
}: {
  shape: FloorPlanRect | FloorPlanPath
  filled: boolean
  onChange: (next: FloorPlanShape, transient?: boolean) => void
}) {
  const opacity = Math.round((shape.fillOpacity ?? DEFAULT_SHAPE_FILL_OPACITY) * 100)
  const set = (patch: Partial<FloorPlanShapeStyle>, transient = false) => {
    const next = { ...shape, ...patch }
    // Back to the theme colour: drop the field rather than store "default".
    for (const key of ['stroke', 'fill'] as const) if (next[key] === undefined) delete next[key]
    onChange(next, transient)
  }
  return (
    <div className="space-y-2">
      <ColourRow label="Line" value={shape.stroke} fallback="#e5e7eb" onChange={(stroke) => set({ stroke })} />
      {filled ? (
        <>
          <ColourRow label="Fill" value={shape.fill} fallback="#475569" onChange={(fill) => set({ fill })} />
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label htmlFor="fp-fill-opacity">Opacity</label>
              <span className="tabular-nums">{opacity}%</span>
            </div>
            <input
              id="fp-fill-opacity"
              type="range"
              min={0}
              max={100}
              step={5}
              value={opacity}
              // Dragging is one undo step: live while it moves, recorded when it lets go.
              onChange={(e) => set({ fillOpacity: Number(e.target.value) / 100 }, true)}
              onPointerUp={() => onChange(shape)}
              onKeyUp={() => onChange(shape)}
              className="w-full accent-primary"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function MetresField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (m: number) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0.1}
        step={0.1}
        className="h-8"
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= 0.05 && n <= 500) onChange(n)
        }}
      />
    </div>
  )
}

/**
 * Properties of the selected shape or marker, floating beside it on the plan. Placed to the right
 * and below, or flipped left/up near the plan's edges.
 */
export function SelectionPopover({
  entity,
  unitsPerMetre,
  cast = [],
  onChange,
  onDelete,
  textInputRef,
  onTextCommit,
}: {
  entity: FloorPlanShape | FloorPlanMarker
  unitsPerMetre: number
  cast?: CastOption[]
  onChange: (next: FloorPlanShape | FloorPlanMarker, transient?: boolean) => void
  onDelete: () => void
  textInputRef?: React.Ref<HTMLTextAreaElement>
  onTextCommit?: () => void
}) {
  // Where the selection is on screen, as fractions of the canvas (the plan may be zoomed in).
  const view = useContext(PlanViewContext)
  const at = planToViewFraction(view, selectionAnchor(entity))
  const fx = Math.min(1, Math.max(0, at.x))
  const fy = Math.min(1, Math.max(0, at.y))
  const flipX = fx > 0.6
  const flipY = fy > 0.55
  const swatch = (color: string, round = false) => (
    <span className={cn('size-3 shrink-0 border border-black/20', round ? 'rounded-full' : 'rounded-sm')} style={{ background: color }} />
  )

  let title: React.ReactNode
  let body: React.ReactNode
  if (entity.kind === 'camera') {
    title = (
      <>
        {swatch(cameraColor(entity.label))}Camera {entity.label}
      </>
    )
    body = (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="fp-camera-label" className="text-xs font-normal text-muted-foreground">
            Camera
          </Label>
          <Input id="fp-camera-label" className="h-8" value={entity.label} maxLength={6} onChange={(e) => onChange({ ...entity, label: e.target.value.toUpperCase() })} />
        </div>
        <AngleField id="fp-camera-facing" value={entity.rotation} onChange={(rotation) => onChange({ ...entity, rotation })} />
      </div>
    )
  } else if (entity.kind === 'actor') {
    const person = cast.find((c) => c.personId === entity.personId)
    title = (
      <>
        {swatch(person?.color ?? '#64748b', true)}
        {entity.label || 'Cast'}
      </>
    )
    const inScene = cast.filter((c) => c.inScene)
    const others = cast.filter((c) => !c.inScene)
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <div className="space-y-1">
          <Label htmlFor="fp-actor-person" className="text-xs font-normal text-muted-foreground">
            Cast
          </Label>
          <Select
            value={entity.personId ?? ''}
            onValueChange={(personId) => {
              const picked = cast.find((c) => c.personId === personId)
              onChange({ ...entity, personId, label: picked?.name ?? entity.label })
            }}
          >
            <SelectTrigger id="fp-actor-person" size="sm" className="w-full">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {inScene.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>In this scene</SelectLabel>
                  {inScene.map((c) => (
                    <SelectItem key={c.personId} value={c.personId}>
                      <span className="flex items-center gap-2">{swatch(c.color, true)}{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {others.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>{inScene.length > 0 ? 'Other cast' : 'Cast'}</SelectLabel>
                  {others.map((c) => (
                    <SelectItem key={c.personId} value={c.personId}>
                      <span className="flex items-center gap-2">{swatch(c.color, true)}{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <AngleField id="fp-actor-facing" value={entity.rotation} onChange={(rotation) => onChange({ ...entity, rotation })} />
      </div>
    )
  } else if (entity.kind === 'item') {
    const entry = catalogItem(entity.type)
    const arm = isArmGlyph(entry?.glyph)
    title = (
      <>
        {swatch(itemColor(entity.type))}
        {entry?.name ?? 'Equipment'}
      </>
    )
    body = (
      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="fp-item-label" className="text-xs font-normal text-muted-foreground">
            Label
          </Label>
          <Input id="fp-item-label" className="h-8" value={entity.label} onChange={(e) => onChange({ ...entity, label: e.target.value })} />
        </div>
        <div className={cn('grid gap-2', entry?.resizable ? 'grid-cols-3' : 'grid-cols-2')}>
          <AngleField id="fp-item-facing" value={entity.rotation} onChange={(rotation) => onChange({ ...entity, rotation })} />
          {entry?.resizable ? (
            <>
              <MetresField id="fp-item-width" label={arm ? 'Base (m)' : 'Width (m)'} value={entity.width} onChange={(width) => onChange({ ...entity, width })} />
              <MetresField id="fp-item-depth" label={arm ? 'Reach (m)' : 'Length (m)'} value={entity.depth} onChange={(depth) => onChange({ ...entity, depth })} />
            </>
          ) : (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Size</span>
              <p className="flex h-8 items-center text-sm">{formatItemSize(entity.width, entity.depth)}</p>
            </div>
          )}
        </div>
      </div>
    )
  } else if (entity.kind === 'text') {
    title = 'Label'
    body = (
      <div className="space-y-2">
        <Textarea
          ref={textInputRef}
          aria-label="Label text"
          rows={2}
          value={entity.text}
          // Typing is one undo step, committed when the box loses focus.
          onChange={(e) => onChange({ ...entity, text: e.target.value }, true)}
          onBlur={onTextCommit}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="fp-text-size" className="text-xs font-normal text-muted-foreground">
              Text size
            </Label>
            <Input
              id="fp-text-size"
              type="number"
              min={6}
              max={120}
              className="h-8"
              value={entity.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 6 && n <= 120) onChange({ ...entity, fontSize: n })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fp-text-rotation" className="text-xs font-normal text-muted-foreground">
              Rotation (°)
            </Label>
            <Input
              id="fp-text-rotation"
              type="number"
              className="h-8"
              value={Math.round(entity.rotation)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) onChange({ ...entity, rotation: normalizeAngle(n) })
              }}
            />
          </div>
        </div>
      </div>
    )
  } else if (entity.kind === 'path') {
    title = entity.closed ? 'Shape' : 'Line'
    body = (
      <div className="space-y-3">
        {entity.points.length > 2 ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={entity.closed} onCheckedChange={(v) => onChange({ ...entity, closed: v === true })} />
            Closed shape
          </label>
        ) : null}
        <ShapeColours shape={entity} filled={entity.closed} onChange={onChange} />
      </div>
    )
  } else {
    title = 'Rectangle'
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{formatItemSize(entity.width / unitsPerMetre, entity.height / unitsPerMetre)}</p>
        <ShapeColours shape={entity} filled onChange={onChange} />
      </div>
    )
  }

  const left = `${fx * 100}%`
  const top = `${fy * 100}%`
  return (
    <div
      role="dialog"
      aria-label="Selection"
      className="absolute z-10 w-64 space-y-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{
        left,
        top,
        transform: `translate(${flipX ? 'calc(-100% - 24px)' : '24px'}, ${flipY ? 'calc(-100% - 12px)' : '12px'})`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">{title}</span>
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Delete" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
      {body}
    </div>
  )
}
