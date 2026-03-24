import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AllocateFloatDialog } from '@/features/budget/AllocateFloatDialog'
import { FloatReconciliationDialog } from '@/features/budget/FloatReconciliationDialog'
import { FloatReconciliationOverview } from '@/features/budget/FloatReconciliationOverview'
import type { FloatSummaryForProduction, FloatSummaryRow } from '@/lib/budget/floatSummary'
import type { BudgetAccount, BudgetItem, Person, PettyCashFloat } from '@/lib/db/types'

export type FloatsTabProps = {
  productionId: string
  revisionId?: string
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  crew: Person[]
  people: Person[]
  budgetItems: BudgetItem[]
  accounts: BudgetAccount[]
  floatSummary: FloatSummaryForProduction
  productionFloats: PettyCashFloat[]
  activateActionableFilter?: boolean
}

function budgetLineLabelForRow(
  row: FloatSummaryRow,
  itemById: Map<string, BudgetItem>,
  accountById: Map<string, BudgetAccount>
): string {
  const item = itemById.get(row.budgetItemId)
  if (!item) return '—'
  const acc = item.account_id ? accountById.get(item.account_id) : null
  const prefix = acc ? `${acc.code} — ` : ''
  return `${prefix}${item.description}`
}

export function FloatsTab({
  productionId,
  revisionId,
  productionCurrency,
  format,
  crew,
  people,
  budgetItems,
  accounts,
  floatSummary,
  productionFloats,
  activateActionableFilter,
}: FloatsTabProps) {
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [reconcileTarget, setReconcileTarget] = useState<PettyCashFloat | null>(null)

  const floatById = useMemo(() => new Map(productionFloats.map((f) => [f.id, f])), [productionFloats])
  const itemById = useMemo(() => new Map(budgetItems.map((i) => [i.id, i])), [budgetItems])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const personName = (personId: string) => people.find((p) => p.id === personId)?.name ?? 'Unknown'

  const budgetLineLabel = (row: FloatSummaryRow) => budgetLineLabelForRow(row, itemById, accountById)

  const handleReconcile = (row: FloatSummaryRow) => {
    const f = floatById.get(row.floatId)
    if (f) setReconcileTarget(f)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm max-w-xl">
          Allocate petty cash floats to budget lines and match expenses here. Line items in the Budget tab stay focused on
          planning.
        </p>
        <Button type="button" onClick={() => setAllocateOpen(true)}>
          Allocate float
        </Button>
      </div>

      <FloatReconciliationOverview
        summary={floatSummary}
        productionCurrency={productionCurrency}
        format={format}
        budgetLineLabel={budgetLineLabel}
        onReconcile={handleReconcile}
        activateActionableFilter={activateActionableFilter}
      />

      <AllocateFloatDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        productionId={productionId}
        revisionId={revisionId}
        budgetItems={budgetItems}
        accounts={accounts}
        crew={crew}
        defaultCurrency={productionCurrency}
      />

      <FloatReconciliationDialog
        open={reconcileTarget != null}
        onOpenChange={(open) => {
          if (!open) setReconcileTarget(null)
        }}
        productionId={productionId}
        revisionId={revisionId}
        pettyCashFloat={reconcileTarget}
        crewMemberName={reconcileTarget ? personName(reconcileTarget.person_id) : ''}
        format={format}
        productionCurrency={productionCurrency}
      />
    </div>
  )
}
