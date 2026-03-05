import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listProductions,
  createProduction,
  updateProduction,
  permanentlyDeleteProduction,
  duplicateProduction,
  deleteProduction,
  archiveProduction,
  unarchiveProduction,
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
import { Plus, Pencil, Trash2, Copy, Archive, PackageOpen } from 'lucide-react'
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
  const [productionToHardDelete, setProductionToHardDelete] = useState<Production | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<Production | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateSuccessResult, setDuplicateSuccessResult] = useState<{ name: string; slug: string } | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [verifyDeleteResult, setVerifyDeleteResult] = useState<string | null>(null)
  const [verifyDeletePending, setVerifyDeletePending] = useState(false)
  const [showArchived, setShowArchived] = useState(() => {
    try {
      return localStorage.getItem('showArchivedProductions') === 'true'
    } catch {
      return false
    }
  })
  const queryClient = useQueryClient()
  const { currentProductionId, setCurrentProductionId, refetchProductions } = useCurrentProduction()
  const { data: productions = [] } = useQuery({
    queryKey: ['productions', { includeArchived: showArchived }],
    queryFn: () => listProductions({ includeArchived: showArchived }),
  })

  function toggleShowArchived() {
    const next = !showArchived
    setShowArchived(next)
    try {
      localStorage.setItem('showArchivedProductions', String(next))
    } catch {
      /* ignore */
    }
  }

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

  const hardDeleteMutation = useMutation({
    mutationFn: permanentlyDeleteProduction,
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setProductionToHardDelete(null)
      setActionToast({ type: 'success', message: 'Production permanently deleted.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      setTimeout(() => setActionToast(null), 5000)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveProduction,
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setActionToast({ type: 'success', message: 'Project archived.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Archive failed' })
      setTimeout(() => setActionToast(null), 5000)
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: unarchiveProduction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setActionToast({ type: 'success', message: 'Project restored.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Unarchive failed' })
      setTimeout(() => setActionToast(null), 5000)
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
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
            {row.original.name}
          </span>
          {row.original.archived_at && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400 text-xs font-medium">
              Archived
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ getValue, row }) => (
        <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
          {(getValue() as string)?.slice(0, 50) ?? '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const isArchived = !!row.original.archived_at
        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingId(row.original.id)}
              title="Edit"
            >
              <Pencil className="size-4" />
            </Button>
            {!isArchived && (
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
            )}
            {isArchived ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => unarchiveMutation.mutate(row.original.id)}
                disabled={unarchiveMutation.isPending}
                title="Unarchive project"
                className="text-mint-600 hover:bg-mint-500/10 hover:text-mint-700 dark:text-mint-400 dark:hover:text-mint-300"
              >
                <Archive className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => archiveMutation.mutate(row.original.id)}
                disabled={archiveMutation.isPending}
                title="Archive project"
                className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <Archive className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setProductionToHardDelete(row.original)}
              title="Delete permanently"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        )
      },
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
        <div className="flex min-w-0 flex-none items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleShowArchived}
            title={showArchived ? 'Hide archived projects' : 'Show archived projects'}
            aria-label={showArchived ? 'Hide archived projects' : 'Show archived projects'}
            className={`flex max-w-[260px] flex-none items-center overflow-hidden transition-colors duration-200 ease-out focus-visible:ring-mint-500 ${showArchived ? 'border-mint-500/40 bg-mint-500/5 pr-2 text-mint-700 hover:bg-mint-500/15 hover:text-foreground dark:text-mint-400 dark:hover:bg-mint-500/20 dark:hover:text-foreground' : ''}`}
          >
            <PackageOpen className="size-4 shrink-0" />
            <span
              className={`inline-block shrink-0 whitespace-nowrap overflow-hidden transition-all duration-200 ease-out max-[900px]:!max-w-0 max-[900px]:!opacity-0 max-[900px]:!ml-0 ${showArchived ? 'max-w-[220px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'}`}
            >
              Hide archived projects
            </span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex-none shrink-0">
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
      {actionToast && (
        <p
          className={
            actionToast.type === 'success'
              ? 'rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-mint-700 dark:text-mint-400 text-sm'
              : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-400 text-sm'
          }
        >
          {actionToast.message}
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
                <TableRow
                  key={row.id}
                  className={row.original.archived_at ? 'bg-muted/40 text-muted-foreground' : ''}
                >
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
        open={!!productionToHardDelete}
        onOpenChange={(open) => !open && setProductionToHardDelete(null)}
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
              {productionToHardDelete
                ? `"${productionToHardDelete.name}" and all its data (scenes, people, documents, etc.) will be removed and cannot be undone.`
                : ''}
            </p>
          </SheetHeader>
          <SheetFooter className="flex-row gap-3 justify-center sm:justify-center">
            <button
              type="button"
              onClick={() => productionToHardDelete && hardDeleteMutation.mutate(productionToHardDelete.id)}
              disabled={hardDeleteMutation.isPending}
              className="rounded-full border-2 border-red-500 bg-transparent px-6 py-2.5 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              Yes, Delete
            </button>
            <button
              type="button"
              onClick={() => setProductionToHardDelete(null)}
              disabled={hardDeleteMutation.isPending}
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
