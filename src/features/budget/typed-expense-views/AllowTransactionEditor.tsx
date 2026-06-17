import { useMemo, useImperativeHandle } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { hasMaxTwoDecimalPlaces, NON_NEGATIVE_MONEY_MESSAGE } from '@/lib/budget/fieldValidation'
import { parseAllowDetails, type AllowDetails } from '@/lib/budget/transactions/allow'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'

const allowEditSchema = z.object({
  allow_description: z.string().min(1, 'Allow description is required'),
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
  status: z.enum(['open', 'resolved']).default('open'),
  notes: z.string().optional(),
})

type AllowFormValues = {
  allow_description: string
  provisional_amount?: number | ''
  status: 'open' | 'resolved'
  notes?: string
}

function toAllowDetails(data: AllowFormValues): AllowDetails {
  return {
    allow_description: data.allow_description,
    provisional_amount:
      data.provisional_amount === '' || data.provisional_amount === undefined
        ? null
        : data.provisional_amount,
    status: data.status,
    notes: data.notes?.trim() ? data.notes.trim() : null,
  }
}

export function AllowTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context: _context,
  hideFooter,
  editorRef,
}: TypedExpenseEditProps<AllowDetails>) {
  const initial: AllowFormValues = useMemo(() => {
    if (!detailsJson) {
      return { allow_description: '', provisional_amount: '', status: 'open', notes: '' }
    }
    const parsed = parseAllowDetails(detailsJson)
    if (!parsed.ok) {
      return { allow_description: '', provisional_amount: '', status: 'open', notes: '' }
    }
    const d = parsed.value
    return {
      allow_description: d.allow_description ?? '',
      provisional_amount: d.provisional_amount ?? '',
      status: d.status ?? 'open',
      notes: d.notes ?? '',
    }
  }, [detailsJson])

  const form = useForm<AllowFormValues>({
    resolver: zodResolver(allowEditSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(editorRef, () => ({
    submit: () => form.handleSubmit((data) => onSave(toAllowDetails(data)))(),
  }), [form, onSave])

  const errors = form.formState.errors

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSave(toAllowDetails(data)))}
      className="mt-2 space-y-4"
    >
      <div>
        <Label>Allow description</Label>
        <Input {...form.register('allow_description')} />
        {errors.allow_description && (
          <p className="text-destructive text-sm">{errors.allow_description.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ValidatedField
          label="Provisional amount"
          error={errors.provisional_amount?.message}
          description="Optional rough amount if known."
          htmlFor="allow-provisional-amount"
        >
          <Controller
            name="provisional_amount"
            control={form.control}
            render={({ field }) => (
              <MoneyAmountInput
                id="allow-provisional-amount"
                mode="nonNegative"
                placeholder="0.00"
                value={field.value === '' || field.value === undefined ? null : field.value}
                onValueChange={(v) => field.onChange(v ?? '')}
                onBlur={field.onBlur}
              />
            )}
          />
        </ValidatedField>
        <div>
          <Label>Status</Label>
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Input {...form.register('notes')} />
      </div>
      {!hideFooter && <ExpenseEditorFooter onCancel={onCancel} isSaving={isSaving} />}
      <input type="hidden" value={expenseId} readOnly />
    </form>
  )
}
