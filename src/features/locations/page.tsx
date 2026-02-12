import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listLocationsByProduction,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/lib/db/repositories/location'
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
import { Textarea } from '@/components/ui/textarea'
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
import type { Location } from '@/lib/db/types'

const locationSchema = z.object({
  name: z.string().min(1),
  booked_status: z.enum(['unbooked', 'hold', 'booked', 'wrap']),
  address: z.string().optional(),
  availability_constraints: z.string().optional(),
  permit_fee: z.coerce.number().optional(),
  location_fee: z.coerce.number().optional(),
  notes: z.string().optional(),
})

type LocationForm = z.infer<typeof locationSchema>

export function LocationsPage() {
  const { currentProductionId } = useCurrentProduction()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: (d: LocationForm) =>
      createLocation({
        production_id: currentProductionId!,
        ...d,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LocationForm> }) =>
      updateLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locations'] }),
  })

  const columns: ColumnDef<Location>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'booked_status', header: 'Status' },
    { accessorKey: 'address', header: 'Address', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'location_fee',
      header: 'Fee',
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
    data: locations,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Locations</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Locations</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 size-4" />Add location</Button>
          </DialogTrigger>
          <DialogContent>
            <LocationForm
              defaultValues={{ name: '', booked_status: 'unbooked' }}
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
            <LocationForm
              defaultValues={locations.find((l) => l.id === editingId)!}
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

function LocationForm({
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  defaultValues: Partial<Location>
  onSubmit: (d: LocationForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<LocationForm>({
    resolver: zodResolver(locationSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      booked_status: defaultValues.booked_status ?? 'unbooked',
      address: defaultValues.address ?? '',
      availability_constraints: defaultValues.availability_constraints ?? '',
      permit_fee: defaultValues.permit_fee ?? undefined,
      location_fee: defaultValues.location_fee ?? undefined,
      notes: defaultValues.notes ?? '',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit location' : 'Add location'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} />
        </div>
        <div>
          <Label>Booked status</Label>
          <Select
            value={form.watch('booked_status')}
            onValueChange={(v) => form.setValue('booked_status', v as LocationForm['booked_status'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unbooked">Unbooked</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="wrap">Wrap</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Address</Label>
          <Input {...form.register('address')} />
        </div>
        <div>
          <Label>Availability constraints</Label>
          <Input {...form.register('availability_constraints')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Permit fee</Label>
            <Input type="number" step={0.01} {...form.register('permit_fee')} />
          </div>
          <div>
            <Label>Location fee</Label>
            <Input type="number" step={0.01} {...form.register('location_fee')} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea {...form.register('notes')} rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>Save</Button>
        </DialogFooter>
      </form>
    </>
  )
}
