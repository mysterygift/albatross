import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  labourLineItemDetailsSchema,
  LABOUR_LINE_ITEM_RATE_TYPES,
  type LabourLineItemDetails,
} from '@/lib/budget/line-items/labour'
import type { LineItemEditProps, LineItemEditorRef } from './types'

const labourLineItemEditSchema = z.object({
  person_id: z.string().nullable().optional(),
  labour_role_label: z.string().nullable().optional(),
  labour_rate_type: z.enum(LABOUR_LINE_ITEM_RATE_TYPES).nullable().optional(),
  planned_days_count: z.union([z.coerce.number().finite().nonnegative(), z.literal('')]).optional(),
  rate_per_day: z.union([z.coerce.number().finite().nonnegative(), z.literal('')]).optional(),
  currency_code: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

type LabourFormValues = z.infer<typeof labourLineItemEditSchema>

function toDetails(values: LabourFormValues): LabourLineItemDetails {
  return {
    person_id: values.person_id?.trim() ? values.person_id.trim() : null,
    labour_role_label: values.labour_role_label?.trim() ? values.labour_role_label.trim() : null,
    labour_rate_type: values.labour_rate_type ?? null,
    planned_days_count:
      values.planned_days_count === '' || values.planned_days_count === undefined
        ? null
        : Number(values.planned_days_count),
    rate_per_day:
      values.rate_per_day === '' || values.rate_per_day === undefined ? null : Number(values.rate_per_day),
    currency_code: values.currency_code?.trim() ? values.currency_code.trim() : null,
    start_date: values.start_date?.trim() ? values.start_date.trim() : null,
    end_date: values.end_date?.trim() ? values.end_date.trim() : null,
    unit: values.unit?.trim() ? values.unit.trim() : null,
    notes: values.notes?.trim() ? values.notes.trim() : null,
  }
}

function fromDetails(d: LabourLineItemDetails | null): LabourFormValues {
  if (!d)
    return {
      person_id: null,
      labour_role_label: null,
      labour_rate_type: null,
      planned_days_count: '',
      rate_per_day: '',
      currency_code: null,
      start_date: null,
      end_date: null,
      unit: null,
      notes: null,
    }
  return {
    person_id: d.person_id ?? null,
    labour_role_label: d.labour_role_label ?? null,
    labour_rate_type: d.labour_rate_type ?? null,
    planned_days_count: d.planned_days_count ?? '',
    rate_per_day: d.rate_per_day ?? '',
    currency_code: d.currency_code ?? null,
    start_date: d.start_date ?? null,
    end_date: d.end_date ?? null,
    unit: d.unit ?? null,
    notes: d.notes ?? null,
  }
}

export const LabourLineItemEditor = forwardRef<
  LineItemEditorRef,
  LineItemEditProps<LabourLineItemDetails>
>(function LabourLineItemEditor(
  { initialDetails, people, format, productionCurrency, onEstimatedCostSuggest },
  ref
) {
  const defaultValues = useMemo(() => fromDetails(initialDetails), [initialDetails])
  const form = useForm<LabourFormValues>({
    resolver: zodResolver(labourLineItemEditSchema) as never,
    defaultValues,
  })

  const initialValuesRef = useRef(defaultValues)
  const isDirty = () => {
    const current = form.getValues()
    const initial = initialValuesRef.current
    return JSON.stringify(current) !== JSON.stringify(initial)
  }

  useImperativeHandle(ref, () => ({
    getDetails: () => toDetails(form.getValues()),
    isDirty,
  }), [form])

  const watch = form.watch()
  const plannedDays =
    watch.planned_days_count === '' || watch.planned_days_count === undefined
      ? null
      : Number(watch.planned_days_count)
  const ratePerDay =
    watch.rate_per_day === '' || watch.rate_per_day === undefined ? null : Number(watch.rate_per_day)
  const suggested =
    plannedDays != null && ratePerDay != null && plannedDays >= 0 && ratePerDay >= 0
      ? plannedDays * ratePerDay
      : null

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Labour details
      </p>
      <div className="grid gap-3">
        <div>
          <Label>Person</Label>
          <Controller
            name="person_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value?.trim() ? field.value : '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
              >
                <SelectTrigger className="mt-1.5 h-9 bg-background">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label>Labour role</Label>
          <Input
            {...form.register('labour_role_label')}
            placeholder="e.g. DoP, Gaffer"
            className="mt-1.5 bg-background"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Rate type</Label>
            <Controller
              name="labour_rate_type"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value ?? '__none__'}
                  onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                >
                  <SelectTrigger className="mt-1.5 h-9 bg-background">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="prep_day">Prep day</SelectItem>
                    <SelectItem value="shoot_day">Shoot day</SelectItem>
                    <SelectItem value="overtime">Overtime</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <Label>Planned days</Label>
            <Input
              type="number"
              step={0.5}
              min={0}
              {...form.register('planned_days_count')}
              className="mt-1.5 bg-background"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Rate per day</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              {...form.register('rate_per_day')}
              className="mt-1.5 bg-background"
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Input
              placeholder="e.g. GBP"
              {...form.register('currency_code')}
              className="mt-1.5 bg-background"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Input type="date" {...form.register('start_date')} className="mt-1.5 bg-background" />
          </div>
          <div>
            <Label>End date</Label>
            <Input type="date" {...form.register('end_date')} className="mt-1.5 bg-background" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unit</Label>
            <Input
              placeholder="Main Unit / Second Unit"
              {...form.register('unit')}
              className="mt-1.5 bg-background"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...form.register('notes')} className="mt-1.5 bg-background" />
          </div>
        </div>
        {suggested != null && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              Suggested: {format(suggested, productionCurrency).formatted}
            </span>
            {onEstimatedCostSuggest && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onEstimatedCostSuggest(suggested)}
              >
                Use suggested amount
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
