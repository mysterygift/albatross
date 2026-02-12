import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listEquipmentByProduction,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from '@/lib/db/repositories/equipment'
import {
  useReactTable,
  getCoreRowModel,
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
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Equipment } from '@/lib/db/types'

const equipmentSchema = z.object({
  name: z.string().min(1),
  source_type: z.enum(['owned', 'purchased', 'rented']),
  vendor: z.string().optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
})

type EquipmentForm = z.infer<typeof equipmentSchema>

export function EquipmentPage() {
  const { currentProductionId } = useCurrentProduction()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', currentProductionId],
    queryFn: () => listEquipmentByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: (d: EquipmentForm) =>
      createEquipment({
        production_id: currentProductionId!,
        ...d,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EquipmentForm> }) =>
      updateEquipment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  })

  const columns: ColumnDef<Equipment>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'source_type', header: 'Source' },
    { accessorKey: 'vendor', header: 'Vendor', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'cost',
      header: 'Cost',
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return v != null ? `$${v}` : '—'
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setEditingId(row.original.id)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(row.original.id)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: equipment,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Equipment</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Equipment</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 size-4" />Add equipment</Button>
          </DialogTrigger>
          <DialogContent>
            <EquipmentForm
              defaultValues={{ name: '', source_type: 'rented' }}
              onSubmit={createMutation.mutate}
              onCancel={() => setOpen(false)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editingId && (
        <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
          <DialogContent>
            <EquipmentForm
              defaultValues={equipment.find((e) => e.id === editingId)!}
              onSubmit={(d) => updateMutation.mutate({ id: editingId, data: d })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function EquipmentForm({
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  defaultValues: Partial<Equipment>
  onSubmit: (d: EquipmentForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<EquipmentForm>({
    resolver: zodResolver(equipmentSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      source_type: defaultValues.source_type ?? 'rented',
      vendor: defaultValues.vendor ?? '',
      cost: defaultValues.cost ?? undefined,
      notes: defaultValues.notes ?? '',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit equipment' : 'Add equipment'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} />
        </div>
        <div>
          <Label>Source type</Label>
          <Select
            value={form.watch('source_type')}
            onValueChange={(v) => form.setValue('source_type', v as EquipmentForm['source_type'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owned">Owned</SelectItem>
              <SelectItem value="purchased">Purchased</SelectItem>
              <SelectItem value="rented">Rented</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vendor</Label>
          <Input {...form.register('vendor')} />
        </div>
        <div>
          <Label>Cost</Label>
          <Input type="number" step={0.01} {...form.register('cost')} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>Save</Button>
        </DialogFooter>
      </form>
    </>
  )
}
