import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Expense } from '@/lib/db/types'
import { listTaxCreditSchemes } from '@/lib/db/repositories/taxCredits'
import { listVatReclaimRates } from '@/lib/db/repositories/vatReclaim'
import type { ExpenseTaxCreditAllocation } from '@/lib/db/types'
import { getProductionBudgetFeatures } from '@/lib/db/repositories/taxCredits'
import {
  buildVatReclaimRateMap,
  computeExpenseVatReclaim,
} from '@/lib/budget/vatReclaim'

type Props = {
  productionId: string
  expense: Expense
  allocations: ExpenseTaxCreditAllocation[]
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ExpenseTaxReadSection({ productionId, expense, allocations }: Props) {
  const { data: features } = useQuery({
    queryKey: ['production-budget-features', productionId],
    queryFn: () => getProductionBudgetFeatures(productionId),
  })

  const { data: schemes = [] } = useQuery({
    queryKey: ['tax-credit-schemes', productionId],
    queryFn: () => listTaxCreditSchemes(productionId),
  })

  const { data: reclaimRates = [] } = useQuery({
    queryKey: ['vat-reclaim-rates', productionId],
    queryFn: () => listVatReclaimRates(productionId),
    enabled: features?.vat_tracking_enabled === true,
  })

  const schemeById = new Map(schemes.map((s) => [s.id, s]))
  const taxCreditsOn = features?.tax_credits_enabled === true
  const vatOn = features?.vat_tracking_enabled === true

  const reclaimBreakdown = useMemo(() => {
    if (!vatOn) return null
    return computeExpenseVatReclaim(expense, buildVatReclaimRateMap(reclaimRates))
  }, [vatOn, expense, reclaimRates])

  const hasAllocations = allocations.length > 0
  const hasVat =
    vatOn &&
    (expense.vat_rate_percent != null ||
      expense.vat_reclaimed_amount != null ||
      expense.vat_reclaim_date != null ||
      (expense.vat_reclaim_reference?.trim() ?? '') !== '')

  if (!taxCreditsOn && !hasVat && !hasAllocations) return null

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Tax &amp; credits
      </p>
      {taxCreditsOn && hasAllocations && (
        <ul className="text-sm space-y-1">
          {allocations.map((a) => {
            const scheme = schemeById.get(a.tax_credit_scheme_id)
            return (
              <li key={a.id}>
                {scheme?.name ?? 'Tax credit'}:{' '}
                <span className="font-medium tabular-nums">{formatMoney(a.qualifying_amount)}</span>{' '}
                qualifying
              </li>
            )
          })}
        </ul>
      )}
      {hasVat && reclaimBreakdown && (
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {expense.vat_rate_percent != null && (
            <>
              <dt className="text-muted-foreground">VAT rate</dt>
              <dd>{expense.vat_rate_percent}%</dd>
            </>
          )}
          <dt className="text-muted-foreground">VAT paid</dt>
          <dd className="tabular-nums">{formatMoney(reclaimBreakdown.vatPaid)}</dd>
          <dt className="text-muted-foreground">VAT reclaimable</dt>
          <dd className="tabular-nums">{formatMoney(reclaimBreakdown.vatReclaimable)}</dd>
          {expense.vat_reclaimed_amount != null && (
            <>
              <dt className="text-muted-foreground">VAT reclaimed</dt>
              <dd className="tabular-nums">{formatMoney(expense.vat_reclaimed_amount)}</dd>
            </>
          )}
          {reclaimBreakdown.vatOutstanding > 0 && (
            <>
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className="tabular-nums">{formatMoney(reclaimBreakdown.vatOutstanding)}</dd>
            </>
          )}
          {expense.vat_reclaim_date && (
            <>
              <dt className="text-muted-foreground">Reclaim date</dt>
              <dd>{expense.vat_reclaim_date}</dd>
            </>
          )}
          {expense.vat_reclaim_reference?.trim() && (
            <>
              <dt className="text-muted-foreground">Reclaim reference</dt>
              <dd>{expense.vat_reclaim_reference}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}
