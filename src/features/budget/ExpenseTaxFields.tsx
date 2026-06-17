import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { PercentageInput } from '@/components/budget/PercentageInput'
import { PERCENTAGE_MESSAGE } from '@/lib/budget/fieldValidation'
import {
  getProductionBudgetFeatures,
  listTaxCreditSchemes,
  type TaxCreditAllocationInput,
} from '@/lib/db/repositories/taxCredits'
import { listVatReclaimRates } from '@/lib/db/repositories/vatReclaim'
import type { ExpenseVatReclaimInput } from '@/lib/db/repositories/vatReclaim'
import type { ExpenseTransactionType } from '@/lib/db/types'
import {
  buildVatReclaimRateMap,
  computeExpenseVatReclaim,
} from '@/lib/budget/vatReclaim'

export type ExpenseTaxCreditDraft = TaxCreditAllocationInput
export type ExpenseVatReclaimDraft = ExpenseVatReclaimInput

type Props = {
  productionId: string
  expenseAmount: number | null
  transactionType: ExpenseTransactionType | null
  value: ExpenseTaxCreditDraft[]
  onChange: (allocations: ExpenseTaxCreditDraft[]) => void
  vatRatePercent: number | null
  onVatRateChange: (rate: number | null) => void
  vatReclaim: ExpenseVatReclaimDraft
  onVatReclaimChange: (value: ExpenseVatReclaimDraft) => void
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ExpenseTaxFields({
  productionId,
  expenseAmount,
  transactionType,
  value,
  onChange,
  vatRatePercent,
  onVatRateChange,
  vatReclaim,
  onVatReclaimChange,
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

  const { data: reclaimRates = [] } = useQuery({
    queryKey: ['vat-reclaim-rates', productionId],
    queryFn: () => listVatReclaimRates(productionId),
    enabled: features?.vat_tracking_enabled === true,
  })

  const enabledSchemes = useMemo(
    () => schemes.filter((s) => s.is_enabled),
    [schemes]
  )

  const taxCreditsOn = features?.tax_credits_enabled === true
  const vatOn = features?.vat_tracking_enabled === true

  const [vatRateError, setVatRateError] = useState<string | null>(null)
  const [qualifyingErrors, setQualifyingErrors] = useState<Record<string, string | null>>({})
  const [vatReclaimedError, setVatReclaimedError] = useState<string | null>(null)

  const amount = expenseAmount ?? 0
  const reclaimBreakdown = useMemo(() => {
    if (!vatOn || amount <= 0) return null
    const map = buildVatReclaimRateMap(reclaimRates)
    return computeExpenseVatReclaim(
      {
        id: 'draft',
        amount,
        vat_rate_percent: vatRatePercent,
        transaction_type: transactionType,
        vat_reclaimed_amount: vatReclaim.vat_reclaimed_amount,
      },
      map
    )
  }, [
    vatOn,
    amount,
    reclaimRates,
    vatRatePercent,
    transactionType,
    vatReclaim.vat_reclaimed_amount,
  ])

  const selectedIds = new Set(value.map((a) => a.tax_credit_scheme_id))
  const totalQualifying = value.reduce((s, a) => s + a.qualifying_amount, 0)

  const toggleScheme = (schemeId: string, checked: boolean) => {
    if (checked) {
      const defaultAmount = amount > 0 ? amount : 0
      onChange([...value, { tax_credit_scheme_id: schemeId, qualifying_amount: defaultAmount }])
    } else {
      onChange(value.filter((a) => a.tax_credit_scheme_id !== schemeId))
      setQualifyingErrors((prev) => {
        const next = { ...prev }
        delete next[schemeId]
        return next
      })
    }
  }

  const updateQualifying = (schemeId: string, num: number | null) => {
    onChange(
      value.map((a) =>
        a.tax_credit_scheme_id === schemeId
          ? { ...a, qualifying_amount: num ?? 0 }
          : a
      )
    )
  }

  useEffect(() => {
    if (vatRatePercent != null && (vatRatePercent < 0 || vatRatePercent > 100)) {
      setVatRateError(PERCENTAGE_MESSAGE)
    }
  }, [vatRatePercent])

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
                      <ValidatedField
                        label="Qualifying"
                        error={qualifyingErrors[scheme.id] ?? undefined}
                        htmlFor={`tc-amt-${scheme.id}`}
                        className="flex items-end gap-1"
                      >
                        <MoneyAmountInput
                          id={`tc-amt-${scheme.id}`}
                          mode="nonNegative"
                          className="w-[120px] h-8"
                          value={alloc?.qualifying_amount ?? null}
                          onValueChange={(v) => updateQualifying(scheme.id, v)}
                          onBlur={() => {
                            const amt = alloc?.qualifying_amount
                            if (amt != null && amt < 0) {
                              setQualifyingErrors((prev) => ({
                                ...prev,
                                [scheme.id]: 'Enter an amount of 0 or more (up to 2 decimal places)',
                              }))
                            } else {
                              setQualifyingErrors((prev) => ({ ...prev, [scheme.id]: null }))
                            }
                          }}
                        />
                      </ValidatedField>
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
        <div className="space-y-3">
          <Label className="text-sm font-medium">VAT &amp; reclaim</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <ValidatedField
              label="VAT rate (%)"
              error={vatRateError ?? undefined}
              htmlFor="expense-vat-rate"
            >
              <PercentageInput
                id="expense-vat-rate"
                className="w-full h-8"
                placeholder={features?.default_vat_rate_percent?.toString() ?? '20'}
                value={vatRatePercent}
                onValueChange={onVatRateChange}
                onValidationError={setVatRateError}
              />
            </ValidatedField>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">VAT paid (computed)</Label>
              <p className="text-sm font-medium tabular-nums h-8 flex items-center">
                {reclaimBreakdown ? formatMoney(reclaimBreakdown.vatPaid) : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">VAT reclaimable (computed)</Label>
              <p className="text-sm font-medium tabular-nums h-8 flex items-center">
                {reclaimBreakdown ? formatMoney(reclaimBreakdown.vatReclaimable) : '—'}
              </p>
            </div>
            <ValidatedField
              label="VAT reclaimed"
              error={vatReclaimedError ?? undefined}
              htmlFor="expense-vat-reclaimed"
            >
              <MoneyAmountInput
                id="expense-vat-reclaimed"
                mode="nonNegative"
                className="w-full h-8"
                placeholder="0"
                value={vatReclaim.vat_reclaimed_amount}
                onValueChange={(v) =>
                  onVatReclaimChange({
                    ...vatReclaim,
                    vat_reclaimed_amount: v,
                  })
                }
                onBlur={() => {
                  const reclaimed = vatReclaim.vat_reclaimed_amount
                  if (reclaimed != null && reclaimed < 0) {
                    setVatReclaimedError('Enter an amount of 0 or more (up to 2 decimal places)')
                  } else {
                    setVatReclaimedError(null)
                  }
                }}
              />
            </ValidatedField>
            <div className="space-y-1">
              <Label htmlFor="expense-vat-reclaim-date" className="text-xs text-muted-foreground">
                Reclaim date
              </Label>
              <Input
                id="expense-vat-reclaim-date"
                type="date"
                className="w-full h-8"
                value={vatReclaim.vat_reclaim_date ?? ''}
                onChange={(e) =>
                  onVatReclaimChange({
                    ...vatReclaim,
                    vat_reclaim_date: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="expense-vat-reclaim-ref" className="text-xs text-muted-foreground">
                Reclaim reference
              </Label>
              <Input
                id="expense-vat-reclaim-ref"
                type="text"
                className="w-full h-8"
                placeholder="e.g. HMRC submission ref"
                value={vatReclaim.vat_reclaim_reference ?? ''}
                onChange={(e) =>
                  onVatReclaimChange({
                    ...vatReclaim,
                    vat_reclaim_reference: e.target.value || null,
                  })
                }
              />
            </div>
          </div>
          {reclaimBreakdown &&
            vatReclaim.vat_reclaimed_amount != null &&
            vatReclaim.vat_reclaimed_amount > reclaimBreakdown.vatReclaimable + 1e-9 && (
              <p className="text-sm text-destructive">
                Reclaimed amount cannot exceed VAT reclaimable ({formatMoney(reclaimBreakdown.vatReclaimable)}).
              </p>
            )}
        </div>
      )}
    </div>
  )
}
