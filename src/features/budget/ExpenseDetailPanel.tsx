import { useState, useMemo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getTypedExpenseConfig } from '@/lib/budget/transactions/registry'
import type { ExpenseWithDetails } from '@/lib/db/repositories/expenseTransactions'
import type { ExpenseViewContext } from '@/features/budget/typed-expense-views/types'
import {
  ExpenseDetailHeader,
  ExpenseVendorSummary,
  ExpenseDetailMetaGrid,
  ExpenseDetailMetaRow,
  ExpenseTypedSection,
  ExpenseParseErrorCard,
} from '@/features/budget/expense-shared'

export type ExpenseDetailPanelProps = {
  expenseWithDetails: ExpenseWithDetails | null | undefined
  isLoading: boolean
  productionId: string
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  defaultCurrencyCode: string | null
  people: Array<{ id: string; name: string; department: string | null }>
  locations: Array<{ id: string; name: string; booked_status?: string }>
  onSaved: () => void
  onSaveRequest: (args: { expenseId: string; details: unknown; type: string }) => Promise<void>
}

export function ExpenseDetailPanel({
  expenseWithDetails,
  isLoading,
  productionId,
  productionCurrency,
  format,
  defaultCurrencyCode,
  people,
  locations,
  onSaved,
  onSaveRequest,
}: ExpenseDetailPanelProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const config = expenseWithDetails
    ? getTypedExpenseConfig(expenseWithDetails.expense.transaction_type)
    : null
  const editable = config?.editable === true && config?.EditComponent != null
  const transactionTypeLabel = config?.label ?? expenseWithDetails?.expense.transaction_type ?? '—'

  const viewContext: ExpenseViewContext = useMemo(
    () => ({
      productionId,
      productionCurrency,
      format,
      defaultCurrencyCode,
      people,
      personById: new Map(people.map((p) => [p.id, p])),
      locations,
      locationById: new Map(locations.map((l) => [l.id, { id: l.id, name: l.name, booked_status: l.booked_status }])),
      vendor: expenseWithDetails?.vendor ?? null,
      expense: expenseWithDetails?.expense,
      account: expenseWithDetails?.account ?? null,
    }),
    [
      productionId,
      productionCurrency,
      format,
      defaultCurrencyCode,
      people,
      locations,
      expenseWithDetails?.vendor,
      expenseWithDetails?.expense,
      expenseWithDetails?.account,
    ]
  )

  const accountLabel = expenseWithDetails?.account
    ? `${expenseWithDetails.account.code} — ${expenseWithDetails.account.name}`
    : 'Uncoded spend'

  const handleSave = async (details: unknown) => {
    if (!expenseWithDetails || !config) return
    setSaveError(null)
    setIsSaving(true)
    try {
      await onSaveRequest({
        expenseId: expenseWithDetails.expense.id,
        details,
        type: config.type,
      })
      onSaved()
      setMode('read')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!expenseWithDetails) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Expense not found.</p>
      </div>
    )
  }

  const { expense, transaction_details } = expenseWithDetails

  let typedContent: ReactNode
  if (mode === 'edit' && config?.EditComponent && editable) {
    const EditComponent = config.EditComponent
    typedContent = (
      <EditComponent
        expenseId={expense.id}
        detailsJson={transaction_details?.details_json ?? null}
        onSave={handleSave}
        onCancel={() => setMode('read')}
        isSaving={isSaving}
        context={viewContext}
      />
    )
  } else if (config && transaction_details) {
    const parsed = config.parse(transaction_details.details_json)
    if (!parsed.ok) {
      typedContent = (
        <ExpenseParseErrorCard
          message={`${config.label} details could not be parsed (${parsed.error}). Showing raw JSON.`}
          rawJson={transaction_details.details_json}
        />
      )
    } else {
      const ReadComponent = config.ReadComponent
      typedContent = <ReadComponent parsed={parsed.value} context={viewContext} />
    }
  } else if (transaction_details) {
    typedContent = (
      <ExpenseParseErrorCard
        message="Unknown transaction type. Showing raw JSON."
        rawJson={transaction_details.details_json}
      />
    )
  } else {
    typedContent = (
      <p className="text-sm text-muted-foreground">
        This spend does not yet use a typed transaction format.
      </p>
    )
  }

  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle>Expense details</SheetTitle>
          {config && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setMode((m) => (m === 'read' ? 'edit' : 'read'))}
              disabled={!editable}
              title={
                !editable
                  ? expense.transaction_type == null
                    ? 'Add a typed transaction in a follow-up prompt'
                    : 'Editing is not yet available for this transaction type.'
                  : undefined
              }
            >
              {mode === 'edit' ? 'View' : 'Edit'}
            </Button>
          )}
        </div>
      </SheetHeader>
      <div className="p-4 space-y-4 overflow-auto">
        <ExpenseDetailHeader
          expense={expense}
          accountLabel={accountLabel}
          formatAmount={format}
          productionCurrency={productionCurrency}
          transactionTypeLabel={transactionTypeLabel}
        />
        <ExpenseDetailMetaGrid>
          <ExpenseDetailMetaRow
            label="Transaction type"
            value={transactionTypeLabel}
          />
          <ExpenseDetailMetaRow
            label="Vendor"
            value={
              <ExpenseVendorSummary
                vendor={expenseWithDetails.vendor}
                legacyVendorString={expense.vendor}
              />
            }
          />
          <ExpenseDetailMetaRow label="Expense type" value={expense.expense_type} />
          <ExpenseDetailMetaRow
            label="Notes"
            value={<span className="whitespace-pre-wrap">{expense.notes ? expense.notes : '—'}</span>}
          />
        </ExpenseDetailMetaGrid>
        <ExpenseTypedSection>{typedContent}</ExpenseTypedSection>
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </>
  )
}
