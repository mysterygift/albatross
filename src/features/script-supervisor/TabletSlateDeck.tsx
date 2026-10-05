import { useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { ContinuityMediaView } from '@/lib/db/repositories/scriptAnnotations'
import type { ContinuityTag, AnnotationView } from '@/lib/script-supervisor/annotations'
import { SHOT_TYPE_LABEL, slateSetupSummary, takeToMark } from '@/lib/script-supervisor/slatePanel'
import { cn } from '@/lib/utils'

import { TRAMLINE_COLOUR } from './LinedScript'
import { ContinuityPhotosSection, ScriptNotesSection } from './SlateNotesPanel'
import {
  MarkTakeButtons,
  NgReasonChips,
  NoSlateYet,
  RollCutButton,
  SlateNotesField,
  SlateSetupFields,
  TakeChips,
  TakesTable,
  type SlatePanelProps,
} from './SlatePanel'
import type { TabletLayout } from './TabletWorkspace'

type DeckTab = 'takes' | 'notes' | 'photos' | 'setup'

export type TabletSlateDeckProps = Omit<SlatePanelProps, 'touch'> & {
  /** Arrangement and space from the workspace. Short: the dock leaves out the takes row (still under Takes & notes). */
  layout: TabletLayout
  notes: AnnotationView[]
  photos: ContinuityMediaView[]
  photoTakeNumber: number | null
  photosBusy: boolean
  onEditNote: (note: AnnotationView) => void
  onAddPhotos: (files: File[], tags: ContinuityTag[]) => void
  onRemovePhoto: (id: string) => void
}

/**
 * Slate controls for the tablet layout. Roll / Cut and Print / Hold / NG are always on screen; takes, notes,
 * photos and the camera setup are tabs underneath. Setup is collapsed to a one-line summary because it
 * carries over from the previous slate and is rarely changed mid-setup.
 *
 * Wide: a full-height column. Narrow: docked under the workbench, showing the takes as chips until expanded.
 * Compact (phone held upright): docked, with Roll / Cut and the marks stacked full width and icon-only header buttons.
 * Phone landscape: the column scrolls as a whole because there is no height for the tabs to have their own scroller.
 */
export function TabletSlateDeck(props: TabletSlateDeckProps) {
  const { slate, takes, busy, layout } = props
  const [tab, setTab] = useState<DeckTab>('takes')
  const [expanded, setExpanded] = useState(false)
  const docked = layout.arrangement === 'narrow'
  const { compact, phoneLandscape } = layout

  if (!slate) return <NoSlateYet className={cn(!docked && 'self-start')} />

  const target = takeToMark(takes, props.selectedTakeId)
  const shotLine = [slate.shot_type ? SHOT_TYPE_LABEL[slate.shot_type] : null, [slate.shot_code, slate.description].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ')
  const setup = slateSetupSummary(slate)
  const openSetup = () => {
    setTab('setup')
    setExpanded(true)
  }

  const heading = (
    <div className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Slate</span>
      <span className="font-mono text-2xl font-semibold" data-testid="current-slate-label">
        {props.slateLabel}
      </span>
      {props.sceneLabel && <span className="shrink-0 text-sm text-muted-foreground">Sc {props.sceneLabel}</span>}
      {docked && <span className="min-w-0 truncate text-sm text-muted-foreground">{shotLine ? `· ${shotLine}` : ''}</span>}
    </div>
  )
  const setupButton = compact ? (
    <Button type="button" variant="outline" size="icon-lg" className="size-11 shrink-0" aria-label="Setup" onClick={openSetup}>
      <SlidersHorizontal aria-hidden />
    </Button>
  ) : (
    <Button type="button" variant="outline" size="lg" className="h-11 shrink-0 px-4" onClick={openSetup}>
      <SlidersHorizontal aria-hidden />
      Setup
    </Button>
  )
  const roll = (
    <RollCutButton
      takes={takes}
      rollingSinceMs={props.rollingSinceMs}
      nowMs={props.nowMs}
      busy={busy}
      touch
      className={cn(docked && (compact ? 'h-14' : 'h-16 flex-1'), phoneLandscape && 'h-14')}
      onRollCut={props.onRollCut}
    />
  )
  const marks = (
    <MarkTakeButtons
      target={target}
      busy={busy}
      touch
      className={cn(docked && !compact && 'w-[336px] shrink-0')}
      buttonClassName={cn(docked && (compact ? 'h-12' : 'h-16'))}
      onMark={props.onMark}
    />
  )
  const markCaption = (
    <p className="text-xs text-muted-foreground">
      {target
        ? `Mark take ${target.take_number}${props.selectedTakeId ? '' : ' (latest)'}. Tap another take’s mark to change it.`
        : 'Roll a take, then mark it.'}
    </p>
  )
  const tabs = (
    <SegmentedControl<DeckTab>
      ariaLabel="Slate details"
      className="h-11"
      value={tab}
      onValueChange={setTab}
      options={[
        { value: 'takes', label: `Takes ${takes.length}` },
        { value: 'notes', label: props.notes.length > 0 ? `Notes ${props.notes.length}` : 'Notes' },
        { value: 'photos', label: props.photos.length > 0 ? `Photos ${props.photos.length}` : 'Photos' },
        { value: 'setup', label: 'Setup' },
      ]}
    />
  )
  const tabContent =
    tab === 'takes' ? (
      <TakesTable takes={takes} target={target} touch onSelectTake={props.onSelectTake} onUpdateTakeRemarks={props.onUpdateTakeRemarks} />
    ) : tab === 'notes' ? (
      <div className="space-y-4">
        <SlateNotesField slate={slate} touch onUpdateSlate={props.onUpdateSlate} />
        <ScriptNotesSection notes={props.notes} touch onEditNote={props.onEditNote} />
      </div>
    ) : tab === 'photos' ? (
      <ContinuityPhotosSection
        photos={props.photos}
        photoTakeNumber={props.photoTakeNumber}
        busy={props.photosBusy}
        touch
        onAddPhotos={props.onAddPhotos}
        onRemovePhoto={props.onRemovePhoto}
      />
    ) : (
      <div className="space-y-2">
        <SlateSetupFields slate={slate} touch columns={docked && !compact ? 3 : 2} onUpdateSlate={props.onUpdateSlate} />
        <p className="text-xs text-muted-foreground">Camera, lens, stop, filter, sound and rolls carry over to the next slate.</p>
      </div>
    )

  if (docked) {
    return (
      <section
        aria-label={`Slate ${props.slateLabel ?? ''}`}
        className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm', compact ? 'gap-2 p-2.5' : 'gap-3 p-3')}
      >
        <div className="flex items-center gap-2">
          {heading}
          {setupButton}
          {compact ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11 shrink-0"
              aria-label={expanded ? 'Less' : 'Takes & notes'}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="lg" className="h-11 shrink-0 px-4" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Less' : 'Takes & notes'}
              {expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
            </Button>
          )}
        </div>
        <div className={cn('flex gap-2', compact && 'flex-col')}>
          {roll}
          {marks}
        </div>
        <NgReasonChips target={target} touch onNgReason={props.onNgReason} />
        {expanded ? (
          <>
            {tabs}
            <div className={cn('overflow-y-auto', compact ? 'max-h-[38dvh]' : 'max-h-[45dvh]')}>{tabContent}</div>
          </>
        ) : (
          !layout.short && <TakeChips takes={takes} target={target} onSelectTake={props.onSelectTake} />
        )}
      </section>
    )
  }

  return (
    <section
      aria-label={`Slate ${props.slateLabel ?? ''}`}
      className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-card', phoneLandscape ? 'gap-2 overflow-y-auto p-3' : 'gap-3 p-4')}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {heading}
          {setupButton}
        </div>
        {shotLine && (
          <p className="flex items-center gap-2 truncate text-sm">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: TRAMLINE_COLOUR[slate.shot_type ?? 'none'] }} />
            <span className="truncate">{shotLine}</span>
          </p>
        )}
        {setup && <p className="truncate font-mono text-xs text-muted-foreground">{setup}</p>}
      </div>
      {roll}
      <div className="space-y-1.5">
        {markCaption}
        {marks}
      </div>
      <NgReasonChips target={target} touch onNgReason={props.onNgReason} />
      {tabs}
      <div className={cn(!phoneLandscape && 'min-h-0 flex-1 overflow-y-auto')}>{tabContent}</div>
    </section>
  )
}
