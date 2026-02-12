import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listPeopleByProduction,
  createPerson,
  updatePerson,
  deletePerson,
} from '@/lib/db/repositories/person'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Person } from '@/lib/db/types'

const personSchema = z.object({
  name: z.string().min(1),
  is_cast: z.boolean(),
  email: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  phases: z.string().optional(),
  notes: z.string().optional(),
  contributor_form_status: z.enum(['not_requested', 'requested', 'signed', 'expired']),
})

type PersonForm = z.infer<typeof personSchema>

export function PeoplePage() {
  const { currentProductionId } = useCurrentProduction()
  const [filter, setFilter] = useState<'all' | 'crew' | 'cast'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: () => listPeopleByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const filtered =
    filter === 'crew'
      ? people.filter((p) => !p.is_cast)
      : filter === 'cast'
        ? people.filter((p) => p.is_cast)
        : people

  const createMutation = useMutation({
    mutationFn: (d: PersonForm) =>
      createPerson({
        production_id: currentProductionId!,
        name: d.name,
        is_cast: d.is_cast ? 1 : 0,
        email: d.email ?? null,
        phone: d.phone ?? null,
        department: d.department ?? null,
        phases: d.phases ?? null,
        notes: d.notes ?? null,
        contributor_form_status: d.contributor_form_status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonForm> }) =>
      updatePerson(id, {
        ...data,
        is_cast: data.is_cast !== undefined ? (data.is_cast ? 1 : 0) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })

  const columns: ColumnDef<Person>[] = [
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'is_cast',
      header: 'Type',
      cell: ({ getValue }) => ((getValue() as number) ? 'Cast' : 'Crew'),
    },
    { accessorKey: 'department', header: 'Department' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'contributor_form_status',
      header: 'Contributor form',
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
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">People</h1>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="crew">Crew</SelectItem>
              <SelectItem value="cast">Cast</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 size-4" />Add person</Button>
            </DialogTrigger>
            <DialogContent>
              <PersonForm
                defaultValues={{
                  name: '',
                  is_cast: 0,
                  contributor_form_status: 'not_requested',
                }}
                onSubmit={createMutation.mutate}
                onCancel={() => setOpen(false)}
                isLoading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
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
            <PersonForm
              defaultValues={people.find((p) => p.id === editingId)!}
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

function PersonForm({
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  defaultValues: Partial<Person>
  onSubmit: (d: PersonForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<PersonForm>({
    resolver: zodResolver(personSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      is_cast: Number(defaultValues.is_cast) !== 0,
      email: defaultValues.email ?? '',
      phone: defaultValues.phone ?? '',
      department: defaultValues.department ?? '',
      phases: defaultValues.phases ?? '',
      notes: defaultValues.notes ?? '',
      contributor_form_status: defaultValues.contributor_form_status ?? 'not_requested',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit person' : 'Add person'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.watch('is_cast')}
            onCheckedChange={(v) => form.setValue('is_cast', !!v)}
          />
          <Label>Cast (otherwise crew)</Label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Email</Label>
            <Input {...form.register('email')} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input {...form.register('phone')} />
          </div>
        </div>
        <div>
          <Label>Department</Label>
          <Input {...form.register('department')} />
        </div>
        <div>
          <Label>Phases</Label>
          <Input {...form.register('phases')} placeholder="pre/production/post" />
        </div>
        {form.watch('is_cast') && (
          <div>
            <Label>Contributor form status</Label>
            <Select
              value={form.watch('contributor_form_status')}
              onValueChange={(v) => form.setValue('contributor_form_status', v as PersonForm['contributor_form_status'])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_requested">Not requested</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
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
