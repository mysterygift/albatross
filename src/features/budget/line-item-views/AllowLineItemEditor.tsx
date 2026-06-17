import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { hasMaxTwoDecimalPlaces, NON_NEGATIVE_MONEY_MESSAGE } from '@/lib/budget/fieldValidation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ALLOW_LINE_ITEM_STATUSES,
  type AllowLineItemDetails,
} from '@/lib/budget/line-items/allow'
import type { LineItemEditProps, LineItemEditorRef } from './types'

const allowLineItemEditSchema = z.object({
  allow_description: z.string().nullable().optional(),
  provisional_amount: z
    .union([
      z.literal(''),
      z
        .number()
        .finite(NON_NEGATIVE_MONEY_MESSAGE)
        .nonnegative(NON_NEGATIVE_MONEY_MESSAGE)
        .refine(hasMaxTwoDecimalPlaces, { message: 'Amount must have at most 2 decimal places' }),
    ])
    .optional(),
  status: z.enum(ALLOW_LINE_ITEM_STATUSES).nullable().optional(),
  notes: z.string().nullable().optional(),
})

type AllowFormValues = {
  allow_description?: string | null
  provisional_amount?: number | ''
  status?: (typeof ALLOW_LINE_ITEM_STATUSES)[number] | null
  notes?: string | null
}

function toDetails(values: AllowFormValues): AllowLineItemDetails {
  return {
    allow_description: values.allow_description?.trim() ? values.allow_description.trim() : null,
    provisional_amount:
      values.provisional_amount === '' || values.provisional_amount === undefined
        ? null
        : Number(values.provisional_amount),
    status: values.status ?? null,
    notes: values.notes?.trim() ? values.notes.trim() : null,
  }
}

function fromDetails(d: AllowLineItemDetails | null): AllowFormValues {
  if (!d)
    return {
      allow_description: null,
      provisional_amount: '',
      status: null,
      notes: null,
    }
  return {
    allow_description: d.allow_description ?? null,
    provisional_amount: d.provisional_amount ?? '',
    status: d.status ?? null,
    notes: d.notes ?? null,
  }
}

export const AllowLineItemEditor = forwardRef<
  LineItemEditorRef,
  LineItemEditProps<AllowLineItemDetails>
>(function AllowLineItemEditor(
  { initialDetails, format, productionCurrency, onEstimatedCostSuggest },
  ref
) {
  const defaultValues = useMemo(() => fromDetails(initialDetails), [initialDetails])
  const form = useForm<AllowFormValues>({
    resolver: zodResolver(allowLineItemEditSchema) as never,
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

  const provisionalAmount = form.watch('provisional_amount')
  const amountNum =
    provisionalAmount === '' || provisionalAmount === undefined
      ? null
      : Number(provisionalAmount)

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Allow details
      </p>
      <div className="grid gap-3">
        <div>
          <Label>Allow description</Label>
          <Input
            {...form.register('allow_description')}
            placeholder="Describe the allow"
            className="mt-1.5 bg-background"
          />
        </div>
        <ValidatedField label="Provisional amount" htmlFor="line-allow-provisional">
          <Controller
            name="provisional_amount"
            control={form.control}
            render={({ field }) => (
              <MoneyAmountInput
                id="line-allow-provisional"
                mode="nonNegative"
                placeholder="0.00"
                value={field.value === '' || field.value === undefined ? null : field.value}
                onValueChange={(v) => field.onChange(v ?? '')}
                onBlur={field.onBlur}
                className="mt-1.5 bg-background"
              />
            )}
          />
        </ValidatedField>
        {amountNum != null && amountNum >= 0 && onEstimatedCostSuggest && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-muted-foreground">
              {format(amountNum, productionCurrency).formatted}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onEstimatedCostSuggest(amountNum)}
            >
              Use provisional as estimate
            </Button>
          </div>
        )}
        <div>
          <Label>Status</Label>
          <Controller
            name="status"
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
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} className="mt-1.5 bg-background" />
        </div>
      </div>
    </div>
  )
})
