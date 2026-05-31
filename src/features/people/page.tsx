import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createPersonForActor,
  deletePersonForActor,
  listPeopleByProductionForActor,
  updatePersonForActor,
} from '@/lib/access/projectDomainService'
import { serializePhases } from '@/lib/people/productionPhases'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Eye } from 'lucide-react'
import type { Person } from '@/lib/db/types'
import { PersonForm, type PersonFormValues } from '@/features/people/components/PersonForm'

export function PeoplePage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const [filter, setFilter] = useState<'all' | 'crew' | 'cast'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listPeopleByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listPeopleByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const filtered =
    filter === 'crew'
      ? people.filter((p) => !p.is_cast)
      : filter === 'cast'
        ? people.filter((p) => p.is_cast)
        : people

  const createMutation = useMutation({
    mutationFn: async (d: PersonFormValues) => {
      const data = {
        production_id: currentProductionId!,
        name: d.name,
        is_cast: d.is_cast ? 1 : 0,
        email: d.email ?? null,
        phone: d.phone ?? null,
        department: d.department ?? null,
        phases: serializePhases(d.phases),
        notes: d.notes ?? null,
        contributor_form_status: d.contributor_form_status,
        cast_number: d.cast_number?.trim() || null,
        agent_name: d.agent_name?.trim() || null,
        agent_email: d.agent_email?.trim() || null,
        agent_phone: d.agent_phone?.trim() || null,
        role_name: d.role_name?.trim() || null,
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createPersonForActor({ db, actor: authSession.currentUser, productionId: currentProductionId!, data })
      }
      return createPerson(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PersonFormValues> }) => {
      const payload = {
        ...data,
        is_cast: data.is_cast !== undefined ? (data.is_cast ? 1 : 0) : undefined,
        cast_number: data.cast_number !== undefined ? (data.cast_number?.trim() || null) : undefined,
        agent_name: data.agent_name !== undefined ? (data.agent_name?.trim() || null) : undefined,
        agent_email: data.agent_email !== undefined ? (data.agent_email?.trim() || null) : undefined,
        agent_phone: data.agent_phone !== undefined ? (data.agent_phone?.trim() || null) : undefined,
        role_name: data.role_name !== undefined ? (data.role_name?.trim() || null) : undefined,
        phases: data.phases !== undefined ? serializePhases(data.phases) : undefined,
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return updatePersonForActor({ db, actor: authSession.currentUser, personId: id, data: payload })
      }
      return updatePerson(id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (personId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return deletePersonForActor({ db, actor: authSession.currentUser, personId })
      }
      return deletePerson(personId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })

  const columns: ColumnDef<Person>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link to={`/people/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'is_cast',
      header: 'Type',
      cell: ({ getValue }) => ((getValue() as number) ? 'Cast' : 'Crew'),
    },
    {
      id: 'cast_number',
      header: 'Cast #',
      cell: ({ row }) => (row.original.is_cast ? (row.original.cast_number?.trim() || '—') : '—'),
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
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/people/${row.original.id}`} aria-label="View">
              <Eye className="size-4" />
            </Link>
          </Button>
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
                  cast_number: '',
                  agent_name: '',
                  agent_email: '',
                  agent_phone: '',
                  role_name: '',
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
