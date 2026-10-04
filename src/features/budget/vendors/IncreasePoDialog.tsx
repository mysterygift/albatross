import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { invalidatePurchaseOrderQueries } from '@/lib/budget/vendors/invalidateVendorFinanceQueries'
import {
  describePoConversion,
  formatPoAmount,
  isForeignPoCurrency,
} from '@/lib/budget/vendors/poCurrency'
import { roundMoney } from '@/lib/money/roundMoney'
import { amendPurchaseOrderAmount } from '@/lib/db/repositories/vendorPurchaseOrderAmendments'

const DEFAULT_REASON = 'Increased from Log Spend'

export type IncreasePoTarget = {
  id: string
  poNumber: string
  vendorId: string
  /** Current PO value, in the PO's own currency. */
  amount: number
  /** Smallest new value that covers the spend, in the PO's own currency. */
  suggestedAmount: number
  /** NULL = production currency. */
  currency_code?: string | null
  /** Locked rate (1 PO currency in production currency). */
  exchange_rate?: number | null
}

export type IncreasePoDialogProps = {
  target: IncreasePoTarget | null
  onOpenChange: (open: boolean) => void
  productionId: string
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  onAmended?: () => void
}

/** Quick "Increase PO to cover" amendment (writes an audit row via amendPurchaseOrderAmount). */
export function IncreasePoDialog(props: IncreasePoDialogProps) {
  const { target, onOpenChange } = props
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      {/* Keyed so each PO starts from its own suggested amount without effect-driven resets. */}
      {target && <IncreasePoDialogBody key={target.id} {...props} target={target} />}
    </Dialog>
  )
}

function IncreasePoDialogBody({
  target,
  onOpenChange,
  productionId,
  productionCurrency,
  format,
  onAmended,
}: IncreasePoDialogProps & { target: IncreasePoTarget }) {
  const queryClient = useQueryClient()
  const [newAmount, setNewAmount] = useState<number | null>(target.suggestedAmount)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const foreign = isForeignPoCurrency(target, productionCurrency)
  const conversion = foreign
    ? describePoConversion({
        amount: newAmount,
        rate: target.exchange_rate,
        poCurrency: target.currency_code ?? productionCurrency,
        productionCurrency,
      })
    : null

  const mutation = useMutation({
    mutationFn: async () => {
      if (newAmount == null || newAmount <= 0) throw new Error('Enter the new PO amount')
      if (roundMoney(newAmount) <= roundMoney(target.amount)) {
        throw new Error('The new amount must be higher than the current PO amount')
      }
      return amendPurchaseOrderAmount({
        poId: target.id,
        newAmount,
        reason: reason.trim() || DEFAULT_REASON,
      })
    },
    onSuccess: () => {
      invalidatePurchaseOrderQueries(queryClient, { productionId, vendorId: target.vendorId, poId: target.id })
      onAmended?.()
      onOpenChange(false)
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Increase PO {target.poNumber}</DialogTitle>
        <DialogDescription>
          {`Currently ${formatPoAmount(target, target.amount, { productionCurrency, format })}. The change is recorded in the PO's amendment history.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <ValidatedField
          label={foreign ? `New PO amount (${target.currency_code}, excl. tax)` : 'New PO amount (excl. tax)'}
          htmlFor="increase-po-amount"
          required
        >
          <MoneyAmountInput
            id="increase-po-amount"
            mode="positive"
            value={newAmount}
            onValueChange={setNewAmount}
          />
        </ValidatedField>
        {conversion && (
          <p className="text-xs text-muted-foreground tabular-nums" data-testid="increase-po-conversion">
            {conversion}
          </p>
        )}
        <ValidatedField label="Reason" htmlFor="increase-po-reason" description="Optional">
          <Input
            id="increase-po-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={DEFAULT_REASON}
          />
        </ValidatedField>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Increase PO'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
