import { useState } from 'react'
import { Circle, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { UpdateSlateInput } from '@/lib/db/repositories/scriptSupervisor'
import type { Slate, SlateShotType, SlateSoundMode, Take, TakeNgReason, TakeStatus } from '@/lib/db/types'
import {
  NG_REASON_LABEL,
  SHOT_TYPE_LABEL,
  SOUND_MODE_LABEL,
  TAKE_STATUS_LABEL,
  formatDuration,
  nextTakeNumber,
  takeToMark,
} from '@/lib/script-supervisor/slatePanel'

const NO_SHOT_TYPE = '__none__'

function patchFor(key: TextField, value: string | null): UpdateSlateInput {
  const patch: UpdateSlateInput = {}
  patch[key] = value
  return patch
}

type TextField = 'shot_code' | 'description' | 'camera' | 'lens' | 'stop' | 'filter' | 'camera_roll' | 'sound_roll'

const SETUP_FIELDS: Array<{ key: TextField; label: string; mono?: boolean }> = [
  { key: 'shot_code', label: 'Shot', mono: true },
  { key: 'camera', label: 'Camera', mono: true },
  { key: 'lens', label: 'Lens', mono: true },
  { key: 'stop', label: 'Stop', mono: true },
  { key: 'filter', label: 'Filter', mono: true },
  { key: 'camera_roll', label: 'Camera roll', mono: true },
  { key: 'sound_roll', label: 'Sound roll', mono: true },
]

const MARK_BUTTONS: Array<{ status: Exclude<TakeStatus, 'pending'>; label: string; key: string }> = [
  { status: 'print', label: 'Print', key: 'P' },
  { status: 'hold', label: 'Hold', key: 'H' },
  { status: 'ng', label: 'NG', key: 'G' },
]

export type SlatePanelProps = {
  slate: Slate | null
  slateLabel: string | null
  sceneLabel: string | null
  takes: Take[]
  selectedTakeId: string | null
  onSelectTake: (takeId: string | null) => void
  rollingSinceMs: number | null
  nowMs: number
  onRollCut: () => void
  onMark: (status: Exclude<TakeStatus, 'pending'>) => void
  onNgReason: (reason: TakeNgReason) => void
  onUpdateSlate: (patch: UpdateSlateInput) => void
  onUpdateTakeRemarks: (takeId: string, remarks: string | null) => void
  touch: boolean
  busy: boolean
}

/** Saves on blur, and only when the value actually changed. */
function BlurField({
  id,
  label,
  value,
  mono,
  touch,
  onCommit,
}: {
  id: string
  label: string
  value: string | null
  mono?: boolean
  touch: boolean
  onCommit: (next: string | null) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        key={`${id}:${value ?? ''}`}
        defaultValue={value ?? ''}
        className={cn(mono && 'font-mono', touch && 'h-11 text-base')}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim()
          if (next !== (value ?? '')) onCommit(next === '' ? null : next)
        }}
      />
    </div>
  )
}

const markClass: Record<TakeStatus, string> = {
  print: 'text-primary ring-2 ring-primary',
  hold: 'bg-secondary text-secondary-foreground',
  ng: 'text-muted-foreground ring-1 ring-border line-through',
  incomplete: 'text-muted-foreground ring-1 ring-border',
  pending: 'text-muted-foreground ring-1 ring-border',
}

/** Camera setup: shot type, codes, lens, rolls, description and sound. Two columns, or three on a wide tablet sheet. */
export function SlateSetupFields({
  slate,
  touch,
  columns = 2,
  onUpdateSlate,
}: {
  slate: Slate
  touch: boolean
  columns?: 2 | 3
  onUpdateSlate: (patch: UpdateSlateInput) => void
}) {
  const shotType = (
    <div className="space-y-1">
      <Label htmlFor="slate-shot-type" className="text-xs text-muted-foreground">
        Shot type
      </Label>
      <Select
        value={slate.shot_type ?? NO_SHOT_TYPE}
        onValueChange={(v) => onUpdateSlate({ shot_type: v === NO_SHOT_TYPE ? null : (v as SlateShotType) })}
      >
        <SelectTrigger id="slate-shot-type" className={cn('w-full', touch && 'h-11 text-base')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SHOT_TYPE}>Not set</SelectItem>
          {(Object.keys(SHOT_TYPE_LABEL) as SlateShotType[]).map((t) => (
            <SelectItem key={t} value={t}>
              {SHOT_TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
  const sound = (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Sound</p>
      <SegmentedControl<SlateSoundMode>
        ariaLabel="Sound"
        size={touch ? 'md' : 'sm'}
        className={cn(touch && 'h-11')}
        value={slate.sound_mode}
        onValueChange={(v) => onUpdateSlate({ sound_mode: v })}
        // A third-width column can't fit "Wild track" beside the other two.
        options={(Object.keys(SOUND_MODE_LABEL) as SlateSoundMode[]).map((v) => ({
          value: v,
          label: columns === 3 && v === 'wild_track' ? 'Wild' : SOUND_MODE_LABEL[v],
        }))}
      />
    </div>
  )
  const fields = SETUP_FIELDS.map((f) => (
    <BlurField
      key={f.key}
      id={`slate-${f.key}`}
      label={f.label}
      value={slate[f.key]}
      mono={f.mono}
      touch={touch}
      onCommit={(next) => onUpdateSlate(patchFor(f.key, next))}
    />
  ))
  const description = (
    <BlurField
      id="slate-description"
      label="Description"
      value={slate.description}
      touch={touch}
      onCommit={(next) => onUpdateSlate({ description: next })}
    />
  )

  if (columns === 3) {
    // Shot type, shot and sound share the first row; the description gets a row of its own.
    const [shot, ...rest] = fields
    return (
      <div className="grid grid-cols-3 gap-3">
        {shotType}
        {shot}
        {sound}
        <div className="col-span-3">{description}</div>
        {rest}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">{shotType}</div>
        {fields}
        <div className="col-span-2">{description}</div>
      </div>
      {sound}
    </div>
  )
}

/** Roll / Cut with the running stopwatch (Space). */
export function RollCutButton({
  takes,
  rollingSinceMs,
  nowMs,
  busy,
  touch,
  className,
  onRollCut,
}: {
  takes: readonly Take[]
  rollingSinceMs: number | null
  nowMs: number
  busy: boolean
  touch: boolean
  className?: string
  onRollCut: () => void
}) {
  const rolling = rollingSinceMs != null
  const next = nextTakeNumber(takes)
  return (
    <button
      type="button"
      onClick={onRollCut}
      disabled={busy && !rolling}
      aria-keyshortcuts="Space"
      className={cn(
        'w-full flex items-center justify-between rounded-lg px-4 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        touch ? 'h-[72px] text-lg' : 'h-14 text-base',
        rolling ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground',
        className
      )}
    >
      <span className="flex items-center gap-2">
        {rolling ? <Square className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
        {rolling ? `Cut take ${next}` : `Roll take ${next}`}
      </span>
      <span className="font-mono text-xl" aria-live="off" data-testid="stopwatch">
        {formatDuration(rolling ? nowMs - rollingSinceMs : 0)}
      </span>
    </button>
  )
}

/** Print / Hold / NG for the selected take, else the latest (P / H / G). */
export function MarkTakeButtons({
  target,
  busy,
  touch,
  className,
  buttonClassName,
  onMark,
}: {
  target: Take | null
  busy: boolean
  touch: boolean
  className?: string
  buttonClassName?: string
  onMark: (status: Exclude<TakeStatus, 'pending'>) => void
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)} role="group" aria-label={target ? `Mark take ${target.take_number}` : 'Mark take'}>
      {MARK_BUTTONS.map((b) => (
        <Button
          key={b.status}
          type="button"
          variant="secondary"
          className={cn(touch ? 'h-14 text-base' : 'h-9', buttonClassName)}
          disabled={!target || busy}
          aria-keyshortcuts={b.key}
          onClick={() => onMark(b.status)}
        >
          {b.label}
          {!touch && <span className="font-mono text-xs opacity-60">{b.key}</span>}
        </Button>
      ))}
    </div>
  )
}

/** NG reason chips, shown while the marked take is NG. */
export function NgReasonChips({ target, touch, onNgReason }: { target: Take | null; touch: boolean; onNgReason: (reason: TakeNgReason) => void }) {
  if (target?.status !== 'ng') return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">NG reason | take {target.take_number}</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NG_REASON_LABEL) as TakeNgReason[]).map((r) => (
          <Button
            key={r}
            type="button"
            variant="outline"
            size={touch ? 'lg' : 'sm'}
            aria-pressed={target.ng_reason === r}
            className={cn('rounded-full', touch && 'h-11', target.ng_reason === r && 'ring-2 ring-primary')}
            onClick={() => onNgReason(r)}
          >
            {NG_REASON_LABEL[r]}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** The slate's takes, newest first: remarks, duration and mark. Tapping a mark selects that take for marking. */
export function TakesTable({
  takes,
  target,
  touch,
  className,
  onSelectTake,
  onUpdateTakeRemarks,
}: {
  takes: readonly Take[]
  target: Take | null
  touch: boolean
  className?: string
  onSelectTake: (takeId: string | null) => void
  onUpdateTakeRemarks: (takeId: string, remarks: string | null) => void
}) {
  const sortedTakes = [...takes].sort((a, b) => b.take_number - a.take_number)
  return (
    <div className={cn('rounded-xl border border-border overflow-hidden', className)}>
      <div className="grid grid-cols-[48px_minmax(0,1fr)_56px_84px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
        <span>Take</span>
        <span>Remarks</span>
        <span>Dur</span>
        <span>Mark</span>
      </div>
      {sortedTakes.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted-foreground">No takes yet. Roll (Space) to start take 1.</p>
      )}
      <ul aria-label="Takes">
        {sortedTakes.map((t) => {
          const selected = target?.id === t.id
          return (
            <li
              key={t.id}
              data-testid={`take-row-${t.take_number}`}
              className={cn(
                'grid grid-cols-[48px_minmax(0,1fr)_56px_84px] gap-2 items-center px-3 py-2 border-b border-border last:border-b-0',
                t.status === 'print' && 'bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)]'
              )}
            >
              <span className="font-mono font-semibold">{t.take_number}</span>
              <Input
                aria-label={`Take ${t.take_number} remarks`}
                key={`${t.id}:${t.remarks ?? ''}`}
                defaultValue={t.remarks ?? ''}
                placeholder="Remarks"
                className={cn('h-8 text-xs', touch && 'h-11 text-base')}
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim()
                  if (next !== (t.remarks ?? '')) onUpdateTakeRemarks(t.id, next === '' ? null : next)
                }}
              />
              <span className="font-mono text-xs">{formatDuration(t.duration_ms)}</span>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Take ${t.take_number}: ${TAKE_STATUS_LABEL[t.status]}${selected ? ', selected for marking' : ''}`}
                onClick={() => onSelectTake(selected ? null : t.id)}
                className={cn(
                  'rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  touch ? 'h-11' : 'h-7',
                  markClass[t.status],
                  selected && 'outline outline-2 outline-offset-2 outline-ring/60'
                )}
              >
                {TAKE_STATUS_LABEL[t.status]}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Compact takes row for the docked tablet deck: number, duration and mark; tap one to mark it instead of the latest. */
export function TakeChips({
  takes,
  target,
  onSelectTake,
}: {
  takes: readonly Take[]
  target: Take | null
  onSelectTake: (takeId: string | null) => void
}) {
  if (takes.length === 0) return <p className="text-sm text-muted-foreground">No takes yet. Roll to start take 1.</p>
  const sortedTakes = [...takes].sort((a, b) => b.take_number - a.take_number)
  return (
    <ul aria-label="Takes" className="flex gap-2 overflow-x-auto p-1">
      {sortedTakes.map((t) => {
        const selected = target?.id === t.id
        return (
          <li key={t.id} data-testid={`take-chip-${t.take_number}`} className="shrink-0">
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`Take ${t.take_number}: ${TAKE_STATUS_LABEL[t.status]}${selected ? ', selected for marking' : ''}`}
              onClick={() => onSelectTake(selected ? null : t.id)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                // Strike through only the word NG, not the take number and reason.
                t.status === 'ng' ? 'text-muted-foreground ring-1 ring-border' : markClass[t.status],
                selected && 'outline outline-2 outline-offset-2 outline-ring/60'
              )}
            >
              <span className="font-mono">{t.take_number}</span>
              <span className="font-mono text-xs opacity-80">{formatDuration(t.duration_ms)}</span>
              <span className={cn(t.status === 'ng' && 'line-through')}>{TAKE_STATUS_LABEL[t.status]}</span>
              {t.status === 'ng' && t.ng_reason && <span className="text-xs opacity-80">{NG_REASON_LABEL[t.ng_reason]}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Free-text continuity and editor notes for the whole slate. */
export function SlateNotesField({ slate, touch, onUpdateSlate }: { slate: Slate; touch: boolean; onUpdateSlate: (patch: UpdateSlateInput) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="slate-notes" className="text-xs text-muted-foreground">
        Continuity and editor notes
      </Label>
      <Textarea
        id="slate-notes"
        key={`notes:${slate.id}:${slate.notes ?? ''}`}
        defaultValue={slate.notes ?? ''}
        rows={3}
        className={cn(touch && 'text-base')}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim()
          if (next !== (slate.notes ?? '')) onUpdateSlate({ notes: next === '' ? null : next })
        }}
      />
    </div>
  )
}

/** Shown in place of the slate controls before the day's first slate. */
export function NoSlateYet({ className }: { className?: string }) {
  return (
    <section aria-label="Slate" className={cn('rounded-xl border border-border bg-card p-4 space-y-2', className)}>
      <h2 className="text-lg">No slate yet</h2>
      <p className="text-sm text-muted-foreground">
        Choose a scene, then press New slate (N). Camera, lens and rolls carry over from the previous slate.
      </p>
    </section>
  )
}

/** Desktop slate panel: setup, roll / cut, marks, takes and notes stacked in one card. */
export function SlatePanel(props: SlatePanelProps) {
  const { slate, takes, touch, busy } = props
  const [showSetup, setShowSetup] = useState(true)

  if (!slate) return <NoSlateYet />

  const target = takeToMark(takes, props.selectedTakeId)

  return (
    <section aria-label={`Slate ${props.slateLabel ?? ''}`} className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Slate</span>
        <span className="font-mono text-2xl font-semibold" data-testid="current-slate-label">
          {props.slateLabel}
        </span>
        {props.sceneLabel && <span className="text-sm text-muted-foreground">Sc {props.sceneLabel}</span>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={showSetup}
          onClick={() => setShowSetup((v) => !v)}
        >
          {showSetup ? 'Hide setup' : 'Show setup'}
        </Button>
      </div>

      {showSetup && <SlateSetupFields slate={slate} touch={touch} onUpdateSlate={props.onUpdateSlate} />}

      <RollCutButton
        takes={takes}
        rollingSinceMs={props.rollingSinceMs}
        nowMs={props.nowMs}
        busy={busy}
        touch={touch}
        onRollCut={props.onRollCut}
      />

      <MarkTakeButtons target={target} busy={busy} touch={touch} onMark={props.onMark} />
      <NgReasonChips target={target} touch={touch} onNgReason={props.onNgReason} />

      <TakesTable
        takes={takes}
        target={target}
        touch={touch}
        onSelectTake={props.onSelectTake}
        onUpdateTakeRemarks={props.onUpdateTakeRemarks}
      />

      <SlateNotesField slate={slate} touch={touch} onUpdateSlate={props.onUpdateSlate} />
    </section>
  )
}
