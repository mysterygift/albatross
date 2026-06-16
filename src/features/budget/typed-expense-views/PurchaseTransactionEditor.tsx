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
import { parsePurchaseDetails } from '@/lib/budget/transactions/purchase'
import type { PurchaseDetails } from '@/lib/budget/transactions/purchase'
import { ExpenseEditorFooter } from '../expense-shared'
import type { TypedExpenseEditProps } from './types'

const purchaseEditSchema = z.object({
  purchase_description: z.string().min(1, 'Purchase description is required'),
  purchase_category: z.string().optional(),
  is_service_purchase: z.boolean().optional(),
  service_description: z.string().optional(),
  location_id: z.string().optional(),
  vendor_id: z.string().optional(),
  notes: z.string().optional(),
  amount: z
    .union([
      z.literal(''),
      z
        .number()
        .finite(POSITIVE_MONEY_MESSAGE)
        .positive(POSITIVE_MONEY_MESSAGE)
        .refine(hasMaxTwoDecimalPlaces, { message: 'Amount must have at most 2 decimal places' }),
    ])
    .superRefine((val, ctx) => {
      if (val === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'Purchase amount is required and must be greater than 0',
        })
      }
    }),
})

type PurchaseFormValues = {
  purchase_description: string
  purchase_category?: string
  is_service_purchase?: boolean
  service_description?: string
  location_id?: string
  vendor_id?: string
  notes?: string
  amount: number | ''
}

function toPurchaseDetails(data: PurchaseFormValues): PurchaseDetails {
  const amount = data.amount === '' ? 0 : data.amount
  return {
    purchase_description: data.purchase_description,
    purchase_category: data.purchase_category?.trim() ? data.purchase_category.trim() : null,
    is_service_purchase: !!data.is_service_purchase,
    service_description: data.service_description?.trim() ? data.service_description.trim() : null,
    location_id: data.location_id?.trim() ? data.location_id.trim() : null,
    vendor_id: data.vendor_id?.trim() ? data.vendor_id.trim() : null,
    notes: data.notes?.trim() ? data.notes.trim() : null,
    amount,
  }
}

export function PurchaseTransactionEditor({
  expenseId,
  detailsJson,
  onSave,
  onCancel,
  isSaving,
  context,
  hideFooter,
  editorRef,
  onVendorIdChange,
}: TypedExpenseEditProps<PurchaseDetails>) {
  const productionId = context.productionId
  const locations = context.locations ?? []
  const vendorIdFromExpense = context.expense?.vendor_id ?? null

  const expenseAmount = context.expense?.amount ?? 0
  const initial: PurchaseFormValues = useMemo(() => {
    if (!detailsJson) {
      return {
        purchase_description: '',
        purchase_category: '',
        is_service_purchase: false,
        service_description: '',
        location_id: '',
        vendor_id: vendorIdFromExpense ?? '',
        notes: '',
        amount: expenseAmount > 0 ? expenseAmount : '',
      }
    }
    const parsed = parsePurchaseDetails(detailsJson)
    if (!parsed.ok) {
      return {
        purchase_description: '',
        purchase_category: '',
        is_service_purchase: false,
        service_description: '',
        location_id: '',
        vendor_id: vendorIdFromExpense ?? '',
        notes: '',
        amount: expenseAmount > 0 ? expenseAmount : '',
      }
    }
    const d = parsed.value
    const amt = d.amount ?? expenseAmount
    return {
      purchase_description: d.purchase_description ?? '',
      purchase_category: d.purchase_category ?? '',
      is_service_purchase: !!d.is_service_purchase,
      service_description: d.service_description ?? '',
      location_id: d.location_id ?? '',
      vendor_id: d.vendor_id ?? vendorIdFromExpense ?? '',
      notes: d.notes ?? '',
      amount: amt > 0 ? amt : '',
    }
  }, [detailsJson, vendorIdFromExpense, expenseAmount])

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseEditSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(editorRef, () => ({
    submit: () => form.handleSubmit((data) => onSave(toPurchaseDetails(data)))(),
  }), [form, onSave])

  const watchedVendorId = form.watch('vendor_id')
  useEffect(() => {
    onVendorIdChange?.(watchedVendorId?.trim() ? watchedVendorId.trim() : null)
  }, [watchedVendorId, onVendorIdChange])

  const isService = !!form.watch('is_service_purchase')
  const errors = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(toPurchaseDetails(data)))} className="mt-2 space-y-4">
      <div>
        <Label>Purchase description</Label>
        <Input {...form.register('purchase_description')} />
        {errors.purchase_description && (
          <p className="text-destructive text-sm">{errors.purchase_description.message}</p>
        )}
      </div>
      <ValidatedField
        label="Amount"
        required
        error={errors.amount?.message}
        description="Required for new spend. This is the actual cost."
        htmlFor="purchase-amount"
      >
        <Controller
          name="amount"
          control={form.control}
          render={({ field }) => (
            <MoneyAmountInput
              id="purchase-amount"
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
        <Label className="mb-2 block">Purchase type</Label>
        <Controller
          name="is_service_purchase"
          control={form.control}
          render={({ field }) => (
            <div
              role="tablist"
              aria-label="Purchase type"
              className="relative flex w-full rounded-xl border border-border bg-muted/20 p-1"
            >
              <div
                aria-hidden
                className="absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-primary/20 transition-transform duration-200 ease-out"
                style={{ transform: field.value ? 'translateX(0)' : 'translateX(100%)' }}
              />
              <button
                type="button"
                role="tab"
                aria-selected={field.value === true}
                tabIndex={field.value === true ? 0 : -1}
                onClick={() => field.onChange(true)}
                className={`relative z-10 flex-1 rounded-lg py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  field.value ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                Service
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={field.value === false}
                tabIndex={field.value === false ? 0 : -1}
                onClick={() => field.onChange(false)}
                className={`relative z-10 flex-1 rounded-lg py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  !field.value ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                Physical / Goods
              </button>
            </div>
          )}
        />
      </div>
      <div>
        <Label>Purchase category</Label>
        <Input {...form.register('purchase_category')} placeholder={isService ? 'Optional' : 'e.g. Props, Camera'} />
      </div>
      {isService && (
        <div>
          <Label>Service description</Label>
          <Input {...form.register('service_description')} placeholder="Describe the service" />
        </div>
      )}
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
          <Label>Location (permit)</Label>
          <Controller
            name="location_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value && field.value.trim() !== '' ? field.value : '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-9">
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
          <p className="text-muted-foreground text-xs mt-1">If set, saving will mark the location as Booked.</p>
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
