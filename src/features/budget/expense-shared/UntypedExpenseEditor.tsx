import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ExpenseEditorFooter } from './ExpenseEditorFooter'
import type { Expense } from '@/lib/db/types'

const untypedExpenseSchema = z.object({
  amount: z.coerce.number().finite().nonnegative('Amount must be 0 or more'),
  date: z.string().min(1, 'Date is required'),
  vendor: z.string().optional(),
  notes: z.string().optional(),
})

export type UntypedExpenseFormValues = z.infer<typeof untypedExpenseSchema>

export type UntypedExpenseEditorProps = {
  expense: Expense
  onSave: (data: { amount: number; date: string; vendor: string | null; notes: string | null }) => void
  onCancel: () => void
  isSaving: boolean
}

export function UntypedExpenseEditor({ expense, onSave, onCancel, isSaving }: UntypedExpenseEditorProps) {
  const form = useForm<UntypedExpenseFormValues>({
    resolver: zodResolver(untypedExpenseSchema),
    defaultValues: {
      amount: expense.amount ?? 0,
      date: expense.date ?? '',
      vendor: expense.vendor ?? '',
      notes: expense.notes ?? '',
    },
  })

  return (
    <form
      onSubmit={form.handleSubmit((data) => {
        onSave({
          amount: data.amount,
          date: data.date,
          vendor: data.vendor?.trim() ? data.vendor.trim() : null,
          notes: data.notes?.trim() ? data.notes.trim() : null,
        })
      })}
      className="space-y-4"
    >
      <div>
        <Label>Amount</Label>
        <Input type="number" step="any" inputMode="decimal" {...form.register('amount')} />
        {form.formState.errors.amount && (
          <p className="text-destructive text-sm">{form.formState.errors.amount.message}</p>
        )}
      </div>
      <div>
        <Label>Date</Label>
        <Input type="date" {...form.register('date')} />
        {form.formState.errors.date && (
          <p className="text-destructive text-sm">{form.formState.errors.date.message}</p>
        )}
      </div>
      <div>
        <Label>Vendor (optional)</Label>
        <Input {...form.register('vendor')} placeholder="—" />
      </div>
      <div>
        <Label>Notes (optional)</Label>
        <Textarea {...form.register('notes')} rows={3} placeholder="—" className="resize-none" />
      </div>
      <ExpenseEditorFooter onCancel={onCancel} isSaving={isSaving} />
    </form>
  )
}
