import { useMemo, useEffect, useImperativeHandle } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { PositiveIntegerInput } from '@/components/budget/PositiveIntegerInput'
import { labourDetailsSchema } from '@/lib/budget/transactions/labour'
import { parseLabourDetails } from '@/lib/budget/transactions/labour'
import { getPersonBookingsSummary } from '@/lib/people/bookingsSummary'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'
import type { z } from 'zod'

type LabourFormValues = z.infer<typeof labourDetailsSchema>

export function LabourTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context,
  hideFooter,
  editorRef,
}: TypedExpenseEditProps<LabourFormValues>) {
  const defaultCurrencyCode = context.defaultCurrencyCode ?? null
  const people = context.people ?? []
  const personById = context.personById ?? new Map()
  const productionId = context.productionId

  const initial: LabourFormValues = useMemo(() => {
    if (!detailsJson) {
      return {
        person_id: null,
        labour_role_label: '',
        labour_rate_type: 'shoot_day',
        booked_days_count: null,
        rate_per_day: null,
        currency_code: defaultCurrencyCode,
        start_date: null,
        end_date: null,
        unit: null,
        notes: null,
      }
    }
    const parsed = parseLabourDetails(detailsJson)
    if (!parsed.ok) {
      return {
        person_id: null,
        labour_role_label: '',
        labour_rate_type: 'shoot_day',
        booked_days_count: null,
        rate_per_day: null,
        currency_code: defaultCurrencyCode,
        start_date: null,
        end_date: null,
        unit: null,
        notes: null,
      }
    }
    return parsed.value
  }, [detailsJson, defaultCurrencyCode])

  const form = useForm<LabourFormValues>({
    resolver: zodResolver(labourDetailsSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(editorRef, () => ({
    submit: () => form.handleSubmit((data) => onSave(data))(),
  }), [form, onSave])

  const selectedPersonId = form.watch('person_id') ?? ''
  const selectedPerson = selectedPersonId ? personById.get(selectedPersonId) ?? null : null

  const { data: bookingSummary } = useQuery({
    queryKey: ['person-bookings-summary', productionId, selectedPersonId],
    queryFn: () => getPersonBookingsSummary(productionId, selectedPersonId),
    enabled: selectedPersonId.length > 0,
  })

  useEffect(() => {
    if (!selectedPerson) return
    const current = form.getValues('labour_role_label')
    if (!current.trim() && selectedPerson.department) {
      form.setValue('labour_role_label', selectedPerson.department, { shouldValidate: true })
    }
  }, [selectedPerson, form])

  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(data))} className="mt-2 space-y-4">
      <div>
        <Label>Person</Label>
        <Controller
          name="person_id"
          control={form.control}
          render={({ field }) => (
            <Select
              value={field.value && field.value.trim() !== '' ? field.value : '__none__'}
              onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
            >
              <SelectTrigger className="h-9">
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
        {bookingSummary && (
          <div className="mt-2 rounded border border-border bg-muted/20 p-2">
            <p className="text-xs text-muted-foreground">
              Bookings summary: {bookingSummary.booked_days_count} day(s)
              {bookingSummary.start_date ? ` · ${bookingSummary.start_date}` : ''}
              {bookingSummary.end_date ? ` → ${bookingSummary.end_date}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  form.setValue('booked_days_count', bookingSummary.booked_days_count, { shouldValidate: true })
                  if (bookingSummary.start_date) form.setValue('start_date', bookingSummary.start_date)
                  if (bookingSummary.end_date) form.setValue('end_date', bookingSummary.end_date)
                }}
              >
                Use booking dates
              </Button>
            </div>
          </div>
        )}
      </div>
      <div>
        <Label>Labour role</Label>
        <Input {...form.register('labour_role_label')} />
        {errors.labour_role_label && (
          <p className="text-destructive text-sm">{errors.labour_role_label.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Rate type</Label>
          <Controller
            name="labour_rate_type"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prep_day">Prep day</SelectItem>
                  <SelectItem value="shoot_day">Shoot day</SelectItem>
                  <SelectItem value="overtime">Overtime</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <ValidatedField
          label="Booked days"
          error={errors.booked_days_count?.message}
          htmlFor="labour-booked-days"
        >
          <Controller
            name="booked_days_count"
            control={form.control}
            render={({ field }) => (
              <PositiveIntegerInput
                id="labour-booked-days"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </ValidatedField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ValidatedField
          label="Rate per day"
          error={errors.rate_per_day?.message}
          htmlFor="labour-rate-per-day"
        >
          <Controller
            name="rate_per_day"
            control={form.control}
            render={({ field }) => (
              <MoneyAmountInput
                id="labour-rate-per-day"
                mode="positive"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </ValidatedField>
        <div>
          <Label>Currency</Label>
          <Input placeholder="e.g. GBP" {...form.register('currency_code')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start date</Label>
          <Controller
            name="start_date"
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
            name="end_date"
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
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Unit</Label>
          <Input placeholder="Main Unit / Second Unit" {...form.register('unit')} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} />
        </div>
      </div>
      {!hideFooter && <ExpenseEditorFooter onCancel={onCancel} isSaving={isSaving} />}
      <input type="hidden" value={expenseId} readOnly />
    </form>
  )
}
