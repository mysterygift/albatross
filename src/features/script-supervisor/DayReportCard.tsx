import { FileDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { DayLogPatch, DayLogTimeField, ScriptSupervisorDayLog } from '@/lib/db/repositories/scriptSupervisor'

const TIME_FIELDS: Array<{ key: DayLogTimeField; label: string; planned?: 'call' | 'wrap' }> = [
  { key: 'call_time', label: 'Unit call', planned: 'call' },
  { key: 'first_shot_time', label: 'First shot' },
  { key: 'lunch_start_time', label: 'Lunch' },
  { key: 'lunch_end_time', label: 'Back from lunch' },
  { key: 'first_shot_after_lunch_time', label: 'First shot after lunch' },
  { key: 'camera_wrap_time', label: 'Camera wrap' },
  { key: 'wrap_time', label: 'Unit wrap', planned: 'wrap' },
]

export type DayReportCardProps = {
  dayLabel: string
  dayLog: ScriptSupervisorDayLog | null | undefined
  plannedCallTime: string | null
  plannedWrapTime: string | null
  onSave: (patch: DayLogPatch) => void
  onExport: () => void
  exporting: boolean
  touch: boolean
}

/**
 * Actual times and remarks for the selected shoot day, and the Daily Progress Report export (SS5).
 * Planned call / wrap from the schedule show as placeholders; nothing here changes the schedule.
 */
export function DayReportCard(props: DayReportCardProps) {
  const { dayLog, touch } = props
  return (
    <section aria-label="Daily progress report" className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-0.5">
          <h2 className="font-medium">Daily progress report · {props.dayLabel}</h2>
          <p className="text-xs text-muted-foreground">
            Actual times for the report. Planned times stay on the schedule and call sheet.
          </p>
        </div>
        <span className="flex-1" />
        <Button type="button" size={touch ? 'lg' : 'default'} onClick={props.onExport} disabled={props.exporting}>
          <FileDown aria-hidden />
          {props.exporting ? 'Exporting…' : 'Export PDF'}
        </Button>
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {TIME_FIELDS.map((f) => {
          const value = dayLog?.[f.key] ?? null
          const planned = f.planned === 'call' ? props.plannedCallTime : f.planned === 'wrap' ? props.plannedWrapTime : null
          const id = `day-log-${f.key}`
          return (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={id} className="text-xs text-muted-foreground">
                {f.label}
              </Label>
              <Input
                id={id}
                key={`${id}:${value ?? ''}`}
                defaultValue={value ?? ''}
                inputMode="numeric"
                placeholder={planned ? `${planned} planned` : 'HH:MM'}
                className={cn('font-mono', touch && 'h-11 text-base')}
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim()
                  if (next !== (value ?? '')) props.onSave({ [f.key]: next === '' ? null : next } as DayLogPatch)
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="space-y-1">
        <Label htmlFor="day-log-remarks" className="text-xs text-muted-foreground">
          Remarks
        </Label>
        <Textarea
          id="day-log-remarks"
          key={`remarks:${dayLog?.remarks ?? ''}`}
          defaultValue={dayLog?.remarks ?? ''}
          rows={2}
          placeholder="Delays, weather, anything production should know"
          className={cn(touch && 'text-base')}
          onBlur={(e) => {
            const next = e.currentTarget.value.trim()
            if (next !== (dayLog?.remarks ?? '')) props.onSave({ remarks: next === '' ? null : next })
          }}
        />
      </div>
    </section>
  )
}
