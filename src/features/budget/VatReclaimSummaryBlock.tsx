import type { VatReclaimTotalsResult } from '@/lib/budget/vatReclaim'

type FormatAmount = (n: number, currency: string) => { formatted: string }

type Props = {
  vatReclaimTotals: VatReclaimTotalsResult
  format: FormatAmount
  productionCurrency: string
}

export function VatReclaimSummaryBlock({
  vatReclaimTotals,
  format,
  productionCurrency,
}: Props) {
  const { totalVatPaid, totalVatReclaimable, totalVatReclaimed, totalVatOutstanding } =
    vatReclaimTotals

  if (
    totalVatPaid === 0 &&
    totalVatReclaimable === 0 &&
    totalVatReclaimed === 0
  ) {
    return null
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
      <p className="text-muted-foreground text-sm font-medium">VAT reclaim</p>
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">VAT paid: </span>
          <span className="font-medium">{format(totalVatPaid, productionCurrency).formatted}</span>
        </div>
        <div>
          <span className="text-muted-foreground">VAT reclaimable: </span>
          <span className="font-medium">
            {format(totalVatReclaimable, productionCurrency).formatted}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">VAT reclaimed: </span>
          <span className="font-medium">
            {format(totalVatReclaimed, productionCurrency).formatted}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Outstanding: </span>
          <span className="font-medium">
            {format(totalVatOutstanding, productionCurrency).formatted}
          </span>
        </div>
      </div>
    </div>
  )
}
