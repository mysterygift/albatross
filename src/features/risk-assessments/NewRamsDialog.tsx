import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { UnitChip } from '@/features/risk-assessments/UnitChip'
import { RAMS_QUERY_KEY } from '@/features/risk-assessments/ramsForm'
import { saveRiskAssessment } from '@/lib/db/repositories/risk-assessments'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { getRamsDayDefaults } from '@/lib/risk-assessments/dayDefaults'
import { formatShootDayLabel } from '@/lib/risk-assessments/exportRiskAssessmentPdf'
import type { ShootDayUnit } from '@/lib/db/types'

const NO_DAY_UNITS: ShootDayUnit[] = []

export type NewRamsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  onCreated: (id: string) => void
}

/** Pick a shoot day and the units it covers; location, hospital and police prefill from the day. */
export function NewRamsDialog(props: NewRamsDialogProps) {
  // Mounted only while open, so every opening starts blank.
  return props.open ? <NewRamsDialogBody {...props} /> : null
}

function NewRamsDialogBody({ open, onOpenChange, productionId, onCreated }: NewRamsDialogProps) {
  const queryClient = useQueryClient()
  const [dayId, setDayId] = useState<string>('')
  // The user's own unit choice for `dayId`; until they touch it, every unit working that day is selected.
  const [unitChoice, setUnitChoice] = useState<{ dayId: string; ids: string[] } | null>(null)

  const { data: days = [] } = useQuery({
    queryKey: ['shoot-days', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
  })
  const { data: units = [] } = useQuery({
    queryKey: ['units', productionId],
    queryFn: () => listUnitsByProduction(productionId),
  })
  const { data: dayUnits = NO_DAY_UNITS } = useQuery({
    queryKey: ['shoot-day-units', dayId],
    queryFn: () => listShootDayUnitsByShootDay(dayId),
    enabled: !!dayId,
  })
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units])

  const unitIds = useMemo(
    () => (unitChoice && unitChoice.dayId === dayId ? unitChoice.ids : dayUnits.map((u) => u.id)),
    [unitChoice, dayId, dayUnits]
  )

  const create = useMutation({
    mutationFn: async () => {
      const defaults = await getRamsDayDefaults(productionId, dayId)
      return saveRiskAssessment({
        production_id: productionId,
        shoot_day_id: dayId,
        shoot_day_unit_ids: unitIds,
        ...defaults,
        hazards: [],
      })
    },
    onSuccess: (ra) => {
      void queryClient.invalidateQueries({ queryKey: [RAMS_QUERY_KEY] })
      onOpenChange(false)
      onCreated(ra.id)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not create risk assessment'),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => (create.isPending ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New risk assessment</DialogTitle>
          <DialogDescription>
            Location, hospital and police details are prefilled from the shoot day and can be edited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-rams-day">Shoot day</Label>
            <Select value={dayId} onValueChange={setDayId}>
              <SelectTrigger id="new-rams-day" className="w-full">
                <SelectValue placeholder="Choose a shoot day" />
              </SelectTrigger>
              <SelectContent>
                {days.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatShootDayLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Units covered</legend>
            {!dayId ? (
              <p className="text-muted-foreground text-sm">Choose a shoot day first.</p>
            ) : (
              dayUnits.map((sdu) => (
                <div key={sdu.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`new-rams-unit-${sdu.id}`}
                    checked={unitIds.includes(sdu.id)}
                    onCheckedChange={(v) =>
                      setUnitChoice({
                        dayId,
                        ids: v === true ? [...unitIds, sdu.id] : unitIds.filter((x) => x !== sdu.id),
                      })
                    }
                  />
                  <Label htmlFor={`new-rams-unit-${sdu.id}`} className="font-normal">
                    <UnitChip name={unitName.get(sdu.unit_id) ?? 'Unit'} />
                  </Label>
                </div>
              ))
            )}
          </fieldset>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dayId || unitIds.length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
