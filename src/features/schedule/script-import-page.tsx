import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentProduction } from '@/features/productions/context'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import { SbRemoteNotice } from './sbRemoteNotice'
import { pickAndSaveAttachment } from '@/lib/files'
import { createDocument } from '@/lib/db/repositories/document'
import { createScene } from '@/lib/db/repositories/schedule'
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import { formatScriptVersionLabel } from '@/lib/db/scriptSectionReconciliationService'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { getLatestScriptVersionForScope } from '@/lib/db/repositories/scriptVersions'
import { defaultParser, parsePdfScript, PdfParseError, formatSceneHeading } from '@/lib/script-parser'
import type { ParsedScene } from '@/lib/script-parser'
import {
  locationIdForParsedName,
  resolveImportLocations,
} from '@/lib/db/scriptImportLocationService'
import { linkLocationScene } from '@/lib/db/repositories/location-scene'
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
import { Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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

export function ScriptImportPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const isEpisodic = currentProduction?.is_episodic === true
  const [importEpisodeId, setImportEpisodeId] = useState('')
  const [importedScenes, setImportedScenes] = useState<ParsedScene[] | null>(null)
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

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { rawText: '' },
  })

  const createScenesMutation = useMutation({
    mutationFn: async (scenes: ParsedScene[]) => {
      if (!currentProductionId) {
        return { linkedPrior: null, versionCreated: false }
      }
      const epId = importEpisodeId.trim()
      if (isEpisodic && !epId) {
        throw new Error('Choose an episode before importing scenes.')
      }
      // Scenes are created via the existing repository (preserves remote-server behaviour).
      const locationNames = scenes
        .map((s) => s.location)
        .filter((loc): loc is string => !!loc?.trim())
      const locationMap = await resolveImportLocations(currentProductionId, locationNames)

      const created: Array<{ sceneId: string; parsed: ParsedScene }> = []
      for (const s of scenes) {
        const locationId = locationIdForParsedName(locationMap, s.location)
        const scene = await createScene({
          production_id: currentProductionId,
          scene_number: s.scene_number,
          heading: formatSceneHeading(s.int_ext, s.title),
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
      // Generate the SB1 script version, pages, and default sections from the parsed scenes.
      // No-op for remote-server productions (handled inside the service).
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
      setImportedScenes(null)
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
        setImportedScenes(scenes)
        if (scenes.length === 0) {
          setParseError('No scenes were detected. Check the PDF uses standard INT./EXT. scene headings, or paste the text instead.')
        }
      } catch (e) {
        setParseError(describePdfError(e))
        setImportedScenes(null)
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
        setImportedScenes(scenes)
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Failed to read or parse file')
        setImportedScenes(null)
      }
      return
    }
    setImportedScenes(null)
  }

  const handleParseText = async () => {
    const raw = form.getValues('rawText')
    setParseError(null)
    if (!raw) return
    try {
      const scenes = await defaultParser.parse({ type: 'text', content: raw })
      setImportedScenes(scenes)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parse failed')
      setImportedScenes(null)
    }
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
          {importedScenes !== null && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Found {importedScenes.length} scene(s)
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2 text-sm">
                {importedScenes.map((s, i) => (
                  <li key={i}>
                    {s.scene_number}: {s.title.slice(0, 60)}
                    {s.title.length > 60 ? '...' : ''}
                    {s.int_ext && ` [${s.int_ext}]`}
                    {s.location && (
                      <span className="text-muted-foreground"> → {s.location}</span>
                    )}
                  </li>
                ))}
              </ul>
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
                onClick={() => createScenesMutation.mutate(importedScenes)}
                disabled={
                  createScenesMutation.isPending ||
                  importedScenes.length === 0 ||
                  (isEpisodic && (!importEpisodeId.trim() || importEpisodes.length === 0))
                }
              >
                Create scenes in production
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
