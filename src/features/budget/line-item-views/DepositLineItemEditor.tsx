import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import {
  DEPOSIT_REFUNDABLE_STATUSES,
  type DepositLineItemDetails,
} from '@/lib/budget/line-items/deposit'
import type { LineItemEditProps, LineItemEditorRef } from './types'

const depositLineItemEditSchema = z.object({
  deposit_description: z.string().nullable().optional(),
  refundable_status: z.enum(DEPOSIT_REFUNDABLE_STATUSES).nullable().optional(),
  vendor_id: z.string().nullable().optional(),
  location_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

type DepositFormValues = z.infer<typeof depositLineItemEditSchema>

function toDetails(values: DepositFormValues): DepositLineItemDetails {
  return {
    deposit_description: values.deposit_description?.trim() ? values.deposit_description.trim() : null,
    refundable_status: values.refundable_status ?? null,
    vendor_id: values.vendor_id?.trim() ? values.vendor_id.trim() : null,
    location_id: values.location_id?.trim() ? values.location_id.trim() : null,
    notes: values.notes?.trim() ? values.notes.trim() : null,
  }
}

function fromDetails(d: DepositLineItemDetails | null): DepositFormValues {
  if (!d)
    return {
      deposit_description: null,
      refundable_status: null,
      vendor_id: null,
      location_id: null,
      notes: null,
    }
  return {
    deposit_description: d.deposit_description ?? null,
    refundable_status: d.refundable_status ?? null,
    vendor_id: d.vendor_id ?? null,
    location_id: d.location_id ?? null,
    notes: d.notes ?? null,
  }
}

export const DepositLineItemEditor = forwardRef<
  LineItemEditorRef,
  LineItemEditProps<DepositLineItemDetails>
>(function DepositLineItemEditor(
  { initialDetails, productionId, locations },
  ref
) {
  const defaultValues = useMemo(() => fromDetails(initialDetails), [initialDetails])
  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositLineItemEditSchema) as never,
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

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Deposit details
      </p>
      <div className="grid gap-3">
        <div>
          <Label>Deposit description</Label>
          <Input
            {...form.register('deposit_description')}
            placeholder="Describe the deposit"
            className="mt-1.5 bg-background"
          />
        </div>
        <div>
          <Label>Refundable status</Label>
          <Controller
            name="refundable_status"
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
                  <SelectItem value="refundable">Refundable</SelectItem>
                  <SelectItem value="non_refundable">Non-refundable</SelectItem>
                </SelectContent>
              </Select>
            )}
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
