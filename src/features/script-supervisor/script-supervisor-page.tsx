import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Info, Plus, Tablet, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  useDayLog,
  useLinedScene,
  useLiningMutations,
  useSaveDayLog,
  useNextSlatePreview,
  useScenesForShootDay,
  useScriptSupervisorSettings,
  useSlatesForShootDay,
  useTakesForSlates,
  useUpdateSlate,
  useSetSceneProgress,
  useShootProgress,
  useUpdateTake,
} from './hooks'
import { DayReportCard } from './DayReportCard'
import { LinedScript } from './LinedScript'
import { ProgressView } from './ProgressView'
import { SceneStatusPip } from './SceneStatusPip'
import { SlatePanel } from './SlatePanel'
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
            .join(' · ')
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

  const [rolling, setRolling] = useState<{ slateId: string; since: number } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!rolling) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [rolling])

  const sceneNumberById = useMemo(() => new Map(allScenes.map((s) => [s.id, s.scene_number])), [allScenes])
  const labelOf = (s: Slate) => slateDisplayLabel(s, s.scene_id ? sceneNumberById.get(s.scene_id) : null)

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
    createTake.error,
    updateTake.error,
    setSceneProgress.error,
    saveDayLog.error,
    exportDpr.error,
    lining.create.error,
    lining.range.error,
    lining.segments.error,
    lining.remove.error,
    lining.restore.error
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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl mr-2">Script Supervisor</h1>
        {days.length > 0 && (
          <Select
            value={dayId ?? undefined}
            onValueChange={(v) => {
              setChosenDayId(v)
              setChosenSceneId(null)
              setChosenSlateId(null)
              setSelectedTakeId(null)
            }}
          >
            <SelectTrigger aria-label="Shoot day" className={cn('w-[220px]', touch && 'h-11 text-base')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...days]
                .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
                .map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.day_number != null ? `Day ${d.day_number} · ` : ''}
                    {d.shoot_date}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground">{isUs ? 'US slating' : 'UK slating'}</span>
        <div className="flex-1" />
        <SegmentedControl<'log' | 'review'>
          ariaLabel="Mode"
          size={touch ? 'md' : 'sm'}
          className="w-auto min-w-[200px]"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'log', label: 'Line & log' },
            { value: 'review', label: 'Review' },
          ]}
        />
        <Button
          type="button"
          variant="outline"
          size={touch ? 'icon-lg' : 'icon'}
          aria-label="Tablet layout"
          title="Tablet layout"
          aria-pressed={touch}
          onClick={toggleTouch}
          className={cn(touch && 'border-primary/60 bg-primary/15 text-primary')}
        >
          <Tablet aria-hidden />
        </Button>
        <Button
          type="button"
          size={touch ? 'lg' : 'default'}
          disabled={!canCreateSlate}
          aria-keyshortcuts="N"
          title={isUs && !sceneId ? 'Choose a scene first' : undefined}
          onClick={handleNewSlate}
        >
          <Plus aria-hidden />
          New slate
          {preview && <span className="font-mono">{preview.label}</span>}
        </Button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {mode === 'review' ? (
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
              <DayReportCard
                dayLabel={chosenDay.day_number != null ? `Day ${chosenDay.day_number}` : chosenDay.shoot_date}
                dayLog={dayLog}
                plannedCallTime={chosenDay.call_time}
                plannedWrapTime={chosenDay.wrap_time}
                onSave={(patch) =>
                  saveDayLog.mutate({ productionId: currentProductionId, shootDayId: chosenDay.id, patch })
                }
                onExport={() => exportDpr.mutate()}
                exporting={exportDpr.isPending}
                touch={touch}
              />
            ) : null
          }
        />
      ) : !daysLoading && days.length === 0 ? (
        <p className="text-muted-foreground">
          No shoot days yet. Add days on the <Link to="/schedule/stripboard">stripboard</Link> to start logging.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <nav
            aria-label="Scenes"
            className={cn('shrink-0 space-y-2', touch ? 'w-[88px]' : 'w-[220px]')}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {chosenDay?.day_number != null ? `Day ${chosenDay.day_number}` : 'Today'} · scenes
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
                        'w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        touch ? 'h-14 px-2 text-center' : 'px-2 py-2',
                        active ? 'bg-primary/15 shadow-[inset_2px_0_0_var(--color-primary)]' : 'hover:bg-muted/40'
                      )}
                    >
                      <span className={cn('inline-flex items-center gap-2', touch && 'flex-col gap-1')}>
                        <SceneStatusPip status={sceneStatus(s.id)} />
                        <span className="font-mono font-semibold">{s.scene_number}</span>
                      </span>
                      {!touch && s.title && (
                        <span className="ml-2 text-xs text-muted-foreground truncate">{s.title}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {!touch && otherScenes.length > 0 && (
              <Select value="" onValueChange={(v) => setChosenSceneId(v)}>
                <SelectTrigger aria-label="Another scene" className="w-full">
                  <SelectValue placeholder="Another scene…" />
                </SelectTrigger>
                <SelectContent>
                  {otherScenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.scene_number}
                      {s.title ? ` · ${s.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {sceneId && !dayScenes.some((d) => d.id === sceneId) && (
              <p className="text-xs text-muted-foreground">
                Logging against unscheduled scene {sceneNumberById.get(sceneId)}.
              </p>
            )}
            {sceneId && (
              <div className="space-y-1 pt-2">
                {!touch && (
                  <p className="text-xs text-muted-foreground">
                    Sc {sceneNumberById.get(sceneId)}: {SCENE_STATUS_LABEL[sceneStatus(sceneId)]}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size={touch ? 'lg' : 'sm'}
                  className={cn('w-full', selectedSceneComplete && 'border-primary/60 text-primary')}
                  aria-pressed={selectedSceneComplete}
                  aria-label={`Scene ${sceneNumberById.get(sceneId) ?? ''} complete`}
                  disabled={setSceneProgress.isPending || sceneStatus(sceneId) === 'omitted'}
                  onClick={toggleSceneComplete}
                >
                  <Check aria-hidden />
                  {touch ? 'Done' : selectedSceneComplete ? 'Scene complete' : 'Mark scene complete'}
                </Button>
              </div>
            )}
          </nav>

          <div className="flex-1 min-w-[240px] space-y-2">
          <SegmentedControl<'slates' | 'script'>
            ariaLabel="Show"
            size={touch ? 'md' : 'sm'}
            className="w-auto"
            value={middleView}
            onValueChange={setMiddleView}
            options={[
              { value: 'slates', label: `Slates (${slates.length})` },
              { value: 'script', label: sceneId ? `Script · Sc ${sceneNumberById.get(sceneId) ?? ''}` : 'Script' },
            ]}
          />
          {middleView === 'script' ? (
            <>
            {linedScene && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size={touch ? 'lg' : 'sm'}
                  disabled={!lastUndo || liningBusy}
                  aria-keyshortcuts="Control+Z Meta+Z"
                  onClick={handleUndo}
                >
                  <Undo2 aria-hidden />
                  {lastUndo ? `Undo ${lastUndo.label}` : 'Undo'}
                </Button>
                {!currentSlate && <span className="text-xs text-muted-foreground">Create a slate to line it.</span>}
              </div>
            )}
            <LinedScript
              layout={linedLayout}
              isLoading={linedLoading && !!sceneId}
              hasScript={!!linedScene}
              sceneNumber={sceneId ? sceneNumberById.get(sceneId) ?? null : null}
              currentSlateId={currentSlate?.id ?? null}
              touch={touch}
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
            </>
          ) : (
          <section aria-label="Slates on this day" className="space-y-2">
            <ul className="space-y-1">
              {[...slates].reverse().map((s) => {
                const active = currentSlate?.id === s.id
                const prints = printedTakeNumbers(dayTakes.filter((t) => t.slate_id === s.id))
                return (
                  <li key={s.id}>
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
                      <span className="font-mono text-xs w-16 text-right">
                        {prints.length > 0 ? `Print ${prints.join(',')}` : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
          )}
          </div>

          <div className={cn('w-full', touch ? 'lg:w-[420px]' : 'lg:w-[380px]')}>
            <SlatePanel
              slate={currentSlate}
              slateLabel={currentSlate ? labelOf(currentSlate) : null}
              sceneLabel={currentSlate?.scene_id ? sceneNumberById.get(currentSlate.scene_id) ?? null : null}
              takes={currentTakes}
              selectedTakeId={selectedTakeId}
              onSelectTake={setSelectedTakeId}
              rollingSinceMs={rolling && currentSlate && rolling.slateId === currentSlate.id ? rolling.since : null}
              nowMs={nowMs}
              onRollCut={handleRollCut}
              onMark={handleMark}
              onNgReason={handleNgReason}
              onUpdateSlate={handleUpdateSlate}
              onUpdateTakeRemarks={(id, remarks) => updateTake.mutate({ id, patch: { remarks } })}
              touch={touch}
              busy={busy}
            />
          </div>
        </div>
      )}
    </div>
  )
}
