import type { TypedExpenseReadProps } from './types'

/**
 * Deposit has no schema yet. Show a consistent read-only state.
 */
export function DepositTransactionRead(_props: TypedExpenseReadProps) {
  return (
    <p className="text-sm text-muted-foreground">
      Deposit transaction. Editing is not yet available for this type.
    </p>
  )
}
