import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { listScriptPagesByScriptVersion } from '@/lib/db/repositories/scriptPages'
import { formatScriptVersionLabel } from '@/lib/db/scriptSectionReconciliationService'
import type {
  Scene,
  ScriptSection,
  ScriptSectionCharacter,
  ScriptSectionRange,
  ScriptVersion,
} from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { formatSectionStatus } from './script-section-edit-dialog'
import {
  formatScriptSectionRange,
  ScriptSectionScriptPanel,
} from './script-section-script-panel'
import { SbRemoteNotice } from './sbRemoteNotice'

function sceneLabel(scene: Scene): string {
  const title = scene.title ?? scene.heading
  return `Scene ${scene.scene_number}${title ? ` — ${title}` : ''}`
}

export type ShotScriptSectionLinkDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shotNumber: string
  scene: Scene | null
  sections: ScriptSection[]
  rangesBySectionId: Map<string, ScriptSectionRange[]>
  charactersBySectionId: Map<string, ScriptSectionCharacter[]>
  scriptVersions: ScriptVersion[]
  latestScriptVersion: ScriptVersion | null
  initialSectionIds: string[]
  isRemoteProduction: boolean
  isSaving: boolean
  error: string | null
  onSave: (sectionIds: string[]) => void
}

export function ShotScriptSectionLinkDialog({
  open,
  onOpenChange,
  shotNumber,
  scene,
  sections,
  rangesBySectionId,
  charactersBySectionId,
  scriptVersions,
  latestScriptVersion,
  initialSectionIds,
  isRemoteProduction,
  isSaving,
  error,
  onSave,
}: ShotScriptSectionLinkDialogProps) {
  const [sectionSelection, setSectionSelection] = useState<Set<string>>(new Set())
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null)

  const scriptVersionById = useMemo(
    () => new Map(scriptVersions.map((v) => [v.id, v])),
    [scriptVersions]
  )

  useEffect(() => {
    if (!open) return
    setSectionSelection(new Set(initialSectionIds))
    const defaultPreview =
      sections.find((s) => initialSectionIds.includes(s.id))?.id ?? sections[0]?.id ?? null
    setPreviewSectionId(defaultPreview)
  }, [open, initialSectionIds, sections])

  const previewSection = sections.find((s) => s.id === previewSectionId) ?? null
  const previewRange = previewSection
    ? rangesBySectionId.get(previewSection.id)?.[0]
    : undefined

  const { data: previewPages = [] } = useQuery({
    queryKey: ['script-pages', previewSection?.script_version_id],
    queryFn: () => listScriptPagesByScriptVersion(previewSection!.script_version_id),
    enabled: open && !!previewSection?.script_version_id,
  })

  const toggleSection = (sectionId: string) => {
    setSectionSelection((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col bg-zinc-800 border-zinc-600">
        <h3 className="text-base font-semibold text-zinc-100">Link script sections</h3>
        <p className="text-sm text-zinc-400">
          Select the script sections covered by shot {shotNumber}. Click a section to preview its
          script text.
        </p>

        {isRemoteProduction && (
          <SbRemoteNotice className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100" />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {sections.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">
            No script sections for this scene yet. Generate or add sections on the Script Sections
            page first.
          </p>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-md border border-zinc-600">
                <div className="border-b border-zinc-600 px-3 py-2">
                  <h4 className="text-base font-semibold text-zinc-100">
                    Sections ({sections.length})
                  </h4>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="space-y-2">
                    {sections.map((section) => {
                      const checked = sectionSelection.has(section.id)
                      const isPreview = previewSectionId === section.id
                      const isGenerated = section.is_manual === 0
                      const ranges = rangesBySectionId.get(section.id)
                      const characters = charactersBySectionId.get(section.id) ?? []
                      const version = scriptVersionById.get(section.script_version_id)

                      return (
                        <div
                          key={section.id}
                          className={cn(
                            'rounded-md border p-3',
                            isPreview
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : checked
                                ? 'border-emerald-700/40 bg-emerald-900/20'
                                : 'border-zinc-600'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={checked}
                              className="mt-1"
                              aria-label={`Link section ${section.label ?? section.id}`}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => toggleSection(section.id)}
                            />
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => setPreviewSectionId(section.id)}
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium text-zinc-100">
                                  {section.label ?? 'Untitled section'}
                                </span>
                                <span className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-xs text-zinc-300">
                                  {formatSectionStatus(section.status)}
                                </span>
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-xs',
                                    isGenerated
                                      ? 'bg-zinc-700/80 text-zinc-400'
                                      : 'bg-zinc-600 text-zinc-200'
                                  )}
                                >
                                  {isGenerated ? 'Generated' : 'Manual'}
                                </span>
                                {checked && (
                                  <span className="rounded bg-emerald-700/60 px-1.5 py-0.5 text-xs text-emerald-100">
                                    Linked
                                  </span>
                                )}
                                {version && (
                                  <span className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-xs text-zinc-400">
                                    {formatScriptVersionLabel(version)}
                                  </span>
                                )}
                                {latestScriptVersion &&
                                  section.script_version_id !== latestScriptVersion.id && (
                                    <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300">
                                      older revision
                                    </span>
                                  )}
                                {isGenerated && (
                                  <span
                                    className="rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300"
                                    title="Page/eighth range is best-effort (auto-generated)"
                                  >
                                    est.
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-sm text-zinc-400">
                                {scene ? sceneLabel(scene) : 'Unknown scene'} ·{' '}
                                {formatScriptSectionRange(ranges?.[0])}
                              </div>
                              {characters.length > 0 && (
                                <div className="mt-1 text-xs text-zinc-500">
                                  Characters:{' '}
                                  {characters
                                    .map((c) => c.character_name)
                                    .filter(Boolean)
                                    .join(', ')}
                                </div>
                              )}
                              {section.notes && (
                                <div className="mt-1 text-xs italic text-zinc-500">{section.notes}</div>
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="min-h-0 rounded-md border border-zinc-600">
                <ScriptSectionScriptPanel
                  pages={previewPages}
                  previewSection={previewSection}
                  previewRange={previewRange}
                  variant="dark"
                  maxHeightClass="max-h-[50vh]"
                  showCard={false}
                  subtitle={
                    previewSection
                      ? `showing pages for “${previewSection.label ?? 'section'}”`
                      : 'Select a section to preview script text'
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isRemoteProduction || isSaving}
                onClick={() => onSave([...sectionSelection])}
              >
                <Check className="mr-1 size-3.5" />
                Save links
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
