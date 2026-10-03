import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { X, Clock, MapPin, Skull, Trash2 } from 'lucide-react'
import type { Location, StripboardStrip } from '@/lib/db/types'
import type { UpdateStripData } from '@/lib/db/repositories/stripboard-strips'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'

const SELECT_NONE = '__none__'

const DELETABLE_NON_SHOT_STRIP_TYPES = ['MOVE', 'LUNCH', 'NOTE'] as const

/**
 * Per-strip action cluster: duration override, call/wrap time, move editor,
 * send to Boneyard and delete. Shared by the board card and the day table row.
 */
export function StripActions({
  strip,
  estimatedMinutesDefault,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  onUpdateMoveStrip,
  locations = [],
  disabled,
  onRemove,
  onSendToBoneyard,
  onDeleteStrip,
  scheduledCallCountOnDay = 0,
  scheduledWrapCountOnDay = 0,
}: {
  strip: StripboardStrip
  estimatedMinutesDefault?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  onUpdateMoveStrip?: (stripId: string, data: UpdateStripData) => void
  locations?: Location[]
  disabled?: boolean
  onRemove?: (strip: StripboardStrip) => void
  onSendToBoneyard?: (strip: StripboardStrip) => void
  onDeleteStrip?: (strip: StripboardStrip) => void
  scheduledCallCountOnDay?: number
  scheduledWrapCountOnDay?: number
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
  const showEstMin =
    (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE') &&
    onUpdateEstimatedMinutes &&
    !disabled
  const showCallWrapTimeEditor = isCallWrap && onUpdateCallWrapTime && !disabled
  const showMoveEditor = strip.strip_type === 'MOVE' && onUpdateMoveStrip && !disabled
  const [localOriginId, setLocalOriginId] = useState(strip.origin_location_id ?? SELECT_NONE)
  const [localDestId, setLocalDestId] = useState(strip.destination_location_id ?? SELECT_NONE)
  const [localTitle, setLocalTitle] = useState(strip.title ?? '')
  const [localDescription, setLocalDescription] = useState(strip.description ?? '')

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

  const commitMoveStrip = () => {
    if (!onUpdateMoveStrip) return
    onUpdateMoveStrip(strip.id, {
      title: localTitle.trim() || null,
      description: localDescription.trim() || null,
      origin_location_id: localOriginId === SELECT_NONE ? null : localOriginId,
      destination_location_id: localDestId === SELECT_NONE ? null : localDestId,
    })
  }

  return (
    <>
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
      {showMoveEditor && (
        <Popover
          onOpenChange={(open) => {
            if (open) {
              setLocalOriginId(strip.origin_location_id ?? SELECT_NONE)
              setLocalDestId(strip.destination_location_id ?? SELECT_NONE)
              setLocalTitle(strip.title ?? '')
              setLocalDescription(strip.description ?? '')
            } else {
              commitMoveStrip()
            }
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
                  <MapPin className="size-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="left">Edit move / setup</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="w-72"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              <p className="text-sm font-medium">Move / setup</p>
              <div className="space-y-1">
                <Label className="text-xs">Origin</Label>
                <Select value={localOriginId} onValueChange={setLocalOriginId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>None</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Destination</Label>
                <Select value={localDestId} onValueChange={setLocalDestId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>None</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title (optional)</Label>
                <Input
                  className="h-8 text-sm"
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  placeholder="e.g. Company move"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  className="h-8 text-sm"
                  value={localDescription}
                  onChange={(e) => setLocalDescription(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
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
    </>
  )
}
