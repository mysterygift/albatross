import { useState, type ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DayProgress, ShootProgress } from '@/lib/db/scriptSupervisorProgressService'
import type { SceneProgressInput } from '@/lib/db/repositories/scriptSupervisor'
import {
  SCENE_STATUS_LABEL,
  formatPageEighths,
  formatScreenTime,
  parseScreenTime,
  type SceneProgressRow,
  type SceneProgressStatus,
} from '@/lib/script-supervisor/progress'

import { SceneStatusPip } from './SceneStatusPip'

type Filter = 'all' | 'part_shot' | 'not_shot' | 'complete'

const MARK_NONE = '__none__'

export type ProgressViewProps = {
  progress: ShootProgress | undefined
  isLoading: boolean
  /** Day used when marking a scene complete with no slate history. */
  fallbackDayId: string | null
  onSetProgress: (sceneId: string, input: SceneProgressInput) => void
  onOpenScene: (sceneId: string) => void
  /** Rendered above the stats (the day report card). */
  header?: ReactNode
}

function dayLabel(d: { dayNumber: number | null; shootDate: string }): string {
  return d.dayNumber != null ? `Day ${d.dayNumber}` : d.shootDate
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function DayBars({ days }: { days: DayProgress[] }) {
  const max = Math.max(8, ...days.map((d) => Math.max(d.scheduledEighths, d.completedEighths)))
  if (days.length === 0) return null
  return (
    <section aria-label="Pages completed per day" className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="font-medium">Pages completed per day vs stripboard</h2>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden />
          Completed
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm ring-[1.5px] ring-inset ring-muted-foreground" aria-hidden />
          Scheduled
        </span>
      </div>
      <div className="overflow-x-auto">
        <ul className="flex items-end gap-1.5 h-36 min-w-[480px] border-b border-border">
          {days.map((d) => (
            <li
              key={d.shootDayId}
              className="relative flex-1 h-full flex items-end justify-center"
              aria-label={`${dayLabel(d)}: ${formatPageEighths(d.completedEighths)} of ${formatPageEighths(d.scheduledEighths)} pages, ${d.slates} slates`}
            >
              <span
                aria-hidden
                className="absolute bottom-0 inset-x-[15%] rounded-t ring-[1.5px] ring-inset ring-muted-foreground"
                style={{ height: `${(d.scheduledEighths / max) * 100}%` }}
              />
              <span
                aria-hidden
                className="relative w-1/2 rounded-t-sm bg-primary/70"
                style={{ height: `${(d.completedEighths / max) * 100}%` }}
              />
            </li>
          ))}
        </ul>
        <div className="flex gap-1.5 min-w-[480px] pt-1" aria-hidden>
          {days.map((d) => (
            <span key={d.shootDayId} className="flex-1 text-center font-mono text-xs text-muted-foreground">
              {d.dayNumber ?? '–'}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function TimedInput({ row, onCommit }: { row: SceneProgressRow; onCommit: (seconds: number | null) => void }) {
  const [invalid, setInvalid] = useState(false)
  return (
    <Input
      aria-label={`Timed screen time for scene ${row.scene.scene_number}, minutes and seconds`}
      aria-invalid={invalid || undefined}
      key={`${row.scene.id}:${row.timedSeconds ?? ''}`}
      defaultValue={row.timedSeconds != null ? formatScreenTime(row.timedSeconds) : ''}
      placeholder={row.estimatedSeconds > 0 ? `${formatScreenTime(row.estimatedSeconds)} est.` : 'm:ss'}
      className={cn('h-8 w-24 font-mono text-xs', invalid && 'border-destructive')}
      onBlur={(e) => {
        const raw = e.currentTarget.value
        const next = parseScreenTime(raw)
        if (raw.trim() !== '' && next == null) {
          setInvalid(true)
          return
        }
        setInvalid(false)
        if (next !== row.timedSeconds) onCommit(next)
      }}
    />
  )
}

function CreditInput({ row, onCommit }: { row: SceneProgressRow; onCommit: (eighths: number | null) => void }) {
  return (
    <Input
      aria-label={`Pages credited for scene ${row.scene.scene_number}, in eighths`}
      key={`${row.scene.id}:${row.creditedEighths ?? ''}`}
      defaultValue={row.creditedEighths ?? ''}
      inputMode="numeric"
      placeholder="eighths"
      className="h-8 w-20 font-mono text-xs"
      onBlur={(e) => {
        const raw = e.currentTarget.value.trim()
        const next = raw === '' ? null : Number(raw)
        if (next !== null && (!Number.isInteger(next) || next < 0)) return
        if (next !== row.creditedEighths) onCommit(next)
      }}
    />
  )
}

/** Review mode (SS4): what has been shot so far, per scene and per day. */
export function ProgressView({ progress, isLoading, fallbackDayId, onSetProgress, onOpenScene, header }: ProgressViewProps) {
  const [filter, setFilter] = useState<Filter>('all')

  if (isLoading || !progress) {
    return <p className="text-sm text-muted-foreground">Loading progress…</p>
  }

  const { totals, rows, days } = progress
  const visible = rows.filter((r) => filter === 'all' || r.status === filter)
  const pct = totals.totalEighths > 0 ? Math.round((totals.shotEighths / totals.totalEighths) * 100) : 0
  const dayIdByDate = new Map(days.map((d) => [d.shootDate, d.shootDayId]))

  const markValue = (r: SceneProgressRow) =>
    r.status === 'complete' || r.status === 'omitted' ? r.status : MARK_NONE

  const setMark = (r: SceneProgressRow, value: string) => {
    if (value === 'omitted') {
      onSetProgress(r.scene.id, { marked_status: 'omitted' })
    } else if (value === 'complete') {
      const dayId = (r.lastShootDate ? dayIdByDate.get(r.lastShootDate) : null) ?? fallbackDayId
      onSetProgress(r.scene.id, { marked_status: 'complete', completed_shoot_day_id: dayId })
    } else {
      onSetProgress(r.scene.id, { marked_status: null })
    }
  }

  return (
    <div className="space-y-4">
      {header}
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <StatTile
          label="Pages shot"
          value={`${formatPageEighths(totals.shotEighths)} / ${formatPageEighths(totals.totalEighths)}`}
          sub={`${pct}%`}
        />
        <StatTile
          label="Scenes"
          value={`${totals.complete} / ${totals.scenes}`}
          sub={`${totals.partShot} part shot | ${totals.notShot} not shot${totals.omitted ? ` | ${totals.omitted} omitted` : ''}`}
        />
        <StatTile
          label="Setups | takes"
          value={`${totals.slates} | ${totals.takes}`}
        />
      </div>

      <DayBars days={days} />

      <section aria-label="Scenes" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
          <h2 className="font-medium">Scenes</h2>
          <span className="flex-1" />
          <SegmentedControl<Filter>
            ariaLabel="Filter scenes"
            size="sm"
            className="w-auto"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'part_shot', label: 'Part shot' },
              { value: 'not_shot', label: 'Not shot' },
              { value: 'complete', label: 'Complete' },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>Scene</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Slates</TableHead>
                <TableHead className="text-right">Takes</TableHead>
                <TableHead className="text-right">Prints</TableHead>
                <TableHead className="text-right">Shot</TableHead>
                <TableHead>Timed</TableHead>
                <TableHead>Last shot</TableHead>
                <TableHead>Mark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">
                    No scenes match this filter.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((r) => (
                <TableRow
                  key={r.scene.id}
                  data-testid={`progress-row-${r.scene.scene_number}`}
                  className={cn(r.status === 'omitted' && 'text-muted-foreground')}
                >
                  <TableCell className="font-mono font-semibold">
                    <button
                      type="button"
                      className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded"
                      onClick={() => onOpenScene(r.scene.id)}
                    >
                      {r.scene.scene_number}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.scene.title ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{formatPageEighths(r.totalEighths)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <SceneStatusPip status={r.status} />
                      {SCENE_STATUS_LABEL[r.status as SceneProgressStatus]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.slates}</TableCell>
                  <TableCell className="text-right font-mono">{r.takes}</TableCell>
                  <TableCell className="text-right font-mono">{r.prints}</TableCell>
                  <TableCell className="text-right">
                    {r.status === 'part_shot' ? (
                      <span className="inline-flex items-center gap-2 justify-end">
                        <span className="font-mono">{formatPageEighths(r.shotEighths)}</span>
                        <CreditInput
                          row={r}
                          onCommit={(eighths) =>
                            onSetProgress(r.scene.id, { credited_eighths: eighths })
                          }
                        />
                      </span>
                    ) : (
                      <span className="font-mono">{formatPageEighths(r.shotEighths)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.status === 'complete' ? (
                      <TimedInput row={r} onCommit={(seconds) => onSetProgress(r.scene.id, { timed_seconds: seconds })} />
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.estimatedSeconds > 0 ? `${formatScreenTime(r.estimatedSeconds)} est.` : '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {r.lastDayNumber != null ? `D${r.lastDayNumber}` : r.lastShootDate ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Select value={markValue(r)} onValueChange={(v) => setMark(r, v)}>
                      <SelectTrigger
                        aria-label={`Mark scene ${r.scene.scene_number}`}
                        className="h-8 w-[130px]"
                        disabled={r.status === 'not_shot' && !fallbackDayId && !r.lastShootDate}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MARK_NONE}>Not marked</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                        <SelectItem value="omitted">Omitted</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
