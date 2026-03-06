import { useMemo, useImperativeHandle } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import {
  parseRentalDetails,
  rentalDetailsSchema,
  computeRentalDays,
  getEffectiveRentalDays,
  calculateRentalExpenseAmount,
  type RentalDetails,
} from '@/lib/budget/transactions/rental'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'

type RentalFormValues = RentalDetails

export function RentalTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context,
  hideFooter,
  editorRef,
}: TypedExpenseEditProps<RentalDetails>) {
  const productionId = context.productionId
  const format = context.format
  const productionCurrency = context.productionCurrency

  const initial: RentalFormValues = useMemo(() => {
    if (!detailsJson) {
      return {
        rental_description: '',
        rental_rate_type: 'daily',
        rental_rate_amount: null,
        rental_start_date: null,
        rental_end_date: null,
        rental_period_override_days: null,
        equipment_description: null,
        vendor_id: null,
        primary_contact_override: null,
        notes: null,
      }
    }
    const parsed = parseRentalDetails(detailsJson)
    if (!parsed.ok) {
      return {
        rental_description: '',
        rental_rate_type: 'daily',
        rental_rate_amount: null,
        rental_start_date: null,
        rental_end_date: null,
        rental_period_override_days: null,
        equipment_description: null,
        vendor_id: null,
        primary_contact_override: null,
        notes: null,
      }
    }
    return parsed.value
  }, [detailsJson])

  const form = useForm<RentalFormValues>({
    resolver: zodResolver(rentalDetailsSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(editorRef, () => ({
    submit: () => form.handleSubmit((data) => onSave(data))(),
  }), [form, onSave])

  const watchAll = form.watch()
  const computedDays = computeRentalDays(watchAll.rental_start_date ?? null, watchAll.rental_end_date ?? null)
  const effectiveDays = getEffectiveRentalDays(watchAll)
  const calculatedTotal = calculateRentalExpenseAmount(watchAll)

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(data))} className="mt-2 space-y-4">
      <div>
        <Label>Rental description</Label>
        <Input {...form.register('rental_description')} />
        {form.formState.errors.rental_description && (
          <p className="text-destructive text-sm">{form.formState.errors.rental_description.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Rate type</Label>
          <Controller
            name="rental_rate_type"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                value={field.value ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  field.onChange(v === '' ? null : Number(v))
                }}
              />
            )}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
              />
            )}
          />
          {form.formState.errors.rental_end_date && (
            <p className="text-destructive text-sm">{form.formState.errors.rental_end_date.message}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Override days (optional)</Label>
          <Controller
            name="rental_period_override_days"
            control={form.control}
            render={({ field }) => (
              <Input
                type="number"
                step={1}
                value={field.value ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  field.onChange(v === '' ? null : Number(v))
                }}
              />
            )}
          />
          {form.formState.errors.rental_period_override_days && (
            <p className="text-destructive text-sm">
              {form.formState.errors.rental_period_override_days.message}
            </p>
          )}
        </div>
        <div className="flex items-end">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Computed days: {computedDays ?? '—'}</p>
            <p>Effective days: {effectiveDays ?? '—'}</p>
            <p>
              Calculated total:{' '}
              {calculatedTotal != null ? format(calculatedTotal, productionCurrency).formatted : '—'}
            </p>
          </div>
        </div>
      </div>
      <div>
        <Label>Equipment description</Label>
        <Input
          value={watchAll.equipment_description ?? ''}
          onChange={(e) => form.setValue('equipment_description', e.target.value || null)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Vendor</Label>
          <Controller
            name="vendor_id"
            control={form.control}
            render={({ field }) => (
              <VendorPicker
                productionId={productionId}
                value={field.value ?? null}
                onChange={(id) => field.onChange(id)}
                placeholder="Select vendor"
              />
            )}
          />
        </div>
        <div>
          <Label>Primary contact override</Label>
          <Input
            value={watchAll.primary_contact_override ?? ''}
            onChange={(e) => form.setValue('primary_contact_override', e.target.value || null)}
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Input
          value={watchAll.notes ?? ''}
          onChange={(e) => form.setValue('notes', e.target.value || null)}
        />
      </div>
      {!hideFooter && <ExpenseEditorFooter onCancel={onCancel} isSaving={isSaving} />}
      <input type="hidden" value={expenseId} readOnly />
    </form>
  )
}
