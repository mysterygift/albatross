import { useMemo, useImperativeHandle } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
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
})

type PurchaseFormValues = z.infer<typeof purchaseEditSchema>

function toPurchaseDetails(data: PurchaseFormValues): PurchaseDetails {
  return {
    purchase_description: data.purchase_description,
    purchase_category: data.purchase_category?.trim() ? data.purchase_category.trim() : null,
    is_service_purchase: !!data.is_service_purchase,
    service_description: data.service_description?.trim() ? data.service_description.trim() : null,
    location_id: data.location_id?.trim() ? data.location_id.trim() : null,
    vendor_id: data.vendor_id?.trim() ? data.vendor_id.trim() : null,
    notes: data.notes?.trim() ? data.notes.trim() : null,
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
}: TypedExpenseEditProps<PurchaseDetails>) {
  const productionId = context.productionId
  const locations = context.locations ?? []
  const vendorIdFromExpense = context.expense?.vendor_id ?? null

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
      }
    }
    const d = parsed.value
    return {
      purchase_description: d.purchase_description ?? '',
      purchase_category: d.purchase_category ?? '',
      is_service_purchase: !!d.is_service_purchase,
      service_description: d.service_description ?? '',
      location_id: d.location_id ?? '',
      vendor_id: d.vendor_id ?? vendorIdFromExpense ?? '',
      notes: d.notes ?? '',
    }
  }, [detailsJson, vendorIdFromExpense])

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseEditSchema) as never,
    defaultValues: initial,
  })

  useImperativeHandle(editorRef, () => ({
    submit: () => form.handleSubmit((data) => onSave(toPurchaseDetails(data)))(),
  }), [form, onSave])

  const isService = !!form.watch('is_service_purchase')

  return (
    <form onSubmit={form.handleSubmit((data) => onSave(toPurchaseDetails(data)))} className="mt-2 space-y-4">
      <div>
        <Label>Purchase description</Label>
        <Input {...form.register('purchase_description')} />
        {form.formState.errors.purchase_description && (
          <p className="text-destructive text-sm">{form.formState.errors.purchase_description.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Purchase category</Label>
          <Input {...form.register('purchase_category')} placeholder={isService ? 'Optional' : 'e.g. Props, Camera'} />
        </div>
        <div className="space-y-2">
          <Label>Service purchase</Label>
          <Controller
            name="is_service_purchase"
            control={form.control}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <span>{field.value ? 'Service' : 'Physical / goods'}</span>
              </label>
            )}
          />
        </div>
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
