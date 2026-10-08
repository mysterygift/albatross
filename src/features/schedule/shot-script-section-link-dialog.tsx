import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listScriptPagesByScriptVersion } from '@/lib/db/repositories/scriptPages'
import { formatScriptVersionLabel } from '@/lib/db/scriptSectionReconciliationService'
import { buildSceneLayouts, formatEighths, formatRuns, runEighths, toRuns } from '@/lib/db/scriptSectionLayout'
import { loadScriptVersionSectionProgress } from '@/lib/db/scriptSectionStatusService'
import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'
import type {
  Scene,
  ScriptSection,
  ScriptSectionCharacter,
  ScriptSectionRange,
  ScriptVersion,
} from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { ScriptLines, SectionStatusBadge, SectionSummary, type ScriptLineDecor } from './script-section-ui'
import { STATUS_FILL_CLASS } from './script-section-status-styles'
import { buildSectionViews, ownerByLine } from './script-section-views'
import { SbRemoteNotice } from './sbRemoteNotice'

export type ShotScriptSectionLinkDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shotNumber: string
  scene: Scene | null
  /** Name of the scene's location, for the heading. */
  locationName?: string | null
  /** The scene's sections across every script version. */
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

/** Version to open on: the latest if the shot is linked there (or has no links), else the version it is linked to. */
function defaultVersionId(
  sections: ScriptSection[],
  initialSectionIds: string[],
  latest: ScriptVersion | null,
  versionIds: string[]
): string | null {
  const linkedVersions = new Set(
    sections.filter((s) => initialSectionIds.includes(s.id)).map((s) => s.script_version_id)
  )
  if (latest && versionIds.includes(latest.id) && (linkedVersions.size === 0 || linkedVersions.has(latest.id))) {
    return latest.id
  }
  return [...linkedVersions][0] ?? versionIds[0] ?? null
}

export function ShotScriptSectionLinkDialog({
  open,
  onOpenChange,
  shotNumber,
  scene,
  locationName = null,
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
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [versionId, setVersionId] = useState<string | null>(null)
  const paint = useRef<boolean | null>(null)
  const lastPointerType = useRef<string>('mouse')
  const linesRef = useRef<HTMLDivElement>(null)

  // Versions that have sections for this scene, newest first.
  const versionIds = useMemo(() => {
    const withSections = new Set(sections.map((s) => s.script_version_id))
    const ordered = scriptVersions.map((v) => v.id).filter((id) => withSections.has(id))
    for (const id of withSections) if (!ordered.includes(id)) ordered.push(id)
    return ordered
  }, [sections, scriptVersions])

  // Follow the shot's saved links (they can load after the dialog opens) until the user changes something.
  const touched = useRef(false)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) touched.current = false
    wasOpen.current = open
    if (!open || touched.current) return
    /* eslint-disable react-hooks/set-state-in-effect -- sync picker with saved links until the user edits */
    setSelection(new Set(initialSectionIds))
    setVersionId(defaultVersionId(sections, initialSectionIds, latestScriptVersion, versionIds))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initialSectionIds, sections, latestScriptVersion, versionIds])

  useEffect(() => {
    const end = () => {
      paint.current = null
    }
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])

  const productionId = scene?.production_id ?? null
  const { data: pages = [] } = useQuery({
    queryKey: ['script-pages', versionId],
    queryFn: () => listScriptPagesByScriptVersion(versionId!),
    enabled: open && !!versionId,
  })
  const { data: progress } = useQuery({
    queryKey: ['script-section-progress', productionId, versionId],
    queryFn: () => loadScriptVersionSectionProgress(productionId!, versionId!),
    enabled: open && !!productionId && !!versionId && !isRemoteProduction,
  })

  const versionSections = useMemo(
    () => sections.filter((s) => s.script_version_id === versionId),
    [sections, versionId]
  )
  const layout = useMemo(() => {
    if (!scene) return null
    return buildSceneLayouts(pages, versionSections, rangesBySectionId).get(scene.id) ?? null
  }, [pages, versionSections, rangesBySectionId, scene])

  const views = useMemo(
    () =>
      buildSectionViews({
        sections: versionSections,
        rangesBySectionId,
        charactersBySectionId,
        layoutBySceneId: layout && scene ? new Map([[scene.id, layout]]) : new Map(),
        shotsBySectionId: progress?.shotsBySectionId ?? new Map(),
        omittedSceneIds: progress?.omittedSceneIds ?? new Set(),
        sceneNumberById: new Map(scene ? [[scene.id, scene.scene_number]] : []),
      }),
    [versionSections, rangesBySectionId, charactersBySectionId, layout, scene, progress]
  )
  const orderedViews = useMemo(
    () => [...views.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [views]
  )
  const owners = useMemo(() => (layout ? ownerByLine(layout) : new Map<number, string>()), [layout])
  const firstLineOf = useMemo(() => {
    const map = new Map<number, string>()
    for (const view of orderedViews) for (const run of view.runs) map.set(run.from, view.section.id)
    return map
  }, [orderedViews])

  const setLinked = (sectionId: string, linked: boolean) => {
    touched.current = true
    setSelection((prev) => {
      if (prev.has(sectionId) === linked) return prev
      const next = new Set(prev)
      if (linked) next.add(sectionId)
      else next.delete(sectionId)
      return next
    })
  }

  const scrollToSection = (sectionId: string) => {
    const first = views.get(sectionId)?.runs[0]?.from
    if (first == null) return
    linesRef.current?.querySelector(`[data-line="${first}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }

  // Bring the first linked section into view once the script loads.
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      scrolledFor.current = null
      return
    }
    if (!layout || scrolledFor.current === versionId) return
    const firstLinked = orderedViews.find((v) => selection.has(v.section.id) && v.runs.length)
    if (!firstLinked) return
    scrolledFor.current = versionId
    const id = window.setTimeout(() => {
      linesRef.current
        ?.querySelector(`[data-line="${firstLinked.runs[0]!.from}"]`)
        ?.scrollIntoView?.({ block: 'center' })
    }, 50)
    return () => window.clearTimeout(id)
  }, [open, layout, versionId, orderedViews, selection])

  const decorate = (line: { index: number }): ScriptLineDecor => {
    const owner = owners.get(line.index)
    if (!owner) return {}
    const view = views.get(owner)
    const linked = selection.has(owner)
    const decor: ScriptLineDecor = {
      bandClassName: view ? STATUS_FILL_CLASS[view.status] : undefined,
      textClassName: linked ? 'bg-primary/25' : undefined,
    }
    if (firstLineOf.get(line.index) === owner && view) {
      decor.tag = <b className={cn('font-medium', linked ? 'text-primary' : 'text-muted-foreground')}>{view.code}</b>
    }
    return decor
  }

  // Click or drag across the script to link (or unlink) every section it passes over.
  const onLinePointerDown = (line: { index: number }, e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerType.current = e.pointerType
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const owner = owners.get(line.index)
    if (!owner) return
    e.preventDefault()
    paint.current = !selection.has(owner)
    setLinked(owner, paint.current)
  }
  const onLinePointerEnter = (line: { index: number }) => {
    if (paint.current == null) return
    const owner = owners.get(line.index)
    if (owner) setLinked(owner, paint.current)
  }
  // Touch and pen: a tap toggles the section under it (scrolling never links anything).
  const onLineClick = (line: { index: number }) => {
    if (lastPointerType.current === 'mouse') return
    const owner = owners.get(line.index)
    if (owner) setLinked(owner, !selection.has(owner))
  }

  const linkedHere = orderedViews.filter((v) => selection.has(v.section.id))
  const linkedRuns = layout ? toRuns(linkedHere.flatMap((v) => v.runs.flatMap((r) => rangeIndexes(r.from, r.to)))) : []
  const linkedEighths = layout ? linkedRuns.reduce((n, r) => n + runEighths(layout.lines, r), 0) : 0
  const linkedElsewhere = sections.filter((s) => s.script_version_id !== versionId && selection.has(s.id))
  const version = scriptVersions.find((v) => v.id === versionId) ?? null
  const changed =
    selection.size !== initialSectionIds.length || initialSectionIds.some((id) => !selection.has(id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="grid gap-1.5 border-b border-border px-5 pb-3.5 pt-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            Link script sections
            <span className="font-mono text-base text-primary">Shot {shotNumber}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose the script sections this shot covers by clicking or dragging across the script, or by ticking
            sections in the list.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-muted-foreground">
            <span>Scene</span>
            <span className="text-foreground">
              {scene ? `Scene ${scene.scene_number} — ${sceneScheduleLabel(scene, locationName)}` : 'No scene selected'}
            </span>
            {versionIds.length > 1 && (
              <Select
                value={versionId ?? undefined}
                onValueChange={(id) => {
                  touched.current = true
                  setVersionId(id)
                }}
              >
                <SelectTrigger className="h-8 w-auto gap-2 bg-input border-border text-foreground" aria-label="Script version">
                  <SelectValue placeholder="Script version" />
                </SelectTrigger>
                <SelectContent>
                  {versionIds.map((id) => {
                    const v = scriptVersions.find((x) => x.id === id)
                    return (
                      <SelectItem key={id} value={id}>
                        {v ? formatScriptVersionLabel(v) : 'Unknown version'}
                        {latestScriptVersion?.id === id ? ' (latest)' : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
            {versionIds.length === 1 && version && <span>· {formatScriptVersionLabel(version)}</span>}
          </div>
          {latestScriptVersion && versionId && versionId !== latestScriptVersion.id && (
            <p className="text-xs text-amber-500">
              You are looking at an older revision. Sections from the latest revision are a better match for new
              links.
            </p>
          )}
        </div>

        {isRemoteProduction && (
          <SbRemoteNotice className="mx-5 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs" />
        )}
        {error && (
          <p role="alert" className="mx-5 mt-3 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {sections.length === 0 ? (
          <p className="flex-1 px-5 py-6 text-sm text-muted-foreground">
            No script sections for this scene yet. Import a script or add sections on the Script Sections page first.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:overflow-hidden">
            <div className="flex min-h-0 flex-col border-b border-border bg-background/40 md:border-b-0 md:border-r">
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-primary/60" /> Linked to shot {shotNumber}
                </span>
                <span>Click or drag across the script to link sections. Tap on a touch screen.</span>
              </div>
              <div className="min-h-[40vh] flex-1 overflow-y-auto pb-5 md:min-h-0" style={{ touchAction: 'pan-y' }}>
                {layout && layout.lines.length > 0 ? (
                  <ScriptLines
                    ref={linesRef}
                    lines={layout.lines}
                    decorate={decorate}
                    interactive
                    onLinePointerDown={onLinePointerDown}
                    onLinePointerEnter={onLinePointerEnter}
                    onLineClick={onLineClick}
                    aria-label="Script text. Click or drag across lines to link their sections."
                  />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No script text for this scene in this version. Tick sections in the list instead.
                  </p>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="grid gap-1 border-b border-border px-5 py-3.5">
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Shot {shotNumber} covers
                </h4>
                {linkedHere.length ? (
                  <p className="text-lg font-semibold tabular-nums" aria-live="polite">
                    {linkedHere.map((v) => v.code).join(', ')}
                    {layout && linkedRuns.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {formatRuns(layout.lines, linkedRuns)} · {formatEighths(linkedEighths)}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    No sections linked in this version.
                  </p>
                )}
                {linkedElsewhere.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Also linked to {linkedElsewhere.length} section{linkedElsewhere.length === 1 ? '' : 's'} in another
                    revision. Those links are kept.
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="group" aria-label="Sections">
                {orderedViews.map((view) => {
                  const linked = selection.has(view.section.id)
                  return (
                    <div
                      key={view.section.id}
                      className={cn(
                        'grid cursor-pointer grid-cols-[auto_3rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-transparent p-2 hover:bg-secondary',
                        linked && 'border-primary/45 bg-primary/10 hover:bg-primary/10'
                      )}
                      onClick={() => {
                        setLinked(view.section.id, !linked)
                        scrollToSection(view.section.id)
                      }}
                    >
                      <Checkbox
                        checked={linked}
                        aria-label={`Link section ${view.code}`}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) => setLinked(view.section.id, checked === true)}
                      />
                      <span className={cn('font-mono text-[13px] text-muted-foreground', linked && 'text-primary')}>
                        {view.code}
                      </span>
                      <SectionSummary
                        rangeText={view.rangeText}
                        lengthText={view.lengthText}
                        estimated={view.estimated}
                        characters={view.characters}
                        cut={view.status === 'cut'}
                      />
                      <SectionStatusBadge status={view.status} label={view.statusLabel} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {selection.size > 0 && (
            <Button type="button" variant="ghost" onClick={() => {
                touched.current = true
                setSelection(new Set())
              }}
              disabled={isSaving}>
              Unlink all
            </Button>
          )}
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isRemoteProduction || isSaving || !changed}
            onClick={() => onSave([...selection])}
          >
            {isSaving ? 'Saving…' : 'Save links'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function rangeIndexes(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, k) => from + k)
}
