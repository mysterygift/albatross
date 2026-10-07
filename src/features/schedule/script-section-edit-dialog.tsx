import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { SectionLayoutPart } from '@/lib/db/repositories/scriptSections'
import {
  buildSceneLines,
  charactersForRun,
  computeLineOwners,
  formatEighths,
  formatRun,
  formatRuns,
  nudgeSelection,
  planSelection,
  rangeForRun,
  runEighths,
  toRuns,
  type LayoutPage,
  type LineRun,
  type SceneLine,
  type SelectionPlan,
} from '@/lib/db/scriptSectionLayout'
import {
  sectionStatusSteps,
  type SectionShotProgress,
} from '@/lib/db/scriptSectionStatus'
import type { ScriptSection, ScriptSectionCharacter, ScriptSectionRange } from '@/lib/db/types'
import { ScriptLines, SectionStatusBadge, SectionStatusSteps, type ScriptLineDecor } from './script-section-ui'

export type SectionSceneOption = { id: string; number: string; label: string }

/** What the dialog asks the page to write. */
export type SectionEditorSave =
  | {
      kind: 'layout'
      sceneId: string
      current: SectionLayoutPart & { id: string | null; label: string | null; cut: boolean }
      updates: Array<SectionLayoutPart & { sectionId: string }>
      removals: string[]
      splits: Array<SectionLayoutPart & { sourceSectionId: string; label: string | null }>
    }
  | { kind: 'cut'; sectionId: string; cut: boolean }

export type ScriptSectionEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  /** Section being edited (edit mode). */
  section: ScriptSection | null
  /** Scene to start on in create mode. */
  initialSceneId: string | null
  scenes: SectionSceneOption[]
  /** All active sections of the script version. */
  sections: ScriptSection[]
  sectionCodes: ReadonlyMap<string, string>
  rangesBySectionId: ReadonlyMap<string, ScriptSectionRange[]>
  charactersBySectionId: ReadonlyMap<string, ScriptSectionCharacter[]>
  /** All pages of the script version. */
  pages: Array<LayoutPage & { scene_id: string | null }>
  shotsBySectionId: ReadonlyMap<string, SectionShotProgress[]>
  omittedSceneIds: ReadonlySet<string>
  pending?: boolean
  error?: string | null
  onSave: (save: SectionEditorSave) => void
  onDelete: (sectionId: string) => void
}

type Role = 'prev' | 'next' | 'other'

const ROLE_TEXT: Record<Role, string> = {
  prev: 'bg-sky-400/20',
  next: 'bg-pink-400/20',
  other: 'bg-muted-foreground/10',
}
const ROLE_BAND: Record<Role, string> = {
  prev: 'bg-sky-400',
  next: 'bg-pink-400',
  other: 'bg-muted-foreground/40',
}
const ROLE_CODE: Record<Role, string> = {
  prev: 'text-sky-400',
  next: 'text-pink-400',
  other: 'text-muted-foreground',
}
// Stripes mark lines the selection takes from a neighbour (neighbour colour + this section's colour).
const NEIGHBOUR_COLOUR: Record<Role, string> = {
  prev: 'oklch(0.75 0.13 230)',
  next: 'oklch(0.72 0.17 350)',
  other: 'oklch(0.7 0.03 260)',
}
const takeStyle = (role: Role): React.CSSProperties => ({
  background: `repeating-linear-gradient(135deg, color-mix(in oklch, ${NEIGHBOUR_COLOUR[role]} 40%, transparent) 0 6px, color-mix(in oklch, var(--primary) 30%, transparent) 6px 12px)`,
})

function sameRun(a: LineRun | null, b: LineRun | null): boolean {
  return a?.from === b?.from && a?.to === b?.to
}

export function ScriptSectionEditDialog({
  open,
  onOpenChange,
  mode,
  section,
  initialSceneId,
  scenes,
  sections,
  sectionCodes,
  rangesBySectionId,
  charactersBySectionId,
  pages,
  shotsBySectionId,
  omittedSceneIds,
  pending = false,
  error = null,
  onSave,
  onDelete,
}: ScriptSectionEditDialogProps) {
  const [sceneId, setSceneId] = useState<string>('')
  const [selection, setSelection] = useState<LineRun | null>(null)
  const [cut, setCut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touchAnchor, setTouchAnchor] = useState<number | null>(null)
  const dragAnchor = useRef<number | null>(null)
  const lastPointerType = useRef<string>('mouse')
  const linesRef = useRef<HTMLDivElement>(null)

  const currentId = mode === 'edit' ? section?.id ?? null : null
  const scene = scenes.find((s) => s.id === sceneId) ?? null

  const layout = useMemo(() => {
    const scenePages = pages
      .filter((p) => p.scene_id === sceneId)
      .sort((a, b) => a.page_index - b.page_index)
    const lines = buildSceneLines(scenePages)
    const sceneSections = sections.filter((s) => s.scene_id === sceneId)
    const owners = computeLineOwners(
      lines,
      scenePages,
      sceneSections.map((s) => ({ id: s.id, ranges: rangesBySectionId.get(s.id) ?? [] }))
    )
    return { lines, owners, sceneSections }
  }, [pages, sceneId, sections, rangesBySectionId])

  const originalSelection = useMemo<LineRun | null>(() => {
    if (!currentId) return null
    const runs = toRuns(layout.owners.get(currentId) ?? [])
    return runs.length ? { from: runs[0]!.from, to: runs[runs.length - 1]!.to } : null
  }, [layout.owners, currentId])

  // Reset only as the dialog opens, so background refetches never wipe a selection in progress.
  const wasOpen = useRef(false)
  useEffect(() => {
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (!opening) return
    /* eslint-disable react-hooks/set-state-in-effect -- intentional reset of editor state on open */
    setSceneId(mode === 'edit' ? section?.scene_id ?? '' : initialSceneId ?? scenes[0]?.id ?? '')
    setCut(mode === 'edit' ? section?.status === 'omitted' : false)
    setConfirmDelete(false)
    setTouchAnchor(null)
    setSelection(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, mode, section, initialSceneId, scenes])

  // Start from the section's own lines once they are known.
  useEffect(() => {
    if (!open || !originalSelection) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed selection once layout resolves
    setSelection((prev) => prev ?? originalSelection)
  }, [open, originalSelection])

  // Bring the selection into view when the dialog opens on a section.
  useEffect(() => {
    if (!open || !originalSelection) return
    const id = window.setTimeout(() => {
      const el = linesRef.current?.querySelector(`[data-line="${originalSelection.from}"]`)
      el?.scrollIntoView?.({ block: 'center' })
    }, 50)
    return () => window.clearTimeout(id)
  }, [open, originalSelection])

  useEffect(() => {
    const end = () => {
      dragAnchor.current = null
    }
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])

  const plan: SelectionPlan | null = useMemo(
    () => (selection ? planSelection(layout.owners, currentId, selection, layout.lines) : null),
    [selection, layout, currentId]
  )

  const codeOf = (id: string) => sectionCodes.get(id) ?? 'section'
  const currentCode = currentId ? codeOf(currentId) : 'New section'

  // Neighbour roles: the nearest section before/after the selection, plus anything it overlaps.
  const roles = useMemo(() => {
    const map = new Map<string, Role>()
    const ref = selection ?? originalSelection
    const others = layout.sceneSections
      .filter((s) => s.id !== currentId)
      .map((s) => ({ id: s.id, runs: toRuns(layout.owners.get(s.id) ?? []) }))
      .filter((s) => s.runs.length > 0)
    if (!ref) {
      for (const o of others) map.set(o.id, 'other')
      return map
    }
    const affected = new Set(
      plan ? [...plan.removals, ...plan.effects.flatMap((e) => ('sectionId' in e ? [e.sectionId] : []))] : []
    )
    const before = others.filter((o) => o.runs[0]!.from < ref.from)
    const after = others.filter((o) => o.runs[0]!.from >= ref.from)
    const nearestPrev = before
      .filter((o) => o.runs.some((r) => r.from < ref.from))
      .sort((a, b) => b.runs[b.runs.length - 1]!.to - a.runs[a.runs.length - 1]!.to)[0]
    const nearestNext = after.sort((a, b) => a.runs[0]!.from - b.runs[0]!.from).find((o) => o.runs[0]!.from > ref.to) ?? after[0]
    for (const o of others) {
      const isBefore = o.runs[0]!.from < ref.from
      const near = isBefore ? o === nearestPrev : o === nearestNext
      map.set(o.id, near || affected.has(o.id) ? (isBefore ? 'prev' : 'next') : 'other')
    }
    return map
  }, [layout, currentId, selection, originalSelection, plan])

  const ownerOfLine = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, set] of layout.owners) {
      if (id === currentId) continue
      for (const i of set) if (!map.has(i)) map.set(i, id)
    }
    return map
  }, [layout.owners, currentId])

  const firstLineOf = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, set] of layout.owners) {
      if (id === currentId) continue
      for (const run of toRuns(set)) map.set(run.from, id)
    }
    return map
  }, [layout.owners, currentId])

  // Lines the section lets go of: who receives each one (null = no section next to it).
  const releasedTo = useMemo(() => {
    const map = new Map<number, string | null>()
    for (const effect of plan?.effects ?? []) {
      const run = effect.kind === 'received' ? effect.given : effect.kind === 'unsectioned' ? effect.lines : null
      if (!run) continue
      for (let i = run.from; i <= run.to; i++) map.set(i, effect.kind === 'received' ? effect.sectionId : null)
    }
    return map
  }, [plan])

  const decorate = (line: SceneLine): ScriptLineDecor => {
    const i = line.index
    const inSel = !!selection && i >= selection.from && i <= selection.to
    const owner = ownerOfLine.get(i)
    const role = owner ? roles.get(owner) ?? 'other' : null
    const decor: ScriptLineDecor = {}
    if (inSel && role) {
      decor.textStyle = takeStyle(role)
      decor.bandClassName = 'bg-primary'
    } else if (inSel) {
      decor.textClassName = 'bg-primary/25'
      decor.bandClassName = 'bg-primary'
    } else if (role) {
      decor.textClassName = ROLE_TEXT[role]
      decor.bandClassName = ROLE_BAND[role]
    } else if (releasedTo.has(i)) {
      const receiver = releasedTo.get(i)
      const receiverRole = receiver ? roles.get(receiver) ?? 'other' : null
      if (receiverRole) {
        decor.textClassName = ROLE_TEXT[receiverRole]
        decor.bandClassName = ROLE_BAND[receiverRole]
      } else {
        decor.textClassName = 'opacity-60'
        decor.bandClassName = 'bg-[repeating-linear-gradient(var(--muted-foreground)_0_3px,transparent_3px_6px)]'
      }
    }
    if (selection && i === selection.from) {
      decor.tag = <b className="font-medium text-primary">{currentId ? currentCode : 'new'}</b>
    } else if (!inSel && firstLineOf.has(i)) {
      const id = firstLineOf.get(i)!
      decor.tag = <b className={cn('font-medium', ROLE_CODE[roles.get(id) ?? 'other'])}>{codeOf(id)}</b>
    }
    return decor
  }

  // ─── Selecting ────────────────────────────────────────────────────────────
  const onLinePointerDown = (line: SceneLine, e: React.PointerEvent<HTMLDivElement>) => {
    lastPointerType.current = e.pointerType
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    e.preventDefault()
    if (e.shiftKey && selection) {
      const anchor = line.index < selection.from ? selection.to : selection.from
      dragAnchor.current = anchor
      setSelection({ from: Math.min(anchor, line.index), to: Math.max(anchor, line.index) })
    } else {
      dragAnchor.current = line.index
      setSelection({ from: line.index, to: line.index })
    }
  }
  const onLinePointerEnter = (line: SceneLine) => {
    const anchor = dragAnchor.current
    if (anchor == null) return
    setSelection({ from: Math.min(anchor, line.index), to: Math.max(anchor, line.index) })
  }
  // Touch and pen: tap the first line, then the last (so scrolling never starts a selection).
  const onLineClick = (line: SceneLine) => {
    if (lastPointerType.current === 'mouse') return
    if (touchAnchor == null) {
      setTouchAnchor(line.index)
      setSelection({ from: line.index, to: line.index })
    } else {
      setSelection({ from: Math.min(touchAnchor, line.index), to: Math.max(touchAnchor, line.index) })
      setTouchAnchor(null)
    }
  }

  const nudge = (edge: 'start' | 'end', direction: -1 | 1) => {
    if (!selection) return
    setSelection(nudgeSelection(layout.lines, selection, edge, direction))
  }

  // ─── Derived copy ─────────────────────────────────────────────────────────
  const shotList = (id: string) => (shotsBySectionId.get(id) ?? []).map((s) => s.shotNumber)
  const impact: string[] = []
  if (plan) {
    for (const effect of plan.effects) {
      if (effect.kind === 'removed') {
        const shots = shotList(effect.sectionId)
        impact.push(
          `${codeOf(effect.sectionId)} sits entirely inside your selection. It will be removed${
            shots.length ? `, and ${shots.join(', ')} will be linked to ${currentId ? currentCode : 'the new section'} instead` : ''
          }.`
        )
      } else if (effect.kind === 'trimmed') {
        impact.push(
          `${codeOf(effect.sectionId)} gives up ${formatRuns(layout.lines, effect.taken)} and becomes ${formatRun(layout.lines, effect.remaining)}.`
        )
      } else if (effect.kind === 'split') {
        impact.push(
          `${codeOf(effect.sectionId)} is split. It keeps ${formatRun(layout.lines, effect.kept)}, and ${formatRuns(layout.lines, effect.newParts)} becomes a new section with the same shots.`
        )
      } else if (effect.kind === 'received') {
        impact.push(
          `${codeOf(effect.sectionId)} takes over ${formatRun(layout.lines, effect.given)} and becomes ${formatRun(layout.lines, effect.result)}.`
        )
      } else {
        impact.push(`${formatRun(layout.lines, effect.lines)} has no section next to it and will not belong to any section.`)
      }
    }
  }
  const affectedCodes = plan
    ? [
        ...new Set(
          plan.effects.flatMap((e) =>
            e.kind === 'removed' || e.kind === 'trimmed' || e.kind === 'split' ? [codeOf(e.sectionId)] : []
          )
        ),
      ]
    : []

  const sceneOmitted = !!sceneId && omittedSceneIds.has(sceneId)
  const currentShots = currentId ? shotsBySectionId.get(currentId) ?? [] : []
  const selectionChars = selection ? charactersForRun(layout.lines, selection) : []
  const selectionChanged = !sameRun(selection, originalSelection)
  const cutChanged = mode === 'edit' && cut !== (section?.status === 'omitted')
  const canSave = mode === 'create' ? !!selection : (!!selection && selectionChanged) || cutChanged

  const saveLabel = !selection
    ? 'Highlight the script to save'
    : affectedCodes.length && selectionChanged
      ? `Save and take from ${affectedCodes.join(', ')}`
      : mode === 'create'
        ? 'Create section'
        : 'Save changes'

  const handleSave = () => {
    if (!scene) return
    if (mode === 'edit' && section && (!selection || !selectionChanged)) {
      onSave({ kind: 'cut', sectionId: section.id, cut })
      return
    }
    if (!selection || !plan) return
    const lines = layout.lines
    const charsFor = (id: string | null, run: LineRun) =>
      charactersForRun(lines, run, id ? charactersBySectionId.get(id) ?? [] : [])
    const label = (run: LineRun) => `Scene ${scene.number} — ${formatRun(lines, run)}`
    onSave({
      kind: 'layout',
      sceneId: scene.id,
      current: {
        id: currentId,
        label: label(selection),
        cut,
        range: rangeForRun(lines, selection),
        characters: charsFor(currentId, selection),
      },
      updates: plan.updates.map((u) => ({
        sectionId: u.sectionId,
        range: rangeForRun(lines, u.run),
        characters: charsFor(u.sectionId, u.run),
      })),
      removals: plan.removals,
      splits: plan.splits.map((s) => ({
        sourceSectionId: s.sourceSectionId,
        label: label(s.run),
        range: rangeForRun(lines, s.run),
        characters: charsFor(s.sourceSectionId, s.run),
      })),
    })
  }

  const legendPrev = [...roles].find(([, r]) => r === 'prev')?.[0]
  const legendNext = [...roles].find(([, r]) => r === 'next')?.[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="grid gap-1.5 border-b border-border px-5 pb-3.5 pt-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            {mode === 'create' ? 'New section' : 'Edit section'}
            {currentId && <span className="font-mono text-base text-primary">{currentCode}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Highlight the script text this section covers. Status is set automatically.
          </DialogDescription>
          {mode === 'create' ? (
            <div className="grid max-w-md gap-1.5">
              <Label className="text-xs text-muted-foreground">Linked scene</Label>
              <Select
                value={sceneId}
                onValueChange={(v) => {
                  setSceneId(v)
                  setSelection(null)
                  setTouchAnchor(null)
                }}
              >
                <SelectTrigger className="bg-input border-border" aria-label="Linked scene">
                  <SelectValue placeholder="Select a scene…" />
                </SelectTrigger>
                <SelectContent>
                  {scenes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
              <span>Linked scene</span>
              <span className="text-foreground">{scene?.label ?? 'Unknown scene'}</span>
              <Link to="/schedule/shots" className="text-primary hover:underline">
                Open Shot List
              </Link>
            </div>
          )}
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:overflow-hidden">
          <div className="flex min-h-0 flex-col border-b border-border bg-background/40 md:border-b-0 md:border-r">
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-3 rounded-sm bg-primary" /> {currentCode}
              </span>
              {legendPrev && (
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-sky-400" /> Previous · {codeOf(legendPrev)}
                </span>
              )}
              {legendNext && (
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm bg-pink-400" /> Next · {codeOf(legendNext)}
                </span>
              )}
              {affectedCodes.length > 0 && selectionChanged && (
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-3 rounded-sm" style={takeStyle('next')} />
                  Taken from a neighbour
                </span>
              )}
            </div>
            <div className="min-h-[40vh] flex-1 overflow-y-auto pb-5 md:min-h-0" style={{ touchAction: 'pan-y' }}>
              {layout.lines.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {sceneId
                    ? 'This scene has no script text in this version, so its range can’t be drawn.'
                    : 'Choose a scene to see its script.'}
                </p>
              ) : (
                <ScriptLines
                  ref={linesRef}
                  lines={layout.lines}
                  decorate={decorate}
                  interactive
                  onLinePointerDown={onLinePointerDown}
                  onLinePointerEnter={onLinePointerEnter}
                  onLineClick={onLineClick}
                  aria-label="Script text. Drag across lines to set the section’s range."
                />
              )}
            </div>
          </div>

          <div className="grid content-start gap-5 px-5 py-4 md:overflow-y-auto">
            <section className="grid gap-2">
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Script range</h4>
              {selection ? (
                <p className="text-xl font-semibold tabular-nums" aria-live="polite">
                  {formatRun(layout.lines, selection)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {formatEighths(runEighths(layout.lines, selection))}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing selected yet.</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="mr-1">Start</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 pointer-coarse:size-10 pointer-coarse:text-base" aria-label="Move start back an eighth" disabled={!selection} onClick={() => nudge('start', -1)}>−</Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 pointer-coarse:size-10 pointer-coarse:text-base" aria-label="Move start forward an eighth" disabled={!selection} onClick={() => nudge('start', 1)}>+</Button>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="mr-1">End</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 pointer-coarse:size-10 pointer-coarse:text-base" aria-label="Move end back an eighth" disabled={!selection} onClick={() => nudge('end', -1)}>−</Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 pointer-coarse:size-10 pointer-coarse:text-base" aria-label="Move end forward an eighth" disabled={!selection} onClick={() => nudge('end', 1)}>+</Button>
                </span>
                {mode === 'edit' && originalSelection && selectionChanged && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelection(originalSelection)}>
                    Reset
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Drag across the script to set the range. Shift-click extends it. On a touch screen, tap the first
                line and then the last.
              </p>
            </section>

            {impact.length > 0 && selectionChanged && (
              <section className="grid gap-1.5 rounded-md border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-sm">
                <b className="font-semibold text-amber-500">Saving changes other sections</b>
                <ul className="grid list-disc gap-1 pl-4">
                  {impact.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <span className="text-xs text-muted-foreground">The most recent selection always wins.</span>
              </section>
            )}

            <section className="grid gap-2">
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</h4>
              {mode === 'create' ? (
                <p className="text-xs text-muted-foreground">
                  New sections start as <SectionStatusBadge status="no_coverage" className="mx-0.5" />. Link shots from
                  the Shot List and the status moves on by itself.
                </p>
              ) : cut || sceneOmitted ? (
                <div className="rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground">
                  <b className="text-foreground">Cut.</b>{' '}
                  {sceneOmitted && !cut
                    ? 'The script supervisor marked this scene omitted. '
                    : 'This section is left out of coverage, scheduling and sides. '}
                  Its shots stay linked, so restoring it puts everything back.
                </div>
              ) : (
                <>
                  <SectionStatusSteps steps={sectionStatusSteps(currentShots)} orientation="vertical" />
                  <p className="text-xs text-muted-foreground">
                    Status comes from the Shot List, the schedule and the Script Supervisor page. It can’t be edited
                    here.
                  </p>
                </>
              )}
            </section>

            <section className="grid gap-2">
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Characters</h4>
              {selectionChars.length ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {selectionChars.map((c) => (
                      <span key={c.character_name} className="rounded border border-border px-2 py-0.5 text-xs tracking-wide">
                        {c.character_name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Read from the selected lines.</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">None in the selected lines.</p>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {mode === 'edit' && section && (
            <>
              <Button type="button" variant="ghost" onClick={() => setCut((c) => !c)} disabled={pending}>
                {cut ? 'Restore section' : 'Mark as cut'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => (confirmDelete ? onDelete(section.id) : setConfirmDelete(true))}
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </Button>
              {confirmDelete && (
                <span className="text-xs text-muted-foreground">
                  Its shots will no longer be linked to any section.
                </span>
              )}
            </>
          )}
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending || !canSave || !scene}>
            {pending ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
