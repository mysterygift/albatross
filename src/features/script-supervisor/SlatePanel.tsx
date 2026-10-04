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
  TAKE_STATUS_LABEL,
  formatDuration,
  takeToMark,
} from '@/lib/script-supervisor/slatePanel'

const SHOT_TYPE_LABEL: Record<SlateShotType, string> = {
  master: 'Master / wide',
  single: 'Single',
  multiple: 'Multiple (2S, 3S, group)',
  insert: 'Insert / cutaway',
  other: 'Other',
}

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

export function SlatePanel(props: SlatePanelProps) {
  const { slate, takes, touch, busy } = props
  const [showSetup, setShowSetup] = useState(true)

  if (!slate) {
    return (
      <section aria-label="Slate" className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-lg">No slate yet</h2>
        <p className="text-sm text-muted-foreground">
          Choose a scene, then press New slate (N). Camera, lens and rolls carry over from the previous slate.
        </p>
      </section>
    )
  }

  const rolling = props.rollingSinceMs != null
  const nextTakeNumber = takes.reduce((m, t) => Math.max(m, t.take_number), 0) + 1
  const target = takeToMark(takes, props.selectedTakeId)
  const sortedTakes = [...takes].sort((a, b) => b.take_number - a.take_number)
  const markButtons: Array<{ status: Exclude<TakeStatus, 'pending'>; label: string; key: string }> = [
    { status: 'print', label: 'Print', key: 'P' },
    { status: 'hold', label: 'Hold', key: 'H' },
    { status: 'ng', label: 'NG', key: 'G' },
  ]

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

      {showSetup && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="slate-shot-type" className="text-xs text-muted-foreground">
                Shot type
              </Label>
              <Select
                value={slate.shot_type ?? NO_SHOT_TYPE}
                onValueChange={(v) =>
                  props.onUpdateSlate({ shot_type: v === NO_SHOT_TYPE ? null : (v as SlateShotType) })
                }
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
            {SETUP_FIELDS.map((f) => (
              <BlurField
                key={f.key}
                id={`slate-${f.key}`}
                label={f.label}
                value={slate[f.key]}
                mono={f.mono}
                touch={touch}
                onCommit={(next) => props.onUpdateSlate(patchFor(f.key, next))}
              />
            ))}
            <div className="col-span-2">
              <BlurField
                id="slate-description"
                label="Description"
                value={slate.description}
                touch={touch}
                onCommit={(next) => props.onUpdateSlate({ description: next })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sound</p>
            <SegmentedControl<SlateSoundMode>
              ariaLabel="Sound"
              size={touch ? 'md' : 'sm'}
              value={slate.sound_mode}
              onValueChange={(v) => props.onUpdateSlate({ sound_mode: v })}
              options={[
                { value: 'sync', label: 'Sync' },
                { value: 'mute', label: 'Mute' },
                { value: 'wild_track', label: 'Wild track' },
              ]}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={props.onRollCut}
        disabled={busy && !rolling}
        aria-keyshortcuts="Space"
        className={cn(
          'w-full flex items-center justify-between rounded-lg px-4 font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
          touch ? 'h-[72px] text-lg' : 'h-14 text-base',
          rolling ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground'
        )}
      >
        <span className="flex items-center gap-2">
          {rolling ? <Square className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
          {rolling ? `Cut take ${nextTakeNumber}` : `Roll take ${nextTakeNumber}`}
        </span>
        <span className="font-mono text-xl" aria-live="off" data-testid="stopwatch">
          {formatDuration(rolling ? props.nowMs - props.rollingSinceMs! : 0)}
        </span>
      </button>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label={target ? `Mark take ${target.take_number}` : 'Mark take'}>
        {markButtons.map((b) => (
          <Button
            key={b.status}
            type="button"
            variant="secondary"
            className={cn(touch ? 'h-14 text-base' : 'h-9')}
            disabled={!target || busy}
            aria-keyshortcuts={b.key}
            onClick={() => props.onMark(b.status)}
          >
            {b.label}
            {!touch && <span className="font-mono text-xs opacity-60">{b.key}</span>}
          </Button>
        ))}
      </div>

      {target?.status === 'ng' && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">NG reason · take {target.take_number}</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(NG_REASON_LABEL) as TakeNgReason[]).map((r) => (
              <Button
                key={r}
                type="button"
                variant="outline"
                size={touch ? 'default' : 'sm'}
                aria-pressed={target.ng_reason === r}
                className={cn('rounded-full', target.ng_reason === r && 'ring-2 ring-primary')}
                onClick={() => props.onNgReason(r)}
              >
                {NG_REASON_LABEL[r]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
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
                  'grid grid-cols-[48px_minmax(0,1fr)_56px_84px] gap-2 items-center px-3 border-b border-border last:border-b-0',
                  touch ? 'py-3' : 'py-2',
                  t.status === 'print' && 'bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)]'
                )}
              >
                <span className="font-mono font-semibold">{t.take_number}</span>
                <Input
                  aria-label={`Take ${t.take_number} remarks`}
                  key={`${t.id}:${t.remarks ?? ''}`}
                  defaultValue={t.remarks ?? ''}
                  placeholder="Remarks"
                  className={cn('h-8 text-xs', touch && 'h-10 text-sm')}
                  onBlur={(e) => {
                    const next = e.currentTarget.value.trim()
                    if (next !== (t.remarks ?? '')) props.onUpdateTakeRemarks(t.id, next === '' ? null : next)
                  }}
                />
                <span className="font-mono text-xs">{formatDuration(t.duration_ms)}</span>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Take ${t.take_number}: ${TAKE_STATUS_LABEL[t.status]}${selected ? ', selected for marking' : ''}`}
                  onClick={() => props.onSelectTake(selected ? null : t.id)}
                  className={cn(
                    'rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    touch ? 'h-10' : 'h-7',
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
            if (next !== (slate.notes ?? '')) props.onUpdateSlate({ notes: next === '' ? null : next })
          }}
        />
      </div>
    </section>
  )
}
