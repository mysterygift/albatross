import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listProductions,
  createProduction,
  updateProduction,
  deleteProduction,
  permanentlyDeleteProduction,
  duplicateProduction,
} from '@/lib/db/repositories/production'
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, AlertTriangle, Copy } from 'lucide-react'
import type { Production } from '@/lib/db/types'
import { useCurrentProduction } from './context'

const productionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  notes: z.string().optional(),
})

type ProductionForm = z.infer<typeof productionSchema>

export function ProductionsPage() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [permanentDeleteProduction, setPermanentDeleteProduction] = useState<Production | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<Production | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateSuccessResult, setDuplicateSuccessResult] = useState<{ name: string; slug: string } | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [deleteToast, setDeleteToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [verifyDeleteResult, setVerifyDeleteResult] = useState<string | null>(null)
  const [verifyDeletePending, setVerifyDeletePending] = useState(false)
  const queryClient = useQueryClient()
  const { currentProductionId, setCurrentProductionId, refetchProductions } = useCurrentProduction()
  const { data: productions = [] } = useQuery({
    queryKey: ['productions'],
    queryFn: listProductions,
  })

  const createMutation = useMutation({
    mutationFn: (data: ProductionForm) =>
      createProduction({ name: data.name, notes: data.notes ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductionForm> }) =>
      updateProduction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProduction,
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setDeleteToast({ type: 'success', message: 'Production deleted.' })
      setTimeout(() => setDeleteToast(null), 4000)
    },
    onError: (err) => {
      setDeleteToast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      setTimeout(() => setDeleteToast(null), 5000)
    },
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: permanentlyDeleteProduction,
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setPermanentDeleteProduction(null)
      setDeleteToast({ type: 'success', message: 'Production permanently deleted.' })
      setTimeout(() => setDeleteToast(null), 4000)
    },
    onError: (err) => {
      setDeleteToast({ type: 'error', message: err instanceof Error ? err.message : 'Permanent delete failed' })
      setTimeout(() => setDeleteToast(null), 5000)
    },
  })

  async function runVerifyProductionDelete() {
    setVerifyDeletePending(true)
    setVerifyDeleteResult(null)
    try {
      const list = await listProductions()
      const source = list[0]
      if (!source) {
        setVerifyDeleteResult('Failed: no production to duplicate')
        return
      }
      const { id } = await duplicateProduction(source.id, 'Verify Delete Temp')
      await deleteProduction(id)
      const afterSoft = await listProductions()
      if (afterSoft.some((p) => p.id === id)) {
        setVerifyDeleteResult('Failed at soft delete: production still in list')
        return
      }
      await permanentlyDeleteProduction(id)
      const afterHard = await listProductions()
      if (afterHard.some((p) => p.id === id)) {
        setVerifyDeleteResult('Failed at hard delete: production still in list')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setVerifyDeleteResult('Verify Production Delete: success')
    } catch (e) {
      setVerifyDeleteResult('Verify Production Delete: failed — ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setVerifyDeletePending(false)
    }
  }

  const duplicateMutation = useMutation({
    mutationFn: ({ sourceId, newName }: { sourceId: string; newName: string }) =>
      duplicateProduction(sourceId, newName),
    onSuccess: (result) => {
      setDuplicateError(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setCurrentProductionId(result.id)
      setDuplicateSource(null)
      setDuplicateName('')
      setDuplicateSuccessResult({ name: result.name, slug: result.slug })
      setTimeout(() => setDuplicateSuccessResult(null), 6000)
    },
    onError: (err) => {
      setDuplicateError(err instanceof Error ? err.message : 'Duplication failed')
    },
  })

  const columns: ColumnDef<Production>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ getValue }) => (getValue() as string)?.slice(0, 50) ?? '—',
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditingId(row.original.id)}
            title="Edit"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setDuplicateSource(row.original)
              setDuplicateName(`${row.original.name} (Copy)`)
              setDuplicateError(null)
            }}
            title="Duplicate production"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate(row.original.id)}
            title="Delete"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPermanentDeleteProduction(row.original)}
            title="Delete permanently"
          >
            <AlertTriangle className="size-4 text-muted-foreground" />
          </Button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: productions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              New production
            </Button>
          </DialogTrigger>
          <DialogContent>
            <ProductionFormDialog
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => setOpen(false)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {duplicateSuccessResult && (
        <p className="rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-mint-700 dark:text-mint-400 text-sm">
          <strong>Production duplicated.</strong> New production: &quot;{duplicateSuccessResult.name}&quot; (slug: <code className="rounded bg-mint-500/20 px-1">{duplicateSuccessResult.slug}</code>). It has been set as the current production and will appear in the list below.
        </p>
      )}
      {duplicateError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-400 text-sm">
          {duplicateError}
        </p>
      )}
      {deleteToast && (
        <p
          className={
            deleteToast.type === 'success'
              ? 'rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-mint-700 dark:text-mint-400 text-sm'
              : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-400 text-sm'
          }
        >
          {deleteToast.message}
        </p>
      )}

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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No productions. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingId && (
        <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
          <DialogContent>
            <EditProductionForm
              production={productions.find((p) => p.id === editingId)!}
              onSubmit={(data) =>
                updateMutation.mutate({ id: editingId, data })
              }
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={!!duplicateSource}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateSource(null)
            setDuplicateName('')
            setDuplicateError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate production</DialogTitle>
            <p className="text-muted-foreground text-sm">
              Create a copy of &quot;{duplicateSource?.name}&quot; with all its data. You can change the name below.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="dup-name">New production name</Label>
            <Input
              id="dup-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="e.g. My Production (Copy)"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateSource(null)
                setDuplicateName('')
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!duplicateName.trim() || duplicateMutation.isPending}
              onClick={() => duplicateSource && duplicateMutation.mutate({ sourceId: duplicateSource.id, newName: duplicateName.trim() })}
            >
              {duplicateMutation.isPending ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={!!permanentDeleteProduction}
        onOpenChange={(open) => !open && setPermanentDeleteProduction(null)}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl border-t bg-zinc-900 text-zinc-100"
        >
          <SheetHeader>
            <SheetTitle className="text-zinc-100">
              Delete production permanently?
            </SheetTitle>
            <p className="text-zinc-400 text-sm">
              {permanentDeleteProduction
                ? `"${permanentDeleteProduction.name}" and all its data (scenes, people, documents, etc.) will be removed and cannot be undone.`
                : ''}
            </p>
          </SheetHeader>
          <SheetFooter className="flex-row gap-3 justify-center sm:justify-center">
            <button
              type="button"
              onClick={() => permanentDeleteMutation.mutate(permanentDeleteProduction!.id)}
              disabled={permanentDeleteMutation.isPending}
              className="rounded-full border-2 border-red-500 bg-transparent px-6 py-2.5 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              Yes, Delete
            </button>
            <button
              type="button"
              onClick={() => setPermanentDeleteProduction(null)}
              disabled={permanentDeleteMutation.isPending}
              className="rounded-full border-2 border-white bg-transparent px-6 py-2.5 text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {import.meta.env.DEV && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Developer: Verify Production Delete</p>
          <p className="mt-1 text-muted-foreground">
            Duplicates the first production, soft-deletes it, then permanently deletes it, and reports success or the first failing step.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={verifyDeletePending || productions.length === 0}
              onClick={() => runVerifyProductionDelete()}
            >
              {verifyDeletePending ? 'Running…' : 'Run verify'}
            </Button>
            {verifyDeleteResult && (
              <span className={verifyDeleteResult.includes('success') ? 'text-mint-600 dark:text-mint-400' : 'text-red-600 dark:text-red-400'}>
                {verifyDeleteResult}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductionFormDialog({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: ProductionForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<ProductionForm>({
    resolver: zodResolver(productionSchema),
    defaultValues: { name: '', notes: '' },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>New production</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" {...form.register('notes')} rows={3} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Create
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditProductionForm({
  production,
  onSubmit,
  onCancel,
  isLoading,
}: {
  production: Production
  onSubmit: (data: ProductionForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<ProductionForm>({
    resolver: zodResolver(productionSchema),
    defaultValues: { name: production.name, notes: production.notes ?? '' },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit production</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea id="edit-notes" {...form.register('notes')} rows={3} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
