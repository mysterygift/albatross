import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { duplicateRiskAssessment } from '@/lib/db/repositories/risk-assessments'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { formatShootDayLabel } from '@/lib/risk-assessments/exportRiskAssessmentPdf'
import { RAMS_QUERY_KEY } from '@/features/risk-assessments/ramsForm'

export type DuplicateRamsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  riskAssessmentId: string | null
  sourceShootDayId: string | null
  /** Called with the new RAMS ids (in selected-day order) after a successful copy. */
  onDuplicated?: (newIds: string[]) => void
}

/** Copies a RAMS onto one or more other shoot days as drafts. */
export function DuplicateRamsDialog(props: DuplicateRamsDialogProps) {
  // Mounted only while open, so every opening starts with a fresh selection.
  return props.open ? <DuplicateRamsDialogBody {...props} /> : null
}

function DuplicateRamsDialogBody({
  open,
  onOpenChange,
  productionId,
  riskAssessmentId,
  sourceShootDayId,
  onDuplicated,
}: DuplicateRamsDialogProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const { data: days = [] } = useQuery({
    queryKey: ['shoot-days', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
  })

  const mutation = useMutation({
    mutationFn: async () => duplicateRiskAssessment(riskAssessmentId!, selected),
    onSuccess: (ids) => {
      void queryClient.invalidateQueries({ queryKey: [RAMS_QUERY_KEY] })
      toast.success(
        ids.length === 1 ? 'Risk assessment duplicated as a draft' : `Risk assessment duplicated to ${ids.length} days as drafts`
      )
      onOpenChange(false)
      onDuplicated?.(ids)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not duplicate risk assessment'),
  })

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((d) => d !== id)))

  return (
    <Dialog open={open} onOpenChange={(next) => (mutation.isPending ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate risk assessment</DialogTitle>
          <DialogDescription>
            Choose the shoot days to copy this onto. Copies are drafts and need signing off again.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72 rounded-md border">
          <ul className="divide-y">
            {days.map((day) => (
              <li key={day.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={`dup-day-${day.id}`}
                  checked={selected.includes(day.id)}
                  onCheckedChange={(v) => toggle(day.id, v === true)}
                />
                <Label htmlFor={`dup-day-${day.id}`} className="flex-1 font-normal">
                  {formatShootDayLabel(day)}
                  {day.id === sourceShootDayId ? (
                    <span className="text-muted-foreground ml-2 text-xs">(same day)</span>
                  ) : null}
                </Label>
              </li>
            ))}
            {days.length === 0 ? <li className="text-muted-foreground px-3 py-4 text-sm">No shoot days.</li> : null}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0 || !riskAssessmentId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Duplicate{selected.length > 0 ? ` to ${selected.length} day${selected.length === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
