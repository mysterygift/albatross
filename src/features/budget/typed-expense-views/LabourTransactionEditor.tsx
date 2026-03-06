import { useMemo, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseLabourDetails } from '@/lib/budget/transactions/labour'
import { getPersonBookingsSummary } from '@/lib/people/bookingsSummary'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'

const labourEditSchema = z.object({
  person_id: z.string().optional(),
  labour_role_label: z.string().min(1, 'Labour role is required'),
  labour_rate_type: z.enum(['prep_day', 'shoot_day', 'overtime']),
  booked_days_count: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  rate_per_day: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  currency_code: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
})

type LabourFormValues = z.infer<typeof labourEditSchema>

function toLabourDetails(data: LabourFormValues) {
  return {
    person_id: data.person_id?.trim() ? data.person_id.trim() : null,
    labour_role_label: data.labour_role_label,
    labour_rate_type: data.labour_rate_type,
    booked_days_count:
      data.booked_days_count === '' || data.booked_days_count === undefined ? null : Number(data.booked_days_count),
    rate_per_day: data.rate_per_day === '' || data.rate_per_day === undefined ? null : Number(data.rate_per_day),
    currency_code: data.currency_code?.trim() ? data.currency_code.trim() : null,
    start_date: data.start_date?.trim() ? data.start_date.trim() : null,
    end_date: data.end_date?.trim() ? data.end_date.trim() : null,
    unit: data.unit?.trim() ? data.unit.trim() : null,
    notes: data.notes?.trim() ? data.notes.trim() : null,
  }
}

export function LabourTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context,
}: TypedExpenseEditProps<ReturnType<typeof toLabourDetails>>) {
  const defaultCurrencyCode = context.defaultCurrencyCode ?? null
  const people = context.people ?? []
  const personById = context.personById ?? new Map()
  const productionId = context.productionId

  const initial: LabourFormValues = useMemo(() => {
    if (!detailsJson) {
      return {
        person_id: '',
        labour_role_label: '',
        labour_rate_type: 'shoot_day',
        booked_days_count: '',
        rate_per_day: '',
        currency_code: defaultCurrencyCode ?? '',
        start_date: '',
        end_date: '',
        unit: '',
        notes: '',
      }
    }
    const parsed = parseLabourDetails(detailsJson)
    if (!parsed.ok) {
      return {
        person_id: '',
        labour_role_label: '',
        labour_rate_type: 'shoot_day',
        booked_days_count: '',
        rate_per_day: '',
        currency_code: defaultCurrencyCode ?? '',
        start_date: '',
        end_date: '',
        unit: '',
        notes: '',
      }
    }
    const d = parsed.value
    return {
      person_id: d.person_id ?? '',
      labour_role_label: d.labour_role_label ?? '',
      labour_rate_type: d.labour_rate_type,
      booked_days_count: d.booked_days_count ?? '',
      rate_per_day: d.rate_per_day ?? '',
      currency_code: d.currency_code ?? defaultCurrencyCode ?? '',
      start_date: d.start_date ?? '',
      end_date: d.end_date ?? '',
      unit: d.unit ?? '',
      notes: d.notes ?? '',
    }
  }, [detailsJson, defaultCurrencyCode])

  const form = useForm<LabourFormValues>({
    resolver: zodResolver(labourEditSchema) as never,
    defaultValues: initial,
  })

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

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(toLabourDetails(data)))} className="mt-2 space-y-4">
      <div>
        <Label>Person</Label>
        <Controller
          name="person_id"
          control={form.control}
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
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
        {form.formState.errors.labour_role_label && (
          <p className="text-destructive text-sm">{form.formState.errors.labour_role_label.message}</p>
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
        <div>
          <Label>Booked days</Label>
          <Input type="number" step={0.5} {...form.register('booked_days_count')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Rate per day</Label>
          <Input type="number" step={0.01} {...form.register('rate_per_day')} />
        </div>
        <div>
          <Label>Currency</Label>
          <Input placeholder="e.g. GBP" {...form.register('currency_code')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start date</Label>
          <Input type="date" {...form.register('start_date')} />
        </div>
        <div>
          <Label>End date</Label>
          <Input type="date" {...form.register('end_date')} />
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
      <ExpenseEditorFooter onCancel={onCancel} isSaving={isSaving} />
      <input type="hidden" value={expenseId} readOnly />
    </form>
  )
}
