import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { SbRemoteNotice } from './sbRemoteNotice'
import { ScriptImportSceneEditorDialog } from './script-import-scene-editor-dialog'
import { pickAndSaveAttachment } from '@/lib/files'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import { createDocument } from '@/lib/db/repositories/document'
import { createScene } from '@/lib/db/repositories/schedule'
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import { formatScriptVersionLabel } from '@/lib/db/scriptSectionReconciliationService'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { getLatestScriptVersionForScope } from '@/lib/db/repositories/scriptVersions'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { defaultParser, parsePdfScript, PdfParseError } from '@/lib/script-parser'
import {
  locationIdForParsedName,
  resolveImportLocations,
} from '@/lib/db/scriptImportLocationService'
import { linkLocationScene } from '@/lib/db/repositories/location-scene'
import {
  analyzeImportLocations,
  applyLocationMergeToDrafts,
  draftToParsedScene,
  effectiveParsedLocation,
  hasLocationSpellingVariants,
  toImportSceneDrafts,
  type ImportSceneDraft,
} from '@/lib/schedule/scriptImportReview'
import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { readFile } from '@tauri-apps/plugin-fs'
import { BaseDirectory } from '@tauri-apps/plugin-fs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Upload, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SELECT_NONE = '__none__'

function describePdfError(err: unknown): string {
  if (err instanceof PdfParseError) {
    if (err.code === 'no-text-layer') {
      return 'This PDF has no selectable text (it may be a scan). OCR is not supported — paste the script text instead.'
    }
    if (err.code === 'too-many-pages') {
      return err.message
    }
    return err.message || 'Failed to parse PDF.'
  }
  return err instanceof Error ? err.message : 'Failed to read or parse PDF'
}

const schema = z.object({
  rawText: z.string().optional(),
})

function locationGroupsFingerprint(groups: ReturnType<typeof analyzeImportLocations>): string {
  return groups
    .map((g) => `${g.canonicalKey}:${[...g.rawVariants].sort().join('|')}:${g.sceneIds.join(',')}`)
    .join(';')
}

function ImportLocationSummary({
  drafts,
  productionId,
  onMergeGroup,
  reviewRevision,
}: {
  drafts: ImportSceneDraft[]
  productionId: string
  onMergeGroup: (sceneIds: string[], canonicalName: string) => void
  reviewRevision: number
}) {
  const { data: existingLocations = [] } = useQuery({
    queryKey: ['locations', productionId],
    queryFn: () => listLocationsByProduction(productionId),
    enabled: drafts.length > 0,
  })

  const locationGroups = useMemo(
    () => analyzeImportLocations(drafts, existingLocations),
    [drafts, existingLocations]
  )

  const [mergeNames, setMergeNames] = useState<Record<string, string>>({})

  useEffect(() => {
    setMergeNames({})
  }, [reviewRevision, locationGroupsFingerprint(locationGroups)])

  if (locationGroups.length === 0) return null

  return (
    <Card className="mt-4 border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Locations in this import</CardTitle>
        <CardDescription>
          {locationGroups.length} unique location{locationGroups.length === 1 ? '' : 's'} detected.
          Merge variants before importing to avoid duplicate location rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {locationGroups.map((group) => {
          const mergeKey = group.canonicalKey
          const defaultMergeName =
            group.matchesExistingLocation?.name ??
            group.rawVariants[0] ??
            group.canonicalKey
          const mergeName = mergeNames[mergeKey] ?? defaultMergeName
          const hasVariants = group.rawVariants.length > 1

          return (
            <div
              key={mergeKey}
              className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{group.canonicalKey}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {group.sceneIds.length} scene{group.sceneIds.length === 1 ? '' : 's'}
                </Badge>
                {group.matchesExistingLocation && (
                  <span className="text-xs text-muted-foreground">
                    Will link to existing: {group.matchesExistingLocation.name}
                  </span>
                )}
              </div>

              {hasVariants && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  These spellings will map to one location on import:{' '}
                  {group.rawVariants.map((v) => `"${v}"`).join(', ')}
                </p>
              )}

              {hasVariants && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <Label htmlFor={`merge-${mergeKey}`} className="text-xs">
                      Canonical name
                    </Label>
                    <Input
                      id={`merge-${mergeKey}`}
                      value={mergeName}
                      onChange={(e) =>
                        setMergeNames((prev) => ({ ...prev, [mergeKey]: e.target.value }))
                      }
                      className="mt-1 h-8 bg-input border-border text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!mergeName.trim()}
                    onClick={() => onMergeGroup(group.sceneIds, mergeName.trim())}
                  >
                    Merge {group.sceneIds.length} scene{group.sceneIds.length === 1 ? '' : 's'}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function ScriptImportPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const isEpisodic = currentProduction?.is_episodic === true
  const [importEpisodeId, setImportEpisodeId] = useState('')
  const [importDrafts, setImportDrafts] = useState<ImportSceneDraft[] | null>(null)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [spellingBannerDismissed, setSpellingBannerDismissed] = useState(false)
  const [locationReviewRevision, setLocationReviewRevision] = useState(0)
  const [uploadedDoc, setUploadedDoc] = useState<{ name: string; id: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [parseProgress, setParseProgress] = useState<{ page: number; total: number } | null>(null)
  const [versionLabel, setVersionLabel] = useState('')
  const [revisionColour, setRevisionColour] = useState('')
  const [linkToPreviousVersion, setLinkToPreviousVersion] = useState(true)
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: importEpisodes = [] } = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: () => listEpisodesByProduction(currentProductionId!),
    enabled: !!currentProductionId && isEpisodic,
  })

  const { dataSourceKey } = useEffectiveDataSourceForProduction(currentProductionId)
  const isRemoteProduction = dataSourceKey === 'remote_server'

  const scopedEpisodeId = isEpisodic ? importEpisodeId.trim() || null : null

  const { data: priorVersion = null } = useQuery({
    queryKey: ['script-versions-prior', currentProductionId, scopedEpisodeId],
    queryFn: () => getLatestScriptVersionForScope(currentProductionId!, scopedEpisodeId),
    enabled: !!currentProductionId,
  })

  const { data: existingLocations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId!),
    enabled: !!currentProductionId && importDrafts != null && importDrafts.length > 0,
  })

  const locationGroups = useMemo(
    () => (importDrafts ? analyzeImportLocations(importDrafts, existingLocations) : []),
    [importDrafts, existingLocations]
  )

  const showSpellingBanner =
    importDrafts != null &&
    importDrafts.length > 0 &&
    hasLocationSpellingVariants(locationGroups) &&
    !spellingBannerDismissed

  const editingDraft = importDrafts?.find((d) => d.id === editingDraftId) ?? null

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { rawText: '' },
  })

  const setParsedScenes = (scenes: Parameters<typeof toImportSceneDrafts>[0]) => {
    setImportDrafts(toImportSceneDrafts(scenes))
    setSpellingBannerDismissed(false)
    setEditingDraftId(null)
  }

  const createScenesMutation = useMutation({
    mutationFn: async (drafts: ImportSceneDraft[]) => {
      if (!currentProductionId) {
        return { linkedPrior: null, versionCreated: false }
      }
      const epId = importEpisodeId.trim()
      if (isEpisodic && !epId) {
        throw new Error('Choose an episode before importing scenes.')
      }

      const scenes = drafts.map(draftToParsedScene)
      const locationNames = scenes
        .map((s) => effectiveParsedLocation(s))
        .filter((loc): loc is string => !!loc?.trim())
      const locationMap = await resolveImportLocations(currentProductionId, locationNames)

      const created: Array<{ sceneId: string; parsed: ReturnType<typeof draftToParsedScene> }> = []
      for (const s of scenes) {
        const locationId = locationIdForParsedName(locationMap, effectiveParsedLocation(s))
        const scene = await createScene({
          production_id: currentProductionId,
          scene_number: s.scene_number,
          title: s.title,
          description: null,
          int_ext: s.int_ext ?? undefined,
          day_night: s.day_night ?? undefined,
          location_id: locationId,
          ...(isEpisodic ? { episode_id: epId } : {}),
        })
        if (locationId) {
          await linkLocationScene(locationId, scene.id)
        }
        created.push({ sceneId: scene.id, parsed: s })
      }

      const version = await generateScriptVersionFromScenes({
        productionId: currentProductionId,
        episodeId: isEpisodic ? epId : null,
        title: uploadedDoc?.name ?? 'Imported Script',
        versionLabel: versionLabel.trim() || null,
        revisionColour: revisionColour.trim() || null,
        linkToPreviousVersion: priorVersion ? linkToPreviousVersion : false,
        scenes: created,
      })
      return {
        linkedPrior: priorVersion && linkToPreviousVersion ? priorVersion : null,
        versionCreated: version != null,
      }
    },
    onSuccess: ({ linkedPrior, versionCreated }) => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: ['scenes', currentProductionId] })
        queryClient.invalidateQueries({ queryKey: ['script-versions', currentProductionId] })
        queryClient.invalidateQueries({ queryKey: ['script-versions-prior', currentProductionId] })
        queryClient.invalidateQueries({ queryKey: ['locations', currentProductionId] })
      }
      setImportDrafts(null)
      setEditingDraftId(null)
      form.setValue('rawText', '')
      setParseError(null)
      setMutationError(null)
      if (!versionCreated) {
        setImportSuccessMessage(
          'Scenes imported. Script sections were not generated because this production uses a remote server.'
        )
      } else if (linkedPrior) {
        setImportSuccessMessage(
          `Script version created and linked to previous revision (${formatScriptVersionLabel(linkedPrior)}).`
        )
      } else {
        setImportSuccessMessage('Script version created.')
      }
    },
    onError: (e) => {
      setMutationError(e instanceof Error ? e.message : 'Could not create scenes.')
    },
  })

  const handleFilePick = async () => {
    if (!currentProductionId) return
    setParseError(null)
    const result = await pickAndSaveAttachment()
    if (!result) return
    const doc = await createDocument({
      production_id: currentProductionId,
      entity_type: 'script',
      entity_id: null,
      file_name: result.fileName,
      file_path: result.relativePath,
      mime_type: null,
    })
    setUploadedDoc({ name: result.fileName, id: doc.id })
    void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
    if (result.fileName.toLowerCase().endsWith('.pdf')) {
      setParseProgress({ page: 0, total: 0 })
      try {
        const content = await readFile(result.relativePath, { baseDir: BaseDirectory.AppData })
        const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer
        const scenes = await parsePdfScript(buffer, {
          onProgress: (page, total) => setParseProgress({ page, total }),
        })
        setParsedScenes(scenes)
        if (scenes.length === 0) {
          setParseError('No scenes were detected. Check the PDF uses standard INT./EXT. scene headings, or paste the text instead.')
        }
      } catch (e) {
        setParseError(describePdfError(e))
        setImportDrafts(null)
      } finally {
        setParseProgress(null)
      }
      return
    }
    if (result.fileName.toLowerCase().endsWith('.txt')) {
      try {
        const content = await readFile(result.relativePath, { baseDir: BaseDirectory.AppData })
        const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
        const scenes = await defaultParser.parse({ type: 'text', content: text })
        setParsedScenes(scenes)
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Failed to read or parse file')
        setImportDrafts(null)
      }
      return
    }
    setImportDrafts(null)
  }

  const handleParseText = async () => {
    const raw = form.getValues('rawText')
    setParseError(null)
    if (!raw) return
    try {
      const scenes = await defaultParser.parse({ type: 'text', content: raw })
      setParsedScenes(scenes)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parse failed')
      setImportDrafts(null)
    }
  }

  const recomputeLocationReview = (drafts: ImportSceneDraft[]) => {
    const groups = analyzeImportLocations(drafts, existingLocations)
    if (hasLocationSpellingVariants(groups)) {
      setSpellingBannerDismissed(false)
    }
    setLocationReviewRevision((r) => r + 1)
  }

  const handleSaveDraft = (updated: ImportSceneDraft) => {
    if (!importDrafts) return
    const next = importDrafts.map((draft) => (draft.id === updated.id ? updated : draft))
    setImportDrafts(next)
    recomputeLocationReview(next)
  }

  const handleMergeLocationGroup = (sceneIds: string[], canonicalName: string) => {
    if (!importDrafts) return
    const next = applyLocationMergeToDrafts(importDrafts, sceneIds, canonicalName)
    setImportDrafts(next)
    recomputeLocationReview(next)
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Script import</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Schedule — Script import</h1>
      <p className="text-muted-foreground">
        Attach a script file (.txt or .pdf) or paste text. Scenes are detected by lines starting with INT., EXT., etc. PDFs are parsed using standard screenplay layout.
      </p>

      {isRemoteProduction && <SbRemoteNotice />}

      {parseError && (
        <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {parseError}
        </p>
      )}

      {mutationError && (
        <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {mutationError}
        </p>
      )}

      {showSpellingBanner && (
        <div className="flex items-start justify-between gap-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <p>Some locations have multiple spellings — review before importing.</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Dismiss"
            onClick={() => setSpellingBannerDismissed(true)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {importSuccessMessage && (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary space-y-1">
          <p>{importSuccessMessage}</p>
          {!isRemoteProduction && (
            <Link to="/schedule/script-sections" className="underline underline-offset-2">
              View script sections
            </Link>
          )}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Upload script file</CardTitle>
          <CardDescription>
            .txt and .pdf files are parsed automatically into scenes; PDFs use standard screenplay formatting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleFilePick}>
            <Upload className="mr-2 size-4" />
            Pick file...
          </Button>
          {parseProgress && (
            <p className="mt-2 text-sm text-muted-foreground">
              Parsing PDF…
              {parseProgress.total > 0
                ? ` page ${parseProgress.page} of ${parseProgress.total}`
                : ''}
            </p>
          )}
          {uploadedDoc && (
            <p className="mt-2 text-sm text-muted-foreground">
              Stored: {uploadedDoc.name}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Paste script text</CardTitle>
          <CardDescription>
            Paste script text; scenes are detected by lines starting with INT., EXT., I/E., INT/EXT.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Raw text</Label>
            <Textarea
              {...form.register('rawText')}
              rows={12}
              className="mt-2 font-mono text-sm bg-input border-border"
              placeholder="INT. LOCATION - DAY&#10;..."
            />
          </div>
          <Button onClick={handleParseText}>Parse scenes</Button>
          {importDrafts !== null && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Found {importDrafts.length} scene(s) — click a scene to edit its header mapping
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded border border-border p-1 text-sm">
                {importDrafts.map((draft) => {
                  const locationName = effectiveParsedLocation(draft)
                  return (
                    <li key={draft.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/60"
                        onClick={() => setEditingDraftId(draft.id)}
                      >
                        <span className="shrink-0 font-medium tabular-nums w-10">
                          {draft.scene_number}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {sceneScheduleLabel(draft, locationName)}
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {draft.int_ext && (
                            <Badge variant="secondary" className="text-[10px]">
                              {draft.int_ext}
                            </Badge>
                          )}
                          {draft.day_night && (
                            <Badge variant="outline" className="text-[10px]">
                              {draft.day_night}
                            </Badge>
                          )}
                          {draft.page_eighths != null && (
                            <Badge variant="outline" className="text-[10px]">
                              {draft.page_eighths}/8
                            </Badge>
                          )}
                        </span>
                        <Pencil className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>

              <ImportLocationSummary
                drafts={importDrafts}
                productionId={currentProductionId}
                onMergeGroup={handleMergeLocationGroup}
                reviewRevision={locationReviewRevision}
              />

              {isEpisodic && (
                <div className="mt-3 space-y-2">
                  <Label>
                    Episode for imported scenes<span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={importEpisodeId.trim() ? importEpisodeId : SELECT_NONE}
                    onValueChange={(v) => setImportEpisodeId(v === SELECT_NONE ? '' : v)}
                    disabled={createScenesMutation.isPending || importEpisodes.length === 0}
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Select episode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE}>Select episode…</SelectItem>
                      {importEpisodes.map((ep) => (
                        <SelectItem key={ep.id} value={ep.id}>
                          {ep.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {importEpisodes.length === 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Add an episode in Settings before importing scenes.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="version-label">Version label</Label>
                  <Input
                    id="version-label"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    placeholder="e.g. v2"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revision-colour">Revision colour</Label>
                  <Input
                    id="revision-colour"
                    value={revisionColour}
                    onChange={(e) => setRevisionColour(e.target.value)}
                    placeholder="e.g. Blue"
                    className="bg-input border-border"
                  />
                </div>
              </div>
              {priorVersion && (
                <div className="mt-3 flex items-start gap-2">
                  <Checkbox
                    id="link-previous-version"
                    checked={linkToPreviousVersion}
                    onCheckedChange={(checked) => setLinkToPreviousVersion(checked === true)}
                  />
                  <Label htmlFor="link-previous-version" className="text-sm font-normal leading-snug">
                    Link to previous script version ({formatScriptVersionLabel(priorVersion)}
                    {priorVersion.revision_colour ? ` — ${priorVersion.revision_colour}` : ''})
                  </Label>
                </div>
              )}
              <Button
                className="mt-2"
                onClick={() => createScenesMutation.mutate(importDrafts)}
                disabled={
                  createScenesMutation.isPending ||
                  importDrafts.length === 0 ||
                  (isEpisodic && (!importEpisodeId.trim() || importEpisodes.length === 0))
                }
              >
                Create scenes in production
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ScriptImportSceneEditorDialog
        draft={editingDraft}
        open={editingDraftId != null}
        onOpenChange={(open) => {
          if (!open) setEditingDraftId(null)
        }}
        existingLocations={existingLocations}
        onSave={handleSaveDraft}
      />
    </div>
  )
}
