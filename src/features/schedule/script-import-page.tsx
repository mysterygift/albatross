import { useState } from 'react'
import { useCurrentProduction } from '@/features/productions/context'
import { pickAndSaveAttachment } from '@/lib/files'
import { createDocument } from '@/lib/db/repositories/document'
import { createScene } from '@/lib/db/repositories/schedule'
import { defaultParser } from '@/lib/script-parser'
import type { ParsedScene } from '@/lib/script-parser'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

const schema = z.object({
  rawText: z.string().optional(),
})

export function ScriptImportPage() {
  const { currentProductionId } = useCurrentProduction()
  const [importedScenes, setImportedScenes] = useState<ParsedScene[] | null>(null)
  const [uploadedDoc, setUploadedDoc] = useState<{ name: string; id: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { rawText: '' },
  })

  const createScenesMutation = useMutation({
    mutationFn: async (scenes: ParsedScene[]) => {
      if (!currentProductionId) return
      for (const s of scenes) {
        await createScene({
          production_id: currentProductionId,
          scene_number: s.scene_number,
          heading: s.title,
          title: s.title,
          description: null,
          int_ext: s.int_ext ?? undefined,
          day_night: s.day_night ?? undefined,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      setImportedScenes(null)
      form.setValue('rawText', '')
      setParseError(null)
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
      setImportedScenes(null)
      setParseError('PDF parsing not implemented yet. Store and preview; use text paste for scene breakdown.')
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
        Attach a script file (.txt or .pdf) or paste text. Scenes are detected by lines starting with INT., EXT., etc. PDF parsing is not implemented; store and preview only.
      </p>

      {parseError && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {parseError}
        </p>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Upload script file</CardTitle>
          <CardDescription>
            .txt files are parsed automatically. PDFs are stored; show &quot;PDF parsing not implemented yet&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleFilePick}>
            <Upload className="mr-2 size-4" />
            Pick file...
          </Button>
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
                  </li>
                ))}
              </ul>
              <Button
                className="mt-2"
                onClick={() => createScenesMutation.mutate(importedScenes)}
                disabled={createScenesMutation.isPending || importedScenes.length === 0}
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
