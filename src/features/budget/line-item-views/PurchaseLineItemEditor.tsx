import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { PurchaseLineItemDetails } from '@/lib/budget/line-items/purchase'
import type { LineItemEditProps, LineItemEditorRef } from './types'

const purchaseLineItemEditSchema = z.object({
  purchase_description: z.string().nullable().optional(),
  purchase_category: z.string().nullable().optional(),
  is_service_purchase: z.boolean().optional(),
  service_description: z.string().nullable().optional(),
  location_id: z.string().nullable().optional(),
  vendor_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

type PurchaseFormValues = z.infer<typeof purchaseLineItemEditSchema>

function toDetails(values: PurchaseFormValues): PurchaseLineItemDetails {
  return {
    purchase_description: values.purchase_description?.trim() ? values.purchase_description.trim() : null,
    purchase_category: values.purchase_category?.trim() ? values.purchase_category.trim() : null,
    is_service_purchase: !!values.is_service_purchase,
    service_description: values.service_description?.trim() ? values.service_description.trim() : null,
    location_id: values.location_id?.trim() ? values.location_id.trim() : null,
    vendor_id: values.vendor_id?.trim() ? values.vendor_id.trim() : null,
    notes: values.notes?.trim() ? values.notes.trim() : null,
    amount: null,
  }
}

function fromDetails(d: PurchaseLineItemDetails | null): PurchaseFormValues {
  if (!d)
    return {
      purchase_description: null,
      purchase_category: null,
      is_service_purchase: false,
      service_description: null,
      location_id: null,
      vendor_id: null,
      notes: null,
    }
  return {
    purchase_description: d.purchase_description ?? null,
    purchase_category: d.purchase_category ?? null,
    is_service_purchase: !!d.is_service_purchase,
    service_description: d.service_description ?? null,
    location_id: d.location_id ?? null,
    vendor_id: d.vendor_id ?? null,
    notes: d.notes ?? null,
  }
}

export const PurchaseLineItemEditor = forwardRef<
  LineItemEditorRef,
  LineItemEditProps<PurchaseLineItemDetails>
>(function PurchaseLineItemEditor(
  { initialDetails, productionId, locations },
  ref
) {
  const defaultValues = useMemo(() => fromDetails(initialDetails), [initialDetails])
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseLineItemEditSchema) as never,
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

  const isService = !!form.watch('is_service_purchase')

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Purchase details
      </p>
      <div className="grid gap-3">
        <div>
          <Label>Purchase description</Label>
          <Input
            {...form.register('purchase_description')}
            placeholder="Describe the purchase"
            className="mt-1.5 bg-background"
          />
        </div>
        <div>
          <Label className="mb-1.5 block">Purchase type</Label>
          <Controller
            name="is_service_purchase"
            control={form.control}
            render={({ field }) => (
              <SegmentedControl
                ariaLabel="Purchase type"
                value={field.value ? 'service' : 'goods'}
                onValueChange={(v) => field.onChange(v === 'service')}
                options={[
                  { value: 'service', label: 'Service' },
                  { value: 'goods', label: 'Physical / Goods' },
                ]}
                className="mt-1.5"
              />
            )}
          />
        </div>
        <div>
          <Label>Purchase category</Label>
          <Input
            {...form.register('purchase_category')}
            placeholder={isService ? 'Optional' : 'e.g. Props, Camera'}
            className="mt-1.5 bg-background"
          />
        </div>
        {isService && (
          <div>
            <Label>Service description</Label>
            <Input
              {...form.register('service_description')}
              placeholder="Describe the service"
              className="mt-1.5 bg-background"
            />
          </div>
        )}
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
            <Label>Location</Label>
            <Controller
              name="location_id"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value?.trim() ? field.value : '__none__'}
                  onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                >
                  <SelectTrigger className="mt-1.5 h-9 bg-background">
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
          <Input {...form.register('notes')} className="mt-1.5 bg-background" />
        </div>
      </div>
    </div>
  )
})
