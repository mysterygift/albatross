/**
 * Left panel: Unscheduled Shots — shots not on the stripboard.
 * Search, location filter (by scene), multi-select, Assign to Day (Shoot Day + Unit).
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Plus } from 'lucide-react'
import type { Location } from '@/lib/db/types'
import type { ShootDay } from '@/lib/db/types'
import type { ShootDayUnit } from '@/lib/db/types'
import type { ShotWithScene } from '@/lib/db/repositories/stripboard-strips'
import { cn } from '@/lib/utils'

/** When visible unscheduled shots exceed this count, the list area scrolls internally. */
const UNSCHEDULED_LIST_SCROLL_THRESHOLD = 10

export type UnscheduledShotsPanelProps = {
  unscheduledShots: ShotWithScene[]
  locations: Location[]
  shootDays: ShootDay[]
  dayUnits: ShootDayUnit[]
  search: string
  onSearchChange: (v: string) => void
  locationId: string | null | undefined
  onLocationChange: (v: string | null | undefined) => void
  selectedShotIds: Set<string>
  onToggleShot: (shotId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onAssignToDay: (shotIds: string[], shootDayId: string, shootDayUnitId: string) => void
  onAddSingle: (shotId: string, shootDayId: string, shootDayUnitId: string) => void
  getUnitName: (unitId: string) => string
  isAssigning?: boolean
  droppableId?: string
}

export function UnscheduledShotsPanel({
  unscheduledShots,
  locations,
  shootDays,
  dayUnits,
  search,
  onSearchChange,
  locationId,
  onLocationChange,
  selectedShotIds,
  onToggleShot,
  onSelectAll,
  onDeselectAll,
  onAssignToDay,
  onAddSingle,
  getUnitName,
  isAssigning,
  droppableId = 'unscheduled-panel',
}: UnscheduledShotsPanelProps) {
  const [assignDayId, setAssignDayId] = useState<string | null>(null)
  const [assignUnitId, setAssignUnitId] = useState<string | null>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [showListBottomFeather, setShowListBottomFeather] = useState(false)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: droppableId })

  const updateListBottomFeather = useCallback(() => {
    const el = listScrollRef.current
    if (!el) {
      setShowListBottomFeather(false)
      return
    }
    const scrollable = el.scrollHeight > el.clientHeight + 1
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setShowListBottomFeather(scrollable && notAtBottom)
  }, [])

  useLayoutEffect(() => {
    const el = listScrollRef.current
    const tick = () => updateListBottomFeather()
    const rafId = requestAnimationFrame(tick)
    if (!el) {
      return () => cancelAnimationFrame(rafId)
    }
    const ro = new ResizeObserver(tick)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [unscheduledShots, updateListBottomFeather])

  const dayUnitsForDay = assignDayId
    ? dayUnits.filter((du) => du.shoot_day_id === assignDayId)
    : []
  const selectedList = [...selectedShotIds]

  const handleBulkAssign = () => {
    if (!assignDayId || !assignUnitId || selectedList.length === 0) return
    const sdu = dayUnits.find((du) => du.shoot_day_id === assignDayId && du.unit_id === assignUnitId)
    if (!sdu) return
    onAssignToDay(selectedList, assignDayId, sdu.id)
    onDeselectAll()
  }

  return (
    <div
      ref={setDroppableRef}
      className={`flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 min-h-0 overflow-auto transition-colors ${isOver ? 'border-primary ring-2 ring-primary/50' : 'border-border'}`}
    >
      {isOver && (
        <p className="text-center text-sm font-medium text-primary">Drop here to unschedule</p>
      )}
      <h2 className="font-semibold text-foreground">Unscheduled Shots</h2>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Scene, shot number, description..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Location</Label>
        <Select
          value={locationId === undefined ? 'all' : locationId === null ? 'none' : locationId}
          onValueChange={(v) => onLocationChange(v === 'all' ? undefined : v === 'none' ? null : v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            <SelectItem value="none">No location</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onSelectAll}>
          Select All
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onDeselectAll}>
          Deselect
        </Button>
        {selectedList.length > 0 && (
          <span className="text-muted-foreground text-xs">{selectedList.length} selected</span>
        )}
      </div>

      <div className="relative flex flex-1 flex-col min-h-0">
        <div
          ref={listScrollRef}
          onScroll={updateListBottomFeather}
          className={cn(
            'flex flex-1 flex-col gap-2 min-h-0',
            unscheduledShots.length > UNSCHEDULED_LIST_SCROLL_THRESHOLD && 'max-h-[18rem] overflow-y-auto'
          )}
        >
          {unscheduledShots.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No unscheduled shots.</p>
          ) : (
            unscheduledShots.map((item) => (
              <DraggableUnscheduledShot key={item.shot.id} item={item}>
                <UnscheduledShotRow
                  item={item}
                  selected={selectedShotIds.has(item.shot.id)}
                  onToggle={() => onToggleShot(item.shot.id)}
                  onAdd={(shootDayId, shootDayUnitId) => onAddSingle(item.shot.id, shootDayId, shootDayUnitId)}
                  shootDays={shootDays}
                  dayUnits={dayUnits}
                  getUnitName={getUnitName}
                />
              </DraggableUnscheduledShot>
            ))
          )}
        </div>
        {showListBottomFeather && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-linear-to-t from-card to-transparent"
          />
        )}
      </div>

      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-xs text-muted-foreground leading-snug">
          Select the shot(s) you want to assign to a shoot day.
        </p>
        <div className="flex flex-col gap-2">
          <Select
            value={assignDayId ?? ''}
            onValueChange={(v) => {
              setAssignDayId(v || null)
              setAssignUnitId(null)
            }}
            disabled={selectedList.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select shoot day..." />
            </SelectTrigger>
            <SelectContent>
              {shootDays.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.shoot_date} {d.day_number != null ? `(Day ${d.day_number})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={assignUnitId ?? ''}
            onValueChange={(v) => setAssignUnitId(v || null)}
            disabled={selectedList.length === 0 || !assignDayId || dayUnitsForDay.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a unit..." />
            </SelectTrigger>
            <SelectContent>
              {dayUnitsForDay.map((du) => (
                <SelectItem key={du.id} value={du.unit_id}>
                  {getUnitName(du.unit_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="w-full"
            disabled={
              selectedList.length === 0 ||
              !assignDayId ||
              !assignUnitId ||
              dayUnitsForDay.length === 0 ||
              isAssigning
            }
            onClick={handleBulkAssign}
          >
            {isAssigning
              ? 'Assigning…'
              : selectedList.length > 0
                ? `Assign ${selectedList.length} to Day`
                : 'Assign to Day'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function UnscheduledShotRow({
  item,
  selected,
  onToggle,
  onAdd,
  shootDays,
  dayUnits,
  getUnitName,
}: {
  item: ShotWithScene
  selected: boolean
  onToggle: () => void
  onAdd: (shootDayId: string, shootDayUnitId: string) => void
  shootDays: ShootDay[]
  dayUnits: ShootDayUnit[]
  getUnitName: (id: string) => string
}) {
  const dayUnitsForDay = (dayId: string) => dayUnits.filter((du) => du.shoot_day_id === dayId)
  const { shot, scene } = item

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background/50 px-2 py-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 rounded border-border"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm">Scene {scene.scene_number} / Shot {shot.shot_number}</span>
          {(scene.int_ext || scene.day_night) && (
            <>
              {scene.int_ext && <Badge variant="secondary" className="text-[10px]">{scene.int_ext}</Badge>}
              {scene.day_night && <Badge variant="outline" className="text-[10px]">{scene.day_night}</Badge>}
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs truncate">
          {shot.shot_description ?? shot.subject ?? '(No shot description)'}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <Plus className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {shootDays.map((day) =>
            dayUnitsForDay(day.id).map((du) => (
              <DropdownMenuItem
                key={du.id}
                onClick={() => onAdd(day.id, du.id)}
              >
                {day.shoot_date} — {getUnitName(du.unit_id)}
              </DropdownMenuItem>
            ))
          )}
          {shootDays.length === 0 && (
            <DropdownMenuItem disabled>No shoot days</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function DraggableUnscheduledShot({
  item,
  children,
}: {
  item: ShotWithScene
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unscheduled:${item.shot.id}`,
    data: { type: 'unscheduled-shot' as const, item },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? 'opacity-50' : ''}
    >
      {children}
    </div>
  )
}
