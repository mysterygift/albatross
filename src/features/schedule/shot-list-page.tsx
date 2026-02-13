import { useState } from 'react'
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listScenesByProduction,
  listShotsByScene,
  updateShot,
} from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import {
  listEquipmentTermsByProductionAndType,
  upsertEquipmentTerm,
} from '@/lib/db/repositories/equipment-terms'
import type { Shot, Scene } from '@/lib/db/types'
import { SHOT_SIZE_VALUES, CAMERA_MOVEMENT_VALUES } from '@/lib/db/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Sentinel for "no selection" in Select; Radix forbids SelectItem value="". */
const SELECT_NONE = '__none__'
import {
  parseEstMinutes,
  parseDurationMmSs,
  shotEstMinutesSchema,
  shotDurationSecondsSchema,
} from './shot-list-validation'

function formatSceneLabel(scene: Scene, locationName: string | null): string {
  const intExt = scene.int_ext ?? '—'
  const loc = locationName ?? '—'
  const dayNight = scene.day_night ?? '—'
  return `${intExt} – ${loc} – ${dayNight}`
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type EditableField =
  | 'subject'
  | 'shot_description'
  | 'shot_size'
  | 'duration_seconds'
  | 'estimated_shoot_minutes'
  | 'camera_movement'
  | 'lens'
  | 'support'
  | 'notes'

export function ShotListPage() {
  const queryClient = useQueryClient()
  const { currentProductionId } = useCurrentProduction()
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingCell, setEditingCell] = useState<{ shotId: string; field: EditableField } | null>(null)
  const [localValue, setLocalValue] = useState<string>('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: () => listScenesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: shots = [] } = useQuery({
    queryKey: ['shots', selectedSceneId],
    queryFn: () => listShotsByScene(selectedSceneId!),
    enabled: !!selectedSceneId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: lensTerms = [] } = useQuery({
    queryKey: ['equipment-terms', currentProductionId, 'LENS'],
    queryFn: () => listEquipmentTermsByProductionAndType(currentProductionId!, 'LENS'),
    enabled: !!currentProductionId,
  })

  const { data: supportTerms = [] } = useQuery({
    queryKey: ['equipment-terms', currentProductionId, 'SUPPORT'],
    queryFn: () => listEquipmentTermsByProductionAndType(currentProductionId!, 'SUPPORT'),
    enabled: !!currentProductionId,
  })

  const updateShotMutation = useMutation({
    mutationFn: ({ shotId, data }: { shotId: string; data: Partial<Shot> }) =>
      updateShot(shotId, data),
    onSuccess: () => {
      setEditingCell(null)
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['shots', selectedSceneId] })
      queryClient.invalidateQueries({ queryKey: ['shots', currentProductionId ?? ''] })
      queryClient.invalidateQueries({ queryKey: ['stripboard'] })
      queryClient.invalidateQueries({ queryKey: ['equipment-terms'] })
    },
    onError: () => {
      setSaveError("Couldn't save")
    },
  })

  const selectedScene = scenes.find((s) => s.id === selectedSceneId)
  const getLocationName = (locationId: string | null) =>
    locationId ? locations.find((l) => l.id === locationId)?.name ?? null : null

  const commitEdit = (shotId: string, field: EditableField, value: string | number | null) => {
    setSaveError(null)
    const shot = shots.find((s) => s.id === shotId)
    if (!shot) return

    if (field === 'estimated_shoot_minutes') {
      const parsed = parseEstMinutes(typeof value === 'string' ? value : String(value ?? ''))
      const validated = shotEstMinutesSchema.safeParse(parsed)
      if (!validated.success) {
        setSaveError('Est. min must be 0 or greater')
        return
      }
      setSaveError(null)
      updateShotMutation.mutate({
        shotId,
        data: { estimated_shoot_minutes: validated.data },
      })
      return
    }
    if (field === 'duration_seconds') {
      const parsed =
        typeof value === 'number' ? value : parseDurationMmSs(typeof value === 'string' ? value : '')
      const validated = shotDurationSecondsSchema.safeParse(parsed)
      if (!validated.success) {
        setSaveError('Duration must be 0 or greater (use m:ss)')
        return
      }
      setSaveError(null)
      updateShotMutation.mutate({
        shotId,
        data: { duration_seconds: validated.data },
      })
      return
    }
    if (field === 'lens') {
      const str = typeof value === 'string' ? value.trim() : ''
      if (str && currentProductionId) {
        upsertEquipmentTerm(currentProductionId, 'LENS', str).then(() => {
          updateShotMutation.mutate({ shotId, data: { lens: str } })
        })
      } else {
        updateShotMutation.mutate({ shotId, data: { lens: null } })
      }
      return
    }
    if (field === 'support') {
      const str = typeof value === 'string' ? value.trim() : ''
      if (str && currentProductionId) {
        upsertEquipmentTerm(currentProductionId, 'SUPPORT', str).then(() => {
          updateShotMutation.mutate({ shotId, data: { support: str } })
        })
      } else {
        updateShotMutation.mutate({ shotId, data: { support: null } })
      }
      return
    }

    const payload: Partial<Shot> = {}
    if (field === 'subject') payload.subject = value === '' ? null : String(value)
    if (field === 'shot_description') payload.shot_description = value === '' ? null : String(value)
    if (field === 'shot_size')
      payload.shot_size = value === '' || value === null ? null : (value as Shot['shot_size'])
    if (field === 'camera_movement')
      payload.camera_movement =
        value === '' || value === null ? null : (value as Shot['camera_movement'])
    if (field === 'notes') payload.notes = value === '' ? null : String(value)
    if (Object.keys(payload).length > 0) {
      updateShotMutation.mutate({ shotId, data: payload })
    }
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setSaveError(null)
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Shot lists</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Schedule — Shot lists</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label className="mb-2 block text-sm text-muted-foreground">Scene</Label>
          <Select
            value={selectedSceneId ?? SELECT_NONE}
            onValueChange={(v) => {
              setSelectedSceneId(v === SELECT_NONE ? null : v)
              setEditingCell(null)
            }}
          >
            <SelectTrigger
              className={cn(
                'h-9 w-full bg-zinc-800/80 text-zinc-200 border-zinc-600',
                'hover:bg-zinc-700/80 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500'
              )}
            >
              <SelectValue placeholder="Select scene…" />
            </SelectTrigger>
            <SelectContent
              className="bg-zinc-800 border-zinc-600 shadow-xl"
              sideOffset={4}
            >
              <SelectItem
                value={SELECT_NONE}
                className="text-zinc-300 focus:bg-zinc-700 focus:text-zinc-100 data-[highlight]:bg-emerald-600/20 data-[highlight]:text-emerald-100"
              >
                Select scene…
              </SelectItem>
              {scenes.map((s) => (
                <SelectItem
                  key={s.id}
                  value={s.id}
                  className="text-zinc-300 focus:bg-zinc-700 focus:text-zinc-100 data-[highlight]:bg-emerald-600/20 data-[highlight]:text-emerald-100"
                >
                  {s.scene_number}. {formatSceneLabel(s, getLocationName(s.location_id))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedSceneId && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {shots.length} shot{shots.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-sm text-destructive" role="alert">
                  {saveError}
                </span>
              )}
              <Button
                variant={editMode ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-1.5',
                  editMode && 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                )}
                onClick={() => {
                  setEditMode((v) => !v)
                  if (editMode) setEditingCell(null)
                }}
              >
                <Pencil className="size-3.5" />
                {editMode ? 'Edit mode' : 'Edit'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-0 bg-zinc-800/90 hover:bg-zinc-800/90">
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">
                    Scene / Shot #
                  </TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Subject</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">
                    Shot Description
                  </TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Shot size</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Duration</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Est. min</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Movement</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Lens</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Support</TableHead>
                  <TableHead className="text-zinc-100 font-medium h-11 px-3">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground text-center py-8">
                      No shots. Add shots to this scene to see them here and on the stripboard.
                    </TableCell>
                  </TableRow>
                ) : (
                  shots.map((shot) => (
                    <ShotRow
                      key={shot.id}
                      shot={shot}
                      sceneNumber={selectedScene?.scene_number ?? ''}
                      editMode={editMode}
                      editingCell={editingCell}
                      localValue={localValue}
                      setEditingCell={setEditingCell}
                      setLocalValue={setLocalValue}
                      commitEdit={commitEdit}
                      cancelEdit={cancelEdit}
                      lensOptions={lensTerms.map((t) => t.value)}
                      supportOptions={supportTerms.map((t) => t.value)}
                      isSaving={updateShotMutation.isPending}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {!selectedSceneId && scenes.length > 0 && (
        <p className="text-muted-foreground">Select a scene to view its shots.</p>
      )}
    </div>
  )
}

function ShotRow({
  shot,
  sceneNumber,
  editMode,
  editingCell,
  localValue,
  setEditingCell,
  setLocalValue,
  commitEdit,
  cancelEdit,
  lensOptions,
  supportOptions,
  isSaving,
}: {
  shot: Shot
  sceneNumber: string
  editMode: boolean
  editingCell: { shotId: string; field: EditableField } | null
  localValue: string
  setEditingCell: (v: { shotId: string; field: EditableField } | null) => void
  setLocalValue: (v: string) => void
  commitEdit: (shotId: string, field: EditableField, value: string | number | null) => void
  cancelEdit: () => void
  lensOptions: string[]
  supportOptions: string[]
  isSaving: boolean
}) {
  const isEditing = editingCell?.shotId === shot.id
  const editingField = isEditing ? editingCell!.field : null

  const startEdit = (field: EditableField) => {
    let val: string
    if (field === 'subject') val = shot.subject ?? ''
    else if (field === 'shot_description') val = shot.shot_description ?? ''
    else if (field === 'shot_size') val = shot.shot_size ?? ''
    else if (field === 'duration_seconds')
      val = shot.duration_seconds != null ? formatDuration(shot.duration_seconds) : ''
    else if (field === 'estimated_shoot_minutes')
      val = shot.estimated_shoot_minutes != null ? String(shot.estimated_shoot_minutes) : ''
    else if (field === 'camera_movement') val = shot.camera_movement ?? ''
    else if (field === 'lens') val = shot.lens ?? ''
    else if (field === 'support') val = shot.support ?? ''
    else val = shot.notes ?? ''
    setLocalValue(val)
    setEditingCell({ shotId: shot.id, field })
  }

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: EditableField,
    value: string | number | null
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit(shot.id, field, value)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const cellClass = (field: EditableField) =>
    cn(
      'align-middle px-3 py-2 max-w-[180px]',
      editMode && 'cursor-pointer hover:bg-zinc-800/50 rounded',
      editingField === field && 'ring-2 ring-emerald-500/50 ring-inset rounded bg-zinc-800/30'
    )

  return (
    <TableRow>
      <TableCell className="font-medium px-3 py-2">
        {sceneNumber} / {shot.shot_number}
      </TableCell>

      {/* Subject */}
      <TableCell
        className={cellClass('subject')}
        onClick={() => editMode && !editingField && startEdit('subject')}
      >
        {editingField === 'subject' ? (
          <Input
            className="h-8 bg-background border-zinc-600 focus-visible:ring-emerald-500/50"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => commitEdit(shot.id, 'subject', localValue.trim() || null)}
            onKeyDown={(e) => handleKeyDown(e, 'subject', localValue.trim() || null)}
            autoFocus
            disabled={isSaving}
          />
        ) : (
          <span className="block truncate">{shot.subject ?? '—'}</span>
        )}
      </TableCell>

      {/* Shot Description */}
      <TableCell
        className={cn(cellClass('shot_description'), 'max-w-[200px]')}
        onClick={() => editMode && !editingField && startEdit('shot_description')}
      >
        {editingField === 'shot_description' ? (
          <Popover open>
            <PopoverTrigger asChild>
              <span className="block truncate text-sm">{localValue || '(empty)'}</span>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 bg-zinc-900 border-zinc-600"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={cancelEdit}
            >
              <Textarea
                className="min-h-[80px] bg-background border-zinc-600"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit()
                }}
                placeholder="Shot description"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => commitEdit(shot.id, 'shot_description', localValue.trim() || null)}
                >
                  <Check className="size-3.5 mr-1" />
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          shot.shot_description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-sm">{shot.shot_description}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {shot.shot_description}
              </TooltipContent>
            </Tooltip>
          ) : (
            '—'
          )
        )}
      </TableCell>

      {/* Shot size */}
      <TableCell
        className={cellClass('shot_size')}
        onClick={() => editMode && !editingField && startEdit('shot_size')}
      >
        {editingField === 'shot_size' ? (
          <Select
            value={localValue || SELECT_NONE}
            onValueChange={(v) =>
              commitEdit(shot.id, 'shot_size', v === SELECT_NONE ? null : v)
            }
            defaultOpen
          >
            <SelectTrigger className="h-8 w-full max-w-[90px] bg-background border-zinc-600">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-600">
              <SelectItem value={SELECT_NONE}>—</SelectItem>
              {SHOT_SIZE_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          shot.shot_size ?? '—'
        )}
      </TableCell>

      {/* Duration */}
      <TableCell
        className={cn(
          cellClass('duration_seconds'),
          editingField === 'duration_seconds' && 'pr-1'
        )}
        onClick={() => editMode && !editingField && startEdit('duration_seconds')}
      >
        {editingField === 'duration_seconds' ? (
          <DurationEditor
            value={localValue}
            onChange={setLocalValue}
            onCommit={() => {
              const sec = parseDurationMmSs(localValue)
              commitEdit(shot.id, 'duration_seconds', sec)
            }}
            onCancel={cancelEdit}
            disabled={isSaving}
          />
        ) : (
          formatDuration(shot.duration_seconds)
        )}
      </TableCell>

      {/* Est. min */}
      <TableCell
        className={cellClass('estimated_shoot_minutes')}
        onClick={() => editMode && !editingField && startEdit('estimated_shoot_minutes')}
      >
        {editingField === 'estimated_shoot_minutes' ? (
          <EstMinutesEditor
            value={localValue}
            onChange={setLocalValue}
            onCommit={() => {
              const parsed = parseEstMinutes(localValue)
              if (parsed !== undefined) commitEdit(shot.id, 'estimated_shoot_minutes', parsed)
            }}
            onCancel={cancelEdit}
            disabled={isSaving}
          />
        ) : (
          shot.estimated_shoot_minutes != null
            ? `${shot.estimated_shoot_minutes} min`
            : '—'
        )}
      </TableCell>

      {/* Movement */}
      <TableCell
        className={cellClass('camera_movement')}
        onClick={() => editMode && !editingField && startEdit('camera_movement')}
      >
        {editingField === 'camera_movement' ? (
          <Select
            value={localValue || SELECT_NONE}
            onValueChange={(v) =>
              commitEdit(shot.id, 'camera_movement', v === SELECT_NONE ? null : v)
            }
            defaultOpen
          >
            <SelectTrigger className="h-8 w-full max-w-[140px] bg-background border-zinc-600">
              <SelectValue placeholder="Movement" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-600 max-h-[280px]">
              <SelectItem value={SELECT_NONE}>—</SelectItem>
              {CAMERA_MOVEMENT_VALUES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          shot.camera_movement ?? '—'
        )}
      </TableCell>

      {/* Lens */}
      <TableCell
        className={cellClass('lens')}
        onClick={() => editMode && !editingField && startEdit('lens')}
      >
        {editingField === 'lens' ? (
          <LensSupportCombobox
            value={localValue}
            options={lensOptions}
            onChange={setLocalValue}
            onCommit={(v) => commitEdit(shot.id, 'lens', v)}
            onCancel={cancelEdit}
            placeholder="Lens"
            disabled={isSaving}
          />
        ) : (
          shot.lens ?? '—'
        )}
      </TableCell>

      {/* Support */}
      <TableCell
        className={cellClass('support')}
        onClick={() => editMode && !editingField && startEdit('support')}
      >
        {editingField === 'support' ? (
          <LensSupportCombobox
            value={localValue}
            options={supportOptions}
            onChange={setLocalValue}
            onCommit={(v) => commitEdit(shot.id, 'support', v)}
            onCancel={cancelEdit}
            placeholder="Support"
            disabled={isSaving}
          />
        ) : (
          shot.support ?? '—'
        )}
      </TableCell>

      {/* Notes */}
      <TableCell
        className={cn(cellClass('notes'), 'max-w-[200px]')}
        onClick={() => editMode && !editingField && startEdit('notes')}
      >
        {editingField === 'notes' ? (
          <Popover open>
            <PopoverTrigger asChild>
              <span className="block truncate text-sm">{localValue || '(empty)'}</span>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 bg-zinc-900 border-zinc-600"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={cancelEdit}
            >
              <Textarea
                className="min-h-[100px] bg-background border-zinc-600"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit()
                }}
                placeholder="Notes"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => commitEdit(shot.id, 'notes', localValue.trim() || null)}
                >
                  <Check className="size-3.5 mr-1" />
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          shot.notes ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-sm">{shot.notes}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                {shot.notes}
              </TooltipContent>
            </Tooltip>
          ) : (
            '—'
          )
        )}
      </TableCell>
    </TableRow>
  )
}

function DurationEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const sec = parseDurationMmSs(value)

  return (
    <div className="flex items-center gap-1 pr-0">
      <Input
        className="h-8 w-24 bg-background border-zinc-600 focus-visible:ring-emerald-500/50"
        placeholder="m:ss"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, ''))}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit()
          if (e.key === 'Escape') onCancel()
        }}
        disabled={disabled}
        autoFocus
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (sec !== null && sec < 86400) onChange(formatDuration(sec + 1))
          else if (sec === null) onChange('0:01')
        }}
      >
        +
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (sec !== null && sec > 0) onChange(formatDuration(sec - 1))
          else if (sec === null) onChange('0:00')
        }}
      >
        −
      </Button>
    </div>
  )
}

function EstMinutesEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const parsed = parseEstMinutes(value)
  const invalid =
    value.trim() !== '' && !shotEstMinutesSchema.safeParse(parsed).success

  return (
    <Tooltip open={invalid}>
      <TooltipTrigger asChild>
        <Input
          type="text"
          inputMode="numeric"
          className={cn(
            'h-8 w-20 bg-background border-zinc-600 focus-visible:ring-emerald-500/50',
            invalid && 'border-destructive aria-invalid'
          )}
          placeholder="min"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (v === '' || parseInt(v, 10) <= 9999) onChange(v)
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit()
            if (e.key === 'Escape') onCancel()
          }}
          disabled={disabled}
          autoFocus
          aria-invalid={invalid}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-destructive">
        Must be 0 or greater
      </TooltipContent>
    </Tooltip>
  )
}

function LensSupportCombobox({
  value,
  options,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  disabled,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  onCommit: (v: string | null) => void
  onCancel: () => void
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(true)
  const uniqueOptions = [...new Set(options)].filter(Boolean).sort()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="block w-full min-w-[80px]">{value || placeholder}</span>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0 bg-zinc-800 border-zinc-600"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="rounded-lg border-0">
          <CommandInput
            placeholder={placeholder}
            value={value}
            onValueChange={onChange}
            className="text-zinc-200"
          />
          <CommandList>
            <CommandEmpty>No match. Type to add new.</CommandEmpty>
            <CommandGroup>
              {uniqueOptions.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onCommit(opt)
                    setOpen(false)
                  }}
                  className="text-zinc-200 focus:bg-zinc-700 focus:text-zinc-100"
                >
                  {opt}
                </CommandItem>
              ))}
              {value.trim() && !uniqueOptions.includes(value.trim()) && (
                <CommandItem
                  value={`Add "${value.trim()}"`}
                  onSelect={() => {
                    onCommit(value.trim())
                    setOpen(false)
                  }}
                  className="text-emerald-400 focus:bg-zinc-700"
                >
                  Add &quot;{value.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex justify-end gap-1 p-2 border-t border-zinc-600">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={disabled}
            onClick={() => {
              onCommit(value.trim() || null)
              setOpen(false)
            }}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
