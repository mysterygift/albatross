import { useState, useMemo, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { createTypedExpense } from '@/lib/db/repositories/createTypedExpense'
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

const TRANSACTION_TYPE_HELPER: Record<ExpenseTransactionType, string> = {
  labour: 'Use for crew, cast, or person-based labour costs.',
  purchase: 'Use for buying goods, services, or permits.',
  rental: 'Use for hired kit, services, or packages with a daily, weekly, or flat rate.',
  allow: 'Use for provisional allocations where final cost is not yet known.',
  deposit: 'Use for refundable or non-refundable deposits.',
}

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const saveAndAddAnotherRef = useRef(false)

  const editorRef = useRef<LogSpendEditorHandle>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: createTypedExpense,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['expense-with-details', data.id] })
      if (variables.transactionType === 'allow') {
        queryClient.invalidateQueries({ queryKey: ['allow-expense-details', variables.productionId] })
      }
      setSaveError(null)
      if (saveAndAddAnotherRef.current) {
        setDraftByType((prev) => {
          const next = { ...prev }
          delete next[variables.transactionType]
          return next
        })
        setFormKey((k) => k + 1)
        saveAndAddAnotherRef.current = false
      } else {
        setSelectedAccountId(null)
        setSelectedTransactionType(null)
        setDraftByType({})
        onOpenChange(false)
      }
    },
    onError: (err: Error) => {
      setSaveError(err.message)
      saveAndAddAnotherRef.current = false
    },
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedAccountId(null)
      setSelectedTransactionType(null)
      setDraftByType({})
      setSaveError(null)
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
  const hasEditableType = Boolean(
    config?.editable && config?.EditComponent && selectedTransactionType
  )
  const typeHasForm =
    selectedTransactionType &&
    getTypedExpenseConfig(selectedTransactionType)?.editable &&
    getTypedExpenseConfig(selectedTransactionType)?.EditComponent

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

  const canSave = Boolean(selectedAccountId && selectedTransactionType && hasEditableType)
  const isSaving = createMutation.isPending

  const handleSave = (addAnother: boolean) => {
    if (!canSave || isSaving) return
    saveAndAddAnotherRef.current = addAnother
    if (hasEditableType) {
      editorRef.current?.submit()
    }
  }

  const handleCancel = () => {
    handleOpenChange(false)
  }

  const handleTransactionTypeChange = (value: string) => {
    const nextType = value ? (value as ExpenseTransactionType) : null
    if (nextType === selectedTransactionType) return
    if (typeHasForm && selectedTransactionType) {
      const confirm = window.confirm(
        'Switching type will discard the current form values. Continue?'
      )
      if (!confirm) return
    }
    setSelectedTransactionType(nextType)
  }

  const handleEditorSave = (details: unknown) => {
    if (!selectedTransactionType || !selectedAccountId) return
    setSaveError(null)
    setDraftByType((prev) => ({ ...prev, [selectedTransactionType]: details }))
    createMutation.mutate({
      productionId,
      accountId: selectedAccountId,
      transactionType: selectedTransactionType,
      draft: details,
      date: new Date().toISOString().slice(0, 10),
    })
  }

  const detailsJsonForType =
    selectedTransactionType && draftByType[selectedTransactionType] != null
      ? JSON.stringify(draftByType[selectedTransactionType])
      : null

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[540px] sm:max-w-[540px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-4 shrink-0">
          <SheetTitle>Log Spend</SheetTitle>
          <SheetDescription>
            Create a typed spend entry for this production
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto flex flex-col">
          {/* Context section */}
          <section className="px-6 pt-5 pb-4 space-y-5 border-b border-border">
            <div className="space-y-2">
              <Label htmlFor="log-spend-account" className="text-muted-foreground text-xs uppercase tracking-wider">
                Account
              </Label>
              <Select
                value={selectedAccountId ?? ''}
                onValueChange={(value) => setSelectedAccountId(value || null)}
              >
                <SelectTrigger id="log-spend-account" className="h-9">
                  <SelectValue placeholder="Select a postable account" />
                </SelectTrigger>
                <SelectContent>
                  {postableAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAccount && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 mt-2">
                  <p className="text-sm font-medium">
                    {selectedAccount.code} — {selectedAccount.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Logging spend against this budget line
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="log-spend-type" className="text-muted-foreground text-xs uppercase tracking-wider">
                Transaction type
              </Label>
              <Select
                value={selectedTransactionType ?? ''}
                onValueChange={handleTransactionTypeChange}
              >
                <SelectTrigger id="log-spend-type" className="h-9">
                  <SelectValue placeholder="Choose a transaction type" />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypeOptions.map(({ type, label }) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTransactionType && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {TRANSACTION_TYPE_HELPER[selectedTransactionType]}
                </p>
              )}
            </div>
          </section>

          {/* Form section */}
          <section className="px-6 py-5 flex-1 min-h-0">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Details
            </Label>
            <div className="mt-3">
              {!selectedTransactionType ? (
                <div className="rounded-md border border-border bg-muted/20 min-h-[140px] flex items-center justify-center p-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Choose a transaction type to continue.
                  </p>
                </div>
              ) : config?.editable && config?.EditComponent ? (
                <div key={formKey} className="rounded-md border border-border bg-background p-4">
                  <config.EditComponent
                    expenseId="create"
                    detailsJson={detailsJsonForType}
                    onSave={handleEditorSave}
                    onCancel={handleCancel}
                    isSaving={isSaving}
                    context={viewContext}
                    hideFooter
                    editorRef={editorRef}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/20 min-h-[120px] flex items-center justify-center p-6">
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Deposit creation is not yet available
                    </p>
                    <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
                      Use another transaction type for now, or add deposits in a future update.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {saveError && (
            <div className="px-6 pb-2">
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border px-6 py-4 flex-row gap-2 sm:gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave(true)}
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save & Add Another'}
          </Button>
          <Button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
