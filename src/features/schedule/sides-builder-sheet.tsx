import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  buildSidesDraftModel,
  defaultSidesFilters,
  isSectionSelected,
  loadSidesBuilderSource,
  type SidesFilters,
  type SidesPreviewGroup,
  type SidesSectionEntry,
  type SidesSelectionState,
} from '@/lib/db/sidesBuilderService'
import { exportShootDaySides } from '@/lib/db/sidesExportService'
import { analyzeSidesBuilderCoverage } from '@/lib/db/coverageAnalysisService'
import { getFileUrl, openInSystem } from '@/lib/files'
import { CoverageIssuesList, CoverageIssuesSummary } from './coverage-issues-list'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { SbRemoteNotice } from './sbRemoteNotice'

const FILTER_ALL = '__all__'

function formatDate(date: string | null): string {
  if (!date) return 'Shoot day'
  return date
}

function sectionLabel(entry: SidesSectionEntry): string {
  const label = entry.section.label?.trim()
  if (label) return label
  return 'Section'
}

/**
 * SB6 — Daily Sides Builder. Assembles the SB5-derived script sections for a shoot day and lets the
 * user filter, include/exclude, and preview sections before an export handoff. Read-only: filters
 * user filter, include/exclude, preview, and export sides PDFs to the document store.
 */
export function SidesBuilderSheet({
  open,
  onOpenChange,
  shootDayId,
  shootDayUnitId = null,
  shootDate,
  unitName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootDayId: string
  shootDayUnitId?: string | null
  shootDate?: string | null
  unitName?: string | null
}) {
  const [filters, setFilters] = useState<SidesFilters>(defaultSidesFilters)
  // TODO(SB6 persistence): draft selection is local-only this phase. Persist via a typed sides-draft
  // table once SB1 adds one (shoot_day_sides_exports stores completed exports, not in-progress drafts).
  const [selection, setSelection] = useState<SidesSelectionState>({ overrides: {} })
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    setFilters(defaultSidesFilters())
    setSelection({ overrides: {} })
    setExportError(null)
  }, [shootDayId, shootDayUnitId])

  const { data: source, isLoading, isError } = useQuery({
    queryKey: ['sides-builder', shootDayId, shootDayUnitId],
    queryFn: () => loadSidesBuilderSource(shootDayId, { shootDayUnitId }),
    enabled: open && !!shootDayId,
  })

  const model = useMemo(
    () => (source ? buildSidesDraftModel(source, filters, selection) : null),
    [source, filters, selection]
  )

  const coverage = useMemo(() => {
    if (!source || !model) return null
    return analyzeSidesBuilderCoverage(source, model.selectedSectionIds)
  }, [source, model])

  const { dataSourceKey } = useEffectiveDataSourceForProduction(source?.productionId ?? null)
  const isRemoteProduction = dataSourceKey === 'remote_server'

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!source || !model) throw new Error('Sides are not ready to export.')
      return exportShootDaySides({ source, model, filters })
    },
    onError: (e) => {
      setExportError(e instanceof Error ? e.message : 'Export failed.')
      console.error('Sides export failed', e)
    },
    onSuccess: () => setExportError(null),
  })

  const openExportedPdf = async (filePath: string) => {
    const url = await getFileUrl(filePath)
    await openInSystem(url)
  }

  const filterOptions = useMemo(() => {
    const entries = source?.entries ?? []
    const episodes = new Map<string, string>()
    const scenes = new Map<string, string>()
    const locations = new Map<string, string>()
    const units = new Map<string, string>()
    const characters = new Set<string>()
    for (const entry of entries) {
      if (entry.episodeId) episodes.set(entry.episodeId, entry.episodeName ?? entry.episodeId)
      scenes.set(
        entry.scene.id,
        `${entry.scene.scene_number}${entry.scene.title ? ` — ${entry.scene.title}` : ''}`
      )
      if (entry.locationId) locations.set(entry.locationId, entry.locationName ?? entry.locationId)
      if (entry.unitId) units.set(entry.unitId, source?.unitName ?? entry.unitId)
      for (const name of entry.characterNames) characters.add(name)
    }
    return {
      episodes: [...episodes.entries()],
      scenes: [...scenes.entries()],
      locations: [...locations.entries()],
      units: [...units.entries()],
      characters: [...characters].sort((a, b) => a.localeCompare(b)),
    }
  }, [source])

  const toggleSection = (sectionId: string, included: boolean) => {
    exportMutation.reset()
    setSelection((prev) => ({ overrides: { ...prev.overrides, [sectionId]: included } }))
  }

  const updateFilter = <K extends keyof SidesFilters>(key: K, value: SidesFilters[K]) => {
    exportMutation.reset()
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const blocked = model?.validation.some((w) => w.blocking) ?? true

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        variant="floating"
        className="w-full sm:max-w-3xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Daily Sides Builder</SheetTitle>
          <SheetDescription>
            {formatDate(shootDate ?? source?.shootDate ?? null)}
            {(unitName ?? source?.unitName) ? ` · ${unitName ?? source?.unitName}` : ''}
            {source && source.scriptVersionIds.length > 0 && (
              <>
                {' · '}
                Script:{' '}
                {source.scriptVersionIds
                  .map((id) => source.scriptVersionLabelsById[id] ?? id)
                  .join(', ')}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
        {isRemoteProduction && (
          <div className="px-4 pt-4">
            <SbRemoteNotice />
          </div>
        )}

        {exportError && (
          <p role="alert" className="mx-4 mt-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {exportError}
          </p>
        )}

        {isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Building sides…
          </p>
        ) : isError || !source || !model ? (
          <p className="p-4 text-sm text-muted-foreground">
            Unable to build sides for this day.
          </p>
        ) : (
          <div className="space-y-4 p-4">
            {/* Summary header */}
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Scheduled scenes" value={source.scheduledSceneIds.length} />
              <Stat label="Sections" value={source.entries.length} />
              <Stat label="Selected" value={model.selectedSectionIds.length} />
              <Stat label="Est. eighths" value={`~${model.totalEstimatedEighths}/8`} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Page and eighth figures are estimated/best-effort. Partial scenes and omitted sections
              are marked below.
            </p>

            {source.sb5Warnings.length > 0 && (
              <ul className="space-y-2">
                {source.sb5Warnings.map((warning, index) => (
                  <li
                    key={`${warning.code}-${warning.sectionId ?? warning.shotId ?? warning.sceneId ?? index}`}
                    className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">{warning.message}</p>
                  </li>
                ))}
              </ul>
            )}

            {/* Filters */}
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Filters
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filterOptions.units.length > 1 && (
                  <FilterSelect
                    label="Unit"
                    value={filters.unitId}
                    options={filterOptions.units}
                    onChange={(v) => updateFilter('unitId', v)}
                  />
                )}
                {filterOptions.episodes.length > 0 && (
                  <FilterSelect
                    label="Episode"
                    value={filters.episodeId}
                    options={filterOptions.episodes}
                    onChange={(v) => updateFilter('episodeId', v)}
                  />
                )}
                {filterOptions.scenes.length > 0 && (
                  <FilterSelect
                    label="Scene"
                    value={filters.sceneId}
                    options={filterOptions.scenes}
                    onChange={(v) => updateFilter('sceneId', v)}
                  />
                )}
                {filterOptions.characters.length > 0 && (
                  <FilterSelect
                    label="Character"
                    value={filters.characterName}
                    options={filterOptions.characters.map((c) => [c, c] as [string, string])}
                    onChange={(v) => updateFilter('characterName', v)}
                  />
                )}
                {filterOptions.locations.length > 0 && (
                  <FilterSelect
                    label="Location"
                    value={filters.locationId}
                    options={filterOptions.locations}
                    onChange={(v) => updateFilter('locationId', v)}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={filters.linkedShotOnly}
                    onCheckedChange={(c) => updateFilter('linkedShotOnly', c === true)}
                  />
                  Linked-shot sections only
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={filters.fullScheduledScenesOnly}
                    onCheckedChange={(c) => updateFilter('fullScheduledScenesOnly', c === true)}
                  />
                  Full scheduled scenes only
                </label>
              </div>
            </div>

            {/* Include / exclude list */}
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Sections ({model.filteredEntries.length})
              </p>
              {model.filteredEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sections match the current filters.</p>
              ) : (
                <ul className="space-y-1">
                  {model.filteredEntries.map((entry) => {
                    const checked = isSectionSelected(entry.sectionId, selection)
                    return (
                      <li
                        key={entry.sectionId}
                        className="flex items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          aria-label={`Include ${sectionLabel(entry)}`}
                          onCheckedChange={(c) => toggleSection(entry.sectionId, c === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-foreground">{sectionLabel(entry)}</span>
                            <span className="text-muted-foreground">
                              Sc {entry.scene.scene_number}
                            </span>
                            <SectionBadges entry={entry} />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Preview */}
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Preview
              </p>
              {model.groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sections selected for preview.</p>
              ) : (
                model.groups.map((group) => (
                  <PreviewGroup key={group.episodeId ?? '__no_episode__'} group={group} />
                ))
              )}
            </div>

            {/* Coverage */}
            {coverage && (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Coverage
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <Stat label="Scheduled sections" value={coverage.includedSections + coverage.fallbackSections} />
                  <Stat label="Selected for sides" value={coverage.selectedSidesSections} />
                  <Stat label="Not in sides" value={Math.max(0, coverage.includedSections + coverage.fallbackSections - coverage.selectedSidesSections)} />
                  <Stat label="Unscheduled selected" value={coverage.unscheduledSelectedSections} />
                  <Stat label="Missing scenes" value={coverage.missingSections} />
                </div>
                <CoverageIssuesSummary
                  issues={coverage.issues.filter(
                    (i) =>
                      i.code === 'scheduled_section_not_in_sides' ||
                      i.code === 'sides_section_not_scheduled' ||
                      i.code === 'partial_scene_coverage' ||
                      i.code === 'scene_no_sections' ||
                      i.code === 'scheduled_shot_no_section'
                  )}
                />
                <CoverageIssuesList
                  issues={coverage.issues.filter(
                    (i) =>
                      i.code === 'scheduled_section_not_in_sides' ||
                      i.code === 'sides_section_not_scheduled' ||
                      i.code === 'partial_scene_coverage' ||
                      i.code === 'scene_no_sections' ||
                      i.code === 'scheduled_shot_no_section' ||
                      i.code === 'scene_fallback_full_scene'
                  )}
                />
              </div>
            )}

            {/* Validation + export handoff */}
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Validation
              </p>
              {model.validation.length === 0 ? (
                <p className="text-xs text-muted-foreground">No issues. Ready for export.</p>
              ) : (
                <ul className="space-y-2">
                  {model.validation.map((warning, index) => (
                    <li
                      key={`${warning.code}-${warning.sectionId ?? warning.shotId ?? index}`}
                      className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${
                        warning.blocking
                          ? 'border-destructive/40 bg-destructive/10'
                          : 'border-amber-500/30 bg-amber-500/10'
                      }`}
                    >
                      <AlertTriangle
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          warning.blocking
                            ? 'text-destructive'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      />
                      <p
                        className={`text-xs ${
                          warning.blocking
                            ? 'text-destructive'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {warning.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  size="sm"
                  disabled={isRemoteProduction || blocked || exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  {exportMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Exporting…
                    </>
                  ) : (
                    'Export sides PDF'
                  )}
                </Button>
                {exportMutation.isSuccess && exportMutation.data && (
                  <>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      Sides exported and saved to documents.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openExportedPdf(exportMutation.data.document.file_path)}
                    >
                      <ExternalLink className="size-4" /> Open sides PDF
                    </Button>
                  </>
                )}
                {exportMutation.isError && (
                  <span className="text-xs text-destructive">
                    Export failed. No export was recorded — please try again.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/40 px-2 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: Array<[string, string]>
  onChange: (value: string | null) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? FILTER_ALL}
        onValueChange={(v) => onChange(v === FILTER_ALL ? null : v)}
      >
        <SelectTrigger className="bg-input border-border h-8">
          <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_ALL}>All {label.toLowerCase()}s</SelectItem>
          {options.map(([id, optionLabel]) => (
            <SelectItem key={id} value={id}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SectionBadges({ entry }: { entry: SidesSectionEntry }) {
  return (
    <>
      <Badge variant={entry.origin === 'included' ? 'secondary' : 'outline'} className="text-[10px]">
        {entry.origin === 'included' ? 'shot-linked' : 'full scene'}
      </Badge>
      {entry.isPartialScene && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
          partial
        </Badge>
      )}
      {entry.isViaShotsOnly && (
        <Badge variant="outline" className="text-[10px]">
          via shots
        </Badge>
      )}
      {entry.isEstimated && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
          estimated
        </Badge>
      )}
      {entry.section.status === 'omitted' && (
        <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px]">
          omitted
        </Badge>
      )}
    </>
  )
}

function PreviewGroup({ group }: { group: SidesPreviewGroup }) {
  return (
    <div className="space-y-2">
      {group.episodeName && (
        <p className="text-xs font-semibold text-foreground">{group.episodeName}</p>
      )}
      {group.scenes.map((sceneGroup) => (
        <div key={sceneGroup.scene.id} className="rounded-md border border-border/40 p-2.5">
          <p className="text-sm font-medium text-foreground">
            Sc {sceneGroup.scene.scene_number}
            {sceneGroup.scene.heading || sceneGroup.scene.title
              ? ` — ${sceneGroup.scene.heading ?? sceneGroup.scene.title}`
              : ''}
          </p>
          {sceneGroup.collatedScriptText ? (
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-border/30 bg-muted/20 p-2 font-mono text-[11px] text-foreground">
              {sceneGroup.collatedScriptText}
            </pre>
          ) : (
            <p className="mt-2 text-[11px] italic text-muted-foreground">
              No script text available (best-effort).
            </p>
          )}
          {sceneGroup.entries.some((e) => e.isEstimated) && sceneGroup.collatedScriptText && (
            <p className="mt-1 text-[10px] italic text-amber-600 dark:text-amber-400">
              Best-effort text; exact range unavailable.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
