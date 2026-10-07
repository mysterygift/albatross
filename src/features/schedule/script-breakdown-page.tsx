import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { breakdownCategory, breakdownCategoryOrder } from '@/lib/breakdown/categories'
import { buildSceneSheet, type SceneSheet } from '@/lib/breakdown/sceneSheet'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import {
  SCRIPT_BREAKDOWN_REMOTE_ERROR,
  carryBreakdownTagsForward,
  listBreakdownRevisionReview,
} from '@/lib/db/repositories/scriptBreakdown'
import { markRevisionItemReviewed } from '@/lib/db/repositories/scriptRevisions'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { formatScriptVersionLabel } from '@/lib/db/scriptSectionReconciliationService'
import type { BreakdownCategory, Scene } from '@/lib/db/types'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { documentsQueryKey, persistProductionDocument } from '@/lib/documents/persistDocument'
import { saveFileWithDialog } from '@/lib/files'
import { generateBreakdownReportPdf, generateSceneBreakdownPdf, type BreakdownReportRow } from '@/lib/pdf/scriptBreakdown'
import { sceneDisplayLabel } from '@/lib/schedule/sceneDisplay'
import { cn } from '@/lib/utils'
import { useScriptBreakdownData } from './script-breakdown-data'
import { BreakdownElementsPanel, type ElementRow } from './script-breakdown-elements'
import { CategoryLegend, BreakdownScriptPanel } from './script-breakdown-script'
import { BreakdownSheet } from './script-breakdown-sheet'
import { SbRemoteNotice } from './sbRemoteNotice'

type Tab = 'script' | 'sheet' | 'elements'

const SELECT_NONE = '__none__'

function versionPickerLabel(v: { version_label: string | null; revision_colour: string | null; title: string | null }): string {
  const label = v.version_label?.trim() || v.title?.trim() || 'Untitled version'
  return v.revision_colour?.trim() ? `${label} (${v.revision_colour})` : label
}

function fileSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'production'
}

export function ScriptBreakdownPage() {
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { dataSourceKey } = useEffectiveDataSourceForProduction(currentProductionId)
  const isRemote = dataSourceKey === 'remote_server'

  const [pickedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [pickedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('script')
  const [hidden, setHidden] = useState<Set<BreakdownCategory>>(new Set())
  const [focusElementId, setFocusElementId] = useState<string | null>(null)

  const versionsQ = useQuery({
    queryKey: ['script-versions', currentProductionId],
    queryFn: () => listScriptVersionsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const versions = useMemo(() => versionsQ.data ?? [], [versionsQ.data])
  // The latest draft until another is picked.
  const selectedVersionId = pickedVersionId ?? versions[0]?.id ?? null
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null
  // Versions are newest first; each episode has its own drafts.
  const latestInScope = selectedVersion ? versions.find((v) => v.episode_id === selectedVersion.episode_id) ?? null : null
  const isLatest = !!selectedVersionId && selectedVersionId === latestInScope?.id
  const readOnly = isRemote || !isLatest

  const data = useScriptBreakdownData(currentProductionId, selectedVersionId)
  const { versionScenes, layoutBySceneId, tagsBySceneId, elementsById, matchesByElementId, sceneIdsByElementId } = data

  const episodesQ = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: () => listEpisodesByProduction(currentProductionId!),
    enabled: !!currentProductionId && !!currentProduction?.is_episodic,
  })
  const episodeName = episodesQ.data?.find((e) => e.id === selectedVersion?.episode_id)?.name ?? null

  // Tags from earlier drafts follow the script onto the latest draft (once per tag).
  const carryQ = useQuery({
    queryKey: ['breakdown-carry', selectedVersionId],
    queryFn: () => carryBreakdownTagsForward(selectedVersionId!),
    enabled: !!selectedVersionId && isLatest && !isRemote,
    staleTime: Infinity,
  })
  useEffect(() => {
    const s = carryQ.data
    if (!s || s.carried + s.moved + s.unmatched === 0) return
    queryClient.invalidateQueries({ queryKey: ['breakdown-tags'] })
    queryClient.invalidateQueries({ queryKey: ['breakdown-revision-review'] })
    toast.success(`Breakdown carried to this draft: ${s.carried + s.moved} tags placed, ${s.moved + s.unmatched} to review`)
  }, [carryQ.data, queryClient])

  const reviewQ = useQuery({
    queryKey: ['breakdown-revision-review', selectedVersionId],
    queryFn: () => listBreakdownRevisionReview(selectedVersionId!),
    enabled: !!selectedVersionId && !isRemote,
  })
  const reviewed = useMutation({
    mutationFn: (id: string) => markRevisionItemReviewed(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['breakdown-revision-review'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  // The picked scene while it is in this version, otherwise the first scene.
  const selectedSceneId =
    pickedSceneId && versionScenes.some((s) => s.id === pickedSceneId) ? pickedSceneId : versionScenes[0]?.id ?? null

  const locationNameById = useMemo(() => new Map(data.locations.map((l) => [l.id, l.name])), [data.locations])
  const sceneHeading = useCallback(
    (scene: Scene) => sceneDisplayLabel(scene, scene.location_id ? locationNameById.get(scene.location_id) ?? null : null),
    [locationNameById]
  )
  const selectedScene = versionScenes.find((s) => s.id === selectedSceneId) ?? null
  const selectedLayout = selectedSceneId ? layoutBySceneId.get(selectedSceneId) ?? null : null

  const categoryCounts = useMemo(() => {
    const counts = new Map<BreakdownCategory, number>()
    for (const tag of tagsBySceneId.get(selectedSceneId ?? '') ?? []) {
      const c = elementsById.get(tag.element_id)?.category
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return counts
  }, [tagsBySceneId, selectedSceneId, elementsById])

  const sheetFor = useCallback(
    (scene: Scene): SceneSheet =>
      buildSceneSheet({
        production: { name: currentProduction?.name ?? '', production_code: currentProduction?.production_code ?? null },
        episodeName,
        scene,
        sceneOrdinal: versionScenes.indexOf(scene) + 1,
        sceneCount: versionScenes.length,
        pages: layoutBySceneId.get(scene.id)?.pages ?? [],
        locations: data.locations,
        tags: tagsBySceneId.get(scene.id) ?? [],
        elementsById,
        matchesByElementId,
      }),
    [currentProduction, episodeName, versionScenes, layoutBySceneId, data.locations, tagsBySceneId, elementsById, matchesByElementId]
  )

  const elementRows = useMemo((): ElementRow[] => {
    const sceneById = new Map(versionScenes.map((s) => [s.id, s]))
    return data.elements
      .filter((e) => sceneIdsByElementId.has(e.id))
      .map((element) => ({
        element,
        match: matchesByElementId.get(element.id)!,
        scenes: (sceneIdsByElementId.get(element.id) ?? []).map((id) => sceneById.get(id)!).filter(Boolean),
      }))
      .sort(
        (a, b) =>
          breakdownCategoryOrder(a.element.category) - breakdownCategoryOrder(b.element.category) ||
          a.element.name.localeCompare(b.element.name, undefined, { sensitivity: 'base' })
      )
  }, [data.elements, sceneIdsByElementId, matchesByElementId, versionScenes])

  const sceneSummary = useCallback(
    (sceneId: string) => {
      const elementIds = new Set((tagsBySceneId.get(sceneId) ?? []).map((t) => t.element_id))
      const categories = [...new Set([...elementIds].map((id) => elementsById.get(id)?.category).filter(Boolean))] as BreakdownCategory[]
      categories.sort((a, b) => breakdownCategoryOrder(a) - breakdownCategoryOrder(b))
      const sourced = [...elementIds].filter((id) => matchesByElementId.get(id)?.status === 'sourced').length
      return { categories, elements: elementIds.size, sourced }
    },
    [tagsBySceneId, elementsById, matchesByElementId]
  )

  // ─── Exports ──────────────────────────────────────────────────────────────
  const productionTitle = episodeName ? `${currentProduction?.name ?? ''} – ${episodeName}` : currentProduction?.name ?? ''
  const exportMutation = useMutation({
    mutationFn: async (args: { kind: 'sheets'; scenes: Scene[] } | { kind: 'report'; category: BreakdownCategory | null }) => {
      if (!currentProductionId || !selectedVersionId) return null
      let bytes: Uint8Array
      let fileName: string
      let entityType: string
      if (args.kind === 'sheets') {
        bytes = await generateSceneBreakdownPdf({ sheets: args.scenes.map(sheetFor) })
        const scenePart = args.scenes.length === 1 ? `scene-${fileSlug(args.scenes[0]!.scene_number)}` : 'all-scenes'
        fileName = `script-breakdown-${fileSlug(productionTitle)}-${scenePart}.pdf`
        entityType = DOCUMENT_ENTITY_TYPES.scriptBreakdownSheets
      } else {
        const rowsByCategory = new Map<BreakdownCategory, BreakdownReportRow[]>()
        for (const row of elementRows) {
          if (args.category && row.element.category !== args.category) continue
          const list = rowsByCategory.get(row.element.category) ?? []
          list.push({
            name: row.element.name,
            scenes: row.scenes.map((s) => s.scene_number),
            status: row.match.status,
            detail: row.match.detail,
            notes: row.element.notes,
          })
          rowsByCategory.set(row.element.category, list)
        }
        bytes = await generateBreakdownReportPdf({
          productionTitle,
          versionLabel: selectedVersion ? formatScriptVersionLabel(selectedVersion) : null,
          rowsByCategory,
        })
        const part = args.category ? fileSlug(breakdownCategory(args.category).label) : 'department-list'
        fileName = `script-breakdown-${fileSlug(productionTitle)}-${part}.pdf`
        entityType = DOCUMENT_ENTITY_TYPES.scriptBreakdownReport
      }
      await persistProductionDocument({
        productionId: currentProductionId,
        fileName,
        bytes,
        mimeType: 'application/pdf',
        entityType,
        entityId: selectedVersionId,
      })
      await saveFileWithDialog({ defaultPath: fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }], title: 'Export script breakdown' }, bytes)
      return fileName
    },
    onSuccess: (fileName) => {
      if (!fileName || !currentProductionId) return
      queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      toast.success('Saved to Documents › Script & sides')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const openScene = (sceneId: string) => {
    setSelectedSceneId(sceneId)
    setTab('script')
  }
  const openElement = (elementId: string) => {
    setFocusElementId(elementId)
    setTab('elements')
  }

  if (!currentProductionId) return <RequireProduction title="Script Breakdown">{null}</RequireProduction>

  const reviewItems = reviewQ.data ?? []
  return (
    <div className="space-y-4" data-touch-targets>
      <PageHeader
        title="Script Breakdown"
        description="Tag what each scene needs, check it against the production's databases and hand departments their lists."
      />
      {isRemote && <SbRemoteNotice message={SCRIPT_BREAKDOWN_REMOTE_ERROR} />}

      {versionsQ.isLoading && <Skeleton className="h-10 w-full" />}
      {versions.length === 0 && !versionsQ.isLoading && !isRemote && (
        <EmptyState
          title="No script yet"
          description="Import a script to break it down."
          action={
            <Button asChild>
              <Link to="/schedule/script-import">Import a script</Link>
            </Button>
          }
        />
      )}

      {selectedVersionId && !isRemote && (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">Script version</Label>
              <Select
                value={selectedVersionId ?? SELECT_NONE}
                onValueChange={(v) => {
                  setSelectedVersionId(v === SELECT_NONE ? null : v)
                  setSelectedSceneId(null)
                }}
              >
                <SelectTrigger className="bg-input border-border sm:w-64" aria-label="Script version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {versionPickerLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SegmentedControl<Tab>
              className="w-auto sm:w-96"
              ariaLabel="Breakdown view"
              value={tab}
              onValueChange={setTab}
              options={[
                { value: 'script', label: 'Script' },
                { value: 'sheet', label: 'Sheet' },
                { value: 'elements', label: 'Elements' },
              ]}
            />
          </div>

          {!isLatest && selectedVersion && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Viewing an older draft ({formatScriptVersionLabel(selectedVersion)}). Tags are added on the latest draft:{' '}
              {latestInScope ? formatScriptVersionLabel(latestInScope) : '—'}.
            </p>
          )}

          {reviewItems.length > 0 && (
            <section className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-sm" aria-label="Tags to review">
              <p className="mb-1.5 font-medium">
                {reviewItems.length} {reviewItems.length === 1 ? 'tag needs' : 'tags need'} a look after the new draft
              </p>
              <ul className="grid max-h-40 gap-1 overflow-y-auto">
                {reviewItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-sm" style={{ background: breakdownCategory(item.category).colour }} />
                    <span>
                      Sc {item.sceneNumber ?? '?'} · {breakdownCategory(item.category).label} › <b>{item.elementName}</b>{' '}
                      <span className="text-muted-foreground">
                        {item.outcome === 'unmatched' ? 'could not be placed' : 'was moved'} — {item.notes.join('; ')}
                      </span>
                    </span>
                    <span className="ml-auto flex gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => openScene(item.sceneId)}>
                        Go to scene
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={reviewed.isPending} onClick={() => reviewed.mutate(item.id)}>
                        Done
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.isLoading && <Skeleton className="h-64 w-full" />}

          {tab === 'elements' ? (
            <div className="rounded-lg border border-border bg-card">
              <BreakdownElementsPanel
                key={focusElementId ?? 'all'}
                rows={elementRows}
                focusElementId={focusElementId}
                readOnly={readOnly}
                exporting={exportMutation.isPending}
                onOpenScene={openScene}
                onExport={(category) => exportMutation.mutate({ kind: 'report', category })}
              />
            </div>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-[minmax(13rem,0.38fr)_minmax(0,1fr)] lg:grid-cols-[minmax(15rem,0.42fr)_minmax(0,1fr)]">
              <nav className="max-h-[74vh] overflow-y-auto rounded-lg border border-border bg-card p-1.5" aria-label="Scenes">
                {versionScenes.length === 0 && !data.isLoading && (
                  <p className="p-3 text-sm text-muted-foreground">No scene text in this version.</p>
                )}
                {versionScenes.map((scene) => {
                  const summary = sceneSummary(scene.id)
                  const selected = scene.id === selectedSceneId
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => setSelectedSceneId(scene.id)}
                      className={cn(
                        'grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-x-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:bg-secondary pointer-coarse:py-2.5',
                        selected && 'border-primary/45 bg-primary/10 hover:bg-primary/10'
                      )}
                    >
                      <span className="font-mono text-[13px] font-semibold">{scene.scene_number}</span>
                      <span className="min-w-0 truncate text-sm">{sceneHeading(scene)}</span>
                      <span />
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {summary.categories.map((c) => (
                          <span
                            key={c}
                            aria-hidden
                            title={breakdownCategory(c).label}
                            className="size-2 rounded-sm"
                            style={{ background: breakdownCategory(c).colour }}
                          />
                        ))}
                        <span className="ml-1 tabular-nums">
                          {summary.elements === 0 ? 'Not broken down' : `${summary.sourced}/${summary.elements} sourced`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </nav>

              <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
                {selectedScene && selectedLayout ? (
                  tab === 'script' ? (
                    <>
                      <div className="grid gap-2 border-b border-border px-4 py-3">
                        <p className="font-semibold">
                          <span className="mr-2 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[13px]">
                            {selectedScene.scene_number}
                          </span>
                          {sceneHeading(selectedScene)}
                        </p>
                        <CategoryLegend
                          counts={categoryCounts}
                          hidden={hidden}
                          onToggle={(c) =>
                            setHidden((prev) => {
                              const next = new Set(prev)
                              if (next.has(c)) next.delete(c)
                              else next.add(c)
                              return next
                            })
                          }
                        />
                      </div>
                      <BreakdownScriptPanel
                        key={`${selectedVersionId}:${selectedScene.id}`}
                        scriptVersionId={selectedVersionId}
                        sceneId={selectedScene.id}
                        layout={selectedLayout}
                        tags={tagsBySceneId.get(selectedScene.id) ?? []}
                        elements={data.elements}
                        elementsById={elementsById}
                        matchesByElementId={matchesByElementId}
                        hiddenCategories={hidden}
                        readOnly={readOnly}
                      />
                    </>
                  ) : (
                    <BreakdownSheet
                      sheet={sheetFor(selectedScene)}
                      exporting={exportMutation.isPending}
                      onExportScene={() => exportMutation.mutate({ kind: 'sheets', scenes: [selectedScene] })}
                      onExportAll={() => exportMutation.mutate({ kind: 'sheets', scenes: versionScenes })}
                      onOpenElement={openElement}
                    />
                  )
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">Choose a scene.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
