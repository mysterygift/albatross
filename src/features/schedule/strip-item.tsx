import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { X, Film, Truck, Phone, Utensils, Moon, StickyNote, Clock } from 'lucide-react'
import type { StripboardStrip, StripType } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'

const STRIP_ICONS: Record<StripType, typeof Film> = {
  SCENE: Film,
  MOVE: Truck,
  CALL: Phone,
  LUNCH: Utensils,
  WRAP: Moon,
  NOTE: StickyNote,
}

export function StripItem({
  strip,
  scenes,
  estimatedMinutesDefault,
  onUpdateEstimatedMinutes,
  isOverlay,
  onRemove,
  disabled,
  className,
}: {
  strip: StripboardStrip
  scenes: Scene[]
  estimatedMinutesDefault?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  isOverlay?: boolean
  onRemove?: (strip: StripboardStrip) => void
  disabled?: boolean
  className?: string
}) {
  const scene = strip.scene_id ? scenes.find((s) => s.id === strip.scene_id) : null
  const Icon = STRIP_ICONS[strip.strip_type]

  const label = (
    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
      <Icon className="size-4 shrink-0 text-primary" />
      {strip.strip_type === 'SCENE' && scene ? (
        <>
          <span className="font-medium shrink-0">Scene {scene.scene_number}</span>
          <span className="text-muted-foreground text-sm min-w-0 truncate">
            {scene.title ?? scene.heading ?? ''}
          </span>
          <div className="flex gap-1 shrink-0 flex-wrap">
            {scene.int_ext && <Badge variant="secondary" className="text-[10px]">{scene.int_ext}</Badge>}
            {scene.day_night && <Badge variant="outline" className="text-[10px]">{scene.day_night}</Badge>}
            {scene.page_eighths != null && <Badge variant="outline" className="text-[10px]">{scene.page_eighths}/8</Badge>}
          </div>
        </>
      ) : (
        <>
          <span className="font-medium shrink-0">{strip.strip_type}</span>
          {strip.title && <span className="text-muted-foreground text-sm min-w-0 truncate">{strip.title}</span>}
        </>
      )}
    </div>
  )

  if (isOverlay) {
    return (
      <div className="flex items-center justify-between gap-2">
        {label}
        {onRemove && <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7"><X className="size-3.5" /></Button>}
      </div>
    )
  }

  return (
    <SortableStripInner
      strip={strip}
      estimatedMinutesDefault={estimatedMinutesDefault}
      onUpdateEstimatedMinutes={onUpdateEstimatedMinutes}
      disabled={disabled}
      onRemove={onRemove}
      label={label}
      className={className}
    />
  )
}

function SortableStripInner({
  strip,
  estimatedMinutesDefault,
  onUpdateEstimatedMinutes,
  disabled,
  onRemove,
  label,
  className,
}: {
  strip: StripboardStrip
  estimatedMinutesDefault?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  disabled?: boolean
  onRemove?: (strip: StripboardStrip) => void
  label: React.ReactNode
  className?: string
}) {
  const [localMinutes, setLocalMinutes] = useState<string>(
    strip.estimated_minutes != null ? String(strip.estimated_minutes) : ''
  )
  useEffect(() => {
    setLocalMinutes(strip.estimated_minutes != null ? String(strip.estimated_minutes) : '')
  }, [strip.id, strip.estimated_minutes])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: strip.id,
    data: { type: 'strip' as const, strip },
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const showEstMin =
    strip.strip_type === 'SCENE' &&
    onUpdateEstimatedMinutes &&
    !disabled

  const commitEstMin = () => {
    if (!onUpdateEstimatedMinutes) return
    const trimmed = localMinutes.trim()
    if (trimmed === '') {
      onUpdateEstimatedMinutes(strip.id, null)
      return
    }
    const n = parseInt(trimmed, 10)
    if (!Number.isNaN(n) && n >= 0) {
      onUpdateEstimatedMinutes(strip.id, n)
    } else {
      setLocalMinutes(strip.estimated_minutes != null ? String(strip.estimated_minutes) : '')
    }
  }

  const placeholder = estimatedMinutesDefault ? `${estimatedMinutesDefault}` : '—'

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm min-h-[52px] ${isDragging ? 'opacity-50' : ''} ${!disabled ? 'cursor-grab active:cursor-grabbing' : ''} ${className ?? ''}`}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 flex-wrap"
        {...(disabled ? {} : { ...attributes, ...listeners })}
      >
        {label}
      </div>
      {showEstMin && (
        <Popover
          onOpenChange={(open) => {
            if (!open) commitEstMin()
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              title="Set duration override"
            >
              <Clock className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              <p className="text-sm font-medium">Duration override (minutes)</p>
              <Input
                type="number"
                min={0}
                className="h-8 bg-input border-border text-sm"
                value={localMinutes}
                onChange={(e) => setLocalMinutes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitEstMin()
                  }
                }}
                placeholder={placeholder}
              />
              <p className="text-muted-foreground text-xs">
                Leave empty to use shot list total ({placeholder} min).
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {onRemove && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onRemove(strip) }}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </li>
  )
}
