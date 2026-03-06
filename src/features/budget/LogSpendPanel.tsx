import { useState, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { typedExpenseRegistry, getTypedExpenseConfig } from '@/lib/budget/transactions/registry'
import type { ExpenseTransactionType } from '@/lib/db/types'
import type { BudgetAccount } from '@/lib/db/types'
import type { ExpenseViewContext, FormatAmount, LogSpendEditorHandle } from '@/features/budget/typed-expense-views/types'

const TRANSACTION_TYPE_ORDER: ExpenseTransactionType[] = [
  'labour',
  'purchase',
  'rental',
  'allow',
  'deposit',
]

export type LogSpendPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  postableAccounts: BudgetAccount[]
  productionId: string
  productionCurrency: string
  format: FormatAmount
  people: Array<{ id: string; name: string; department: string | null }>
  locations: Array<{ id: string; name: string; booked_status?: string }>
}

export function LogSpendPanel({
  open,
  onOpenChange,
  postableAccounts,
  productionId,
  productionCurrency,
  format,
  people,
  locations,
}: LogSpendPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<ExpenseTransactionType | null>(null)
  const [draftByType, setDraftByType] = useState<Partial<Record<ExpenseTransactionType, unknown>>>({})

  const editorRef = useRef<LogSpendEditorHandle>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedAccountId(null)
      setSelectedTransactionType(null)
      setDraftByType({})
    }
    onOpenChange(next)
  }

  const transactionTypeOptions = useMemo(
    () =>
      TRANSACTION_TYPE_ORDER.map((type) => ({
        type,
        label: typedExpenseRegistry[type].label,
      })),
    []
  )

  const config = selectedTransactionType
    ? getTypedExpenseConfig(selectedTransactionType)
    : null
  const selectedAccount = selectedAccountId
    ? postableAccounts.find((a) => a.id === selectedAccountId) ?? null
    : null

  const viewContext: ExpenseViewContext = useMemo(
    () => ({
      productionId,
      productionCurrency,
      format,
      people,
      personById: new Map(people.map((p) => [p.id, { id: p.id, name: p.name, department: p.department }])),
      locations,
      locationById: new Map(
        locations.map((l) => [l.id, { id: l.id, name: l.name, booked_status: l.booked_status }])
      ),
      account: selectedAccount
        ? { id: selectedAccount.id, code: selectedAccount.code, name: selectedAccount.name }
        : null,
      defaultCurrencyCode: null,
    }),
    [
      productionId,
      productionCurrency,
      format,
      people,
      locations,
      selectedAccount?.id,
      selectedAccount?.code,
      selectedAccount?.name,
    ]
  )

  const hasEditableType = Boolean(
    config?.editable && config?.EditComponent && selectedTransactionType
  )
  const canSave = Boolean(selectedAccountId && selectedTransactionType && hasEditableType)

  const handleShellSaveComplete = (draft: unknown) => {
    console.log('Log Spend save placeholder', {
      productionId,
      accountId: selectedAccountId,
      transactionType: selectedTransactionType,
      draft,
    })
    onOpenChange(false)
  }

  const handleSave = () => {
    if (!canSave) return
    if (hasEditableType) {
      editorRef.current?.submit()
    }
  }

  const handleCancel = () => {
    handleOpenChange(false)
  }

  const handleEditorSave = (details: unknown) => {
    if (!selectedTransactionType) return
    setDraftByType((prev) => ({ ...prev, [selectedTransactionType]: details }))
    handleShellSaveComplete(details)
  }

  const detailsJsonForType =
    selectedTransactionType && draftByType[selectedTransactionType] != null
      ? JSON.stringify(draftByType[selectedTransactionType])
      : null

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[520px] sm:max-w-[520px] flex flex-col"
      >
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Log Spend</SheetTitle>
          <SheetDescription>
            Create a typed spend entry for this production
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="log-spend-account">Account</Label>
            <Select
              value={selectedAccountId ?? ''}
              onValueChange={(value) => setSelectedAccountId(value || null)}
            >
              <SelectTrigger id="log-spend-account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {postableAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-spend-type">Transaction type</Label>
            <Select
              value={selectedTransactionType ?? ''}
              onValueChange={(value) =>
                setSelectedTransactionType(
                  value ? (value as ExpenseTransactionType) : null
                )
              }
            >
              <SelectTrigger id="log-spend-type">
                <SelectValue placeholder="Select transaction type" />
              </SelectTrigger>
              <SelectContent>
                {transactionTypeOptions.map(({ type, label }) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Details
            </Label>
            {!selectedTransactionType ? (
              <div className="rounded-md border border-border bg-muted/20 min-h-[120px] flex items-center justify-center p-4">
                <p className="text-sm text-muted-foreground text-center">
                  Choose a transaction type to continue.
                </p>
              </div>
            ) : config?.editable && config?.EditComponent ? (
              <div className="rounded-md border border-border bg-background p-4">
                <config.EditComponent
                  expenseId="create"
                  detailsJson={detailsJsonForType}
                  onSave={handleEditorSave}
                  onCancel={handleCancel}
                  isSaving={false}
                  context={viewContext}
                  hideFooter
                  editorRef={editorRef}
                />
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/20 min-h-[120px] flex items-center justify-center p-4">
                <p className="text-sm text-muted-foreground text-center">
                  Deposit creation UI not yet fully implemented.
                </p>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border pt-4 flex-row gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
