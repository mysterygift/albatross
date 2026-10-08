import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveOvertimeSettings } from '@/lib/db/repositories/overtime'
import type { OvertimeSettings, OvertimeBasis } from '@/lib/overtime/overtime'

type Draft = {
  basis: OvertimeBasis
  standardDayHours: string
  divisor: string
  multiplier: string
  increment: string
  restHours: string
}

function toDraft(s: OvertimeSettings): Draft {
  return {
    basis: s.overtime_basis,
    standardDayHours: String(s.standard_day_minutes / 60),
    divisor: String(s.hourly_rate_divisor),
    multiplier: String(s.overtime_multiplier),
    increment: String(s.overtime_increment_minutes),
    restHours: String(s.minimum_rest_minutes / 60),
  }
}

function fromDraft(d: Draft): OvertimeSettings {
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))
  return {
    overtime_basis: d.basis,
    standard_day_minutes: Math.round(num(d.standardDayHours) * 60),
    hourly_rate_divisor: num(d.divisor),
    overtime_multiplier: num(d.multiplier),
    overtime_increment_minutes: Math.round(num(d.increment)),
    minimum_rest_minutes: Math.round(num(d.restHours) * 60),
  }
}

/** Edits the production's overtime rule (Overtime). */
export function OvertimeRuleDialog({
  open,
  onOpenChange,
  productionId,
  settings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  settings: OvertimeSettings
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings))
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(toDraft(settings))
  }

  const save = useMutation({
    mutationFn: () => saveOvertimeSettings(productionId, fromDraft(draft)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overtime', productionId] })
      onOpenChange(false)
    },
  })

  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const field = 'h-11 text-base md:text-base'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Overtime rule</DialogTitle>
          <DialogDescription>
            How Overtime works out overtime and rest for this production. Check it against your crew agreements.
          </DialogDescription>
        </DialogHeader>
        <form
          id="overtime-rule-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ot-basis">Overtime starts</Label>
            <Select value={draft.basis} onValueChange={(v) => set('basis', v as OvertimeBasis)}>
              <SelectTrigger id="ot-basis" className={`w-full ${field}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled_wrap">At the shoot day’s planned wrap</SelectItem>
                <SelectItem value="day_length">A standard day after each person’s call</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.basis === 'day_length' ? (
            <div className="space-y-1.5">
              <Label htmlFor="ot-day">Standard day (hours, with lunch)</Label>
              <Input id="ot-day" inputMode="decimal" className={field} value={draft.standardDayHours} onChange={(e) => set('standardDayHours', e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="ot-divisor">Hourly rate = day rate ÷</Label>
            <Input id="ot-divisor" inputMode="decimal" className={field} value={draft.divisor} onChange={(e) => set('divisor', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-multiplier">Overtime hour = hourly rate ×</Label>
            <Input id="ot-multiplier" inputMode="decimal" className={field} value={draft.multiplier} onChange={(e) => set('multiplier', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-increment">Bill per started (minutes)</Label>
            <Input id="ot-increment" inputMode="numeric" className={field} value={draft.increment} onChange={(e) => set('increment', e.target.value)} />
            <p className="text-xs text-muted-foreground">0 bills exact minutes.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-rest">Minimum rest (hours)</Label>
            <Input id="ot-rest" inputMode="decimal" className={field} value={draft.restHours} onChange={(e) => set('restHours', e.target.value)} />
          </div>
        </form>
        {save.error ? (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="overtime-rule-form" className="h-11" disabled={save.isPending}>
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
