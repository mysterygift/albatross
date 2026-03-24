import { useState, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'
import { Pencil } from 'lucide-react'
import type { BudgetItemWithDetails, LineItemType } from '@/lib/db/types'
import type { Location, Person } from '@/lib/db/types'
import { saveBudgetItemWithDetails } from '@/lib/db/repositories/budgetItemDetails'
import { getLineItemTypeConfig, lineItemTypeRegistry } from '@/lib/budget/line-items/registry'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseEditorFooter } from '@/features/budget/expense-shared'
import { LineItemParseErrorCard } from '@/features/budget/line-item-views/LineItemParseErrorCard'
import type { LineItemEditorRef } from '@/features/budget/line-item-views/types'
const LINE_ITEM_TYPE_SENTINEL_NONE = '__none__'

const LINE_ITEM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  ...(Object.entries(lineItemTypeRegistry) as [LineItemType, (typeof lineItemTypeRegistry)[LineItemType]][])
    .map(([value, config]) => ({ value, label: config.label })),
  { value: LINE_ITEM_TYPE_SENTINEL_NONE, label: 'Untyped / None' },
]

export type LineItemDetailPanelProps = {
  lineItemWithDetails: BudgetItemWithDetails | null | undefined
  isLoading: boolean
  accountLabel: string
  format: (amount: number, currency: string) => { formatted: string }
  productionCurrency: string
  productionId: string
  people: Person[]
  locations: Location[]
  onClose: () => void
  /** Called after a successful save; parent should invalidate budget-items and budget-item-with-details. */
  onSaved: () => void
  /** Optional: related spend in same account + same type (informational only). */
  relatedSpendInAccount?: { count: number; totalActual: number; typeLabel: string }
}

const lineItemEditSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  estimated_cost: z.coerce
    .number()
    .finite('Estimated cost must be a number')
    .nonnegative('Estimated cost must be 0 or more'),
  vendor: z.string().optional(),
  lineItemType: z.string(),
})

type LineItemEditFormValues = z.infer<typeof lineItemEditSchema>

function formatLineItemType(type: string | null): string {
  if (type == null) return 'Untyped line item'
  return getLineItemTypeConfig(type as LineItemType)?.label ?? type
}

export function LineItemDetailPanel({
  lineItemWithDetails,
  isLoading,
  accountLabel,
  format,
  productionCurrency,
  productionId,
  people,
  locations,
  onClose,
  onSaved,
  relatedSpendInAccount,
}: LineItemDetailPanelProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const typedEditorRef = useRef<LineItemEditorRef | null>(null)

  const form = useForm<LineItemEditFormValues>({
    resolver: zodResolver(lineItemEditSchema) as never,
    values:
      lineItemWithDetails != null
        ? {
            description: lineItemWithDetails.budget_item.description,
            estimated_cost: lineItemWithDetails.budget_item.estimated_cost,
            vendor: lineItemWithDetails.budget_item.vendor ?? '',
            lineItemType:
              lineItemWithDetails.budget_item.line_item_type ?? LINE_ITEM_TYPE_SENTINEL_NONE,
          }
        : undefined,
  })

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!lineItemWithDetails) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Line item not found.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  const { budget_item: item, details } = lineItemWithDetails
  const typeLabel = formatLineItemType(item.line_item_type)
  const hasTypeButNoDetails = item.line_item_type != null && details == null

  const handleSave = form.handleSubmit(async (data) => {
    setSaveError(null)
    setIsSaving(true)
    try {
      const lineItemType: LineItemType | null =
        data.lineItemType === LINE_ITEM_TYPE_SENTINEL_NONE ? null : (data.lineItemType as LineItemType)
      let typedDetails: unknown = undefined
      if (lineItemType != null) {
        typedDetails = typedEditorRef.current?.getDetails() ?? undefined
        const config = getLineItemTypeConfig(lineItemType)
        if (config?.serialize && typedDetails !== undefined) {
          config.serialize(typedDetails)
        }
      }
      await saveBudgetItemWithDetails({
        budgetItemId: item.id,
        description: data.description.trim(),
        estimated_cost: data.estimated_cost,
        vendor: data.vendor?.trim() ? data.vendor.trim() : null,
        lineItemType,
        details: typedDetails,
      })
      onSaved()
      setMode('read')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  })

  const handleCancel = () => {
    form.reset({
      description: item.description,
      estimated_cost: item.estimated_cost,
      vendor: item.vendor ?? '',
      lineItemType: item.line_item_type ?? LINE_ITEM_TYPE_SENTINEL_NONE,
    })
    setSaveError(null)
    setMode('read')
  }

  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle>Line item details</SheetTitle>
          <div className="flex items-center gap-1">
            {mode === 'read' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setMode('edit')}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {mode === 'read' && (
          <p className="text-xs font-medium text-muted-foreground mt-1">{typeLabel}</p>
        )}
      </SheetHeader>
      <div className="p-4 space-y-4 overflow-auto">
        {mode === 'read' ? (
          <>
            <ExpenseDetailMetaGrid>
              <ExpenseDetailMetaRow label="Account" value={accountLabel} />
              <ExpenseDetailMetaRow label="Description" value={item.description} />
              <ExpenseDetailMetaRow
                label="Estimated cost"
                value={format(item.estimated_cost, productionCurrency).formatted}
              />
              <ExpenseDetailMetaRow label="Vendor" value={item.vendor ?? '—'} />
              <ExpenseDetailMetaRow label="Line item type" value={typeLabel} />
            </ExpenseDetailMetaGrid>

            {relatedSpendInAccount && relatedSpendInAccount.count > 0 && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">Related spend in this account</p>
                <p className="text-sm mt-0.5">
                  {relatedSpendInAccount.count} {relatedSpendInAccount.typeLabel.toLowerCase()} expense
                  {relatedSpendInAccount.count !== 1 ? 's' : ''} · {format(relatedSpendInAccount.totalActual, productionCurrency).formatted} actual
                </p>
              </div>
            )}

            {details ? (
              (() => {
                const config = getLineItemTypeConfig(item.line_item_type)
                if (!config) {
                  return (
                    <LineItemParseErrorCard
                      message="Unknown line item type. Showing raw data."
                      rawJson={details.details_json}
                    />
                  )
                }
                const parsed = config.parse(details.details_json)
                if (!parsed.ok) {
                  return (
                    <LineItemParseErrorCard
                      message={parsed.error}
                      rawJson={details.details_json}
                    />
                  )
                }
                const ReadComponent = config.ReadComponent
                return (
                  <ReadComponent
                    details={parsed.value}
                    format={format}
                    productionCurrency={productionCurrency}
                  />
                )
              })()
            ) : hasTypeButNoDetails ? (
              <p className="text-sm text-muted-foreground">
                Typed details for this line item have not been added yet.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This line item does not yet use typed details.
              </p>
            )}
          </>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {saveError && (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            )}
            <div className="grid gap-3">
              <div>
                <Label htmlFor="line-item-description">Description</Label>
                <Input
                  id="line-item-description"
                  {...form.register('description')}
                  className="mt-1.5 bg-background"
                />
                {form.formState.errors.description && (
                  <p className="text-destructive text-sm mt-1">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="line-item-estimated-cost">Estimated cost</Label>
                <Input
                  id="line-item-estimated-cost"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  {...form.register('estimated_cost')}
                  className="mt-1.5 bg-background"
                />
                {form.formState.errors.estimated_cost && (
                  <p className="text-destructive text-sm mt-1">
                    {form.formState.errors.estimated_cost.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="line-item-vendor">Vendor (optional)</Label>
                <Input
                  id="line-item-vendor"
                  {...form.register('vendor')}
                  placeholder="—"
                  className="mt-1.5 bg-background"
                />
              </div>
              <div>
                <Label>Line item type</Label>
                <Controller
                  name="lineItemType"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(newValue) => {
                        if (newValue === field.value) return
                        const currentType = field.value
                        const hadType = currentType !== LINE_ITEM_TYPE_SENTINEL_NONE
                        const hadDetails = hadType && details != null
                        const typedDirty = hadType && typedEditorRef.current?.isDirty?.()
                        if (hadDetails || typedDirty) {
                          if (
                            !window.confirm(
                              'Changing the line item type will discard incompatible typed details.'
                            )
                          ) {
                            return
                          }
                        }
                        field.onChange(newValue)
                      }}
                    >
                      <SelectTrigger id="line-item-type" className="mt-1.5 w-full bg-background">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {LINE_ITEM_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            {(() => {
              const selectedType = form.watch('lineItemType') as string
              const lineItemType =
                selectedType === LINE_ITEM_TYPE_SENTINEL_NONE ? null : (selectedType as LineItemType)
              const config =
                lineItemType != null ? getLineItemTypeConfig(lineItemType) : null
              const showTypedEditor =
                config?.editable && config?.EditComponent && lineItemType != null
              if (!showTypedEditor) return null
              const initialDetails =
                lineItemType === item.line_item_type && details
                  ? (() => {
                      const parsed = config.parse(details.details_json)
                      return parsed.ok ? parsed.value : null
                    })()
                  : null
              const EditComponent = config.EditComponent!
              return (
                <EditComponent
                  key={lineItemType}
                  ref={typedEditorRef}
                  initialDetails={initialDetails}
                  productionId={productionId}
                  people={people}
                  locations={locations}
                  format={format}
                  productionCurrency={productionCurrency}
                  onEstimatedCostSuggest={(amount) =>
                    form.setValue('estimated_cost', amount, { shouldValidate: true })
                  }
                />
              )
            })()}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <ExpenseEditorFooter
                onCancel={handleCancel}
                isSaving={isSaving}
                saveLabel="Save"
                cancelLabel="Cancel"
              />
            </div>
          </form>
        )}
      </div>
    </>
  )
}
