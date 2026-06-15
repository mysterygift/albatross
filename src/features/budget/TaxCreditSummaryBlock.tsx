import type { TaxCreditTotalsResult } from '@/lib/budget/taxCredits'

type FormatAmount = (n: number, currency: string) => { formatted: string }

type Props = {
  taxCreditTotals: TaxCreditTotalsResult
  totalDerived: number
  totalActual: number
  format: FormatAmount
  productionCurrency: string
  showVat?: boolean
  totalVat?: number
  variant?: 'compact' | 'detailed'
}

export function TaxCreditSummaryBlock({
  taxCreditTotals,
  totalDerived,
  totalActual,
  format,
  productionCurrency,
  showVat,
  totalVat = 0,
  variant = 'compact',
}: Props) {
  const grossCost = totalActual + totalDerived
  const enabledSchemes = taxCreditTotals.perScheme.filter((s) => s.creditAmount > 0 || s.qualifyingSpend > 0)

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-muted-foreground text-sm font-medium">Tax credits &amp; relief</p>
      {variant === 'detailed' && enabledSchemes.length > 0 && (
        <div className="space-y-2 text-sm">
          {enabledSchemes.map((s) => (
            <div key={s.schemeId} className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">{s.schemeName}</span>
              <span>
                Qualifying {format(s.qualifyingSpend, productionCurrency).formatted}
                {' · '}
                Credit {format(s.creditAmount, productionCurrency).formatted}
              </span>
            </div>
          ))}
          {taxCreditTotals.perScheme.some((s) => s.warnings.length > 0) && (
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {taxCreditTotals.perScheme.flatMap((s) =>
                s.warnings.map((w, i) => (
                  <li key={`${s.schemeId}-${i}`}>
                    {s.schemeName}: {w}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Qualifying spend: </span>
          <span className="font-medium">
            {format(taxCreditTotals.totalQualifyingSpend, productionCurrency).formatted}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Tax credits: </span>
          <span className="font-medium">
            {format(taxCreditTotals.totalTaxCredits, productionCurrency).formatted}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Net cost after credits: </span>
          <span className="font-medium">
            {format(taxCreditTotals.netCostAfterCredits, productionCurrency).formatted}
          </span>
        </div>
        {showVat && totalVat > 0 && (
          <div>
            <span className="text-muted-foreground">Total VAT (informational): </span>
            <span className="font-medium">{format(totalVat, productionCurrency).formatted}</span>
          </div>
        )}
      </div>
      {variant === 'compact' && grossCost !== taxCreditTotals.netCostAfterCredits && (
        <p className="text-xs text-muted-foreground">
          Based on actual spend {format(totalActual, productionCurrency).formatted}
          {totalDerived > 0 ? ` plus derived ${format(totalDerived, productionCurrency).formatted}` : ''}.
        </p>
      )}
    </div>
  )
}
