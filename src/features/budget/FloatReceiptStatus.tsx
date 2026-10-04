import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getExpenseProofKind, type ExpenseProofCounts } from '@/lib/budget/receiptStatus'
import { attachReceiptToExpense } from '@/lib/db/expenseReceiptService'
import { invalidateExpenseReceiptQueries } from '@/lib/db/repositories/expenseReceipts'
import { pickFileBytes } from '@/lib/documents/pickAndPersistProductionDocument'

/** Per-expense proof badge used in float reconciliation: Receipt / Invoice / Missing receipt. */
export function ExpenseReceiptStatusBadge({
  counts,
  className,
}: {
  counts: ExpenseProofCounts | null | undefined
  className?: string
}) {
  const kind = getExpenseProofKind(counts)
  if (kind === 'receipt') {
    return (
      <Badge variant="secondary" className={cn('text-xs font-normal', className)}>
        Receipt
      </Badge>
    )
  }
  if (kind === 'invoice') {
    return (
      <Badge variant="secondary" className={cn('text-xs font-normal', className)}>
        Invoice on file
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-normal border-amber-500/50 text-amber-800 dark:text-amber-300', className)}
    >
      Missing receipt
    </Badge>
  )
}

/** Pick a file and attach it as a receipt to an expense that has none. */
export function AttachReceiptButton({
  productionId,
  expenseId,
  disabled,
}: {
  productionId: string
  expenseId: string
  disabled?: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      const picked = await pickFileBytes([{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }])
      if (!picked) return null
      return attachReceiptToExpense(expenseId, picked)
    },
    onSuccess: (result) => {
      setError(null)
      if (result) invalidateExpenseReceiptQueries(queryClient, { productionId, expenseId })
    },
    onError: (err: Error) => setError(err.message),
  })
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Paperclip className="size-3.5 mr-1" aria-hidden />
        {mutation.isPending ? 'Attaching…' : 'Attach receipt'}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

/** Non-blocking warning shown when expenses on a float have no receipt (or linked invoice file). */
export function MissingReceiptsWarning({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  return (
    <p
      role="status"
      data-testid="float-missing-receipts-warning"
      className={cn(
        'rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200',
        className
      )}
    >
      {message} You can still reconcile, but attach receipts before closing the float out.
    </p>
  )
}
