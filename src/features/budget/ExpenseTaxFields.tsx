import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getProductionBudgetFeatures,
  listTaxCreditSchemes,
  type TaxCreditAllocationInput,
} from '@/lib/db/repositories/taxCredits'

export type ExpenseTaxCreditDraft = TaxCreditAllocationInput

type Props = {
  productionId: string
  expenseAmount: number | null
  value: ExpenseTaxCreditDraft[]
  onChange: (allocations: ExpenseTaxCreditDraft[]) => void
  vatRatePercent: number | null
  onVatRateChange: (rate: number | null) => void
}

export function ExpenseTaxFields({
  productionId,
  expenseAmount,
  value,
  onChange,
  vatRatePercent,
  onVatRateChange,
}: Props) {
  const { data: features } = useQuery({
    queryKey: ['production-budget-features', productionId],
    queryFn: () => getProductionBudgetFeatures(productionId),
  })

  const { data: schemes = [] } = useQuery({
    queryKey: ['tax-credit-schemes', productionId],
    queryFn: () => listTaxCreditSchemes(productionId),
    enabled: features?.tax_credits_enabled === true,
  })

  const enabledSchemes = useMemo(
    () => schemes.filter((s) => s.is_enabled),
    [schemes]
  )

  const taxCreditsOn = features?.tax_credits_enabled === true
  const vatOn = features?.vat_tracking_enabled === true

  const [vatDraft, setVatDraft] = useState(
    vatRatePercent != null ? String(vatRatePercent) : ''
  )

  useEffect(() => {
    setVatDraft(vatRatePercent != null ? String(vatRatePercent) : '')
  }, [vatRatePercent])

  const selectedIds = new Set(value.map((a) => a.tax_credit_scheme_id))
  const totalQualifying = value.reduce((s, a) => s + a.qualifying_amount, 0)
  const amount = expenseAmount ?? 0

  const toggleScheme = (schemeId: string, checked: boolean) => {
    if (checked) {
      const defaultAmount = amount > 0 ? amount : 0
      onChange([...value, { tax_credit_scheme_id: schemeId, qualifying_amount: defaultAmount }])
    } else {
      onChange(value.filter((a) => a.tax_credit_scheme_id !== schemeId))
    }
  }

  const updateQualifying = (schemeId: string, raw: string) => {
    const num = raw === '' ? 0 : Number(raw)
    onChange(
      value.map((a) =>
        a.tax_credit_scheme_id === schemeId
          ? { ...a, qualifying_amount: num }
          : a
      )
    )
  }

  if (!taxCreditsOn && !vatOn) return null

  return (
    <div className="space-y-4 rounded-md border border-border p-3 bg-muted/20">
      {taxCreditsOn && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tax credit qualifying spend</Label>
          {enabledSchemes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enabled tax credit schemes. Configure schemes in Settings → Budget.
            </p>
          ) : (
            <div className="space-y-2">
              {enabledSchemes.map((scheme) => {
                const selected = selectedIds.has(scheme.id)
                const alloc = value.find((a) => a.tax_credit_scheme_id === scheme.id)
                return (
                  <div key={scheme.id} className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      id={`tc-${scheme.id}`}
                      checked={selected}
                      onCheckedChange={(c) => toggleScheme(scheme.id, c === true)}
                    />
                    <Label htmlFor={`tc-${scheme.id}`} className="flex-1 min-w-[140px] text-sm">
                      {scheme.name}
                    </Label>
                    {selected && (
                      <div className="flex items-center gap-1">
                        <Label htmlFor={`tc-amt-${scheme.id}`} className="text-xs text-muted-foreground">
                          Qualifying
                        </Label>
                        <Input
                          id={`tc-amt-${scheme.id}`}
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-[120px] h-8"
                          value={alloc?.qualifying_amount ?? ''}
                          onChange={(e) => updateQualifying(scheme.id, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              {amount > 0 && totalQualifying > amount + 1e-9 && (
                <p className="text-sm text-destructive">
                  Total qualifying amounts cannot exceed the expense amount ({amount.toLocaleString()}).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {vatOn && (
        <div className="space-y-1">
          <Label htmlFor="expense-vat-rate">VAT rate (%)</Label>
          <Input
            id="expense-vat-rate"
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-[120px]"
            placeholder={features?.default_vat_rate_percent?.toString() ?? '20'}
            value={vatDraft}
            onChange={(e) => {
              setVatDraft(e.target.value)
              const raw = e.target.value
              onVatRateChange(raw === '' ? null : Number(raw))
            }}
          />
          {amount > 0 && vatRatePercent != null && vatRatePercent > 0 && (
            <p className="text-xs text-muted-foreground">
              VAT amount: {(amount * (vatRatePercent / 100)).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
