import { useState } from 'react'
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
import { X, Film, Truck, Megaphone, Utensils, Moon, StickyNote, Clock, Skull, Trash2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { StripboardStrip, StripType, Episode } from '@/lib/db/types'
import type { Scene, Shot } from '@/lib/db/types'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'
import {
  episodeLabelForSceneRow,
  NO_EPISODE_ASSIGNMENT_LABEL,
} from '@/lib/schedule/episodicScheduleDisplay'

const STRIP_ICONS: Record<StripType, typeof Film> = {
  SHOT: Film,
  SCENE: Film,
  MOVE: Truck,
  CALL: Megaphone,
  LUNCH: Utensils,
  WRAP: Moon,
  NOTE: StickyNote,
}

export function StripItem({
  strip,
  scenes,
  shots,
  estimatedMinutesDefault,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  isOverlay,
  onRemove,
  onSendToBoneyard,
  onDeleteStrip,
  scheduledCallCountOnDay = 0,
  scheduledWrapCountOnDay = 0,
  disabled,
  className,
  isEpisodic,
  episodeById,
}: {
  strip: StripboardStrip
  scenes: Scene[]
  shots: Shot[]
  estimatedMinutesDefault?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  isOverlay?: boolean
  /** Boneyard: permanent delete. Only in Boneyard panel. */
  onRemove?: (strip: StripboardStrip) => void
  /** Scheduled SHOT/SCENE strips only: send to Boneyard (amber skull). */
  onSendToBoneyard?: (strip: StripboardStrip) => void
  /** Scheduled MOVE/CALL/LUNCH/WRAP/NOTE strips: delete (grey trash). CALL/WRAP only when counts allow (see stripboard parent). */
  onDeleteStrip?: (strip: StripboardStrip) => void
  /** For this shoot day column: total SCHEDULED Call / Wrap strips (multi-unit). Used to allow Call/Wrap trash only when not the sole strip of that type on the day. */
  scheduledCallCountOnDay?: number
  scheduledWrapCountOnDay?: number
  disabled?: boolean
  className?: string
  /** When true, show episode label from scene (shots inherit via scene). */
  isEpisodic?: boolean
  episodeById?: Map<string, Episode>
}) {
  const shot = strip.shot_id ? shots.find((sh) => sh.id === strip.shot_id) : null
  const scene = shot ? scenes.find((s) => s.id === shot.scene_id) : (strip.scene_id ? scenes.find((s) => s.id === strip.scene_id) : null)
  const Icon = STRIP_ICONS[strip.strip_type]
  const episodeStripLabel =
    isEpisodic &&
    episodeById &&
    scene &&
    (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE')
      ? episodeLabelForSceneRow({ scene, episodeById })
      : null

  const label = (
    <div className="flex flex-col gap-0 min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <Icon className="size-4 shrink-0 text-primary" />
        {strip.strip_type === 'SHOT' && scene && shot ? (
          <>
            <span className="font-medium shrink-0">Scene {scene.scene_number} / Shot {shot.shot_number}</span>
            <div className="flex gap-1 shrink-0 flex-wrap">
              {episodeStripLabel && (
                <Badge
                  variant={episodeStripLabel === NO_EPISODE_ASSIGNMENT_LABEL ? 'outline' : 'secondary'}
                  className="text-[10px] max-w-[6.5rem] truncate"
                  title={episodeStripLabel}
                >
                  {episodeStripLabel}
                </Badge>
              )}
              {scene.int_ext && <Badge variant="secondary" className="text-[10px]">{scene.int_ext}</Badge>}
              {scene.day_night && <Badge variant="outline" className="text-[10px]">{scene.day_night}</Badge>}
              {scene.page_eighths != null && <Badge variant="outline" className="text-[10px]">{scene.page_eighths}/8</Badge>}
            </div>
          </>
        ) : strip.strip_type === 'SCENE' && scene ? (
          <>
            <span className="font-medium shrink-0">Scene {scene.scene_number}</span>
            <span className="text-muted-foreground text-sm min-w-0 truncate">
              {scene.title ?? scene.heading ?? ''}
            </span>
            <div className="flex gap-1 shrink-0 flex-wrap">
              {episodeStripLabel && (
                <Badge
                  variant={episodeStripLabel === NO_EPISODE_ASSIGNMENT_LABEL ? 'outline' : 'secondary'}
                  className="text-[10px] max-w-[6.5rem] truncate"
                  title={episodeStripLabel}
                >
                  {episodeStripLabel}
                </Badge>
              )}
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
      {strip.strip_type === 'SHOT' && shot && (
        <div className="flex items-start gap-2 pt-2 min-w-0">
          <span className="size-4 shrink-0" aria-hidden />
          <p className="text-muted-foreground text-xs min-w-0 truncate flex-1">
            {shot.shot_description ?? shot.subject ?? '(No shot description)'}
          </p>
        </div>
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
      onUpdateCallWrapTime={onUpdateCallWrapTime}
      disabled={disabled}
      onRemove={onRemove}
      onSendToBoneyard={onSendToBoneyard}
      onDeleteStrip={onDeleteStrip}
      scheduledCallCountOnDay={scheduledCallCountOnDay}
      scheduledWrapCountOnDay={scheduledWrapCountOnDay}
      label={label}
      className={className}
    />
  )
}

const DELETABLE_NON_SHOT_STRIP_TYPES = ['MOVE', 'LUNCH', 'NOTE'] as const

function SortableStripInner({
  strip,
  estimatedMinutesDefault,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  disabled,
  onRemove,
  onSendToBoneyard,
  onDeleteStrip,
  scheduledCallCountOnDay = 0,
  scheduledWrapCountOnDay = 0,
  label,
  className,
}: {
  strip: StripboardStrip
  estimatedMinutesDefault?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  disabled?: boolean
  onRemove?: (strip: StripboardStrip) => void
  onSendToBoneyard?: (strip: StripboardStrip) => void
  onDeleteStrip?: (strip: StripboardStrip) => void
  scheduledCallCountOnDay?: number
  scheduledWrapCountOnDay?: number
  label: React.ReactNode
  className?: string
}) {
  const isShotOrScene = strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE'
  const showBoneyard = isShotOrScene && onSendToBoneyard
  const isCallWrap = strip.strip_type === 'CALL' || strip.strip_type === 'WRAP'
  const canDeleteThisCallWrap =
    isCallWrap &&
    onDeleteStrip &&
    ((strip.strip_type === 'CALL' && scheduledCallCountOnDay >= 2) ||
      (strip.strip_type === 'WRAP' && scheduledWrapCountOnDay >= 2))
  const showDelete =
    onDeleteStrip &&
    (DELETABLE_NON_SHOT_STRIP_TYPES.includes(strip.strip_type as (typeof DELETABLE_NON_SHOT_STRIP_TYPES)[number]) ||
      canDeleteThisCallWrap)
  const [localMinutes, setLocalMinutes] = useState<string>(
    strip.estimated_minutes != null ? String(strip.estimated_minutes) : ''
  )
  const [localTime, setLocalTime] = useState<string>(() => {
    const m = (strip.title ?? '').match(/(\d{1,2}:\d{2})$/)
    return normalizeScheduleTimeInput(m?.[1] ?? '') ?? ''
  })
  const [timeError, setTimeError] = useState<string | null>(null)
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
    (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE') &&
    onUpdateEstimatedMinutes &&
    !disabled
  const showCallWrapTimeEditor = isCallWrap && onUpdateCallWrapTime && !disabled

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
  const commitCallWrapTime = () => {
    if (!onUpdateCallWrapTime) return
    const normalized = normalizeScheduleTimeInput(localTime)
    if (!normalized) {
      setTimeError('Enter time as HH:MM')
      return
    }
    setTimeError(null)
    onUpdateCallWrapTime(strip.id, normalized)
  }

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
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Clock className="size-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">Set shot duration</TooltipContent>
          </Tooltip>
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
      {showCallWrapTimeEditor && (
        <Popover
          onOpenChange={(open) => {
            if (!open) commitCallWrapTime()
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Clock className="size-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">Edit strip time</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="w-56"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {strip.strip_type === 'CALL' ? 'Call time' : 'Wrap time'}
              </p>
              <Input
                type="text"
                inputMode="numeric"
                className="h-8 bg-input border-border text-sm"
                value={localTime}
                onChange={(e) => {
                  setLocalTime(e.target.value)
                  if (timeError) setTimeError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitCallWrapTime()
                  }
                }}
                placeholder="HH:MM"
              />
              {timeError && <p className="text-xs text-destructive">{timeError}</p>}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {showBoneyard && !disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:scale-110 transition-transform"
              onClick={(e) => { e.stopPropagation(); onSendToBoneyard!(strip) }}
            >
              <Skull className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Send to Boneyard</TooltipContent>
        </Tooltip>
      )}
      {showDelete && !disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDeleteStrip!(strip) }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Delete strip</TooltipContent>
        </Tooltip>
      )}
      {onRemove && !showBoneyard && !showDelete && !disabled && (
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
