import { useEffect, useMemo, useRef, useState } from 'react'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileDown, Info, Plus, Tablet, Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentProduction } from '@/features/productions/context'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { documentsQueryKey, persistProductionDocument } from '@/lib/documents/persistDocument'
import { saveFileWithDialog } from '@/lib/files'
import { generateDailyProgressReportPdf } from '@/lib/pdf/dailyProgressReport'
import { buildDailyProgressReport, dailyProgressReportFileName } from '@/lib/script-supervisor/dailyProgressReport'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { listScenesByProduction, listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { SCRIPT_SUPERVISOR_REMOTE_ERROR } from '@/lib/db/repositories/scriptSupervisor'
import type { UpdateSlateInput } from '@/lib/db/repositories/scriptSupervisor'
import type { Slate, TakeNgReason, TakeStatus } from '@/lib/db/types'
import { slateDisplayLabel } from '@/lib/script-supervisor/slateNumbering'
import { layoutLinedScript, type CellState, type LiningRow } from '@/lib/script-supervisor/lining'
import {
  characterRunElementIds,
  popUndo,
  pushUndo,
  snapRangeToLineable,
  type LiningUndoEntry,
} from '@/lib/script-supervisor/liningEdit'
import { annotationsByElement, formatAnnotationChip, type AnnotationView, type ContinuityTag } from '@/lib/script-supervisor/annotations'
import { SCENE_STATUS_LABEL, type SceneProgressStatus } from '@/lib/script-supervisor/progress'
import {
  carryOverFields,
  isTypingTarget,
  latestSlate,
  pickDefaultShootDay,
  printedTakeNumbers,
  takeToMark,
} from '@/lib/script-supervisor/slatePanel'
import { cn } from '@/lib/utils'

import {
  useCreateSlate,
  useCreateTake,
  useDayCoverage,
  useDayLog,
  useLinedScene,
  useLiningMutations,
  useMarkRevisionReviewed,
  useRevisionReview,
  useAnnotationMutations,
  usePhotoMutations,
  useSceneAnnotations,
  useSlateAnnotations,
  useSlatePhotos,
  useSaveDayLog,
  useNextSlatePreview,
  useScenesForShootDay,
  useScriptSupervisorSettings,
  useSlatesForShootDay,
  useTakesForSlates,
  useUpdateSlate,
  useDeleteSlate,
  useSetSceneProgress,
  useShootProgress,
  useUpdateTake,
} from './hooks'
import { DayReportCard } from './DayReportCard'
import { ExportsCard } from './ExportsCard'
import {
  exportContinuitySheets,
  exportDayMarkedUpScript,
  exportEditorsLog,
  exportSceneMarkedUpScript,
  type DayExportContext,
  type ExportKind,
} from './exports'
import { LinedScript } from './LinedScript'
import { ProgressView } from './ProgressView'
import { SceneStatusPip } from './SceneStatusPip'
import { SlatePanel } from './SlatePanel'
import { SwipeToDeleteRow } from './SwipeToDeleteRow'
import { TabletSceneNav } from './TabletSceneNav'
import { TabletSlateDeck } from './TabletSlateDeck'
import { TabletWorkspace } from './TabletWorkspace'
import { AnnotationDialog, type AnnotationDialogState } from './AnnotationDialog'
import { SlateNotesPanel } from './SlateNotesPanel'
import { RevisionReview, revisionRecorded, revisionSummary } from './RevisionReview'
import { useTouchLayout } from './useTouchLayout'

function localIsoDate(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function errorMessage(...errors: unknown[]): string | null {
  for (const e of errors) if (e instanceof Error) return e.message
  return null
}

/** Script Supervisor workspace (SS3): log slates and takes against a stripboard shoot day. */
export function ScriptSupervisorPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const queryClient = useQueryClient()
  const { data: dataSource } = useEffectiveDataSourceForProduction(currentProductionId)
  const [touch, toggleTouch] = useTouchLayout()

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const { data: allScenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: () => listScenesByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const [chosenDayId, setChosenDayId] = useState<string | null>(null)
  const dayId = chosenDayId ?? pickDefaultShootDay(days, localIsoDate())?.id ?? null
  const { data: slates = [] } = useSlatesForShootDay(dayId)
  const { data: dayScenes = [] } = useScenesForShootDay(dayId)
  const { data: settings } = useScriptSupervisorSettings(currentProductionId)

  const [chosenSceneId, setChosenSceneId] = useState<string | null>(null)
  const sceneId = chosenSceneId ?? dayScenes[0]?.id ?? null

  const [chosenSlateId, setChosenSlateId] = useState<string | null>(null)
  const currentSlate = slates.find((s) => s.id === chosenSlateId) ?? latestSlate(slates)
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null)

  const slateIds = useMemo(() => slates.map((s) => s.id), [slates])
  const { data: dayTakes = [] } = useTakesForSlates(slateIds)
  const currentTakes = currentSlate ? dayTakes.filter((t) => t.slate_id === currentSlate.id) : []

  const { data: preview } = useNextSlatePreview(currentProductionId, { sceneId })

  const createSlate = useCreateSlate()
  const updateSlate = useUpdateSlate()
  const deleteSlate = useDeleteSlate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [swipedSlateId, setSwipedSlateId] = useState<string | null>(null)
  const createTake = useCreateTake()
  const updateTake = useUpdateTake()
  const setSceneProgress = useSetSceneProgress()

  const [mode, setMode] = useState<'log' | 'review'>('log')
  const { data: progress, isLoading: progressLoading } = useShootProgress(currentProductionId)
  const statusBySceneId = useMemo(
    () => new Map<string, SceneProgressStatus>((progress?.rows ?? []).map((r) => [r.scene.id, r.status])),
    [progress]
  )
  const sceneStatus = (id: string): SceneProgressStatus => statusBySceneId.get(id) ?? 'not_shot'

  const [middleView, setMiddleView] = useState<'slates' | 'script'>('slates')
  const { data: linedScene, isLoading: linedLoading } = useLinedScene(
    middleView === 'script' ? currentProductionId : null,
    sceneId
  )
  const linedLayout = useMemo(
    () => (linedScene ? layoutLinedScript(linedScene.elements, linedScene.tramlines) : null),
    [linedScene]
  )

  const { data: dayLog } = useDayLog(dayId)
  const saveDayLog = useSaveDayLog()
  const exportDpr = useMutation({
    mutationFn: async () => {
      const day = days.find((d) => d.id === dayId)
      if (!currentProductionId || !day || !progress) throw new Error('Choose a shoot day first')
      const wildTracks = slates
        .filter((s) => s.sound_mode === 'wild_track')
        .map((s) =>
          [
            `Slate ${slateDisplayLabel(s, s.scene_id ? sceneNumberById.get(s.scene_id) : null)}`,
            s.scene_id ? `Sc ${sceneNumberById.get(s.scene_id) ?? '?'}` : null,
            s.description,
          ]
            .filter(Boolean)
            .join(' | ')
        )
      const data = buildDailyProgressReport({
        productionName: currentProduction?.name ?? 'Production',
        shootDayId: day.id,
        shootDate: day.shoot_date,
        dayNumber: day.day_number,
        totalShootDays: days.length,
        plannedCallTime: day.call_time,
        plannedWrapTime: day.wrap_time,
        dayLog: dayLog ?? null,
        rows: progress.rows,
        days: progress.days,
        scheduledSceneIds: dayScenes.map((sc) => sc.id),
        wildTracks,
      })
      const bytes = new Uint8Array(await generateDailyProgressReportPdf(data))
      const fileName = dailyProgressReportFileName(day.day_number, day.shoot_date)
      await persistProductionDocument({
        productionId: currentProductionId,
        fileName,
        bytes,
        mimeType: 'application/pdf',
        entityType: DOCUMENT_ENTITY_TYPES.dailyProgressReport,
        entityId: day.id,
      })
      await saveFileWithDialog(
        { defaultPath: fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }], title: 'Export daily progress report' },
        bytes
      )
    },
    onSuccess: () => {
      if (currentProductionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
    },
  })

  // ─── Exports (SS9) ─────────────────────────────────────────────────────────
  const { data: dayCoverage, isLoading: coverageLoading } = useDayCoverage(
    mode === 'review' ? currentProductionId : null,
    dayId
  )
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const refreshDocuments = () => {
    if (currentProductionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
  }
  const dayExport = useMutation({
    mutationFn: async (kind: ExportKind): Promise<string | null> => {
      const day = days.find((d) => d.id === dayId)
      if (!currentProductionId || !day) throw new Error('Choose a shoot day first')
      const ctx: DayExportContext = {
        productionId: currentProductionId,
        productionName: currentProduction?.name ?? 'Production',
        shootDayId: day.id,
        shootDate: day.shoot_date,
        dayNumber: day.day_number,
        totalShootDays: days.length,
      }
      if (kind === 'continuity') await exportContinuitySheets(ctx)
      else if (kind === 'editors_log') await exportEditorsLog(ctx)
      else {
        const missing = await exportDayMarkedUpScript(ctx)
        if (missing.length > 0) {
          return `Left out ${missing.map((n) => `Sc ${n}`).join(', ')}: not in an imported script.`
        }
      }
      return null
    },
    onMutate: () => setExportNotice(null),
    onSuccess: (notice) => {
      setExportNotice(notice)
      refreshDocuments()
    },
  })
  const sceneExport = useMutation({
    mutationFn: async () => {
      const scene = allScenes.find((s) => s.id === sceneId)
      if (!currentProductionId || !scene) throw new Error('Choose a scene first')
      await exportSceneMarkedUpScript({
        productionId: currentProductionId,
        productionName: currentProduction?.name ?? 'Production',
        scene: { sceneId: scene.id, sceneNumber: scene.scene_number, title: scene.title ?? null },
        asOf: localIsoDate(),
      })
    },
    onSuccess: refreshDocuments,
  })

  const [rolling, setRolling] = useState<{ slateId: string; since: number } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!rolling) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [rolling])

  const sceneNumberById = useMemo(() => new Map(allScenes.map((s) => [s.id, s.scene_number])), [allScenes])
  const labelOf = (s: Slate) => slateDisplayLabel(s, s.scene_id ? sceneNumberById.get(s.scene_id) : null)

  // ─── Revisions (SS10) ──────────────────────────────────────────────────────
  const { data: revision } = useRevisionReview(currentProductionId, sceneId, middleView === 'script' && !!linedScene)
  const markReviewed = useMarkRevisionReviewed()
  const revisionWasRecorded = revision ? revisionRecorded(revision) : false

  // ─── Lining (SS7) ──────────────────────────────────────────────────────────
  const lining = useLiningMutations()
  const [undoStack, setUndoStack] = useState<LiningUndoEntry[]>([])
  const remember = (entry: LiningUndoEntry) => setUndoStack((stack) => pushUndo(stack, entry))
  const liningBusy =
    lining.create.isPending ||
    lining.range.isPending ||
    lining.segments.isPending ||
    lining.remove.isPending ||
    lining.restore.isPending
  const activeTramline =
    linedScene && currentSlate
      ? linedScene.tramlines.find((t) => t.slateId === currentSlate.id && t.camera === '') ?? null
      : null
  const tramlineAt = (laneIndex: number) => {
    const id = linedLayout?.columns[laneIndex]?.tramlineId
    return linedScene?.tramlines.find((t) => t.id === id) ?? null
  }
  const laneLabel = (laneIndex: number) => linedLayout?.columns[laneIndex]?.label ?? ''

  const handleDraw = (startSort: number, endSort: number) => {
    if (!linedLayout || !linedScene || !currentSlate) return
    const snapped = snapRangeToLineable(linedLayout.rows, startSort, endSort)
    if (!snapped) return
    const idBySort = new Map(linedLayout.rows.map((r) => [r.element.sort_index, r.element.id]))
    const start = idBySort.get(snapped.start)!
    const end = idBySort.get(snapped.end)!
    const label = labelOf(currentSlate)
    if (activeTramline) {
      const previous = { start: activeTramline.startElementId, end: activeTramline.endElementId }
      lining.range.mutate(
        { id: activeTramline.id, start, end },
        {
          onSuccess: () =>
            remember({ kind: 'range', tramlineId: activeTramline.id, startElementId: previous.start, endElementId: previous.end, label: `redraw of ${label}` }),
        }
      )
    } else {
      lining.create.mutate(
        { slateId: currentSlate.id, scriptVersionId: linedScene.scriptVersionId, startElementId: start, endElementId: end },
        { onSuccess: (tramlineId) => remember({ kind: 'created', tramlineId, label: `lining ${label}` }) }
      )
    }
  }

  const handleSetSegment = (laneIndex: number, row: LiningRow, state: CellState) => {
    const t = tramlineAt(laneIndex)
    const previous = row.cells[laneIndex]?.state ?? 'on'
    if (!t || previous === state) return
    lining.segments.mutate(
      { id: t.id, changes: [{ elementId: row.element.id, state }] },
      {
        onSuccess: () =>
          remember({ kind: 'segments', tramlineId: t.id, previous: [{ elementId: row.element.id, state: previous }], label: `change to ${laneLabel(laneIndex)}` }),
      }
    )
  }

  const handleCharacterOff = (laneIndex: number, row: LiningRow) => {
    const t = tramlineAt(laneIndex)
    if (!t || !linedLayout || !row.element.character_name) return
    const ids = characterRunElementIds(linedLayout.rows, laneIndex, row.element.sort_index, row.element.character_name)
    const stateById = new Map<string, CellState>(
      linedLayout.rows.map((r): [string, CellState] => [r.element.id, r.cells[laneIndex]?.state ?? 'on'])
    )
    const previous = ids.map((id) => ({ elementId: id, state: stateById.get(id) ?? 'on' }))
    lining.segments.mutate(
      { id: t.id, changes: ids.map((id) => ({ elementId: id, state: 'off' as const })) },
      { onSuccess: () => remember({ kind: 'segments', tramlineId: t.id, previous, label: `${row.element.character_name} off camera` }) }
    )
  }

  const handleDeleteTramline = (laneIndex: number) => {
    const t = tramlineAt(laneIndex)
    if (!t) return
    const label = laneLabel(laneIndex)
    lining.remove.mutate(t.id, { onSuccess: () => remember({ kind: 'deleted', tramlineId: t.id, label: `deleting ${label}` }) })
  }

  const handleUndo = () => {
    if (liningBusy) return
    const { entry, rest } = popUndo(undoStack)
    if (!entry) return
    setUndoStack(rest)
    if (entry.kind === 'created') lining.remove.mutate(entry.tramlineId)
    else if (entry.kind === 'deleted') lining.restore.mutate(entry.tramlineId)
    else if (entry.kind === 'range') lining.range.mutate({ id: entry.tramlineId, start: entry.startElementId, end: entry.endElementId })
    else lining.segments.mutate({ id: entry.tramlineId, changes: entry.previous })
  }
  const lastUndo = undoStack[undoStack.length - 1] ?? null

  // ─── Notes and continuity photos (SS8) ─────────────────────────────────────
  const { data: sceneNotes = [] } = useSceneAnnotations(linedScene?.scriptVersionId, sceneId)
  const notesByElement = useMemo(() => annotationsByElement(sceneNotes), [sceneNotes])
  const { data: slateNotes = [] } = useSlateAnnotations(currentSlate?.id)
  const { data: slatePhotos = [] } = useSlatePhotos(currentSlate?.id)
  const notes = useAnnotationMutations()
  const photos = usePhotoMutations()
  const [noteDialog, setNoteDialog] = useState<AnnotationDialogState | null>(null)
  const photoTake = takeToMark(currentTakes, selectedTakeId)
  const noteSlateId = noteDialog?.mode === 'edit' ? noteDialog.annotation.slateId : currentSlate?.id ?? null
  const noteTakes = noteSlateId ? dayTakes.filter((t) => t.slate_id === noteSlateId) : []
  const noteError = [notes.create.error, notes.update.error, notes.remove.error].find((e) => e instanceof Error) as Error | undefined
  const rowExcerpt = (row: LiningRow) =>
    (row.element.element_type === 'dialogue' ? `${row.element.character_name}: ${row.element.text}` : row.element.text).replace(/\s+/g, ' ')

  const isUs = settings?.slating_system === 'us'
  const busy = createSlate.isPending || createTake.isPending || updateTake.isPending
  const canCreateSlate =
    !!currentProductionId && !!dayId && !(isUs && !sceneId) && !createSlate.isPending && !rolling

  const handleNewSlate = () => {
    if (!canCreateSlate) return
    createSlate.mutate(
      {
        production_id: currentProductionId!,
        shoot_day_id: dayId!,
        scene_id: sceneId,
        ...carryOverFields(latestSlate(slates)),
      },
      {
        onSuccess: (slate) => {
          setChosenSlateId(slate.id)
          setSelectedTakeId(null)
        },
      }
    )
  }

  const handleRollCut = () => {
    if (rolling) {
      const durationMs = Date.now() - rolling.since
      const slateId = rolling.slateId
      setRolling(null)
      createTake.mutate({ slateId, fields: { duration_ms: durationMs } }, { onSuccess: () => setSelectedTakeId(null) })
      return
    }
    if (!currentSlate) return
    const now = Date.now()
    setNowMs(now)
    setRolling({ slateId: currentSlate.id, since: now })
  }

  const handleMark = (status: Exclude<TakeStatus, 'pending'>) => {
    const target = takeToMark(currentTakes, selectedTakeId)
    if (target) updateTake.mutate({ id: target.id, patch: { status } })
  }

  const handleNgReason = (reason: TakeNgReason) => {
    const target = takeToMark(currentTakes, selectedTakeId)
    if (target) updateTake.mutate({ id: target.id, patch: { status: 'ng', ng_reason: reason } })
  }

  const handleDeleteSlate = async (slate: Slate) => {
    const takeCount = dayTakes.filter((t) => t.slate_id === slate.id).length
    const ok = await confirm({
      title: `Delete slate ${labelOf(slate)}?`,
      description: takeCount > 0 ? `Its ${takeCount} ${takeCount === 1 ? 'take' : 'takes'} will be deleted too.` : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setSwipedSlateId(null)
    deleteSlate.mutate(slate.id, {
      onSuccess: () => {
        if (chosenSlateId === slate.id) setChosenSlateId(null)
        setSelectedTakeId(null)
      },
    })
  }

  const handleUpdateSlate = (patch: UpdateSlateInput) => {
    if (currentSlate) updateSlate.mutate({ id: currentSlate.id, patch })
  }

  // Single-key shortcuts (N, Space, P, H, G) — ignored while typing or with modifier keys.
  const shortcuts = useRef({ handleNewSlate, handleRollCut, handleMark, handleUndo, middleView })
  shortcuts.current = { handleNewSlate, handleRollCut, handleMark, handleUndo, middleView }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      // Undo lining (Cmd/Ctrl+Z) while the script is showing.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && shortcuts.current.middleView === 'script') {
        e.preventDefault()
        shortcuts.current.handleUndo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const onButton = target?.tagName?.toLowerCase() === 'button'
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          shortcuts.current.handleNewSlate()
          break
        case ' ':
          if (onButton) return // let Space activate the focused button as usual
          e.preventDefault()
          shortcuts.current.handleRollCut()
          break
        case 'p':
          shortcuts.current.handleMark('print')
          break
        case 'h':
          shortcuts.current.handleMark('hold')
          break
        case 'g':
          shortcuts.current.handleMark('ng')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!currentProductionId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl">Script Supervisor</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  if (dataSource === 'remote_server') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl">Script Supervisor</h1>
        <div role="status" className="flex gap-2 items-start rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <Info className="size-4 shrink-0 mt-0.5" aria-hidden />
          <span>{SCRIPT_SUPERVISOR_REMOTE_ERROR}</span>
        </div>
      </div>
    )
  }

  const error = errorMessage(
    createSlate.error,
    updateSlate.error,
    deleteSlate.error,
    createTake.error,
    updateTake.error,
    setSceneProgress.error,
    saveDayLog.error,
    exportDpr.error,
    dayExport.error,
    sceneExport.error,
    lining.create.error,
    lining.range.error,
    lining.segments.error,
    lining.remove.error,
    lining.restore.error,
    photos.add.error,
    photos.remove.error,
    markReviewed.error
  )
  const selectedSceneComplete = sceneId ? sceneStatus(sceneId) === 'complete' : false
  const toggleSceneComplete = () => {
    if (!sceneId || !dayId) return
    setSceneProgress.mutate({
      productionId: currentProductionId,
      sceneId,
      input: selectedSceneComplete
        ? { marked_status: null }
        : { marked_status: 'complete', completed_shoot_day_id: dayId },
    })
  }
  const otherScenes = allScenes.filter((s) => !dayScenes.some((d) => d.id === s.id))
  const chosenDay = days.find((d) => d.id === dayId)
  const sceneNumber = sceneId ? sceneNumberById.get(sceneId) ?? null : null
  const dayLabelOf = (d: { day_number: number | null; shoot_date: string }) => (d.day_number != null ? `Day ${d.day_number}` : d.shoot_date)

  // ─── Pieces shared by the desktop and tablet layouts ───────────────────────
  const daySelect = days.length > 0 && (
    <Select
      value={dayId ?? undefined}
      onValueChange={(v) => {
        setChosenDayId(v)
        setChosenSceneId(null)
        setChosenSlateId(null)
        setSelectedTakeId(null)
      }}
    >
      <SelectTrigger aria-label="Shoot day" className={cn(touch ? 'h-11 w-[240px] text-base' : 'w-[220px]')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {[...days]
          .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
          .map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.day_number != null ? `Day ${d.day_number} | ` : ''}
              {d.shoot_date}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
  const modeControl = (
    <SegmentedControl<'log' | 'review'>
      ariaLabel="Mode"
      size={touch ? 'md' : 'sm'}
      className={cn('w-auto min-w-[200px]', touch && 'h-11 min-w-[240px]')}
      value={mode}
      onValueChange={setMode}
      options={[
        { value: 'log', label: 'Line & log' },
        { value: 'review', label: 'Review' },
      ]}
    />
  )
  const tabletToggle = toggleTouch && (
    <Button
      type="button"
      variant="outline"
      size={touch ? 'icon-lg' : 'icon'}
      aria-label="Tablet layout"
      title="Tablet layout"
      aria-pressed={touch}
      onClick={toggleTouch}
      className={cn(touch && 'size-11 border-primary/60 bg-primary/15 text-primary')}
    >
      <Tablet aria-hidden />
    </Button>
  )
  const newSlateButton = (
    <Button
      type="button"
      size={touch ? 'lg' : 'default'}
      className={cn(touch && 'h-11')}
      disabled={!canCreateSlate}
      aria-keyshortcuts="N"
      title={isUs && !sceneId ? 'Choose a scene first' : touch ? `${isUs ? 'US' : 'UK'} slating` : undefined}
      onClick={handleNewSlate}
    >
      <Plus aria-hidden />
      New slate
      {/* A separate space keeps the accessible name "New slate 12" rather than "New slate12". */}
      {preview && ' '}
      {preview && <span className="font-mono">{preview.label}</span>}
    </Button>
  )
  // One header for both layouts, so switching layout keeps the toggle (and its focus) in place.
  const header = (
    <header className="flex flex-wrap items-center gap-3">
      {/* On tablets the breadcrumb and section tab already name the page, so the toolbar keeps only controls. */}
      <h1 className={cn(touch ? 'sr-only' : 'text-2xl')}>Script Supervisor</h1>
      <ExperimentalBadge />
      {daySelect}
      {!touch && <span className="text-xs text-muted-foreground">{isUs ? 'US slating' : 'UK slating'}</span>}
      {touch && modeControl}
      <div className="flex-1" />
      {!touch && modeControl}
      {tabletToggle}
      {newSlateButton}
    </header>
  )
  const errorAlert = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
  const reviewView = (
    <ProgressView
      progress={progress}
      isLoading={progressLoading}
      fallbackDayId={dayId}
      onSetProgress={(id, input) => setSceneProgress.mutate({ productionId: currentProductionId, sceneId: id, input })}
      onOpenScene={(id) => {
        setChosenSceneId(id)
        setMode('log')
      }}
      header={
        chosenDay ? (
          <div className="space-y-4">
            <DayReportCard
              dayLabel={dayLabelOf(chosenDay)}
              dayLog={dayLog}
              plannedCallTime={chosenDay.call_time}
              plannedWrapTime={chosenDay.wrap_time}
              onSave={(patch) => saveDayLog.mutate({ productionId: currentProductionId, shootDayId: chosenDay.id, patch })}
              onExport={() => exportDpr.mutate()}
              exporting={exportDpr.isPending}
              touch={touch}
            />
            <ExportsCard
              dayLabel={dayLabelOf(chosenDay)}
              coverage={dayCoverage}
              coverageLoading={coverageLoading}
              exporting={dayExport.isPending ? dayExport.variables ?? null : null}
              notice={exportNotice}
              touch={touch}
              onExport={(kind) => dayExport.mutate(kind)}
              onOpenScene={(id) => {
                setChosenSceneId(id)
                setMiddleView('script')
                setMode('log')
              }}
            />
          </div>
        ) : null
      }
    />
  )
  const noDays = !daysLoading && days.length === 0
  const noDaysMessage = (
    <p className="text-muted-foreground">
      No shoot days yet. Add days on the <Link to="/schedule/stripboard">stripboard</Link> to start logging.
    </p>
  )
  const sceneCompleteButton = sceneId && (
    <Button
      type="button"
      variant="outline"
      size={touch ? 'lg' : 'sm'}
      className={cn(touch ? 'h-11 shrink-0' : 'w-full', selectedSceneComplete && 'border-primary/60 text-primary')}
      aria-pressed={selectedSceneComplete}
      aria-label={`Scene ${sceneNumber ?? ''} complete`}
      disabled={setSceneProgress.isPending || sceneStatus(sceneId) === 'omitted'}
      onClick={toggleSceneComplete}
    >
      <Check aria-hidden />
      {selectedSceneComplete ? 'Scene complete' : touch ? 'Mark complete' : 'Mark scene complete'}
    </Button>
  )
  const middleViewControl = (
    <SegmentedControl<'slates' | 'script'>
      ariaLabel="Show"
      size={touch ? 'md' : 'sm'}
      className={cn('w-auto', touch && 'h-11 w-[220px] shrink-0')}
      value={middleView}
      onValueChange={setMiddleView}
      options={[
        { value: 'slates', label: `Slates (${slates.length})` },
        // The tablet header names the scene beside the control, so the tab doesn't repeat it.
        { value: 'script', label: sceneId && !touch ? `Script | Sc ${sceneNumber ?? ''}` : 'Script' },
      ]}
    />
  )
  const revisionPanel = revision && (revision.items.length > 0 || revision.relined > 0) && (
    <RevisionReview
      review={revision}
      touch={touch}
      busy={markReviewed.isPending}
      daySlateIds={new Set(slateIds)}
      onSelectSlate={(id) => {
        setChosenSlateId(id)
        setSelectedTakeId(null)
      }}
      onReviewed={(id) => markReviewed.mutate(id)}
    />
  )
  const liningToolbar = linedScene && (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={touch ? 'lg' : 'sm'}
        className={cn(touch && 'h-11')}
        disabled={!lastUndo || liningBusy}
        aria-keyshortcuts="Control+Z Meta+Z"
        onClick={handleUndo}
      >
        <Undo2 aria-hidden />
        {lastUndo ? `Undo ${lastUndo.label}` : 'Undo'}
      </Button>
      {!currentSlate && <span className="text-xs text-muted-foreground">Create a slate to line it.</span>}
      {revision && revisionWasRecorded && revision.items.length === 0 && revision.relined === 0 && (
        <span className="text-xs text-muted-foreground">{revisionSummary(revision)}</span>
      )}
      <span className="flex-1" />
      <Button
        type="button"
        variant="outline"
        size={touch ? 'lg' : 'sm'}
        className={cn(touch && 'h-11')}
        disabled={sceneExport.isPending}
        onClick={() => sceneExport.mutate()}
      >
        <FileDown aria-hidden />
        {sceneExport.isPending ? 'Exporting…' : 'Export PDF'}
      </Button>
    </div>
  )
  const linedScript = (
    <LinedScript
      layout={linedLayout}
      isLoading={linedLoading && !!sceneId}
      hasScript={!!linedScene}
      sceneNumber={sceneNumber}
      currentSlateId={currentSlate?.id ?? null}
      touch={touch}
      annotations={notesByElement}
      onAnnotate={(row) =>
        setNoteDialog({
          mode: 'create',
          elementId: row.element.id,
          excerpt: rowExcerpt(row),
          character: row.element.element_type === 'dialogue' ? row.element.character_name : null,
        })
      }
      onEditAnnotation={(a, row) => setNoteDialog({ mode: 'edit', annotation: a, excerpt: rowExcerpt(row) })}
      editing={{
        activeSlateId: currentSlate?.id ?? null,
        activeLabel: currentSlate ? labelOf(currentSlate) : null,
        activeShotType: currentSlate?.shot_type ?? null,
        activeHasTramline: !!activeTramline,
        busy: liningBusy,
        onDraw: handleDraw,
        onSetSegment: handleSetSegment,
        onCharacterOff: handleCharacterOff,
        onDeleteTramline: handleDeleteTramline,
      }}
    />
  )
  const slatesList = (
    <section aria-label="Slates on this day" className="space-y-2">
      {touch && slates.length === 0 && <p className="p-3 text-sm text-muted-foreground">No slates on this day yet.</p>}
      <ul className="space-y-1">
        {[...slates].reverse().map((s) => {
          const active = currentSlate?.id === s.id
          const prints = printedTakeNumbers(dayTakes.filter((t) => t.slate_id === s.id))
          return (
            <li key={s.id} className="group relative">
              <SwipeToDeleteRow
                open={swipedSlateId === s.id}
                onOpenChange={(o) => setSwipedSlateId(o ? s.id : null)}
                onDelete={() => void handleDeleteSlate(s)}
                disabled={rolling?.slateId === s.id}
                deleteLabel={`Delete slate ${labelOf(s)}`}
              >
              <button
                type="button"
                aria-pressed={active}
                disabled={!!rolling && !active}
                onClick={() => {
                  setChosenSlateId(s.id)
                  setSelectedTakeId(null)
                }}
                className={cn(
                  'w-full rounded-lg text-left flex items-center gap-3 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
                  touch ? 'min-h-14 px-3' : 'px-3 py-2',
                  active ? 'bg-primary/15 shadow-[inset_2px_0_0_var(--color-primary)]' : 'hover:bg-muted/40'
                )}
              >
                <span className="font-mono font-semibold w-14">{labelOf(s)}</span>
                <span className="flex-1 min-w-0 truncate text-sm">
                  {[s.shot_code, s.description].filter(Boolean).join(' ') || (
                    <span className="text-muted-foreground">No description</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.scene_id ? `Sc ${sceneNumberById.get(s.scene_id) ?? '?'}` : 'No scene'}
                </span>
                <span className={cn('font-mono text-xs text-right', touch ? 'w-20 whitespace-nowrap' : 'w-16')}>
                  {prints.length > 0 ? `Print ${prints.join(',')}` : ''}
                </span>
              </button>
              </SwipeToDeleteRow>
              {!touch && (
                <button
                  type="button"
                  aria-label={`Delete slate ${labelOf(s)}`}
                  title="Delete slate"
                  disabled={rolling?.slateId === s.id}
                  onClick={() => void handleDeleteSlate(s)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover:opacity-100 disabled:hidden"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
  const slatePanelProps = {
    slate: currentSlate,
    slateLabel: currentSlate ? labelOf(currentSlate) : null,
    sceneLabel: currentSlate?.scene_id ? sceneNumberById.get(currentSlate.scene_id) ?? null : null,
    takes: currentTakes,
    selectedTakeId,
    onSelectTake: setSelectedTakeId,
    rollingSinceMs: rolling && currentSlate && rolling.slateId === currentSlate.id ? rolling.since : null,
    nowMs,
    onRollCut: handleRollCut,
    onMark: handleMark,
    onNgReason: handleNgReason,
    onUpdateSlate: handleUpdateSlate,
    onUpdateTakeRemarks: (id: string, remarks: string | null) => updateTake.mutate({ id, patch: { remarks } }),
    busy,
  }
  const onEditSlateNote = (n: AnnotationView) => setNoteDialog({ mode: 'edit', annotation: n, excerpt: formatAnnotationChip(n) })
  const onAddPhotos = (files: File[], tags: ContinuityTag[]) => {
    if (!currentSlate) return
    photos.add.mutate({
      productionId: currentProductionId,
      files,
      slateId: currentSlate.id,
      slateLabel: labelOf(currentSlate),
      takeId: photoTake?.id ?? null,
      takeNumber: photoTake?.take_number ?? null,
      sceneId: currentSlate.scene_id,
      tags,
    })
  }
  const annotationDialog = (
    <AnnotationDialog
      state={noteDialog}
      slate={currentSlate ? { id: currentSlate.id, label: labelOf(currentSlate) } : null}
      takes={noteTakes}
      defaultTakeId={photoTake?.id ?? null}
      busy={notes.create.isPending || notes.update.isPending || notes.remove.isPending}
      error={noteError?.message ?? null}
      onClose={() => setNoteDialog(null)}
      onCreate={(input) => notes.create.mutate(input, { onSuccess: () => setNoteDialog(null) })}
      onUpdate={(id, patch) => notes.update.mutate({ id, patch }, { onSuccess: () => setNoteDialog(null) })}
      onDelete={(id) => notes.remove.mutate(id, { onSuccess: () => setNoteDialog(null) })}
    />
  )

  if (touch) {
    const sceneTitle = sceneId ? allScenes.find((s) => s.id === sceneId)?.title ?? dayScenes.find((s) => s.id === sceneId)?.title ?? null : null
    return (
      <div className="space-y-3">
        {confirmDialog}
        {header}
        {errorAlert}
        {mode === 'review' ? (
          reviewView
        ) : noDays ? (
          noDaysMessage
        ) : (
          <TabletWorkspace
            scenes={(arrangement) => (
              <TabletSceneNav
                arrangement={arrangement}
                dayLabel={chosenDay ? dayLabelOf(chosenDay) : 'Today'}
                dayScenes={dayScenes}
                otherScenes={otherScenes}
                sceneId={sceneId}
                statusOf={sceneStatus}
                onSelect={setChosenSceneId}
              />
            )}
            workbench={
              <>
                <div className="flex items-center gap-3">
                  {middleViewControl}
                  <div className="min-w-0 flex-1">
                    {sceneId ? (
                      <>
                        <p className="truncate">
                          <span className="font-mono font-semibold">Sc {sceneNumber}</span>
                          {sceneTitle && <span className="text-muted-foreground"> {sceneTitle}</span>}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <SceneStatusPip status={sceneStatus(sceneId)} />
                          {SCENE_STATUS_LABEL[sceneStatus(sceneId)]}
                          {!dayScenes.some((d) => d.id === sceneId) && ' | not scheduled today'}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Choose a scene.</p>
                    )}
                  </div>
                  {sceneCompleteButton}
                </div>
                {middleView === 'script' ? (
                  <>
                    {liningToolbar}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {revisionPanel}
                      {linedScript}
                    </div>
                  </>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card p-1.5">{slatesList}</div>
                )}
              </>
            }
            deck={(arrangement, short) => (
              <TabletSlateDeck
                {...slatePanelProps}
                arrangement={arrangement}
                short={short}
                notes={slateNotes}
                photos={slatePhotos}
                photoTakeNumber={photoTake?.take_number ?? null}
                photosBusy={photos.add.isPending}
                onEditNote={onEditSlateNote}
                onAddPhotos={onAddPhotos}
                onRemovePhoto={(id) => photos.remove.mutate(id)}
              />
            )}
          />
        )}
        {annotationDialog}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {header}

      {errorAlert}

      {mode === 'review' ? (
        reviewView
      ) : noDays ? (
        noDaysMessage
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <nav aria-label="Scenes" className="w-[220px] shrink-0 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {chosenDay?.day_number != null ? `Day ${chosenDay.day_number}` : 'Today'} | scenes
            </p>
            {dayScenes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing on the stripboard for this day.</p>
            )}
            <ul className="space-y-1">
              {dayScenes.map((s) => {
                const active = s.id === sceneId
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setChosenSceneId(s.id)}
                      className={cn(
                        'w-full rounded-lg text-left px-2 py-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        active ? 'bg-primary/15 shadow-[inset_2px_0_0_var(--color-primary)]' : 'hover:bg-muted/40'
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <SceneStatusPip status={sceneStatus(s.id)} />
                        <span className="font-mono font-semibold">{s.scene_number}</span>
                      </span>
                      {s.title && <span className="ml-2 text-xs text-muted-foreground truncate">{s.title}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            {otherScenes.length > 0 && (
              <Select value="" onValueChange={(v) => setChosenSceneId(v)}>
                <SelectTrigger aria-label="Another scene" className="w-full">
                  <SelectValue placeholder="Another scene…" />
                </SelectTrigger>
                <SelectContent>
                  {otherScenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.scene_number}
                      {s.title ? ` | ${s.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {sceneId && !dayScenes.some((d) => d.id === sceneId) && (
              <p className="text-xs text-muted-foreground">Logging against unscheduled scene {sceneNumber}.</p>
            )}
            {sceneId && (
              <div className="space-y-1 pt-2">
                <p className="text-xs text-muted-foreground">
                  Sc {sceneNumber}: {SCENE_STATUS_LABEL[sceneStatus(sceneId)]}
                </p>
                {sceneCompleteButton}
              </div>
            )}
          </nav>

          <div className="flex-1 min-w-[240px] space-y-2">
            {middleViewControl}
            {middleView === 'script' ? (
              <>
                {revisionPanel}
                {liningToolbar}
                {linedScript}
              </>
            ) : (
              slatesList
            )}
          </div>

          <div className="w-full lg:w-[380px]">
            <div className="space-y-4">
              <SlatePanel {...slatePanelProps} touch={false} />
              {currentSlate && (
                <SlateNotesPanel
                  slateLabel={labelOf(currentSlate)}
                  notes={slateNotes}
                  photos={slatePhotos}
                  photoTakeNumber={photoTake?.take_number ?? null}
                  busy={photos.add.isPending}
                  touch={false}
                  onEditNote={onEditSlateNote}
                  onAddPhotos={onAddPhotos}
                  onRemovePhoto={(id) => photos.remove.mutate(id)}
                />
              )}
            </div>
            {annotationDialog}
          </div>
        </div>
      )}
    </div>
  )
}
