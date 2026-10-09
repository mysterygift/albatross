import { useMemo, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import { usePhoneWidth } from '@/hooks/use-is-phone'
import { cn } from '@/lib/utils'
import type { UpdateEquipmentPatch } from '@/lib/db/repositories/equipment'
import type { Equipment } from '@/lib/db/types'
import {
  buildBulkEquipmentPatch,
  getInitialBulkEditValues,
  getMixedBulkFields,
  type BulkEditableField,
  type BulkEditValues,
} from '@/lib/equipment/bulkEdit'
import {
  EquipmentCategorySelect,
  EquipmentDepartmentSelect,
  EquipmentSourceSelect,
  EquipmentStatusSelect,
} from '@/features/equipment/EquipmentFieldSelects'

export function BulkEditEquipmentDialog({
  open,
  onOpenChange,
  items,
  productionId,
  departmentOptions,
  onApply,
  isSaving,
  errorMessage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: Equipment[]
  productionId: string
  departmentOptions: string[]
  onApply: (patch: UpdateEquipmentPatch) => void
  isSaving: boolean
  errorMessage?: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-touch-targets>
        {open && items.length > 0 && (
          <BulkEditEquipmentForm
            items={items}
            productionId={productionId}
            departmentOptions={departmentOptions}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
            isSaving={isSaving}
            errorMessage={errorMessage}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BulkEditEquipmentForm({
  items,
  productionId,
  departmentOptions,
  onApply,
  onCancel,
  isSaving,
  errorMessage,
}: {
  items: Equipment[]
  productionId: string
  departmentOptions: string[]
  onApply: (patch: UpdateEquipmentPatch) => void
  onCancel: () => void
  isSaving: boolean
  errorMessage?: string | null
}) {
  // Snapshot on open so a background refetch doesn't reset what the user has typed.
  const [initial] = useState(() => ({
    values: getInitialBulkEditValues(items),
    mixed: getMixedBulkFields(items),
  }))
  const { mixed } = initial
  // Paired fields and the three dates stack on a phone; side by side they are too narrow to read.
  const phone = usePhoneWidth()
  const [values, setValues] = useState<BulkEditValues>(initial.values)
  const [enabled, setEnabled] = useState<Set<BulkEditableField>>(() => new Set())
  // Number inputs are kept as text so "Mixed" fields can start blank.
  const [quantityText, setQuantityText] = useState(() =>
    mixed.has('quantity') ? '' : String(initial.values.quantity)
  )
  const [replacementText, setReplacementText] = useState(() =>
    mixed.has('replacement_value') || initial.values.replacement_value == null
      ? ''
      : String(initial.values.replacement_value)
  )

  const toggle = (field: BulkEditableField, on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (on) next.add(field)
      else next.delete(field)
      return next
    })

  /** Changing a field's value ticks it, so the change is applied. */
  const set = <K extends keyof BulkEditValues>(field: BulkEditableField, key: K, value: BulkEditValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    toggle(field, true)
  }

  const quantity = Number(quantityText)
  const quantityInvalid = enabled.has('quantity') && !(Number.isInteger(quantity) && quantity >= 1)
  const replacement = replacementText.trim() === '' ? null : Number(replacementText)
  const replacementInvalid =
    enabled.has('replacement_value') && replacement != null && !(Number.isFinite(replacement) && replacement >= 0)

  const sameName = useMemo(() => items.every((e) => e.name === items[0]!.name), [items])
  const canApply = enabled.size > 0 && !quantityInvalid && !replacementInvalid && !isSaving

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canApply) return
    onApply(
      buildBulkEquipmentPatch(
        { ...values, quantity: Number.isInteger(quantity) ? quantity : 1, replacement_value: replacement },
        enabled
      )
    )
  }

  const fieldProps = (field: BulkEditableField, label: string) => ({
    field,
    label,
    enabled: enabled.has(field),
    mixed: mixed.has(field),
    onToggle: (on: boolean) => toggle(field, on),
  })
  const showMixed = (field: BulkEditableField) => mixed.has(field) && !enabled.has(field)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {items.length} items</DialogTitle>
        <DialogDescription>
          Tick the fields you want to change. Fields you leave unticked keep each item&apos;s current value.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LockedField
          label="Name"
          reason="Edit items one at a time to rename them"
          value={sameName ? items[0]!.name : `${items.length} different names`}
        />
        <BulkField {...fieldProps('quantity', 'Quantity')}>
          <Input
            id="bulk-quantity"
            type="number"
            min={1}
            step={1}
            value={quantityText}
            placeholder={showMixed('quantity') ? 'Mixed' : undefined}
            aria-invalid={quantityInvalid || undefined}
            onChange={(e) => {
              setQuantityText(e.target.value)
              toggle('quantity', true)
            }}
          />
          {quantityInvalid && <p className="text-xs text-destructive mt-1">Quantity must be at least 1</p>}
        </BulkField>
        <div className={cn('grid gap-4', phone ? 'grid-cols-1' : 'grid-cols-2')}>
          <BulkField {...fieldProps('category', 'Category')}>
            <EquipmentCategorySelect
              id="bulk-category"
              value={values.category}
              mixed={showMixed('category')}
              onValueChange={(v) => set('category', 'category', v)}
            />
          </BulkField>
          <BulkField {...fieldProps('source_type', 'Source')}>
            <EquipmentSourceSelect
              id="bulk-source_type"
              value={values.source_type}
              mixed={showMixed('source_type')}
              onValueChange={(v) => set('source_type', 'source_type', v)}
            />
          </BulkField>
        </div>
        <div className={cn('grid gap-4', phone ? 'grid-cols-1' : 'grid-cols-2')}>
          <BulkField {...fieldProps('department', 'Department')}>
            <EquipmentDepartmentSelect
              id="bulk-department"
              value={values.department}
              mixed={showMixed('department')}
              departmentOptions={departmentOptions}
              onValueChange={(v) => set('department', 'department', v)}
            />
          </BulkField>
          <BulkField {...fieldProps('status', 'Status')}>
            <EquipmentStatusSelect
              id="bulk-status"
              value={values.status}
              mixed={showMixed('status')}
              onValueChange={(v) => set('status', 'status', v)}
            />
          </BulkField>
        </div>
        <BulkField {...fieldProps('vendor', 'Vendor')}>
          <VendorPicker
            productionId={productionId}
            value={values.vendor_id}
            onChange={(id) => set('vendor', 'vendor_id', id)}
            placeholder={showMixed('vendor') ? 'Mixed' : 'Select vendor (optional)'}
            mixed={showMixed('vendor')}
          />
          {!values.vendor_id && !showMixed('vendor') && (
            <Input
              className="mt-2"
              placeholder="Or enter legacy vendor name"
              value={values.vendor}
              onChange={(e) => set('vendor', 'vendor', e.target.value)}
            />
          )}
        </BulkField>
        <LockedField label="Serial number" reason="Serial numbers are unique to each item" />
        <div className={cn('grid gap-4', phone ? 'grid-cols-1' : 'grid-cols-3')}>
          <BulkField {...fieldProps('rental_start_date', 'Rental start')}>
            <Input
              id="bulk-rental_start_date"
              type="date"
              value={values.rental_start_date}
              onChange={(e) => set('rental_start_date', 'rental_start_date', e.target.value)}
            />
          </BulkField>
          <BulkField {...fieldProps('return_due_date', 'Return due')}>
            <Input
              id="bulk-return_due_date"
              type="date"
              value={values.return_due_date}
              onChange={(e) => set('return_due_date', 'return_due_date', e.target.value)}
            />
          </BulkField>
          <BulkField {...fieldProps('returned_at', 'Returned at')}>
            <Input
              id="bulk-returned_at"
              type="date"
              value={values.returned_at}
              onChange={(e) => set('returned_at', 'returned_at', e.target.value)}
            />
          </BulkField>
        </div>
        <BulkField {...fieldProps('replacement_value', 'Replacement value (insurance)')}>
          <Input
            id="bulk-replacement_value"
            type="number"
            step={0.01}
            min={0}
            value={replacementText}
            placeholder={showMixed('replacement_value') ? 'Mixed' : 'Optional'}
            aria-invalid={replacementInvalid || undefined}
            onChange={(e) => {
              setReplacementText(e.target.value)
              toggle('replacement_value', true)
            }}
          />
        </BulkField>
        <BulkField {...fieldProps('notes', 'Notes')}>
          <Input
            id="bulk-notes"
            value={values.notes}
            placeholder={showMixed('notes') ? 'Mixed' : 'Optional'}
            onChange={(e) => set('notes', 'notes', e.target.value)}
          />
        </BulkField>
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Return reminders are kept in sync for each item, the same as when you edit one item. A ticked field
          left blank clears that value on every selected item.
        </p>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canApply}>
            {isSaving ? 'Saving…' : `Apply to ${items.length} items`}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function BulkField({
  field,
  label,
  enabled,
  mixed,
  onToggle,
  children,
}: {
  field: BulkEditableField
  label: string
  enabled: boolean
  mixed: boolean
  onToggle: (on: boolean) => void
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Checkbox
        className="mt-0.5"
        checked={enabled}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={`Change ${label}`}
      />
      <div className="flex-1 min-w-0">
        {/* Inputs use the id `bulk-<field>` so the label names them; the checkbox has its own aria-label. */}
        <Label htmlFor={`bulk-${field}`} className="mb-1.5">
          {label}
          {mixed && !enabled && <span className="text-xs font-normal text-muted-foreground">(mixed)</span>}
        </Label>
        <div className={enabled ? undefined : 'opacity-70'}>{children}</div>
      </div>
    </div>
  )
}

function LockedField({ label, reason, value }: { label: string; reason: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex-1 min-w-0">
        <Label className="mb-1.5">
          {label}
          <span className="text-xs font-normal text-muted-foreground">{reason}</span>
        </Label>
        <Input disabled value={value ?? ''} placeholder="Unchanged" aria-label={`${label} (locked)`} />
      </div>
    </div>
  )
}
