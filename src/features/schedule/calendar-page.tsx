/**
 * Schedule Calendar — month view of shoot day events (one per shoot_day_unit).
 *
 * Drag any event to another date to move the entire shoot day to that date.
 * If the target date already has a shoot, you can swap the two days. Day Summary Drawer on click.
 */
import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { scheduleTutorialSteps } from '@/features/tutorial/sections/scheduleTutorial'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import {
  moveShootDayToDate,
  swapShootDays,
  updateShootDay,
  listScenesByProduction,
  listShotsByProduction,
  listShootDaysByProduction,
  ensureCallWrapStripsForProduction,
} from '@/lib/db/repositories/schedule'
import { stripboardQueryKeys } from '@/features/schedule/stripboard-hooks'
import type { CalendarShootDayEvent } from '@/lib/db/types'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'
import { listStripsByProduction } from '@/lib/db/repositories/stripboard-strips'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listCast, listCrew } from '@/lib/db/repositories/person'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getSetting } from '@/lib/db/repositories/settings'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import {
  calendarShootingBlocDisplay,
  orderedDistinctEpisodeNames,
  type ShootingBlocViewFilter,
} from '@/lib/schedule/episodicScheduleDisplay'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import {
  ensureCallWrapStripsForProductionForActor,
  getCastIdsBySceneIdsForActor,
  getCastIdsByShotIdsForActor,
  listBookingsByProductionForActor,
  listCalendarShootDayEventsForActor,
  listCastForActor,
  listEpisodesByProductionForActor,
  listLocationsByProductionForActor,
  listScenesByProductionForActor,
  listShootDaysByProductionForActor,
  listShotsByProductionForActor,
  listShootingBlocsByProductionForActor,
  listStripsByProductionForActor,
  listCrewForActor,
  moveShootDayToDateForActor,
  swapShootDaysForActor,
  updateShootDayForActor,
} from '@/lib/access/projectDomainService'
import { getCallSheetCastRequirements } from '@/lib/call-sheets/castRequirements'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import {
  getEffectiveCrewHierarchyOrDefault,
  getDefaultCrewHierarchyConfig,
} from '@/lib/people/crewHierarchyResolver'
import {
  getTravelSegmentsForDayUnit,
  type DayTravelSegment,
} from '@/lib/logistics/dayTravel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toYyyyMmDd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthGrid(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    leadingBlanks: start.getDay(),
    daysInMonth: end.getDate(),
  }
}

/** Format call–wrap range; omit missing parts. */
function formatCallWrap(callTime: string | null, wrapTime: string | null): string {
  if (callTime && wrapTime) return `${callTime} – ${wrapTime}`
  if (callTime) return `Call ${callTime}`
  if (wrapTime) return `Wrap ${wrapTime}`
  return '—'
}

/** Format estimated runtime (minutes). */
function formatRuntime(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Format date YYYY-MM-DD for display. */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('default', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTravelMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const RUNTIME_WARNING_THRESHOLD_MINUTES = 630 // 10.5h
const LONG_MOVE_WARNING_THRESHOLD_MINUTES = 60
const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'
const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()

type DaySummaryStats = {
  scenesScheduled: number
  pagesEighths: number
  shots: number
  castCalled: number
  crewBooked: number
}

type DaySummaryLocationStackEntry = {
  locationId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
}

type DaySummaryLocationStack = {
  orderedLocations: DaySummaryLocationStackEntry[]
  missingLocationSceneCount: number
}

type DaySummaryWarning = {
  id: string
  message: string
}

type DayTurnaroundSummary = {
  available: boolean
  durationMinutes: number | null
  formattedDuration: string | null
  affectedCrewCount: number
  affectedCrewNames: string[]
  allCastCrewAffected: boolean
  belowThreshold: boolean
  reasonUnavailable?: string
}

function getOrderedLocationStackForDayUnit(args: {
  strips: Array<{
    sort_index: number
    strip_type: string
    scene_id: string | null
    shot_id: string | null
  }>
  shotsById: Map<string, { scene_id: string }>
  scenesById: Map<string, { location_id: string | null }>
  locationsById: Map<string, { name: string; address: string | null; lat: number | null; lng: number | null }>
}): DaySummaryLocationStack {
  const { strips, shotsById, scenesById, locationsById } = args
  const ordered = [...strips].sort((a, b) => a.sort_index - b.sort_index)
  const seenLocationIds = new Set<string>()
  const orderedLocations: DaySummaryLocationStackEntry[] = []
  const missingLocationSceneIds = new Set<string>()

  for (const strip of ordered) {
    if (strip.strip_type !== 'SHOT' && strip.strip_type !== 'SCENE') continue

    let sceneId: string | null = strip.scene_id
    if (!sceneId && strip.shot_id) {
      sceneId = shotsById.get(strip.shot_id)?.scene_id ?? null
    }
    if (!sceneId) continue

    const locationId = scenesById.get(sceneId)?.location_id ?? null
    if (!locationId) {
      missingLocationSceneIds.add(sceneId)
      continue
    }

    const location = locationsById.get(locationId)
    if (!location) {
      missingLocationSceneIds.add(sceneId)
      continue
    }
    if (seenLocationIds.has(locationId)) continue

    seenLocationIds.add(locationId)
    orderedLocations.push({
      locationId,
      name: location.name,
      address: location.address ?? null,
      lat: location.lat,
      lng: location.lng,
    })
  }

  return { orderedLocations, missingLocationSceneCount: missingLocationSceneIds.size }
}

function toNullableCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatNamesSummary(names: string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (unique.length === 0) return ''
  if (unique.length <= 2) return unique.join(', ')
  return `${unique.slice(0, 2).join(', ')}, +${unique.length - 2} more`
}

function getDaySummaryWarnings(args: {
  callTime: string | null
  wrapTime: string | null
  requiredButNotBookedNames: string[]
  bookedButNotRequiredNames: string[]
  missingLocationSceneCount: number
}): DaySummaryWarning[] {
  const warnings: DaySummaryWarning[] = []
  const callTime = args.callTime?.trim() ?? ''
  const wrapTime = args.wrapTime?.trim() ?? ''

  if (!callTime) warnings.push({ id: 'missing-call-time', message: 'Missing call time' })
  if (!wrapTime) warnings.push({ id: 'missing-wrap-time', message: 'Missing wrap time' })

  if (args.requiredButNotBookedNames.length > 0) {
    const names = formatNamesSummary(args.requiredButNotBookedNames)
    warnings.push({
      id: 'required-cast-not-booked',
      message: `${args.requiredButNotBookedNames.length} required cast not booked${names ? `: ${names}` : ''}`,
    })
  }

  if (args.bookedButNotRequiredNames.length > 0) {
    const names = formatNamesSummary(args.bookedButNotRequiredNames)
    warnings.push({
      id: 'booked-cast-not-required',
      message: `${args.bookedButNotRequiredNames.length} booked cast not required${names ? `: ${names}` : ''}`,
    })
  }

  if (args.missingLocationSceneCount > 0) {
    const noun = args.missingLocationSceneCount === 1 ? 'scene has' : 'scenes have'
    warnings.push({
      id: 'scheduled-scenes-missing-location',
      message: `${args.missingLocationSceneCount} scheduled ${noun} no location assigned`,
    })
  }

  return warnings
}

function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * Baseline turnaround model (DS5):
 * selected-day call minus previous shoot-day wrap, with 10h threshold.
 */
function getDayTurnaroundSummary(args: {
  selectedDate: string
  selectedCallTime: string | null
  previousDate: string | null
  previousWrapTime: string | null
  selectedCrewBookedIds: string[]
  previousCrewBookedIds: string[]
  selectedBookedPersonIds: string[]
  previousBookedPersonIds: string[]
  crewById: Map<string, { name: string }>
  thresholdMinutes: number
}): DayTurnaroundSummary {
  const callTime = args.selectedCallTime?.trim() ?? ''
  if (!callTime) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable: missing call time.',
    }
  }

  if (!args.previousDate) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable for this day.',
    }
  }

  const wrapTime = args.previousWrapTime?.trim() ?? ''
  if (!wrapTime) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable: missing previous wrap time.',
    }
  }

  const prevWrap = new Date(`${args.previousDate}T${wrapTime}:00`)
  const selectedCall = new Date(`${args.selectedDate}T${callTime}:00`)
  const diffMinutes = Math.round((selectedCall.getTime() - prevWrap.getTime()) / 60000)
  if (!Number.isFinite(diffMinutes) || diffMinutes < 0) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable for this day.',
    }
  }

  const prevSet = new Set(args.previousCrewBookedIds)
  const overlapIds = [...new Set(args.selectedCrewBookedIds)].filter((id) => prevSet.has(id))
  const affectedCrewNames = overlapIds
    .map((id) => args.crewById.get(id)?.name?.trim() ?? '')
    .filter(Boolean)
  const selectedBooked = [...new Set(args.selectedBookedPersonIds)]
  const previousBookedSet = new Set(args.previousBookedPersonIds)
  const allBookedOverlapCount = selectedBooked.filter((id) => previousBookedSet.has(id)).length
  const allCastCrewAffected = selectedBooked.length > 0 && allBookedOverlapCount === selectedBooked.length

  return {
    available: true,
    durationMinutes: diffMinutes,
    formattedDuration: formatDurationMinutes(diffMinutes),
    affectedCrewCount: overlapIds.length,
    affectedCrewNames,
    allCastCrewAffected,
    belowThreshold: diffMinutes < args.thresholdMinutes,
  }
}

/** Exported for episodic schedule UI tests. */
export function CalendarEventCardBody({
  event,
  onClick,
  isOverlay,
  isEpisodic,
}: {
  event: CalendarShootDayEvent
  onClick: () => void
  isOverlay?: boolean
  isEpisodic?: boolean
}) {
  const isMain = event.unitKey === 'main'
  const bgVar = isMain ? 'var(--unit-main)' : 'var(--unit-second)'
  const fgVar = isMain ? 'var(--unit-main-foreground)' : 'var(--unit-second-foreground)'

  return (
    <div
      role={isOverlay ? undefined : 'button'}
      tabIndex={isOverlay ? undefined : 0}
      onClick={onClick}
      onKeyDown={(e) => !isOverlay && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={cn(
        'rounded-md px-1.5 py-1 text-left text-xs transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
        !isOverlay && 'cursor-pointer flex-1 min-w-0'
      )}
      style={{
        backgroundColor: bgVar,
        color: fgVar,
      }}
    >
      <div className="font-medium">{event.unitName}</div>
      {isEpisodic && (
        <div className="mt-0.5 text-[10px] font-medium opacity-95 truncate" title={calendarShootingBlocDisplay(event.shootingBlocId, event.shootingBlocName)}>
          {calendarShootingBlocDisplay(event.shootingBlocId, event.shootingBlocName)}
        </div>
      )}
      <div className="mt-0.5 opacity-90">
        {formatCallWrap(event.callTime, event.wrapTime)}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 opacity-90">
        <span>{formatRuntime(event.estMinutes)}</span>
        <span>{event.primaryLocationName ?? '—'}</span>
        <span>{event.shotCount} shots</span>
      </div>
    </div>
  )
}

function DraggableEventCard({
  event,
  onClick,
  isEpisodic,
}: {
  event: CalendarShootDayEvent
  onClick: () => void
  isEpisodic?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.shootDayUnitId,
    data: {
      shootDayUnitId: event.shootDayUnitId,
      shootDayId: event.shootDayId,
      date: event.date,
    },
  })
  return (
    <div
      className={cn(
        'flex items-stretch gap-0.5 rounded-md overflow-hidden',
        isDragging && 'opacity-50'
      )}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing touch-none flex items-center shrink-0 px-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Drag to reschedule"
      >
        <GripVertical className="size-3.5" />
      </div>
      <CalendarEventCardBody event={event} onClick={onClick} isOverlay={false} isEpisodic={isEpisodic} />
    </div>
  )
}

function DroppableDayCell({
  dateStr,
  children,
}: {
  dateStr: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateStr}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[100px] rounded border border-border bg-card/30 p-2 text-left',
        isOver && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
      )}
    >
      {children}
    </div>
  )
}

function DaySummaryDrawer({
  event,
  open,
  onOpenChange,
  onSaveEdits,
  isSaving,
  stats,
  locationStack,
  warnings,
  turnaround,
  orsApiKeySetting,
  isEpisodic,
  shootingBlocDisplay,
  episodesOnUnitSummary,
}: {
  event: CalendarShootDayEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveEdits: (payload: {
    shootDayId: string
    callTime: string | null
    wrapTime: string | null
    notes: string | null
  }) => Promise<void>
  isSaving: boolean
  stats: DaySummaryStats
  locationStack: DaySummaryLocationStack
  warnings: DaySummaryWarning[]
  turnaround: DayTurnaroundSummary
  orsApiKeySetting: string
  isEpisodic?: boolean
  shootingBlocDisplay?: string | null
  /** Comma-separated episode names for scheduled material on this unit, or "—". */
  episodesOnUnitSummary?: string | null
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [callTimeInput, setCallTimeInput] = useState('')
  const [wrapTimeInput, setWrapTimeInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [callTimeError, setCallTimeError] = useState<string | null>(null)
  const [wrapTimeError, setWrapTimeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [travelSegments, setTravelSegments] = useState<DayTravelSegment[]>([])
  const [isTravelLoading, setIsTravelLoading] = useState(false)
  const [travelRefreshTick, setTravelRefreshTick] = useState(0)

  useEffect(() => {
    if (!event) return
    queueMicrotask(() => {
      setCallTimeInput(event.callTime ?? '')
      setWrapTimeInput(event.wrapTime ?? '')
      setNotesInput(event.notes ?? '')
      setCallTimeError(null)
      setWrapTimeError(null)
      setSaveError(null)
      setIsEditing(false)
    })
  }, [event?.shootDayUnitId, open])

  useEffect(() => {
    let cancelled = false
    const orderedLocations = locationStack.orderedLocations
    if (!event || orderedLocations.length < 2) {
      queueMicrotask(() => {
        setTravelSegments([])
        setIsTravelLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => setIsTravelLoading(true))
    void getTravelSegmentsForDayUnit(
      orderedLocations.map((location) => ({
        id: location.locationId,
        name: location.name,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
      })),
      { orsApiKey: orsApiKeySetting }
    )
      .then((segments) => {
        if (cancelled) return
        setTravelSegments(segments)
      })
      .catch(() => {
        if (cancelled) return
        setTravelSegments([])
      })
      .finally(() => {
        if (cancelled) return
        setIsTravelLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [event?.shootDayUnitId, locationStack.orderedLocations, travelRefreshTick, orsApiKeySetting])

  const totalTravelMinutes = useMemo(() => {
    const valid = travelSegments
      .map((segment) => segment.travelMinutes)
      .filter((minutes): minutes is number => minutes != null)
    if (valid.length === 0) return null
    return valid.reduce((sum, minutes) => sum + minutes, 0)
  }, [travelSegments])

  const hasLongMove = useMemo(
    () =>
      travelSegments.some(
        (segment) =>
          typeof segment.travelMinutes === 'number' &&
          segment.travelMinutes >= LONG_MOVE_WARNING_THRESHOLD_MINUTES
      ),
    [travelSegments]
  )

  if (!event) return null

  const runtimeWarning = event.estMinutes > RUNTIME_WARNING_THRESHOLD_MINUTES
  const unitColor =
    event.unitKey === 'main' ? 'var(--unit-main)' : 'var(--unit-second)'

  const resetEdits = () => {
    setCallTimeInput(event.callTime ?? '')
    setWrapTimeInput(event.wrapTime ?? '')
    setNotesInput(event.notes ?? '')
    setCallTimeError(null)
    setWrapTimeError(null)
    setSaveError(null)
    setIsEditing(false)
  }

  const canRefreshTravel = locationStack.orderedLocations.length >= 2

  const handleSave = async () => {
    setCallTimeError(null)
    setWrapTimeError(null)
    setSaveError(null)

    const rawCall = callTimeInput.trim()
    const rawWrap = wrapTimeInput.trim()
    const normalizedCall = normalizeScheduleTimeInput(rawCall)
    const normalizedWrap = normalizeScheduleTimeInput(rawWrap)

    let hasError = false
    if (rawCall && !normalizedCall) {
      setCallTimeError('Enter time as HH:MM')
      hasError = true
    }
    if (rawWrap && !normalizedWrap) {
      setWrapTimeError('Enter time as HH:MM')
      hasError = true
    }
    if (hasError) return

    try {
      await onSaveEdits({
        shootDayId: event.shootDayId,
        callTime: normalizedCall,
        wrapTime: normalizedWrap,
        notes: notesInput.trim() ? notesInput.trim() : null,
      })
      setIsEditing(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed. Try again.'
      setSaveError(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'top-4 right-4 bottom-4 left-[auto] h-[calc(100vh-2rem)] w-[420px] max-w-[90vw] flex flex-col gap-0 rounded-2xl border border-border shadow-xl overflow-hidden',
          'transition-[transform] duration-300 ease-out',
          'data-[state=open]:duration-300 data-[state=closed]:duration-300'
        )}
      >
        <SheetHeader className="px-7 pt-6 pb-3">
          <div className="pr-8">
            <SheetTitle className="text-foreground text-lg font-semibold leading-tight">
              {formatDateLabel(event.date)}
            </SheetTitle>
            <p
              className="mt-2 font-medium text-sm"
              style={{ color: unitColor }}
            >
              {event.unitName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-muted/80 px-2 py-0.5 text-muted-foreground text-xs">
                {event.shotCount} shots
              </span>
              <span className="rounded-md bg-muted/80 px-2 py-0.5 text-muted-foreground text-xs">
                {formatRuntime(event.estMinutes)}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {!isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                    Edit day details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTravelRefreshTick((tick) => tick + 1)}
                    disabled={!canRefreshTravel || isTravelLoading}
                  >
                    {isTravelLoading ? 'Refreshing travel…' : 'Refresh travel times'}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetEdits} disabled={isSaving}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-7 py-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {isEpisodic && (
                <>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Shooting bloc
                    </p>
                    <p className="text-foreground mt-0.5 text-sm">
                      {shootingBlocDisplay ?? '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Episodes (this unit)
                    </p>
                    <p className="text-foreground mt-0.5 text-sm">
                      {episodesOnUnitSummary ?? '—'}
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Call time
                </p>
                {isEditing ? (
                  <>
                    <Input
                      value={callTimeInput}
                      onChange={(e) => {
                        setCallTimeInput(e.target.value)
                        if (callTimeError) setCallTimeError(null)
                      }}
                      placeholder="HH:MM"
                      className="mt-1 h-8"
                    />
                    {callTimeError && <p className="mt-1 text-xs text-destructive">{callTimeError}</p>}
                  </>
                ) : (
                  <p className="text-foreground mt-0.5 text-sm">
                    {event.callTime ?? '—'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Lunch
                </p>
                <p className="text-foreground mt-0.5 text-sm">
                  {event.lunchTime ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Wrap time
                </p>
                {isEditing ? (
                  <>
                    <Input
                      value={wrapTimeInput}
                      onChange={(e) => {
                        setWrapTimeInput(e.target.value)
                        if (wrapTimeError) setWrapTimeError(null)
                      }}
                      placeholder="HH:MM"
                      className="mt-1 h-8"
                    />
                    {wrapTimeError && <p className="mt-1 text-xs text-destructive">{wrapTimeError}</p>}
                  </>
                ) : (
                  <p className="text-foreground mt-0.5 text-sm">
                    {event.wrapTime ?? '—'}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Notes
                </p>
                {isEditing ? (
                  <Textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add notes"
                    className="mt-1 min-h-[84px] resize-y"
                  />
                ) : (
                  <p className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">
                    {event.notes?.trim() ? event.notes : '—'}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Location
                </p>
                <p className="text-foreground mt-0.5 text-sm">
                  {event.primaryLocationName ?? '—'}
                </p>
              </div>
            </div>

            {saveError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {saveError}
              </p>
            )}

            {runtimeWarning && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400 text-xs">
                Estimated runtime over 10h 30min. Consider splitting the day.
              </p>
            )}

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Work Summary
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Scenes scheduled</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.scenesScheduled}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Pages</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.pagesEighths}/8</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Shots</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.shots}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                People Summary
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Cast called</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.castCalled}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Crew booked</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.crewBooked}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Location Stack
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Locations</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">
                    {locationStack.orderedLocations.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Moves</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">
                    {Math.max(locationStack.orderedLocations.length - 1, 0)}
                  </p>
                </div>
              </div>
              {locationStack.orderedLocations.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No locations are associated with the scheduled material for this day.
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {locationStack.orderedLocations.map((location, index) => (
                    <li key={location.locationId} className="space-y-2">
                      <div className="rounded-md border border-border/50 px-2.5 py-2">
                        <p className="text-foreground text-sm font-medium">
                          {index + 1}. {location.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {location.address?.trim() ? location.address : 'Address missing'}
                        </p>
                      </div>
                      {index < locationStack.orderedLocations.length - 1 && (
                        <p className="px-1 text-xs text-muted-foreground">
                          {isTravelLoading
                            ? '↓ Loading travel time…'
                            : travelSegments[index]?.travelMinutes != null
                              ? `↓ ${formatTravelMinutes(travelSegments[index]!.travelMinutes!)} drive`
                              : '↓ Travel time unavailable'}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {locationStack.orderedLocations.length > 1 && !isTravelLoading && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {totalTravelMinutes != null
                    ? `Total travel time: ${formatTravelMinutes(totalTravelMinutes)}`
                    : 'Total travel time unavailable'}
                </p>
              )}
              {locationStack.orderedLocations.length > 1 && isTravelLoading && (
                <p className="mt-2 text-xs text-muted-foreground">Total travel time: loading…</p>
              )}
              {!isTravelLoading && hasLongMove && (
                <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Long move between locations</span> (1h+)
                </p>
              )}
              {locationStack.missingLocationSceneCount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Some scheduled material has no location assigned.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Warnings
              </p>
              {warnings.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No schedule warnings for this day.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {warnings.map((warning) => (
                    <li
                      key={warning.id}
                      className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {warning.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Turnaround
              </p>
              {!turnaround.available ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {turnaround.reasonUnavailable ?? 'Turnaround unavailable for this day.'}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Shortest turnaround</p>
                    <p className="text-foreground mt-0.5 text-sm font-medium">
                      {turnaround.formattedDuration}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Affected crew</p>
                    <p className="text-foreground mt-0.5 text-sm font-medium">
                      {turnaround.allCastCrewAffected
                        ? 'All Cast/Crew'
                        : `${turnaround.affectedCrewCount}${turnaround.affectedCrewNames.length > 0
                        ? `: ${formatNamesSummary(turnaround.affectedCrewNames)}`
                        : ''}`}
                    </p>
                  </div>
                  {turnaround.belowThreshold && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                      Below 10h recommended turnaround
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ScheduleCalendarPage() {
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const authSession = useAuthSession()
  const isEpisodicProduction = currentProduction?.is_episodic === true
  const [viewDate, setViewDate] = useState(() => new Date())
  const [calendarBlocFilter, setCalendarBlocFilter] = useState<ShootingBlocViewFilter>('all')
  const [selectedEvent, setSelectedEvent] = useState<CalendarShootDayEvent | null>(null)

  useEffect(() => {
    setCalendarBlocFilter('all')
  }, [currentProductionId])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [activeEvent, setActiveEvent] = useState<CalendarShootDayEvent | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [conflictModal, setConflictModal] = useState<{
    sourceShootDayId: string
    existingShootDayId: string
  } | null>(null)

  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [tutorialOpen, setTutorialOpen] = useState(false)

  useEffect(() => {
    if (progress?.currentSection === 'schedule') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const invalidateScheduleQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
    queryClient.invalidateQueries({ queryKey: ['shoot-days'] })
    queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const moveMutation = useMutation({
    mutationFn: async (vars: { shootDayId: string; newDate: string }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return moveShootDayToDateForActor({
          db,
          actor: authSession.currentUser,
          shootDayId: vars.shootDayId,
          newDate: vars.newDate,
        })
      }
      return moveShootDayToDate(vars.shootDayId, vars.newDate)
    },
  })
  const ensureCallWrapStripsMutation = useMutation({
    mutationFn: async (productionId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await ensureCallWrapStripsForProductionForActor({ db, actor: authSession.currentUser, productionId })
      } else {
        await ensureCallWrapStripsForProduction(productionId)
      }
    },
    onSuccess: () => {
      invalidateScheduleQueries()
    },
    onError: () => {
      setToast('Could not complete schedule migration check.')
    },
  })
  const updateDaySummaryMutation = useMutation({
    mutationFn: (vars: {
      shootDayId: string
      callTime: string | null
      wrapTime: string | null
      notes: string | null
    }) => {
      if (authSession.authSupported && authSession.currentUser) {
        return getDb().then((db) =>
          updateShootDayForActor({
            db,
            actor: authSession.currentUser!,
            shootDayId: vars.shootDayId,
            data: {
              call_time: vars.callTime,
              wrap_time: vars.wrapTime,
              notes: vars.notes,
            },
          })
        )
      }
      return updateShootDay(vars.shootDayId, {
        call_time: vars.callTime,
        wrap_time: vars.wrapTime,
        notes: vars.notes,
      })
    },
  })

  const handleDragStart = (ev: DragStartEvent) => {
    const { active } = ev
    const found = events.find((e) => e.shootDayUnitId === active.id)
    setActiveEvent(found ?? null)
  }

  const handleDragEnd = (ev: DragEndEvent) => {
    setActiveEvent(null)
    const { active, over } = ev
    const overId = over?.id
    if (overId == null || typeof overId !== 'string' || !overId.startsWith('date-')) return
    const targetDate = overId.slice(5)
    if (targetDate.length !== 10) return
    const data = active.data.current as { shootDayUnitId?: string; shootDayId?: string; date?: string } | undefined
    if (!data?.shootDayId || !data?.date || data.date === targetDate) return
    if (moveMutation.isPending) return
    const variables = { shootDayId: data.shootDayId, newDate: targetDate }
    moveMutation.mutateAsync(variables).then((result) => {
      if (result.success) {
        invalidateScheduleQueries()
      } else if ('existingShootDayId' in result && result.existingShootDayId) {
        setConflictModal({
          sourceShootDayId: variables.shootDayId,
          existingShootDayId: result.existingShootDayId,
        })
      } else {
        setToast('A shoot already exists on that date.')
      }
    }).catch(() => setToast('Move failed.'))
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  const dateRange = useMemo(() => {
    const start = toYyyyMmDd(year, month, 1)
    const end = toYyyyMmDd(year, month, new Date(year, month + 1, 0).getDate())
    return { start, end }
  }, [year, month])

  const { data: shootingBlocs = [] } = useQuery({
    queryKey: ['shooting-blocs', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootingBlocsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootingBlocsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && isEpisodicProduction,
  })

  const { data: episodes = [] } = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEpisodesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listEpisodesByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && isEpisodicProduction,
  })

  const { data: events = [] } = useQuery({
    queryKey: [
      'calendar-events',
      currentProductionId,
      dateRange.start,
      dateRange.end,
      isEpisodicProduction ? calendarBlocFilter : 'all',
    ],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCalendarShootDayEventsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          dateRange,
          filters: { shootingBlocFilter: isEpisodicProduction ? calendarBlocFilter : 'all' },
        })
      }
      return listCalendarShootDayEvents(currentProductionId, dateRange, {
        shootingBlocFilter: isEpisodicProduction ? calendarBlocFilter : 'all',
      })
    },
    enabled: !!currentProductionId,
  })
  const { data: strips = [] } = useQuery({
    queryKey: stripboardQueryKeys.strips(currentProductionId ?? ''),
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStripsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listStripsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: scenes = [] } = useQuery({
    queryKey: stripboardQueryKeys.scenes(currentProductionId ?? ''),
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listScenesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: shots = [] } = useQuery({
    queryKey: ['shots', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShotsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listBookingsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCast(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: crew = [] } = useQuery({
    queryKey: ['crew', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCrewForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCrew(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId ?? ''],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId,
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listLocationsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listLocationsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: orsApiKeySetting = '' } = useQuery({
    queryKey: ['settings', OPENROUTESERVICE_API_KEY_SETTING],
    queryFn: async () => (await getSetting(OPENROUTESERVICE_API_KEY_SETTING)) ?? '',
  })
  const crewHierarchy = hierarchyData ?? defaultCrewHierarchy

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarShootDayEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  const selectedUnitScheduledStrips = useMemo(() => {
    if (!selectedEvent) return []
    return strips.filter(
      (s) =>
        s.strip_status === 'SCHEDULED' &&
        s.shoot_day_id === selectedEvent.shootDayId &&
        s.shoot_day_unit_id === selectedEvent.shootDayUnitId
    )
  }, [strips, selectedEvent])

  const scheduledShotIdsForSelectedUnit = useMemo(() => {
    return [...new Set(selectedUnitScheduledStrips.filter((s) => s.strip_type === 'SHOT' && s.shot_id).map((s) => s.shot_id as string))]
  }, [selectedUnitScheduledStrips])

  const scheduledSceneIdsForSelectedUnit = useMemo(() => {
    const sceneIds = new Set<string>()
    const shotById = new Map(shots.map((shot) => [shot.id, shot]))
    for (const strip of selectedUnitScheduledStrips) {
      if (strip.scene_id) {
        sceneIds.add(strip.scene_id)
        continue
      }
      if (strip.shot_id) {
        const shot = shotById.get(strip.shot_id)
        if (shot?.scene_id) sceneIds.add(shot.scene_id)
      }
    }
    return [...sceneIds]
  }, [selectedUnitScheduledStrips, shots])

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene-calendar-drawer', scheduledSceneIdsForSelectedUnit.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: scheduledSceneIdsForSelectedUnit,
        })
      }
      return getCastIdsBySceneIds(scheduledSceneIdsForSelectedUnit)
    },
    enabled: scheduledSceneIdsForSelectedUnit.length > 0,
  })

  const { data: castByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-shot-calendar-drawer', scheduledShotIdsForSelectedUnit.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shotIds: scheduledShotIdsForSelectedUnit,
        })
      }
      return getCastIdsByShotIds(scheduledShotIdsForSelectedUnit)
    },
    enabled: scheduledShotIdsForSelectedUnit.length > 0,
  })

  const bookingsForSelectedDay = useMemo(() => {
    if (!selectedEvent) return []
    return bookings.filter((b) => b.shoot_day_id === selectedEvent.shootDayId)
  }, [bookings, selectedEvent])

  const castResultForSelectedUnit = useMemo(() => {
    return getCallSheetCastRequirements({
      sceneIdsScheduled: scheduledSceneIdsForSelectedUnit,
      shotIdsScheduled: scheduledShotIdsForSelectedUnit,
      castBySceneId,
      castByShotId,
      bookedPersonIds: new Set(bookingsForSelectedDay.map((b) => b.person_id)),
      cast,
    })
  }, [
    scheduledSceneIdsForSelectedUnit,
    scheduledShotIdsForSelectedUnit,
    castBySceneId,
    castByShotId,
    bookingsForSelectedDay,
    cast,
  ])

  const episodeById = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes])

  const episodesOnUnitSummary = useMemo(() => {
    if (!isEpisodicProduction || !selectedEvent) return null
    const shotById = new Map(shots.map((s) => [s.id, s]))
    const sceneById = new Map(scenes.map((s) => [s.id, s]))
    const names = orderedDistinctEpisodeNames({
      strips: selectedUnitScheduledStrips,
      shotById,
      sceneById,
      episodeById,
    })
    return names.length > 0 ? names.join(', ') : '—'
  }, [
    isEpisodicProduction,
    selectedEvent,
    selectedUnitScheduledStrips,
    shots,
    scenes,
    episodeById,
  ])

  const daySummaryStats = useMemo<DaySummaryStats>(() => {
    if (!selectedEvent) {
      return { scenesScheduled: 0, pagesEighths: 0, shots: 0, castCalled: 0, crewBooked: 0 }
    }
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]))
    const pagesEighths = scheduledSceneIdsForSelectedUnit.reduce(
      (sum, sceneId) => sum + (sceneById.get(sceneId)?.page_eighths ?? 0),
      0
    )
    const crewGroups = getCallSheetCrewRequirements(crewHierarchy, bookingsForSelectedDay, crew)
    const crewBooked = crewGroups.reduce((sum, group) => sum + group.rows.length, 0)

    return {
      scenesScheduled: scheduledSceneIdsForSelectedUnit.length,
      pagesEighths,
      shots: scheduledShotIdsForSelectedUnit.length,
      castCalled: castResultForSelectedUnit.castRows.length,
      crewBooked,
    }
  }, [
    selectedEvent,
    scenes,
    scheduledSceneIdsForSelectedUnit,
    scheduledShotIdsForSelectedUnit,
    bookingsForSelectedDay,
    castResultForSelectedUnit,
    crewHierarchy,
    crew,
  ])

  const daySummaryLocationStack = useMemo<DaySummaryLocationStack>(() => {
    if (!selectedEvent) return { orderedLocations: [], missingLocationSceneCount: 0 }
    const shotsById = new Map(shots.map((shot) => [shot.id, { scene_id: shot.scene_id }]))
    const scenesById = new Map(scenes.map((scene) => [scene.id, { location_id: scene.location_id }]))
    const locationsById = new Map(
      locations.map((location) => [
        location.id,
        {
          name: location.name,
          address: location.address ?? null,
          lat: toNullableCoordinate(
            (location as unknown as Record<string, unknown>).latitude ??
              (location as unknown as Record<string, unknown>).lat
          ),
          lng: toNullableCoordinate(
            (location as unknown as Record<string, unknown>).longitude ??
              (location as unknown as Record<string, unknown>).lng
          ),
        },
      ])
    )
    return getOrderedLocationStackForDayUnit({
      strips: selectedUnitScheduledStrips,
      shotsById,
      scenesById,
      locationsById,
    })
  }, [selectedEvent, selectedUnitScheduledStrips, shots, scenes, locations])

  const daySummaryWarnings = useMemo<DaySummaryWarning[]>(() => {
    if (!selectedEvent) return []
    return getDaySummaryWarnings({
      callTime: selectedEvent.callTime,
      wrapTime: selectedEvent.wrapTime,
      requiredButNotBookedNames: castResultForSelectedUnit.requiredButNotBooked.map((p) => p.name),
      bookedButNotRequiredNames: castResultForSelectedUnit.bookedButNotRequired.map((p) => p.name),
      missingLocationSceneCount: daySummaryLocationStack.missingLocationSceneCount,
    })
  }, [selectedEvent, castResultForSelectedUnit, daySummaryLocationStack])

  const dayTurnaroundSummary = useMemo<DayTurnaroundSummary>(() => {
    if (!selectedEvent) {
      return {
        available: false,
        durationMinutes: null,
        formattedDuration: null,
        affectedCrewCount: 0,
        affectedCrewNames: [],
        allCastCrewAffected: false,
        belowThreshold: false,
        reasonUnavailable: 'Turnaround unavailable for this day.',
      }
    }

    const orderedShootDays = [...shootDays].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
    const selectedIndex = orderedShootDays.findIndex((d) => d.id === selectedEvent.shootDayId)
    const previousDay = selectedIndex > 0 ? orderedShootDays[selectedIndex - 1] : null

    const crewById = new Map(crew.map((p) => [p.id, { name: p.name }]))
    const isCrewPerson = new Set(crew.map((p) => p.id))
    const selectedCrewBookedIds = bookings
      .filter((b) => b.shoot_day_id === selectedEvent.shootDayId && isCrewPerson.has(b.person_id))
      .map((b) => b.person_id)
    const selectedBookedPersonIds = bookings
      .filter((b) => b.shoot_day_id === selectedEvent.shootDayId)
      .map((b) => b.person_id)
    const previousCrewBookedIds = previousDay
      ? bookings
          .filter((b) => b.shoot_day_id === previousDay.id && isCrewPerson.has(b.person_id))
          .map((b) => b.person_id)
      : []
    const previousBookedPersonIds = previousDay
      ? bookings
          .filter((b) => b.shoot_day_id === previousDay.id)
          .map((b) => b.person_id)
      : []

    return getDayTurnaroundSummary({
      selectedDate: selectedEvent.date,
      selectedCallTime: selectedEvent.callTime,
      previousDate: previousDay?.shoot_date ?? null,
      previousWrapTime: previousDay?.wrap_time ?? null,
      selectedCrewBookedIds,
      previousCrewBookedIds,
      selectedBookedPersonIds,
      previousBookedPersonIds,
      crewById,
      thresholdMinutes: 600,
    })
  }, [selectedEvent, shootDays, bookings, crew])

  const { leadingBlanks, daysInMonth } = useMemo(
    () => getMonthGrid(year, month),
    [year, month]
  )

  const goPrevMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const goNextMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  const openDrawer = (event: CalendarShootDayEvent) => {
    setSelectedEvent(event)
    setDrawerOpen(true)
  }
  const closeDrawer = () => setDrawerOpen(false)

  useEffect(() => {
    if (!currentProductionId) return
    const migrationKey = `schedule-call-wrap-migration:${currentProductionId}`
    if (sessionStorage.getItem(migrationKey) === 'done') return
    if (ensureCallWrapStripsMutation.isPending) return
    ensureCallWrapStripsMutation.mutate(currentProductionId, {
      onSuccess: () => sessionStorage.setItem(migrationKey, 'done'),
    })
  }, [currentProductionId, ensureCallWrapStripsMutation])

  useEffect(() => {
    setSelectedEvent((prev) => {
      if (!prev) return prev
      const refreshed = events.find((e) => e.shootDayUnitId === prev.shootDayUnitId)
      return refreshed ?? prev
    })
  }, [events])

  useEffect(() => {
    if (!drawerOpen && selectedEvent) {
      const t = setTimeout(() => setSelectedEvent(null), 350)
      return () => clearTimeout(t)
    }
  }, [drawerOpen, selectedEvent])

  if (!currentProductionId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isEpisodicProduction && (
            <Select
              value={calendarBlocFilter}
              onValueChange={(v) => setCalendarBlocFilter(v as ShootingBlocViewFilter)}
            >
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter calendar by shooting bloc">
                <SelectValue placeholder="Bloc" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All blocs</SelectItem>
                <SelectItem value="unassigned">Outside blocs</SelectItem>
                {shootingBlocs.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {moveMutation.isPending && (
            <span className="text-muted-foreground text-sm">Moving…</span>
          )}
          <Button variant="outline" size="icon" onClick={goPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center font-medium">
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" onClick={goNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2 font-medium">
              {label}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-[100px] rounded border border-border bg-card/30 p-2" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = toYyyyMmDd(year, month, day)
            const dayEvents = eventsByDate.get(dateStr) ?? []
            return (
              <DroppableDayCell key={day} dateStr={dateStr}>
                <span className="text-foreground font-medium">{day}</span>
                <div className="mt-1 space-y-1">
                  {dayEvents.map((event) => (
                    <DraggableEventCard
                      key={event.shootDayUnitId}
                      event={event}
                      onClick={() => openDrawer(event)}
                      isEpisodic={isEpisodicProduction}
                    />
                  ))}
                </div>
              </DroppableDayCell>
            )
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeEvent ? (
            <div className="w-[min(100%,220px)] rounded-md shadow-lg ring-1 ring-border opacity-95">
              <CalendarEventCardBody
                event={activeEvent}
                onClick={() => {}}
                isOverlay
                isEpisodic={isEpisodicProduction}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg"
        >
          {toast}
        </div>
      )}

      <Dialog open={!!conflictModal} onOpenChange={(open) => !open && setConflictModal(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>That date already has a shoot day.</DialogTitle>
            <DialogDescription>
              Swap the two days so each shoot moves to the other&apos;s date?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!conflictModal) return
                ;(authSession.authSupported && authSession.currentUser
                  ? getDb().then((db) =>
                      swapShootDaysForActor({
                        db,
                        actor: authSession.currentUser!,
                        sourceShootDayId: conflictModal.sourceShootDayId,
                        targetShootDayId: conflictModal.existingShootDayId,
                      })
                    )
                  : swapShootDays(conflictModal.sourceShootDayId, conflictModal.existingShootDayId))
                  .then(() => {
                    invalidateScheduleQueries()
                    setConflictModal(null)
                  })
                  .catch(() => setToast('Swap failed.'))
              }}
            >
              Swap
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConflictModal(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DaySummaryDrawer
        event={selectedEvent}
        open={drawerOpen}
        onOpenChange={(open) => !open && closeDrawer()}
        isSaving={updateDaySummaryMutation.isPending}
        stats={daySummaryStats}
        locationStack={daySummaryLocationStack}
        warnings={daySummaryWarnings}
        turnaround={dayTurnaroundSummary}
        orsApiKeySetting={orsApiKeySetting}
        isEpisodic={isEpisodicProduction}
        shootingBlocDisplay={
          selectedEvent && isEpisodicProduction
            ? calendarShootingBlocDisplay(selectedEvent.shootingBlocId, selectedEvent.shootingBlocName)
            : undefined
        }
        episodesOnUnitSummary={episodesOnUnitSummary ?? undefined}
        onSaveEdits={async ({ shootDayId, callTime, wrapTime, notes }) => {
          await updateDaySummaryMutation.mutateAsync({
            shootDayId,
            callTime,
            wrapTime,
            notes,
          })
          if (selectedEvent && selectedEvent.shootDayId === shootDayId) {
            setSelectedEvent({
              ...selectedEvent,
              callTime,
              wrapTime,
              notes,
            })
          }
          invalidateScheduleQueries()
        }}
      />

      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'schedule' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                schedule: prev.sections.schedule === 'not_started' ? 'in_progress' : prev.sections.schedule,
              },
            }))
          }
        }}
        sectionId="schedule"
        sectionTitle="Schedule"
        steps={scheduleTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'schedule' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              schedule: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
