import { RequireProduction } from '@/components/require-production'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/page-header'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { listScenesByProduction, listShotsByScene } from '@/lib/db/repositories/schedule'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import {
  applySafeShotLinkRemaps,
  formatScriptVersionLabel,
  reconcileScriptVersions,
  type ScriptSectionReconciliationReport,
} from '@/lib/db/scriptSectionReconciliationService'
import { listScriptPagesByScriptVersion } from '@/lib/db/repositories/scriptPages'
import {
  applyScriptSectionLayout,
  getLinkedSectionCountsByShotIds,
  listCharactersByScriptVersion,
  listRangesByScriptVersion,
  listSectionsByScriptVersion,
  setScriptSectionCut,
  softDeleteSectionWithChildren,
} from '@/lib/db/repositories/scriptSections'
import { loadScriptVersionSectionProgress } from '@/lib/db/scriptSectionStatusService'
import {
  formatShootDay,
  sectionStatusSteps,
  type DerivedSectionStatus,
  type SectionShotProgress,
} from '@/lib/db/scriptSectionStatus'
import { buildSceneLayouts, type SceneLayout } from '@/lib/db/scriptSectionLayout'
import { conflictingSectionIds, findOverlappingSectionPairs } from '@/lib/db/scriptSectionMatching'
import type { Scene, ScriptSection, ScriptSectionRange } from '@/lib/db/types'
import { sceneDisplayLabel } from '@/lib/schedule/sceneDisplay'
import { formatPageEighths } from '@/lib/script-supervisor/progress'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ScriptSectionEditDialog,
  type SectionEditorSave,
  type SectionSceneOption,
} from './script-section-edit-dialog'
import { ScriptLines, SectionStatusBadge, SectionStatusSteps, SectionSummary } from './script-section-ui'
import { buildSectionViews, ownerByLine, type SectionView } from './script-section-views'
import { STATUS_FILL_CLASS } from './script-section-status-styles'
import { SbRemoteNotice } from './sbRemoteNotice'

const SELECT_NONE = '__none__'
const ALL_SCENES = '__all_scenes__'
/** Match the schedule dialog exit-animation delay used elsewhere. */
const SCHEDULE_DIALOG_EXIT_MS = 200

type StatusFilter = 'all' | DerivedSectionStatus

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string; dot: string }> = [
  { key: 'all', label: 'All', dot: 'bg-muted-foreground' },
  { key: 'no_coverage', label: 'No coverage', dot: STATUS_FILL_CLASS.no_coverage },
  { key: 'covered', label: 'Covered', dot: STATUS_FILL_CLASS.covered },
  { key: 'scheduled', label: 'Scheduled', dot: STATUS_FILL_CLASS.scheduled },
  { key: 'shot', label: 'Shot', dot: STATUS_FILL_CLASS.shot },
  { key: 'cut', label: 'Cut', dot: STATUS_FILL_CLASS.cut },
]

function compareSceneNumbers(a: Scene, b: Scene): number {
  return a.scene_number.localeCompare(b.scene_number, undefined, { numeric: true })
}

function versionPickerLabel(v: {
  version_label: string | null
  revision_colour: string | null
  title: string | null
}): string {
  const label = v.version_label?.trim() || v.title?.trim() || 'Untitled version'
  return v.revision_colour?.trim() ? `${label} (${v.revision_colour})` : label
}

function ReconciliationSummary({ report }: { report: ScriptSectionReconciliationReport }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-border p-2">
          <div className="text-lg font-semibold">{report.matched.length}</div>
          <div className="text-muted-foreground">Matched</div>
        </div>
        <div className="rounded border border-border p-2">
          <div className="text-lg font-semibold">{report.changed.length}</div>
          <div className="text-muted-foreground">Changed</div>
        </div>
        <div className="rounded border border-border p-2">
          <div className="text-lg font-semibold">{report.removed.length}</div>
          <div className="text-muted-foreground">Removed</div>
        </div>
        <div className="rounded border border-border p-2">
          <div className="text-lg font-semibold">{report.added.length}</div>
          <div className="text-muted-foreground">New</div>
        </div>
      </div>
      <p className="text-muted-foreground">
        {report.remappableShotLinks.length} shot link
        {report.remappableShotLinks.length === 1 ? '' : 's'} can be remapped safely;{' '}
        {report.reviewRequiredShotLinks.length} need manual review.
      </p>
      {report.changed.length > 0 && (
        <div>
          <p className="font-medium">Changed sections</p>
          <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-muted-foreground">
            {report.changed.slice(0, 8).map((pair) => (
              <li key={pair.old.sectionId}>{pair.old.label ?? pair.old.sectionId}</li>
            ))}
            {report.changed.length > 8 && <li>…and {report.changed.length - 8} more</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ScriptSectionsPage() {
  const queryClient = useQueryClient()
  const { currentProductionId } = useCurrentProduction()

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [selectedSceneFilterId, setSelectedSceneFilterId] = useState(ALL_SCENES)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingSection, setEditingSection] = useState<ScriptSection | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileReport, setReconcileReport] = useState<ScriptSectionReconciliationReport | null>(null)
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null)
  const scriptScrollRef = useRef<HTMLDivElement>(null)

  const { dataSourceKey } = useEffectiveDataSourceForProduction(currentProductionId)
  const isRemoteProduction = dataSourceKey === 'remote_server'

  const { data: versions = [], isLoading: versionsLoading, isError: versionsError } = useQuery({
    queryKey: ['script-versions', currentProductionId],
    queryFn: () => listScriptVersionsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes', currentProductionId],
    queryFn: () => listScenesByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: sections = [] } = useQuery({
    queryKey: ['script-sections', selectedVersionId],
    queryFn: () => listSectionsByScriptVersion(selectedVersionId!),
    enabled: !!selectedVersionId,
  })

  const { data: pages = [] } = useQuery({
    queryKey: ['script-pages', selectedVersionId],
    queryFn: () => listScriptPagesByScriptVersion(selectedVersionId!),
    enabled: !!selectedVersionId,
  })

  const { data: rangesBySectionId = new Map<string, ScriptSectionRange[]>() } = useQuery({
    queryKey: ['script-section-ranges', selectedVersionId],
    queryFn: () => listRangesByScriptVersion(selectedVersionId!),
    enabled: !!selectedVersionId,
  })

  const { data: charactersBySectionId = new Map() } = useQuery({
    queryKey: ['script-section-characters', selectedVersionId],
    queryFn: () => listCharactersByScriptVersion(selectedVersionId!),
    enabled: !!selectedVersionId,
  })

  const { data: progress } = useQuery({
    queryKey: ['script-section-progress', currentProductionId, selectedVersionId],
    queryFn: () => loadScriptVersionSectionProgress(currentProductionId!, selectedVersionId!),
    enabled: !!currentProductionId && !!selectedVersionId && !isRemoteProduction,
  })
  const shotsBySectionId = useMemo(
    () => progress?.shotsBySectionId ?? new Map<string, SectionShotProgress[]>(),
    [progress]
  )
  const omittedSceneIds = useMemo(() => progress?.omittedSceneIds ?? new Set<string>(), [progress])

  // Default to the most recent version once versions load.
  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      setSelectedVersionId(versions[0]!.id)
    }
  }, [versions, selectedVersionId])

  const locationNameById = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])
  const sceneHeading = useCallback(
    (scene: Scene) => sceneDisplayLabel(scene, scene.location_id ? locationNameById.get(scene.location_id) ?? null : null),
    [locationNameById]
  )

  // ─── Script layout per scene ──────────────────────────────────────────────
  const layoutBySceneId = useMemo(
    () => buildSceneLayouts(pages, sections, rangesBySectionId),
    [pages, sections, rangesBySectionId]
  )

  const views = useMemo(
    () =>
      buildSectionViews({
        sections,
        rangesBySectionId,
        charactersBySectionId,
        layoutBySceneId,
        shotsBySectionId,
        omittedSceneIds,
        sceneNumberById: new Map(scenes.map((s) => [s.id, s.scene_number])),
      }),
    [sections, rangesBySectionId, charactersBySectionId, layoutBySceneId, shotsBySectionId, omittedSceneIds, scenes]
  )
  const sectionCodes = useMemo(() => new Map([...views].map(([id, v]) => [id, v.code])), [views])

  const conflictSectionIds = useMemo(() => {
    const firstRange = new Map(sections.map((s) => [s.id, rangesBySectionId.get(s.id)?.[0]]))
    return conflictingSectionIds(findOverlappingSectionPairs(sections, firstRange))
  }, [sections, rangesBySectionId])

  // ─── Filtering & grouping ─────────────────────────────────────────────────
  const versionSceneIds = useMemo(
    () => new Set([...sections.map((s) => s.scene_id), ...layoutBySceneId.keys()]),
    [sections, layoutBySceneId]
  )
  const versionScenes = useMemo(
    () =>
      [...versionSceneIds]
        .map((id) => sceneById.get(id))
        .filter((s): s is Scene => s != null)
        .sort(compareSceneNumbers),
    [versionSceneIds, sceneById]
  )

  // Reset the scene filter when the scene is not in this version.
  useEffect(() => {
    if (selectedSceneFilterId !== ALL_SCENES && !versionSceneIds.has(selectedSceneFilterId) && sections.length > 0) {
      setSelectedSceneFilterId(ALL_SCENES)
    }
  }, [versionSceneIds, selectedSceneFilterId, sections.length])

  const inSceneScope = useCallback(
    (sceneId: string) => selectedSceneFilterId === ALL_SCENES || sceneId === selectedSceneFilterId,
    [selectedSceneFilterId]
  )

  const statusCounts = useMemo(() => {
    const counts = new Map<StatusFilter, number>()
    for (const view of views.values()) {
      if (!inSceneScope(view.section.scene_id)) continue
      counts.set('all', (counts.get('all') ?? 0) + 1)
      counts.set(view.status, (counts.get(view.status) ?? 0) + 1)
    }
    return counts
  }, [views, inSceneScope])

  const groups = useMemo(() => {
    return versionScenes
      .filter((scene) => inSceneScope(scene.id))
      .map((scene) => {
        const sceneViews = [...views.values()]
          .filter((v) => v.section.scene_id === scene.id)
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        const visible = sceneViews.filter((v) => statusFilter === 'all' || v.status === statusFilter)
        const layout = layoutBySceneId.get(scene.id)
        return { scene, sceneViews, visible, layout }
      })
      .filter((g) => g.visible.length > 0 || (statusFilter === 'all' && g.layout))
  }, [versionScenes, inSceneScope, views, statusFilter, layoutBySceneId])

  const selectedView = selectedSectionId ? views.get(selectedSectionId) ?? null : null

  // Drop the selection when it is filtered out or deleted.
  useEffect(() => {
    if (!selectedSectionId) return
    const view = views.get(selectedSectionId)
    if (sections.length > 0 && (!view || !inSceneScope(view.section.scene_id))) {
      setSelectedSectionId(null)
    }
  }, [selectedSectionId, views, inSceneScope, sections.length])

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null
  const latestVersionId = versions[0]?.id ?? null
  const isViewingOlderRevision =
    !!selectedVersionId && !!latestVersionId && selectedVersionId !== latestVersionId

  // ─── Shots in the selected scene that no section covers ─────────────────
  const selectedSceneId = selectedView?.section.scene_id ?? null
  const { data: sceneShots = [] } = useQuery({
    queryKey: ['scene-shots', selectedSceneId],
    queryFn: () => listShotsByScene(selectedSceneId!),
    enabled: !!selectedSceneId,
  })
  const sceneShotIdsKey = sceneShots.map((s) => s.id).join(',')
  const { data: sceneShotSectionCounts = new Map<string, number>() } = useQuery({
    queryKey: ['scene-shot-section-counts', sceneShotIdsKey],
    queryFn: () => getLinkedSectionCountsByShotIds(sceneShots.map((s) => s.id)),
    enabled: sceneShots.length > 0,
  })
  const unlinkedSceneShots = useMemo(
    () => sceneShots.filter((s) => (sceneShotSectionCounts.get(s.id) ?? 0) === 0),
    [sceneShots, sceneShotSectionCounts]
  )

  // ─── Mutations ────────────────────────────────────────────────────────────
  const invalidateSections = () => {
    queryClient.invalidateQueries({ queryKey: ['script-sections', selectedVersionId] })
    queryClient.invalidateQueries({ queryKey: ['script-section-ranges', selectedVersionId] })
    queryClient.invalidateQueries({ queryKey: ['script-section-characters', selectedVersionId] })
    queryClient.invalidateQueries({ queryKey: ['script-section-progress'] })
    queryClient.invalidateQueries({ queryKey: ['section-shot-counts'] })
    queryClient.invalidateQueries({ queryKey: ['shot-section-counts'] })
    queryClient.invalidateQueries({ queryKey: ['scene-shot-section-counts'] })
  }

  const closeDialogDeferred = () => {
    setDialogOpen(false)
    window.setTimeout(() => setEditingSection(null), SCHEDULE_DIALOG_EXIT_MS)
  }

  const saveMutation = useMutation({
    mutationFn: async (save: SectionEditorSave): Promise<string> => {
      if (save.kind === 'cut') {
        await setScriptSectionCut(save.sectionId, save.cut)
        return save.sectionId
      }
      if (!currentProductionId || !selectedVersionId) throw new Error('No production or script version selected.')
      return applyScriptSectionLayout({
        production_id: currentProductionId,
        script_version_id: selectedVersionId,
        scene_id: save.sceneId,
        episode_id: sceneById.get(save.sceneId)?.episode_id ?? null,
        current: save.current,
        updates: save.updates,
        removals: save.removals,
        splits: save.splits,
      })
    },
    onSuccess: (sectionId, save) => {
      invalidateSections()
      setSelectedSectionId(sectionId)
      closeDialogDeferred()
      if (save.kind === 'layout') {
        const others = save.updates.length + save.removals.length + save.splits.length
        toast.success(others ? `Section saved. ${others} other section${others === 1 ? '' : 's'} adjusted.` : 'Section saved.')
      } else {
        toast.success(save.cut ? 'Section marked as cut.' : 'Section restored.')
      }
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not save section.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (sectionId: string) => softDeleteSectionWithChildren(sectionId),
    onSuccess: (_data, sectionId) => {
      if (selectedSectionId === sectionId) setSelectedSectionId(null)
      invalidateSections()
      closeDialogDeferred()
      toast.success('Section deleted.')
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not delete section.'),
  })

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVersion?.previous_script_version_id || !selectedVersionId) {
        throw new Error('No previous script version to compare.')
      }
      return reconcileScriptVersions(selectedVersion.previous_script_version_id, selectedVersionId)
    },
    onSuccess: (report) => {
      setReconcileReport(report)
      setReconcileMessage(null)
      setReconcileOpen(true)
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not reconcile versions.'),
  })

  const applyRemapsMutation = useMutation({
    mutationFn: async (report: ScriptSectionReconciliationReport) => applySafeShotLinkRemaps(report),
    onSuccess: (result) => {
      setReconcileMessage(`Remapped ${result.remappedCount} shot link(s); skipped ${result.skippedCount}.`)
      invalidateSections()
    },
    onError: (e) => setReconcileMessage(e instanceof Error ? e.message : 'Could not apply remaps.'),
  })

  const openCreate = () => {
    setMutationError(null)
    setDialogMode('create')
    setEditingSection(null)
    setDialogOpen(true)
  }

  const openEdit = (section: ScriptSection) => {
    setMutationError(null)
    setDialogMode('edit')
    setEditingSection(section)
    setDialogOpen(true)
  }

  const sceneOptions: SectionSceneOption[] = useMemo(
    () =>
      (versionScenes.length ? versionScenes : [...scenes].sort(compareSceneNumbers)).map((s) => ({
        id: s.id,
        number: s.scene_number,
        label: `Scene ${s.scene_number} — ${sceneHeading(s)}`,
      })),
    [versionScenes, scenes, sceneHeading]
  )

  // ─── Script panel ─────────────────────────────────────────────────────────
  const panelScenes = useMemo(() => {
    if (selectedView) return versionScenes.filter((s) => s.id === selectedView.section.scene_id)
    return versionScenes
      .filter((s) => inSceneScope(s.id) && layoutBySceneId.has(s.id))
      .sort((a, b) => (layoutBySceneId.get(a.id)!.pages[0]?.page_index ?? 0) - (layoutBySceneId.get(b.id)!.pages[0]?.page_index ?? 0))
  }, [selectedView, versionScenes, inSceneScope, layoutBySceneId])

  useEffect(() => {
    if (!selectedView || selectedView.runs.length === 0) return
    const box = scriptScrollRef.current
    const el = box?.querySelector<HTMLElement>(
      `[data-scene="${selectedView.section.scene_id}"] [data-line="${selectedView.runs[0]!.from}"]`
    )
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 60)
  }, [selectedView])

  const ownerStatus = (sceneId: string, lineIndex: number): DerivedSectionStatus | null => {
    const layout = layoutBySceneId.get(sceneId)
    if (!layout) return null
    for (const [id, set] of layout.owners) if (set.has(lineIndex)) return views.get(id)?.status ?? null
    return null
  }
  const ownerOf = (sceneId: string, lineIndex: number): string | null => {
    const layout = layoutBySceneId.get(sceneId)
    if (!layout) return null
    for (const [id, set] of layout.owners) if (set.has(lineIndex)) return id
    return null
  }

  return (
    <>
      {!currentProductionId ? (
        <RequireProduction title="Script Sections">{null}</RequireProduction>
      ) : (
        <div className="space-y-4">
          <PageHeader title="Script Sections" />

          {isRemoteProduction && <SbRemoteNotice />}

          {versionsLoading && (
            <div role="status" aria-label="Loading script versions" className="space-y-2">
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {versionsError && !versionsLoading && (
            <p role="alert" className="text-sm text-muted-foreground">
              Unable to load script versions.
            </p>
          )}

          {mutationError && !dialogOpen && (
            <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {mutationError}
            </p>
          )}

          {conflictSectionIds.size > 0 && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {conflictSectionIds.size} sections overlap another section in the same scene. Open one and save its
              range to give the shared lines to it.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="min-w-[200px] flex-1 sm:flex-none">
              <Label className="mb-2 block text-sm text-muted-foreground">Script version</Label>
              <Select
                value={selectedVersionId ?? SELECT_NONE}
                onValueChange={(v) => {
                  setSelectedVersionId(v === SELECT_NONE ? null : v)
                  setSelectedSceneFilterId(ALL_SCENES)
                  setSelectedSectionId(null)
                }}
              >
                <SelectTrigger className="bg-input border-border sm:w-64" aria-label="Script version">
                  <SelectValue placeholder="Select a script version…" />
                </SelectTrigger>
                <SelectContent>
                  {versions.length === 0 && <SelectItem value={SELECT_NONE}>No script versions</SelectItem>}
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {versionPickerLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px] flex-1">
              <Label className="mb-2 block text-sm text-muted-foreground">Scene</Label>
              <Select
                value={selectedSceneFilterId}
                onValueChange={setSelectedSceneFilterId}
                disabled={!selectedVersionId}
              >
                <SelectTrigger className="bg-input border-border sm:max-w-md" aria-label="Scene">
                  <SelectValue placeholder="All scenes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SCENES}>All scenes</SelectItem>
                  {versionScenes.map((scene) => (
                    <SelectItem key={scene.id} value={scene.id}>
                      Scene {scene.scene_number} — {sceneHeading(scene)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVersion?.previous_script_version_id && (
                <Button
                  variant="outline"
                  onClick={() => reconcileMutation.mutate()}
                  disabled={reconcileMutation.isPending}
                >
                  Compare with previous revision
                </Button>
              )}
              <Button onClick={openCreate} disabled={!selectedVersionId || scenes.length === 0}>
                New section
              </Button>
            </div>
          </div>

          {isViewingOlderRevision && selectedVersion && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Viewing an older revision ({formatScriptVersionLabel(selectedVersion)}). Latest:{' '}
              {versions[0] ? formatScriptVersionLabel(versions[0]) : '—'}.
            </p>
          )}

          {versions.length === 0 && !versionsLoading && (
            isRemoteProduction ? (
              <p className="text-sm text-muted-foreground">
                Script sections are not available for remote-server productions.
              </p>
            ) : (
              <EmptyState
                title="No script versions yet"
                description="Import a script to generate sections."
                action={
                  <Button asChild>
                    <Link to="/schedule/script-import">Import a script</Link>
                  </Button>
                }
              />
            )
          )}

          {selectedVersionId && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={statusFilter === f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm transition-colors hover:bg-secondary',
                      statusFilter === f.key && 'border-foreground/35 bg-secondary'
                    )}
                  >
                    <span aria-hidden className={cn('size-2 rounded-full', f.dot)} />
                    {f.label}
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {statusCounts.get(f.key) ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                {/* Sections, grouped by scene */}
                <div className="max-h-[72vh] overflow-y-auto rounded-lg border border-border bg-card" aria-label="Sections">
                  {sections.length === 0 && groups.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">No sections in this version.</p>
                  )}
                  {(sections.length > 0 || groups.length > 0) && groups.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">No sections match this filter.</p>
                  )}
                  {groups.map(({ scene, sceneViews, visible, layout }) => {
                    const live = sceneViews.filter((v) => v.status !== 'cut')
                    const covered = live.filter((v) => v.shots.length > 0).length
                    const ownedLines = new Set<number>()
                    for (const set of layout?.owners.values() ?? []) for (const i of set) ownedLines.add(i)
                    const unsectioned = layout
                      ? layout.lines.filter((l) => l.text.trim() && !ownedLines.has(l.index)).length
                      : 0
                    const pageNumbers = layout ? [...new Set(layout.lines.map((l) => l.pageNumber))] : []
                    return (
                      <section key={scene.id} className="border-b border-border last:border-b-0" aria-label={`Scene ${scene.scene_number}`}>
                        <div className="sticky top-0 z-[1] grid gap-2 bg-card px-4 pb-2.5 pt-3.5">
                          <div className="flex flex-wrap items-baseline gap-2.5">
                            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[13px] font-semibold">
                              {scene.scene_number}
                            </span>
                            <span className="font-semibold">{sceneHeading(scene)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
                            {pageNumbers.length > 0 && (
                              <span>
                                {pageNumbers.length === 1 ? `p${pageNumbers[0]}` : `pp${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]}`}
                                {scene.page_eighths != null && ` · ${formatPageEighths(scene.page_eighths)} pg`}
                              </span>
                            )}
                            <span>
                              {covered} of {live.length} section{live.length === 1 ? '' : 's'} covered
                            </span>
                            {unsectioned > 0 && (
                              <span className="text-amber-500">
                                {unsectioned} line{unsectioned === 1 ? '' : 's'} not in any section
                              </span>
                            )}
                          </div>
                          {layout && layout.lines.length > 0 && (
                            <SceneMeter layout={layout} statusOf={(id) => views.get(id)?.status ?? null} codeOf={(id) => views.get(id)?.code ?? ''} />
                          )}
                        </div>
                        <div className="grid px-2 pb-2.5" role="listbox" aria-label={`Sections in scene ${scene.scene_number}`}>
                          {visible.length === 0 && (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">No sections yet.</p>
                          )}
                          {visible.map((view) => {
                            const isSelected = view.section.id === selectedSectionId
                            const hasConflict = conflictSectionIds.has(view.section.id)
                            return (
                              <div
                                key={view.section.id}
                                role="option"
                                tabIndex={0}
                                aria-selected={isSelected}
                                onClick={() => setSelectedSectionId(isSelected ? null : view.section.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setSelectedSectionId(isSelected ? null : view.section.id)
                                  }
                                }}
                                className={cn(
                                  'grid cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-md border border-transparent p-2 hover:bg-secondary',
                                  isSelected && 'border-primary/45 bg-primary/10 hover:bg-primary/10',
                                  hasConflict && 'border-destructive/60'
                                )}
                              >
                                <span className={cn('font-mono text-[13px] text-muted-foreground', isSelected && 'text-primary')}>
                                  {view.code}
                                </span>
                                <SectionSummary
                                  rangeText={view.rangeText}
                                  lengthText={view.lengthText}
                                  estimated={view.estimated}
                                  characters={view.characters}
                                  cut={view.status === 'cut'}
                                  extra={
                                    hasConflict && (
                                      <span className="ml-1.5 text-xs text-destructive">Overlaps another section</span>
                                    )
                                  }
                                />
                                <SectionStatusBadge status={view.status} label={view.statusLabel} />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0 text-muted-foreground"
                                  aria-label={`Edit section ${view.code}`}
                                  title="Edit section"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEdit(view.section)
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>

                {/* Selected section + script */}
                <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
                  {selectedView ? (
                    <SectionDetail
                      view={selectedView}
                      sceneNumber={sceneById.get(selectedView.section.scene_id)?.scene_number ?? ''}
                      unlinkedShots={unlinkedSceneShots.map((s) => s.shot_number)}
                      onEdit={() => openEdit(selectedView.section)}
                    />
                  ) : (
                    <p className="border-b border-border px-4 py-3.5 text-sm text-muted-foreground">
                      Select a section to highlight it in the script and see its shots.
                    </p>
                  )}
                  <div ref={scriptScrollRef} className="relative max-h-[58vh] overflow-y-auto bg-background/40 pb-4">
                    {panelScenes.length === 0 && (
                      <p className="p-4 text-sm text-muted-foreground">No page text available for this version.</p>
                    )}
                    {panelScenes.map((scene) => {
                      const layout = layoutBySceneId.get(scene.id)
                      if (!layout) return null
                      const selectedLines = selectedView?.section.scene_id === scene.id
                        ? new Set(selectedView.runs.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, k) => r.from + k)))
                        : null
                      return (
                        <div key={scene.id} data-scene={scene.id}>
                          {panelScenes.length > 1 && (
                            <p className="px-4 pt-3 text-xs font-semibold text-muted-foreground">
                              Scene {scene.scene_number} — {sceneHeading(scene)}
                            </p>
                          )}
                          <ScriptLines
                            lines={layout.lines}
                            decorate={(line) => {
                              const status = ownerStatus(scene.id, line.index)
                              return {
                                bandClassName: status ? STATUS_FILL_CLASS[status] : undefined,
                                textClassName: selectedLines?.has(line.index) ? 'bg-primary/20' : undefined,
                              }
                            }}
                            onLineClick={(line) => {
                              const owner = ownerOf(scene.id, line.index)
                              if (owner) setSelectedSectionId(owner)
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <ScriptSectionEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogDeferred()
          else setDialogOpen(true)
        }}
        mode={dialogMode}
        section={editingSection}
        initialSceneId={
          selectedSceneFilterId !== ALL_SCENES ? selectedSceneFilterId : selectedView?.section.scene_id ?? null
        }
        scenes={sceneOptions}
        sections={sections}
        sectionCodes={sectionCodes}
        rangesBySectionId={rangesBySectionId}
        charactersBySectionId={charactersBySectionId}
        pages={pages}
        shotsBySectionId={shotsBySectionId}
        omittedSceneIds={omittedSceneIds}
        pending={saveMutation.isPending || deleteMutation.isPending}
        error={dialogOpen ? mutationError : null}
        onSave={(save) => {
          setMutationError(null)
          saveMutation.mutate(save)
        }}
        onDelete={(sectionId) => {
          setMutationError(null)
          deleteMutation.mutate(sectionId)
        }}
      />

      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revision reconciliation</DialogTitle>
            <DialogDescription>
              Comparison between the previous script version and this revision. Shot links are not
              changed until you apply safe remaps.
            </DialogDescription>
          </DialogHeader>
          {reconcileReport && <ReconciliationSummary report={reconcileReport} />}
          {reconcileMessage && (
            <p className="text-sm text-muted-foreground" role="status">
              {reconcileMessage}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReconcileOpen(false)}>
              Close
            </Button>
            <Button
              disabled={
                !reconcileReport ||
                reconcileReport.remappableShotLinks.length === 0 ||
                applyRemapsMutation.isPending
              }
              onClick={() => reconcileReport && applyRemapsMutation.mutate(reconcileReport)}
            >
              Apply safe shot link remaps
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Segmented bar of the scene's lines, one segment per section in script order. */
function SceneMeter({
  layout,
  statusOf,
  codeOf,
}: {
  layout: SceneLayout
  statusOf: (sectionId: string) => DerivedSectionStatus | null
  codeOf: (sectionId: string) => string
}) {
  const owners = ownerByLine(layout)
  const segments: Array<{ key: string; owner: string | null; count: number }> = []
  for (const line of layout.lines) {
    const owner = owners.get(line.index) ?? null
    // Blank lines between sections are not gaps in coverage.
    if (!owner && !line.text.trim()) continue
    const last = segments[segments.length - 1]
    if (last && last.owner === owner) last.count++
    else segments.push({ key: `${line.index}`, owner, count: 1 })
  }
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {segments.map((seg) => {
        const status = seg.owner ? statusOf(seg.owner) : null
        return (
          <i
            key={seg.key}
            title={seg.owner ? codeOf(seg.owner) : 'Not in any section'}
            className={cn('block min-w-[3px]', status ? STATUS_FILL_CLASS[status] : 'bg-[repeating-linear-gradient(135deg,oklch(0.77_0.16_70)_0_2px,transparent_2px_5px)]')}
            style={{ flexGrow: seg.count }}
          />
        )
      })}
    </div>
  )
}

function SectionDetail({
  view,
  sceneNumber,
  unlinkedShots,
  onEdit,
}: {
  view: SectionView
  sceneNumber: string
  unlinkedShots: string[]
  onEdit: () => void
}) {
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="font-mono text-lg font-semibold text-primary">{view.code}</span>
        <span className="tabular-nums">
          {view.rangeText}
          {view.lengthText && <span className="ml-1.5 text-sm text-muted-foreground">{view.lengthText}</span>}
        </span>
        <SectionStatusBadge status={view.status} label={view.statusLabel} />
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </div>
      {view.status === 'cut' ? (
        <p className="text-sm text-muted-foreground">
          This section is cut. It stays here for reference and is left out of coverage, scheduling and sides.
        </p>
      ) : (
        <SectionStatusSteps steps={sectionStatusSteps(view.shots)} />
      )}
      {view.shots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Shot</th>
                <th className="py-1 pr-2 font-medium">Shoot day</th>
                <th className="py-1 font-medium">Script supervisor</th>
              </tr>
            </thead>
            <tbody>
              {view.shots.map((shot) => (
                <tr key={shot.shotId} className="border-b border-border/50 last:border-b-0">
                  <td className="py-1 pr-2">{shot.shotNumber}</td>
                  <td className={cn('py-1 pr-2', shot.shootDays.length === 0 && 'text-muted-foreground')}>
                    {shot.shootDays.length
                      ? shot.shootDays.map((d) => `${formatShootDay(d)} · ${d.shootDate}`).join(', ')
                      : 'Not scheduled'}
                  </td>
                  <td className={cn('py-1', !shot.printedTakes.length && !shot.sceneComplete && 'text-muted-foreground')}>
                    {shot.printedTakes.length
                      ? `Printed · ${shot.printedTakes.join(', ')}`
                      : shot.sceneComplete
                        ? 'Scene marked complete'
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unlinkedShots.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Shots in scene {sceneNumber} not linked to any section:{' '}
          <span className="text-amber-500">{unlinkedShots.join(', ')}</span>
        </p>
      )}
    </div>
  )
}
