import { useMemo, useImperativeHandle, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { hasMaxTwoDecimalPlaces, POSITIVE_MONEY_MESSAGE } from '@/lib/budget/fieldValidation'
import {
  DEPOSIT_REFUNDABLE_STATUSES,
  parseDepositDetails,
  type DepositDetails,
} from '@/lib/budget/transactions/deposit'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'

const depositEditSchema = z.object({
  deposit_description: z.string().min(1, 'Deposit description is required'),
  amount: z.union([
    z.literal(''),
    z
      .number()
      .finite(POSITIVE_MONEY_MESSAGE)
      .positive('Deposit amount must be greater than 0')
      .refine(hasMaxTwoDecimalPlaces, { message: 'Amount must have at most 2 decimal places' }),
  ]),
  refundable_status: z.enum(DEPOSIT_REFUNDABLE_STATUSES, {
    message: 'Select refundable or non-refundable',
  }),
  vendor_id: z.string().optional(),
  location_id: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.amount === '') {
    ctx.addIssue({
      code: 'custom',
      message: 'Deposit amount is required',
      path: ['amount'],
    })
  }
})

type DepositFormValues = {
  deposit_description: string
  amount: number | ''
  refundable_status: (typeof DEPOSIT_REFUNDABLE_STATUSES)[number]
  vendor_id?: string
  location_id?: string
  notes?: string
}

function toDepositDetails(data: DepositFormValues): DepositDetails {
  const amount = data.amount === '' ? 0 : Number(data.amount)
  return {
    deposit_description: data.deposit_description.trim(),
    refundable_status: data.refundable_status,
    amount,
    vendor_id: data.vendor_id?.trim() ? data.vendor_id.trim() : null,
    location_id: data.location_id?.trim() ? data.location_id.trim() : null,
    notes: data.notes?.trim() ? data.notes.trim() : null,
  }
}

export function DepositTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context,
  hideFooter,
  editorRef,
  onVendorIdChange,
}: TypedExpenseEditProps<DepositDetails>) {
  const productionId = context.productionId
  const locations = context.locations ?? []
  const vendorIdFromExpense = context.expense?.vendor_id ?? null
  const expenseAmount = context.expense?.amount ?? 0

  const initial: DepositFormValues = useMemo(() => {
    if (!detailsJson) {
      return {
        deposit_description: '',
        amount: expenseAmount > 0 ? expenseAmount : '',
        refundable_status: 'refundable',
        vendor_id: vendorIdFromExpense ?? '',
        location_id: '',
        notes: '',
      }
    }
    const parsed = parseDepositDetails(detailsJson)
    if (!parsed.ok) {
      return {
        deposit_description: '',
        amount: expenseAmount > 0 ? expenseAmount : '',
        refundable_status: 'refundable',
        vendor_id: vendorIdFromExpense ?? '',
        location_id: '',
        notes: '',
      }
    }
    const d = parsed.value
    const amt = d.amount > 0 ? d.amount : expenseAmount
    return {
      deposit_description: d.deposit_description ?? '',
      amount: amt > 0 ? amt : '',
      refundable_status: d.refundable_status,
      vendor_id: d.vendor_id ?? vendorIdFromExpense ?? '',
      location_id: d.location_id ?? '',
      notes: d.notes ?? '',
    }
  }, [detailsJson, vendorIdFromExpense, expenseAmount])

  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositEditSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(
    editorRef,
    () => ({
      submit: () => form.handleSubmit((data) => onSave(toDepositDetails(data)))(),
    }),
    [form, onSave]
  )

  const watchedVendorId = form.watch('vendor_id')
  useEffect(() => {
    onVendorIdChange?.(watchedVendorId?.trim() ? watchedVendorId.trim() : null)
  }, [watchedVendorId, onVendorIdChange])

  const errors = form.formState.errors

  return (
    <form
      onSubmit={form.handleSubmit((data) => onSave(toDepositDetails(data)))}
      className="mt-2 space-y-4"
    >
      <div>
        <Label>Deposit description</Label>
        <Input {...form.register('deposit_description')} placeholder="Describe the deposit" />
        {errors.deposit_description && (
          <p className="text-destructive text-sm">{errors.deposit_description.message}</p>
        )}
      </div>
      <ValidatedField
        label="Deposit amount"
        required
        error={errors.amount?.message}
        description="Required. Held deposit value recorded on this spend."
        htmlFor="deposit-amount"
      >
        <Controller
          name="amount"
          control={form.control}
          render={({ field }) => (
            <MoneyAmountInput
              id="deposit-amount"
              mode="positive"
              placeholder="0.00"
              value={field.value === '' ? null : field.value}
              onValueChange={(v) => field.onChange(v ?? '')}
              onBlur={field.onBlur}
            />
          )}
        />
      </ValidatedField>
      <div>
        <Label>Refundable status</Label>
        <Controller
          name="refundable_status"
          control={form.control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-9 mt-1.5">
                <SelectValue placeholder="Select refundable or non-refundable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refundable">Refundable</SelectItem>
                <SelectItem value="non_refundable">Non-refundable</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.refundable_status && (
          <p className="text-destructive text-sm">{errors.refundable_status.message}</p>
        )}
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
                value={field.value?.trim() ? field.value : null}
                onChange={(id) => field.onChange(id ?? '')}
                placeholder="Select vendor"
              />
            )}
          />
        </div>
        <div>
          <Label>Location</Label>
          <Controller
            name="location_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value?.trim() ? field.value : '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-9 mt-1.5">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
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
