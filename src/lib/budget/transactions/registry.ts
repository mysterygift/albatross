import type { ExpenseTransactionType } from '@/lib/db/types'
import type { ComponentType } from 'react'
import type { TypedExpenseReadPropsUnknown, TypedExpenseEditProps } from '@/features/budget/typed-expense-views/types'
import { parseLabourDetails } from '@/lib/budget/transactions/labour'
import { parsePurchaseDetails } from '@/lib/budget/transactions/purchase'
import { parseRentalDetails } from '@/lib/budget/transactions/rental'
import { parseAllowDetails } from '@/lib/budget/transactions/allow'
import { parseDepositDetails } from '@/lib/budget/transactions/deposit'
import { saveDepositTransaction } from '@/lib/db/repositories/depositTransactions'
import { saveExpenseTransactionDetails } from '@/lib/db/repositories/expenseTransactions'
import { savePurchaseTransaction } from '@/lib/db/repositories/purchaseTransactions'
import { saveRentalTransaction } from '@/lib/db/repositories/rentalTransactions'
import { LabourTransactionRead } from '@/features/budget/typed-expense-views/LabourTransactionRead'
import { LabourTransactionEditor } from '@/features/budget/typed-expense-views/LabourTransactionEditor'
import { PurchaseTransactionRead } from '@/features/budget/typed-expense-views/PurchaseTransactionRead'
import { PurchaseTransactionEditor } from '@/features/budget/typed-expense-views/PurchaseTransactionEditor'
import { RentalTransactionRead } from '@/features/budget/typed-expense-views/RentalTransactionRead'
import { RentalTransactionEditor } from '@/features/budget/typed-expense-views/RentalTransactionEditor'
import { AllowTransactionRead } from '@/features/budget/typed-expense-views/AllowTransactionRead'
import { AllowTransactionEditor } from '@/features/budget/typed-expense-views/AllowTransactionEditor'
import { DepositTransactionRead } from '@/features/budget/typed-expense-views/DepositTransactionRead'
import { DepositTransactionEditor } from '@/features/budget/typed-expense-views/DepositTransactionEditor'

export type SaveContext = {
  productionId: string
}

export type TypedExpenseConfig = {
  type: ExpenseTransactionType
  label: string
  parse: (detailsJson: string) => { ok: true; value: unknown } | { ok: false; error: string }
  ReadComponent: ComponentType<TypedExpenseReadPropsUnknown>
  EditComponent?: ComponentType<TypedExpenseEditProps<unknown>>
  save: (args: { expenseId: string; details: unknown; ctx: SaveContext }) => Promise<void>
  editable: boolean
  derivesAmount?: boolean
}

const labourConfig: TypedExpenseConfig = {
  type: 'labour',
  label: 'Labour',
  parse: (json) => parseLabourDetails(json),
  ReadComponent: LabourTransactionRead,
  EditComponent: LabourTransactionEditor as ComponentType<TypedExpenseEditProps<unknown>>,
  save: async ({ expenseId, details, ctx: _ctx }) => {
    await saveExpenseTransactionDetails({ expenseId, transactionType: 'labour', details })
  },
  editable: true,
}

const purchaseConfig: TypedExpenseConfig = {
  type: 'purchase',
  label: 'Purchase',
  parse: (json) => parsePurchaseDetails(json),
  ReadComponent: PurchaseTransactionRead,
  EditComponent: PurchaseTransactionEditor as ComponentType<TypedExpenseEditProps<unknown>>,
  save: async ({ expenseId, details }) => {
    await savePurchaseTransaction({ expenseId, details: details as Parameters<typeof savePurchaseTransaction>[0]['details'] })
  },
  editable: true,
}

const rentalConfig: TypedExpenseConfig = {
  type: 'rental',
  label: 'Rental',
  parse: (json) => parseRentalDetails(json),
  ReadComponent: RentalTransactionRead,
  EditComponent: RentalTransactionEditor as ComponentType<TypedExpenseEditProps<unknown>>,
  save: async ({ expenseId, details }) => {
    await saveRentalTransaction({ expenseId, details: details as Parameters<typeof saveRentalTransaction>[0]['details'] })
  },
  editable: true,
  derivesAmount: true,
}

const allowConfig: TypedExpenseConfig = {
  type: 'allow',
  label: 'Allow',
  parse: (json) => parseAllowDetails(json),
  ReadComponent: AllowTransactionRead,
  EditComponent: AllowTransactionEditor as ComponentType<TypedExpenseEditProps<unknown>>,
  save: async ({ expenseId, details }) => {
    await saveExpenseTransactionDetails({ expenseId, transactionType: 'allow', details })
  },
  editable: true,
}

const depositConfig: TypedExpenseConfig = {
  type: 'deposit',
  label: 'Deposit',
  parse: (json) => parseDepositDetails(json),
  ReadComponent: DepositTransactionRead,
  EditComponent: DepositTransactionEditor as ComponentType<TypedExpenseEditProps<unknown>>,
  save: async ({ expenseId, details }) => {
    await saveDepositTransaction({
      expenseId,
      details: details as Parameters<typeof saveDepositTransaction>[0]['details'],
    })
  },
  editable: true,
}

export const typedExpenseRegistry: Record<ExpenseTransactionType, TypedExpenseConfig> = {
  labour: labourConfig,
  purchase: purchaseConfig,
  rental: rentalConfig,
  allow: allowConfig,
  deposit: depositConfig,
}

export function getTypedExpenseConfig(
  type: ExpenseTransactionType | null | undefined
): TypedExpenseConfig | null {
  if (type == null) return null
  const config = typedExpenseRegistry[type]
  return config ?? null
}
