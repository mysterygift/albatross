import { useQuery } from '@tanstack/react-query'
import type { Expense } from '@/lib/db/types'
import { listTaxCreditSchemes } from '@/lib/db/repositories/taxCredits'
import type { ExpenseTaxCreditAllocation } from '@/lib/db/types'

type Props = {
  productionId: string
  expense: Expense
  allocations: ExpenseTaxCreditAllocation[]
}

export function ExpenseTaxReadSection({ productionId, expense, allocations }: Props) {
  const { data: schemes = [] } = useQuery({
    queryKey: ['tax-credit-schemes', productionId],
    queryFn: () => listTaxCreditSchemes(productionId),
  })

  const schemeById = new Map(schemes.map((s) => [s.id, s]))
  const hasVat = expense.vat_rate_percent != null && expense.vat_rate_percent > 0
  const hasAllocations = allocations.length > 0

  if (!hasVat && !hasAllocations) return null

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Tax &amp; credits
      </p>
      {hasAllocations && (
        <ul className="text-sm space-y-1">
          {allocations.map((a) => {
            const scheme = schemeById.get(a.tax_credit_scheme_id)
            return (
              <li key={a.id}>
                {scheme?.name ?? 'Tax credit'}:{' '}
                <span className="font-medium tabular-nums">
                  {a.qualifying_amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>{' '}
                qualifying
              </li>
            )
          })}
        </ul>
      )}
      {hasVat && (
        <p className="text-sm">
          VAT {expense.vat_rate_percent}%:{' '}
          <span className="font-medium tabular-nums">
            {(expense.amount * (expense.vat_rate_percent! / 100)).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </p>
      )}
    </div>
  )
}
