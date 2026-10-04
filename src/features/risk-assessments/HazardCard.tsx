import { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BookmarkPlus, ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RiskFactorPill } from '@/features/risk-assessments/RiskFactorPill'
import { RiskMatrix } from '@/features/risk-assessments/RiskMatrix'
import type { HazardFormValues, RamsFormValues } from '@/features/risk-assessments/ramsForm'
import { riskFactor } from '@/lib/risk-assessments/riskMatrix'
import { cn } from '@/lib/utils'

export type HazardCardProps = {
  index: number
  /** Stable sortable id (the field array's `fieldKey`). */
  sortId: string
  defaultOpen?: boolean
  onRemove: () => void
  onSaveAsTemplate: (hazard: HazardFormValues) => void
}

/** One collapsible hazard: text fields, who is at risk, and the before / after risk matrices. */
export function HazardCard({ index, sortId, defaultOpen = true, onRemove, onSaveAsTemplate }: HazardCardProps) {
  const { register, control, setValue, getValues, formState } = useFormContext<RamsFormValues>()
  const [open, setOpen] = useState(defaultOpen)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
  })

  const hazard = useWatch({ control, name: `hazards.${index}` })
  const nameError = formState.errors.hazards?.[index]?.name?.message
  const before = riskFactor(hazard?.severity_before ?? 1, hazard?.probability_before ?? 1)
  const after = riskFactor(hazard?.severity_after ?? 1, hazard?.probability_after ?? 1)
  const bodyId = `hazard-body-${sortId}`

  const setRating = (field: 'before' | 'after', severity: number, probability: number) => {
    setValue(`hazards.${index}.severity_${field}`, severity, { shouldDirty: true })
    setValue(`hazards.${index}.probability_${field}`, probability, { shouldDirty: true })
  }

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('gap-0 py-0', isDragging && 'z-10 opacity-80 shadow-lg')}
      data-testid="hazard-card"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
          aria-label={`Reorder hazard ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className={cn('truncate font-medium', !hazard?.name?.trim() && 'text-muted-foreground italic')}>
            {hazard?.name?.trim() || 'Untitled hazard'}
          </span>
        </button>
        <div className="flex items-center gap-1.5 text-xs" aria-label="Risk before and after controls">
          <RiskFactorPill factor={before} />
          <span aria-hidden="true">→</span>
          <RiskFactorPill factor={after} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSaveAsTemplate(getValues(`hazards.${index}`))}
        >
          <BookmarkPlus className="size-4" /> Save as template
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove hazard ${index + 1}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {open ? (
        <div id={bodyId} className="grid gap-6 border-t px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`hazard-name-${sortId}`}>Hazard</Label>
              <Input
                id={`hazard-name-${sortId}`}
                aria-invalid={!!nameError}
                placeholder="e.g. Manual handling"
                {...register(`hazards.${index}.name`)}
              />
              {nameError ? <p className="text-destructive text-xs">{nameError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hazard-desc-${sortId}`}>Description</Label>
              <Textarea id={`hazard-desc-${sortId}`} rows={2} {...register(`hazards.${index}.description`)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`hazard-risks-${sortId}`}>Risks</Label>
                <Textarea
                  id={`hazard-risks-${sortId}`}
                  rows={4}
                  placeholder="One per line"
                  {...register(`hazards.${index}.risks`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`hazard-outcomes-${sortId}`}>Potential outcomes</Label>
                <Textarea
                  id={`hazard-outcomes-${sortId}`}
                  rows={4}
                  placeholder="One per line"
                  {...register(`hazards.${index}.outcomes`)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hazard-controls-${sortId}`}>Control measures</Label>
              <Textarea
                id={`hazard-controls-${sortId}`}
                rows={6}
                placeholder="One per line"
                {...register(`hazards.${index}.control_measures`)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">People at risk</legend>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ['at_risk_crew', 'Crew'],
                    ['at_risk_cast', 'Cast'],
                    ['at_risk_public', 'General public'],
                  ] as const
                ).map(([field, label]) => (
                  <Controller
                    key={field}
                    control={control}
                    name={`hazards.${index}.${field}`}
                    render={({ field: f }) => (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`hazard-${field}-${sortId}`}
                          checked={f.value}
                          onCheckedChange={(v) => f.onChange(v === true)}
                        />
                        <Label htmlFor={`hazard-${field}-${sortId}`} className="font-normal">
                          {label}
                        </Label>
                      </div>
                    )}
                  />
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-start gap-6 lg:flex-col xl:flex-row">
            <div className="space-y-1">
              <p className="text-sm font-medium">Before controls</p>
              <RiskMatrix
                label={`Hazard ${index + 1} risk before controls`}
                value={{ severity: hazard?.severity_before ?? 1, probability: hazard?.probability_before ?? 1 }}
                onChange={(v) => setRating('before', v.severity, v.probability)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">After controls</p>
              <RiskMatrix
                label={`Hazard ${index + 1} risk after controls`}
                value={{ severity: hazard?.severity_after ?? 1, probability: hazard?.probability_after ?? 1 }}
                onChange={(v) => setRating('after', v.severity, v.probability)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
