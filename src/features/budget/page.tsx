import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import {
  listBudgetCategoriesByProduction,
  listBudgetItemsByProduction,
  listExpensesByProduction,
  createBudgetItem,
  createExpense,
} from '@/lib/db/repositories/budget'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Download } from 'lucide-react'
import { saveFileWithDialog } from '@/lib/files'
import type { BudgetItem, BudgetCategory } from '@/lib/db/types'

const itemSchema = z.object({
  category_id: z.string().min(1),
  description: z.string().min(1),
  estimated_cost: z.coerce.number().min(0),
  actual_cost: z.coerce.number().min(0),
  vendor: z.string().optional(),
})

const expenseSchema = z.object({
  amount: z.coerce.number().min(0),
  date: z.string().min(1),
  category_id: z.string().optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
  expense_type: z.enum(['petty_cash', 'per_diem', 'other']),
})

export function BudgetPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { format, ensureRate, conversionBanner } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (currentProduction?.currency_code) ensureRate(currentProduction.currency_code)
  }, [currentProduction?.currency_code, ensureRate])

  const { data: categories = [] } = useQuery({
    queryKey: ['budget-categories', currentProductionId],
    queryFn: () => listBudgetCategoriesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['budget-items', currentProductionId],
    queryFn: () => listBudgetItemsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', currentProductionId],
    queryFn: () => listExpensesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createItemMutation = useMutation({
    mutationFn: (data: Parameters<typeof createBudgetItem>[0]) =>
      createBudgetItem({ ...data, production_id: currentProductionId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-items'] })
      setAddItemOpen(false)
    },
  })

  const createExpenseMutation = useMutation({
    mutationFn: (data: z.infer<typeof expenseSchema>) =>
      createExpense({
        production_id: currentProductionId!,
        amount: data.amount,
        date: data.date,
        category_id: data.category_id ?? null,
        vendor: data.vendor ?? null,
        notes: data.notes ?? null,
        expense_type: data.expense_type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['budget-items'] })
      setAddExpenseOpen(false)
    },
  })

  const totalEstimated = items.reduce((s, i) => s + i.estimated_cost, 0)
  const totalActualFromItems = items.reduce((s, i) => s + i.actual_cost, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalActual = totalExpenses + totalActualFromItems
  const variance = totalEstimated - totalActual

  const exportCsv = async () => {
    const rows = [
      ['Category', 'Description', 'Estimated', 'Actual', 'Variance'],
      ...items.map((i) => {
        const cat = categories.find((c) => c.id === i.category_id)
        const actual = i.actual_cost + expenses.filter((e) => e.category_id === i.category_id).reduce((s, e) => s + e.amount, 0)
        return [cat?.code ?? '', i.description, i.estimated_cost, actual, i.estimated_cost - actual]
      }),
      ['', 'TOTAL', totalEstimated, totalActual, variance],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    await saveFileWithDialog(
      {
        defaultPath: 'budget-report.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        title: 'Save budget report',
      },
      csv,
      true
    )
  }

  const tableData = useMemo(
    () =>
      items.map((i) => ({
        ...i,
        categoryCode: categories.find((c) => c.id === i.category_id)?.code ?? '—',
      })),
    [items, categories]
  )

  const columns: ColumnDef<BudgetItem & { categoryCode?: string }>[] = useMemo(
    () => [
      {
        accessorKey: 'categoryCode',
        header: 'Category',
      },
      { accessorKey: 'description', header: 'Description' },
      {
        accessorKey: 'estimated_cost',
        header: 'Estimated',
        cell: ({ getValue }) => format(Number(getValue()), productionCurrency).formatted,
      },
      {
        accessorKey: 'actual_cost',
        header: 'Actual',
        cell: ({ row }) => {
          const item = row.original
          const expTotal = expenses
            .filter((e) => e.category_id === item.category_id)
            .reduce((s, e) => s + e.amount, 0)
          return format(item.actual_cost + expTotal, productionCurrency).formatted
        },
      },
      {
        id: 'variance',
        header: 'Variance',
        cell: ({ row }) => {
          const item = row.original
          const expTotal = expenses
            .filter((e) => e.category_id === item.category_id)
            .reduce((s, e) => s + e.amount, 0)
          const actual = item.actual_cost + expTotal
          const v = item.estimated_cost - actual
          return (
            <span className={v < 0 ? 'text-destructive' : ''}>
              {format(v, productionCurrency).formatted}
            </span>
          )
        },
      },
    ],
    [expenses, format, productionCurrency]
  )

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {conversionBanner && (
        <p className="text-muted-foreground text-sm rounded-md border border-border bg-muted/30 px-3 py-2">
          {conversionBanner}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Budget</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
          <Dialog
            open={addExpenseOpen}
            onOpenChange={setAddExpenseOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 size-4" />
                Quick-add spend
              </Button>
            </DialogTrigger>
            <DialogContent>
              {addExpenseOpen && (
              <QuickExpenseForm
                categories={categories}
                onSubmit={createExpenseMutation.mutate}
                onCancel={() => setAddExpenseOpen(false)}
                isLoading={createExpenseMutation.isPending}
              />
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Add line item
              </Button>
            </DialogTrigger>
            <DialogContent>
              {addItemOpen && (
              <BudgetItemForm
                categories={categories}
                onSubmit={(d) =>
                  createItemMutation.mutate({
                    ...d,
                    production_id: currentProductionId,
                    category_id: d.category_id,
                    description: d.description,
                    estimated_cost: d.estimated_cost,
                    actual_cost: d.actual_cost,
                    vendor: d.vendor ?? null,
                  })
                }
                onCancel={() => setAddItemOpen(false)}
                isLoading={createItemMutation.isPending}
              />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Total estimated</p>
          <p className="text-2xl font-semibold">{format(totalEstimated, productionCurrency).formatted}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Total actual</p>
          <p className="text-2xl font-semibold">{format(totalActual, productionCurrency).formatted}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Variance</p>
          <p className={`text-2xl font-semibold ${variance < 0 ? 'text-destructive' : ''}`}>
            {format(variance, productionCurrency).formatted}
          </p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No budget items. Add a category first (Settings or here), then add line items.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function BudgetItemForm({
  categories,
  onSubmit,
  onCancel,
  isLoading,
}: {
  categories: BudgetCategory[]
  onSubmit: (d: z.infer<typeof itemSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof itemSchema>>({
    resolver: zodResolver(itemSchema) as never,
    defaultValues: {
      category_id: '',
      description: '',
      estimated_cost: 0,
      actual_cost: 0,
      vendor: '',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add budget line item</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Category</Label>
          <Controller
            name="category_id"
            control={form.control}
            render={({ field }) => (
              <Select
                defaultValue={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.category_id && (
            <p className="text-destructive text-sm">
              {form.formState.errors.category_id.message}
            </p>
          )}
        </div>
        <div>
          <Label>Description</Label>
          <Input {...form.register('description')} />
          {form.formState.errors.description && (
            <p className="text-destructive text-sm">
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Estimated cost</Label>
            <Input type="number" step={0.01} {...form.register('estimated_cost')} />
          </div>
          <div>
            <Label>Actual cost</Label>
            <Input type="number" step={0.01} {...form.register('actual_cost')} />
          </div>
        </div>
        <div>
          <Label>Vendor</Label>
          <Input {...form.register('vendor')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Add
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function QuickExpenseForm({
  categories,
  onSubmit,
  onCancel,
  isLoading,
}: {
  categories: BudgetCategory[]
  onSubmit: (d: z.infer<typeof expenseSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema) as never,
    defaultValues: {
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      expense_type: 'other',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Quick-add spend</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Amount</Label>
            <Input type="number" step={0.01} {...form.register('amount')} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" {...form.register('date')} />
          </div>
        </div>
        <div>
          <Label>Budget code (category)</Label>
          <Controller
            name="category_id"
            control={form.control}
            render={({ field }) => (
              <Select
                defaultValue={field.value ?? ''}
                onValueChange={(v) => field.onChange(v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label>Type</Label>
          <Controller
            name="expense_type"
            control={form.control}
            render={({ field }) => (
              <Select
                defaultValue={field.value}
                onValueChange={(v) =>
                  field.onChange(v as 'petty_cash' | 'per_diem' | 'other')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="petty_cash">Petty cash</SelectItem>
                  <SelectItem value="per_diem">Per diem</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label>Vendor</Label>
          <Input {...form.register('vendor')} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Add
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
