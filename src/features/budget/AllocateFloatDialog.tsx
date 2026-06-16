import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { hasMaxTwoDecimalPlaces, POSITIVE_MONEY_MESSAGE } from '@/lib/budget/fieldValidation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BudgetAccount, BudgetItem, Person } from '@/lib/db/types'
import { createFloat } from '@/lib/db/repositories/floats'

const schema = z.object({
  budget_item_id: z.string().min(1, 'Select a budget line item'),
  person_id: z.string().min(1, 'Select a crew member'),
  amount: z
    .union([z.null(), z.number()])
    .refine((v): v is number => v != null && Number.isFinite(v) && v > 0, {
      message: POSITIVE_MONEY_MESSAGE,
    })
    .refine((v): v is number => v != null && hasMaxTwoDecimalPlaces(v), {
      message: 'Amount must have at most 2 decimal places',
    }),
  currency: z.string().min(1, 'Currency is required'),
  issued_date: z.string().min(1, 'Issued date is required'),
  notes: z.string().optional(),
})

type FormValues = {
  budget_item_id: string
  person_id: string
  amount: number | null
  currency: string
  issued_date: string
  notes?: string
}

function budgetItemLabel(item: BudgetItem, accountById: Map<string, BudgetAccount>): string {
  const acc = item.account_id ? accountById.get(item.account_id) : null
  const prefix = acc ? `${acc.code} — ` : ''
  return `${prefix}${item.description}`
}

export type AllocateFloatDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  revisionId?: string
  budgetItems: BudgetItem[]
  accounts: BudgetAccount[]
  crew: Person[]
  defaultCurrency: string
}

export function AllocateFloatDialog({
  open,
  onOpenChange,
  productionId,
  revisionId,
  budgetItems,
  accounts,
  crew,
  defaultCurrency,
}: AllocateFloatDialogProps) {
  const queryClient = useQueryClient()
  const [lineItemComboOpen, setLineItemComboOpen] = useState(false)
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      budget_item_id: '',
      person_id: '',
      amount: null,
      currency: defaultCurrency,
      issued_date: '',
      notes: '',
    },
  })

  const selectedItemId = form.watch('budget_item_id')
  const selectedLabel = useMemo(() => {
    if (!selectedItemId) return null
    const item = budgetItems.find((i) => i.id === selectedItemId)
    return item ? budgetItemLabel(item, accountById) : null
  }, [selectedItemId, budgetItems, accountById])

  useEffect(() => {
    if (!open) return
    form.reset({
      budget_item_id: '',
      person_id: '',
      amount: null,
      currency: defaultCurrency,
      issued_date: '',
      notes: '',
    })
    setLineItemComboOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.reset is stable; avoid re-running on every form identity tick
  }, [open, defaultCurrency])

  const { mutate, isPending, isError, error, reset: resetMutation } = useMutation({
    mutationFn: (values: FormValues) => {
      if (values.amount == null) throw new Error('Amount is required')
      return createFloat({
        production_id: productionId,
        revision_id: revisionId,
        budget_item_id: values.budget_item_id,
        person_id: values.person_id,
        amount: values.amount,
        currency: values.currency.trim().toUpperCase(),
        issued_date: values.issued_date,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      })
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['floats', productionId, revisionId] })
      queryClient.invalidateQueries({ queryKey: ['floats-by-budget-item', values.budget_item_id] })
      queryClient.invalidateQueries({ queryKey: ['float-expense-links-by-production', productionId, revisionId] })
      onOpenChange(false)
      form.reset({
        budget_item_id: '',
        person_id: '',
        amount: null,
        currency: defaultCurrency,
        issued_date: '',
        notes: '',
      })
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetMutation()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allocate float</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Link a petty cash float to a budget line item and crew member.
          </p>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutate(values))}
        >
          <div>
            <Label>Budget line item</Label>
            {budgetItems.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1.5">Add line items in the Budget tab first.</p>
            ) : (
              <Controller
                name="budget_item_id"
                control={form.control}
                render={({ field }) => (
                  <Popover open={lineItemComboOpen} onOpenChange={setLineItemComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={lineItemComboOpen}
                        className={cn('mt-1.5 w-full justify-between font-normal', !field.value && 'text-muted-foreground')}
                      >
                        <span className="truncate text-left">{selectedLabel ?? 'Search line items…'}</span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search by description or code…" />
                        <CommandList>
                          <CommandEmpty>No line item found.</CommandEmpty>
                          <CommandGroup>
                            {budgetItems.map((item) => {
                              const label = budgetItemLabel(item, accountById)
                              return (
                                <CommandItem
                                  key={item.id}
                                  value={`${label} ${item.id}`}
                                  onSelect={() => {
                                    field.onChange(item.id)
                                    setLineItemComboOpen(false)
                                  }}
                                >
                                  {label}
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
            )}
            {form.formState.errors.budget_item_id && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.budget_item_id.message}</p>
            )}
          </div>
          <div>
            <Label>Crew member</Label>
            {crew.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1.5">Add crew in People before allocating a float.</p>
            ) : (
              <Controller
                name="person_id"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1.5 w-full bg-background">
                      <SelectValue placeholder="Select crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      {crew.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {form.formState.errors.person_id && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.person_id.message}</p>
            )}
          </div>
          <ValidatedField
            label="Amount"
            required
            error={form.formState.errors.amount?.message}
            htmlFor="float-amount"
          >
            <Controller
              name="amount"
              control={form.control}
              render={({ field }) => (
                <MoneyAmountInput
                  id="float-amount"
                  mode="positive"
                  className="mt-1.5 bg-background"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </ValidatedField>
          <div>
            <Label htmlFor="float-currency">Currency</Label>
            <Input
              id="float-currency"
              className="mt-1.5 bg-background"
              maxLength={8}
              {...form.register('currency')}
            />
            {form.formState.errors.currency && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.currency.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="float-issued">Issued date</Label>
            <Input id="float-issued" type="date" className="mt-1.5 bg-background" {...form.register('issued_date')} />
            {form.formState.errors.issued_date && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.issued_date.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="float-notes">Notes (optional)</Label>
            <Textarea id="float-notes" className="mt-1.5 bg-background" rows={3} {...form.register('notes')} />
          </div>
          {isError && (
            <p className="text-sm text-destructive" role="alert">
              {error instanceof Error ? error.message : 'Could not save float'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || crew.length === 0 || budgetItems.length === 0}>
              Save allocation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
