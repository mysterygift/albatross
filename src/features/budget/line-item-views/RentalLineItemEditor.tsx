import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import {
  RENTAL_LINE_ITEM_RATE_TYPES,
  computeRentalDays,
  getEffectiveRentalDays,
  calculateRentalSuggestedAmount,
  type RentalLineItemDetails,
} from '@/lib/budget/line-items/rental'
import type { LineItemEditProps, LineItemEditorRef } from './types'

const isoDate = z
  .string()
  .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), 'Expected ISO date YYYY-MM-DD')
  .nullable()
  .optional()

const rentalLineItemEditSchema = z.object({
  rental_description: z.string().nullable().optional(),
  rental_rate_type: z.enum(RENTAL_LINE_ITEM_RATE_TYPES).nullable().optional(),
  rental_rate_amount: z.number().finite().nonnegative().nullable().optional(),
  rental_start_date: isoDate,
  rental_end_date: isoDate,
  rental_period_override_days: z.number().finite().nonnegative().nullable().optional(),
  equipment_description: z.string().nullable().optional(),
  vendor_id: z.string().nullable().optional(),
  primary_contact_override: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

type RentalFormValues = z.infer<typeof rentalLineItemEditSchema>

function toDetails(values: RentalFormValues): RentalLineItemDetails {
  return {
    rental_description: values.rental_description?.trim() ? values.rental_description.trim() : null,
    rental_rate_type: values.rental_rate_type ?? null,
    rental_rate_amount: values.rental_rate_amount ?? null,
    rental_start_date: values.rental_start_date?.trim() ? values.rental_start_date.trim() : null,
    rental_end_date: values.rental_end_date?.trim() ? values.rental_end_date.trim() : null,
    rental_period_override_days: values.rental_period_override_days ?? null,
    equipment_description: values.equipment_description?.trim() ? values.equipment_description.trim() : null,
    vendor_id: values.vendor_id?.trim() ? values.vendor_id.trim() : null,
    primary_contact_override: values.primary_contact_override?.trim()
      ? values.primary_contact_override.trim()
      : null,
    notes: values.notes?.trim() ? values.notes.trim() : null,
  }
}

function fromDetails(d: RentalLineItemDetails | null): RentalFormValues {
  if (!d)
    return {
      rental_description: null,
      rental_rate_type: null,
      rental_rate_amount: null,
      rental_start_date: null,
      rental_end_date: null,
      rental_period_override_days: null,
      equipment_description: null,
      vendor_id: null,
      primary_contact_override: null,
      notes: null,
    }
  return {
    rental_description: d.rental_description ?? null,
    rental_rate_type: d.rental_rate_type ?? null,
    rental_rate_amount: d.rental_rate_amount ?? null,
    rental_start_date: d.rental_start_date ?? null,
    rental_end_date: d.rental_end_date ?? null,
    rental_period_override_days: d.rental_period_override_days ?? null,
    equipment_description: d.equipment_description ?? null,
    vendor_id: d.vendor_id ?? null,
    primary_contact_override: d.primary_contact_override ?? null,
    notes: d.notes ?? null,
  }
}

export const RentalLineItemEditor = forwardRef<
  LineItemEditorRef,
  LineItemEditProps<RentalLineItemDetails>
>(function RentalLineItemEditor(
  { initialDetails, productionId, format, productionCurrency, onEstimatedCostSuggest },
  ref
) {
  const defaultValues = useMemo(() => fromDetails(initialDetails), [initialDetails])
  const form = useForm<RentalFormValues>({
    resolver: zodResolver(rentalLineItemEditSchema) as never,
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

  const watchAll = form.watch()
  const detailsForCalc = toDetails(watchAll)
  const computedDays = computeRentalDays(watchAll.rental_start_date, watchAll.rental_end_date)
  const effectiveDays = getEffectiveRentalDays(detailsForCalc)
  const calculatedAmount = calculateRentalSuggestedAmount(detailsForCalc)

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Rental details
      </p>
      <div className="grid gap-3">
        <div>
          <Label>Rental description</Label>
          <Input
            {...form.register('rental_description')}
            placeholder="Describe the rental"
            className="mt-1.5 bg-background"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Rate type</Label>
            <Controller
              name="rental_rate_type"
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
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <Label>Rate amount</Label>
            <Controller
              name="rental_rate_amount"
              control={form.control}
              render={({ field }) => (
                <Input
                  type="number"
                  step={0.01}
                  min={0}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="mt-1.5 bg-background"
                />
              )}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Controller
              name="rental_start_date"
              control={form.control}
              render={({ field }) => (
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  className="mt-1.5 bg-background"
                />
              )}
            />
          </div>
          <div>
            <Label>End date</Label>
            <Controller
              name="rental_end_date"
              control={form.control}
              render={({ field }) => (
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  className="mt-1.5 bg-background"
                />
              )}
            />
          </div>
        </div>
        <div>
          <Label>Override days (optional)</Label>
          <Controller
            name="rental_period_override_days"
            control={form.control}
            render={({ field }) => (
              <Input
                type="number"
                step={1}
                min={0}
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? null : Number(e.target.value))
                }
                className="mt-1.5 bg-background"
              />
            )}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Computed days: {computedDays ?? '—'}</span>
          <span>Effective days: {effectiveDays ?? '—'}</span>
          {calculatedAmount != null && (
            <>
              <span>Suggested: {format(calculatedAmount, productionCurrency).formatted}</span>
              {onEstimatedCostSuggest && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onEstimatedCostSuggest(calculatedAmount)}
                >
                  Use calculated amount
                </Button>
              )}
            </>
          )}
        </div>
        <div>
          <Label>Equipment description</Label>
          <Input
            {...form.register('equipment_description')}
            className="mt-1.5 bg-background"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Vendor</Label>
            <Controller
              name="vendor_id"
              control={form.control}
              render={({ field }) => (
                <VendorPicker
                  productionId={productionId}
                  value={field.value?.trim() ? field.value : null}
                  onChange={(id) => field.onChange(id ?? null)}
                  placeholder="Select vendor"
                />
              )}
            />
          </div>
          <div>
            <Label>Primary contact override</Label>
            <Input
              {...form.register('primary_contact_override')}
              className="mt-1.5 bg-background"
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} className="mt-1.5 bg-background" />
        </div>
      </div>
    </div>
  )
})
