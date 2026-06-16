import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
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
  createSectionWithRangesAndCharacters,
  getLinkedSectionCountsByShotIds,
  getLinkedShotCountsBySectionIds,
  listCharactersBySection,
  listRangesBySection,
  listSectionsByScriptVersion,
  listShotsBySection,
  replaceSectionCharacters,
  replaceSectionRanges,
  softDeleteSectionWithChildren,
  updateScriptSection,
} from '@/lib/db/repositories/scriptSections'
import type {
  Scene,
  ScriptSection,
  ScriptSectionCharacter,
  ScriptSectionRange,
} from '@/lib/db/types'
import { sceneDisplayLabel } from '@/lib/schedule/sceneDisplay'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
import {
  EMPTY_SECTION_VALUES,
  ScriptSectionEditDialog,
  formatSectionStatus,
  type SceneOption,
  type SectionEditorValues,
} from './script-section-edit-dialog'
import { CoverageIssuesList, CoverageIssuesSummary } from './coverage-issues-list'
import { SbRemoteNotice } from './sbRemoteNotice'
import { loadSceneCoverage } from '@/lib/db/coverageAnalysisService'
import type { ScriptSectionRangeInput } from '@/lib/db/repositories/scriptSections'
import { enrichRangeWithPageOffsets } from '@/lib/db/scriptEighthSplitService'
import {
  conflictingSectionIds,
  findOverlappingSectionPairs,
} from '@/lib/db/scriptSectionMatching'
import { parseLeadingPageNumber } from '@/lib/db/sidesBuilderService'
import {
  formatScriptSectionRange,
  ScriptSectionScriptPanel,
} from './script-section-script-panel'

const SELECT_NONE = '__none__'
const ALL_SCENES = '__all_scenes__'
/** Match the schedule dialog exit-animation delay used elsewhere. */
const SCHEDULE_DIALOG_EXIT_MS = 200

type SectionDetail = { ranges: ScriptSectionRange[]; characters: ScriptSectionCharacter[] }
type DetailMap = Record<string, SectionDetail>

function sceneLabel(scene: Scene, locationName?: string | null): string {
  return `Scene ${scene.scene_number} — ${sceneDisplayLabel(scene, locationName ?? null)}`
}

function buildRangeInput(values: SectionEditorValues): ScriptSectionRangeInput | null {
  const hasAny =
    values.start_page.trim() || values.end_page.trim() || values.start_eighth.trim() || values.end_eighth.trim()
  if (!hasAny) return null
  return {
    start_page: values.start_page.trim() || null,
    start_eighth: values.start_eighth.trim() ? Number(values.start_eighth) : null,
    end_page: values.end_page.trim() || null,
    end_eighth: values.end_eighth.trim() ? Number(values.end_eighth) : null,
  }
}

function sectionToValues(section: ScriptSection, detail: SectionDetail | undefined): SectionEditorValues {
  const range = detail?.ranges[0]
  return {
    scene_id: section.scene_id,
    label: section.label ?? '',
    status: section.status,
    notes: section.notes ?? '',
    start_page: range?.start_page ?? '',
    start_eighth: range?.start_eighth != null ? String(range.start_eighth) : '',
    end_page: range?.end_page ?? '',
    end_eighth: range?.end_eighth != null ? String(range.end_eighth) : '',
    characterNames: (detail?.characters ?? []).map((c) => c.character_name ?? '').filter(Boolean),
  }
}

function enrichRangeForSave(
  range: ScriptSectionRangeInput | null,
  pages: Array<{ page_number: string | null; page_index: number; content: string | null }>
): ScriptSectionRangeInput | null {
  if (!range) return null
  return enrichRangeWithPageOffsets(range, pages, parseLeadingPageNumber) as ScriptSectionRangeInput
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
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingSection, setEditingSection] = useState<ScriptSection | null>(null)
  const [dialogInitialValues, setDialogInitialValues] = useState<SectionEditorValues>(EMPTY_SECTION_VALUES)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileReport, setReconcileReport] = useState<ScriptSectionReconciliationReport | null>(null)
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null)

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

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const loc of locations) {
      map.set(loc.id, loc.name)
    }
    return map
  }, [locations])

  const getLocationName = useCallback(
    (locationId: string | null) => (locationId ? locationNameById.get(locationId) ?? null : null),
    [locationNameById]
  )

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

  const sectionIdsKey = sections.map((s) => s.id).join(',')
  const { data: details = {} } = useQuery<DetailMap>({
    queryKey: ['script-section-details', selectedVersionId, sectionIdsKey],
    queryFn: async () => {
      const map: DetailMap = {}
      for (const s of sections) {
        map[s.id] = {
          ranges: await listRangesBySection(s.id),
          characters: await listCharactersBySection(s.id),
        }
      }
      return map
    },
    enabled: !!selectedVersionId && sections.length > 0,
  })

  const { data: sectionShotCounts = new Map<string, number>() } = useQuery({
    queryKey: ['section-shot-counts', selectedVersionId, sectionIdsKey],
    queryFn: () => getLinkedShotCountsBySectionIds(sections.map((s) => s.id)),
    enabled: !!selectedVersionId && sections.length > 0,
  })

  // Default to the most recent version once versions load.
  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional default selection once versions load
      setSelectedVersionId(versions[0]!.id)
    }
  }, [versions, selectedVersionId])

  const sceneOptions: SceneOption[] = useMemo(
    () => scenes.map((s) => ({ id: s.id, label: sceneLabel(s, getLocationName(s.location_id)) })),
    [scenes, getLocationName]
  )
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])

  const sceneFilterOptions = useMemo(() => {
    const sceneIds = [...new Set(sections.map((s) => s.scene_id))]
    return sceneIds
      .map((id) => sceneById.get(id))
      .filter((s): s is Scene => s != null)
      .sort((a, b) => a.scene_number.localeCompare(b.scene_number, undefined, { numeric: true }))
  }, [sections, sceneById])

  const filteredSections = useMemo(() => {
    if (selectedSceneFilterId === ALL_SCENES) return sections
    return sections.filter((s) => s.scene_id === selectedSceneFilterId)
  }, [sections, selectedSceneFilterId])

  const sectionsCountLabel = useMemo(() => {
    if (sections.length === 0) return ''
    if (selectedSceneFilterId === ALL_SCENES) return ` (${sections.length})`
    return ` (${filteredSections.length} of ${sections.length})`
  }, [sections.length, selectedSceneFilterId, filteredSections.length])

  // Reset scene filter when the selected scene no longer has sections in this version.
  useEffect(() => {
    if (selectedSceneFilterId === ALL_SCENES) return
    const stillValid = sections.some((s) => s.scene_id === selectedSceneFilterId)
    if (!stillValid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale filter when version data changes
      setSelectedSceneFilterId(ALL_SCENES)
    }
  }, [sections, selectedSceneFilterId])

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null
  const latestVersionId = versions[0]?.id ?? null
  const isViewingOlderRevision =
    !!selectedVersionId && !!latestVersionId && selectedVersionId !== latestVersionId

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
      queryClient.invalidateQueries({ queryKey: ['section-shot-counts'] })
      queryClient.invalidateQueries({ queryKey: ['shot-section-counts'] })
    },
    onError: (e) => setReconcileMessage(e instanceof Error ? e.message : 'Could not apply remaps.'),
  })

  const invalidateSections = () => {
    queryClient.invalidateQueries({ queryKey: ['script-sections', selectedVersionId] })
    queryClient.invalidateQueries({ queryKey: ['script-section-details', selectedVersionId] })
  }

  const createMutation = useMutation({
    mutationFn: async (values: SectionEditorValues) => {
      if (!currentProductionId || !selectedVersionId) throw new Error('No production or script version selected.')
      const range = enrichRangeForSave(buildRangeInput(values), pages)
      const characters = values.characterNames
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ character_name: name }))
      await createSectionWithRangesAndCharacters({
        production_id: currentProductionId,
        script_version_id: selectedVersionId,
        scene_id: values.scene_id,
        section_type: 'custom',
        status: values.status,
        label: values.label.trim() || null,
        notes: values.notes.trim() || null,
        is_manual: true,
        ranges: range ? [range] : [],
        characters,
      })
    },
    onSuccess: () => {
      invalidateSections()
      closeDialogDeferred()
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not create section.'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: SectionEditorValues) => {
      const section = editingSection
      if (!section) throw new Error('No section selected.')
      const isGenerated = section.is_manual === 0
      if (isGenerated) {
        await updateScriptSection(section.id, { status: values.status, notes: values.notes.trim() || null })
        const range = enrichRangeForSave(buildRangeInput(values), pages)
        if (range) {
          await replaceSectionRanges(section.id, [range], { markUserEdited: true })
        }
        return
      }
      await updateScriptSection(section.id, {
        label: values.label.trim() || null,
        status: values.status,
        notes: values.notes.trim() || null,
      })
      const range = enrichRangeForSave(buildRangeInput(values), pages)
      await replaceSectionRanges(section.id, range ? [range] : [])
      await replaceSectionCharacters(
        section.id,
        values.characterNames
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => ({ character_name: name }))
      )
    },
    onSuccess: () => {
      invalidateSections()
      closeDialogDeferred()
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not save section.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (sectionId: string) => softDeleteSectionWithChildren(sectionId),
    onSuccess: (_data, sectionId) => {
      if (selectedSectionId === sectionId) setSelectedSectionId(null)
      invalidateSections()
      queryClient.invalidateQueries({ queryKey: ['section-shot-counts'] })
      queryClient.invalidateQueries({ queryKey: ['shot-section-counts'] })
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : 'Could not delete section.'),
  })

  const closeDialogDeferred = () => {
    setDialogOpen(false)
    window.setTimeout(() => {
      setEditingSection(null)
      setDialogInitialValues(EMPTY_SECTION_VALUES)
    }, SCHEDULE_DIALOG_EXIT_MS)
  }

  const handleSceneFilterChange = (value: string) => {
    setSelectedSceneFilterId(value)
    if (value !== ALL_SCENES && selectedSectionId) {
      const section = sections.find((s) => s.id === selectedSectionId)
      if (section && section.scene_id !== value) {
        setSelectedSectionId(null)
      }
    }
  }

  const openCreate = () => {
    setMutationError(null)
    setDialogMode('create')
    setEditingSection(null)
    setDialogInitialValues(
      selectedSceneFilterId !== ALL_SCENES
        ? { ...EMPTY_SECTION_VALUES, scene_id: selectedSceneFilterId }
        : EMPTY_SECTION_VALUES
    )
    setDialogOpen(true)
  }

  const openEdit = (section: ScriptSection) => {
    setMutationError(null)
    setDialogMode('edit')
    setEditingSection(section)
    setDialogInitialValues(sectionToValues(section, details[section.id]))
    setDialogOpen(true)
  }

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null
  const selectedRange = details[selectedSection?.id ?? '']?.ranges[0]

  const rangeBySectionId = useMemo(() => {
    const map = new Map<string, ScriptSectionRange | undefined>()
    for (const section of sections) {
      map.set(section.id, details[section.id]?.ranges[0])
    }
    return map
  }, [sections, details])

  const conflictPairs = useMemo(
    () => findOverlappingSectionPairs(sections, rangeBySectionId),
    [sections, rangeBySectionId]
  )
  const conflictSectionIds = useMemo(() => conflictingSectionIds(conflictPairs), [conflictPairs])

  const conflictRangesForSelected = useMemo(() => {
    if (!selectedSectionId) return [] as ScriptSectionRange[]
    const partnerIds = new Set<string>()
    for (const pair of conflictPairs) {
      if (pair.sectionAId === selectedSectionId) partnerIds.add(pair.sectionBId)
      else if (pair.sectionBId === selectedSectionId) partnerIds.add(pair.sectionAId)
    }
    return [...partnerIds]
      .map((id) => details[id]?.ranges[0])
      .filter((r): r is ScriptSectionRange => r != null)
  }, [selectedSectionId, conflictPairs, details])

  const selectedHasConflict = selectedSectionId != null && conflictSectionIds.has(selectedSectionId)

  const { data: linkedShotsForSection = [] } = useQuery({
    queryKey: ['section-linked-shots', selectedSectionId],
    queryFn: () => listShotsBySection(selectedSectionId!),
    enabled: !!selectedSectionId,
  })

  const selectedSceneId = selectedSection?.scene_id ?? null
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
  const uncoveredSceneShots = useMemo(
    () => sceneShots.filter((s) => (sceneShotSectionCounts.get(s.id) ?? 0) === 0),
    [sceneShots, sceneShotSectionCounts]
  )

  const { data: sceneCoverage } = useQuery({
    queryKey: ['scene-coverage', selectedSceneId],
    queryFn: () => loadSceneCoverage(selectedSceneId!),
    enabled: !!selectedSceneId,
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Script sections</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  const editingGenerated = dialogMode === 'edit' && editingSection?.is_manual === 0

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Schedule — Script sections</h1>

      {isRemoteProduction && <SbRemoteNotice />}

      {(versionsLoading || versionsError) && (
        <p role="alert" className="text-sm text-muted-foreground">
          {versionsLoading ? 'Loading script versions…' : 'Unable to load script versions.'}
        </p>
      )}

      {mutationError && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      )}

      {conflictPairs.length > 0 && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {conflictPairs.length} overlapping section range
          {conflictPairs.length === 1 ? '' : 's'} in this script version. Sections within the same
          scene cannot share page/eighth spans — adjust ranges or merge sections. Conflicting
          sections are outlined in red below.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="min-w-0 flex-1">
            <Label className="mb-2 block text-sm text-muted-foreground">Script version</Label>
            <Select
              value={selectedVersionId ?? SELECT_NONE}
              onValueChange={(v) => {
                setSelectedVersionId(v === SELECT_NONE ? null : v)
                setSelectedSceneFilterId(ALL_SCENES)
                setSelectedSectionId(null)
              }}
            >
              <SelectTrigger className="bg-input border-border" aria-label="Script version">
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
          <div className="min-w-0 flex-1">
            <Label className="mb-2 block text-sm text-muted-foreground">Scene</Label>
            <Select
              value={selectedSceneFilterId}
              onValueChange={handleSceneFilterChange}
              disabled={!selectedVersionId}
            >
              <SelectTrigger className="bg-input border-border" aria-label="Scene">
                <SelectValue placeholder="All scenes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SCENES}>All scenes</SelectItem>
                {sceneFilterOptions.map((scene) => (
                  <SelectItem key={scene.id} value={scene.id}>
                    {sceneLabel(scene, getLocationName(scene.location_id))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 md:justify-end">
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
        <p className="text-sm text-muted-foreground">
          {isRemoteProduction ? (
            'Script sections are not available for remote-server productions.'
          ) : (
            <>
              No script versions yet.{' '}
              <Link to="/schedule/script-import" className="underline underline-offset-2">
                Import a script
              </Link>{' '}
              to generate sections.
            </>
          )}
        </p>
      )}

      {selectedVersionId && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Sections list */}
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border py-2">
              <CardTitle className="text-base">
                Sections{sectionsCountLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {sections.length === 0 && <p className="text-sm text-muted-foreground">No sections in this version.</p>}
              {sections.length > 0 && filteredSections.length === 0 && (
                <p className="text-sm text-muted-foreground">No sections for this scene in this version.</p>
              )}
              {filteredSections.map((section) => {
                const detail = details[section.id]
                const isGenerated = section.is_manual === 0
                const scene = sceneById.get(section.scene_id)
                const isSelected = selectedSectionId === section.id
                const hasConflict = conflictSectionIds.has(section.id)
                return (
                  <div
                    key={section.id}
                    className={`rounded-md border p-3 ${
                      hasConflict
                        ? isSelected
                          ? 'border-destructive bg-destructive/10 outline outline-2 outline-destructive/60'
                          : 'border-destructive bg-destructive/5 outline outline-2 outline-destructive/40'
                        : isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedSectionId(isSelected ? null : section.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{section.label ?? 'Untitled section'}</span>
                          <Badge
                            variant={section.status === 'omitted' ? 'destructive' : 'secondary'}
                          >
                            {formatSectionStatus(section.status)}
                          </Badge>
                          <Badge variant={isGenerated ? 'outline' : 'default'}>
                            {isGenerated ? 'Generated' : 'Manual'}
                          </Badge>
                          {hasConflict && (
                            <Badge variant="destructive" className="outline outline-1 outline-destructive">
                              Overlap
                            </Badge>
                          )}
                          {(sectionShotCounts.get(section.id) ?? 0) > 0 ? (
                            <Badge variant="secondary">
                              {sectionShotCounts.get(section.id)} shot
                              {sectionShotCounts.get(section.id) === 1 ? '' : 's'}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 text-amber-500"
                              title="No shots are linked to this section yet"
                            >
                              No shots
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {scene ? sceneLabel(scene, getLocationName(scene.location_id)) : 'Unknown scene'} · {formatScriptSectionRange(detail?.ranges[0])}
                        </div>
                        {detail && detail.characters.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Characters: {detail.characters.map((c) => c.character_name).filter(Boolean).join(', ')}
                          </div>
                        )}
                        {section.notes && (
                          <div className="mt-1 text-xs text-muted-foreground italic">{section.notes}</div>
                        )}
                      </button>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(section)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
                          title={
                            isGenerated
                              ? 'Remove this generated section and any shot links to it.'
                              : undefined
                          }
                          onClick={() => deleteMutation.mutate(section.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
            </CardContent>
          </Card>

          {/* Script text panel */}
          <ScriptSectionScriptPanel
            pages={pages}
            previewSection={selectedSection}
            previewRange={selectedRange}
            conflictRanges={conflictRangesForSelected}
            subtitle={
              selectedSection
                ? `showing pages for “${selectedSection.label ?? 'section'}”${selectedHasConflict ? ' — overlap conflict' : ''}`
                : null
            }
          />
        </div>
      )}

      {selectedSection && sceneCoverage && (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border py-2">
            <CardTitle className="text-base">
              Scene coverage — {sceneById.get(selectedSection.scene_id)?.scene_number ?? 'scene'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              <CoverageStat label="Sections covered" value={`${sceneCoverage.coveredSections}/${sceneCoverage.totalSections}`} />
              <CoverageStat label="Coverage" value={`${sceneCoverage.coveragePercent}%`} />
              <CoverageStat label="Linked shots" value={`${sceneCoverage.linkedShots}/${sceneCoverage.linkedShots + sceneCoverage.unlinkedShots}`} />
              <CoverageStat label="Uncovered sections" value={sceneCoverage.uncoveredSections} />
              <CoverageStat label="Unlinked shots" value={sceneCoverage.unlinkedShots} />
              {sceneCoverage.isPartialScene && (
                <CoverageStat label="Scene length" value="Partial" />
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${sceneCoverage.coveragePercent}%` }}
              />
            </div>
            <CoverageIssuesSummary issues={sceneCoverage.issues} />
            {sceneCoverage.issues.length > 0 && (
              <CoverageIssuesList issues={sceneCoverage.issues} />
            )}
          </CardContent>
        </Card>
      )}

      {selectedSection && (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border py-2">
            <CardTitle className="text-base">
              Coverage for “{selectedSection.label ?? 'section'}”
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 md:grid-cols-2">
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">
                Shots linked to this section
              </Label>
              {linkedShotsForSection.length === 0 ? (
                <p className="text-sm text-amber-500">No shots cover this section yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {linkedShotsForSection.map((shot) => (
                    <Badge key={shot.id} variant="secondary">
                      Shot {shot.shot_number}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">
                Shots in this scene with no linked section
              </Label>
              {uncoveredSceneShots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every shot in this scene is linked to at least one section.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {uncoveredSceneShots.map((shot) => (
                    <Badge
                      key={shot.id}
                      variant="outline"
                      className="border-amber-500/50 text-amber-500"
                    >
                      Shot {shot.shot_number}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ScriptSectionEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogDeferred()
          else setDialogOpen(true)
        }}
        mode={dialogMode}
        editingGenerated={editingGenerated}
        scenes={sceneOptions}
        initialValues={dialogInitialValues}
        pending={createMutation.isPending || updateMutation.isPending}
        error={mutationError}
        onSubmit={(values) => {
          setMutationError(null)
          if (dialogMode === 'create') createMutation.mutate(values)
          else updateMutation.mutate(values)
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
    </div>
  )
}

function CoverageStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/40 px-2 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}
