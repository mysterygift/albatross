import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listProductions,
  updateProduction,
  permanentlyDeleteProduction,
  duplicateProduction,
  deleteProduction,
  archiveProduction,
  unarchiveProduction,
  findExistingDemoTemplateProduction,
} from '@/lib/db/repositories/production'
import { createProductionFromTemplate } from '@/lib/db/createProductionFromTemplate'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Archive,
  PackageOpen,
  File,
  FileStack,
  FileText,
  Download,
  Upload,
  Loader2,
} from 'lucide-react'
import type { Production } from '@/lib/db/types'
import { useCurrentProduction } from './context'
import { useApfActions } from '@/features/productions/useApfActions'

const templateEnum = z.enum(['blank', 'demo', 'default'])
const editProductionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  notes: z.string().optional(),
})
const newProductionFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    notes: z.string().optional(),
    template: templateEnum,
    isEpisodic: z.boolean(),
    initialEpisodeName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isEpisodic) return
    if (!(data.initialEpisodeName ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a name for the first episode',
        path: ['initialEpisodeName'],
      })
    }
  })
type NewProductionForm = z.infer<typeof newProductionFormSchema>
type EditProductionForm = z.infer<typeof editProductionSchema>

const TEMPLATE_OPTIONS: {
  value: NewProductionForm['template']
  label: string
  description: string
  preview: string
  Icon: typeof File
  cardClass: string
  selectedClass: string
}[] = [
  {
    value: 'blank',
    label: 'Blank',
    description: 'A truly clean slate. No accounts, tasks, or deliverables—you add everything yourself.',
    preview: 'No starter data',
    Icon: File,
    cardClass: 'border-border hover:border-muted-foreground/40',
    selectedClass: 'border-muted-foreground/60 bg-muted/30 ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
  },
  {
    value: 'demo',
    label: 'Demo',
    description: 'A full sample production: scenes, cast, schedule, budget, tasks, and deliverables. Perfect for exploring Albatross.',
    preview: 'Scenes, schedule, budget, tasks, deliverables',
    Icon: FileStack,
    cardClass: 'border-border hover:border-indigo-500/40',
    selectedClass: 'border-indigo-500/60 bg-indigo-500/5 ring-2 ring-indigo-500/30 ring-offset-2 ring-offset-background',
  },
  {
    value: 'default',
    label: 'Default',
    description: 'A practical starting point: chart of accounts, starter tasks (Pre-Production, Principal, Post), and a small deliverables set.',
    preview: 'Budget codes + starter tasks + deliverables',
    Icon: FileText,
    cardClass: 'border-border hover:border-primary/40',
    selectedClass: 'border-primary/50 bg-primary/10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
  },
]

/** Template options visible in the New Production modal. Demo is hidden for now. */
const VISIBLE_TEMPLATE_OPTIONS = TEMPLATE_OPTIONS.filter((opt) => opt.value !== 'demo')

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
  const [demoOverrideTarget, setDemoOverrideTarget] = useState<{
    production: Production
    formData: NewProductionForm
  } | null>(null)
  const [demoOverrideError, setDemoOverrideError] = useState<string | null>(null)
  const [overrideDeletePending, setOverrideDeletePending] = useState(false)
  const [showArchived, setShowArchived] = useState(() => {
    try {
      return localStorage.getItem('showArchivedProductions') === 'true'
    } catch {
      return false
    }
  })
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction, setCurrentProductionId, refetchProductions } =
    useCurrentProduction()
  const { apfBusy, handleImportApf, handleExportApf } = useApfActions({
    onMessage: (msg) => {
      setActionToast({ type: msg.type, message: msg.message })
      setTimeout(() => setActionToast(null), msg.timeoutMs)
    },
  })
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

  useEffect(() => {
    const onRevealArchived = () => setShowArchived(true)
    window.addEventListener('albatross-reveal-archived-productions', onRevealArchived)
    return () => window.removeEventListener('albatross-reveal-archived-productions', onRevealArchived)
  }, [])

  useEffect(() => {
    const onOpenNewProjectDialog = () => setOpen(true)
    window.addEventListener('albatross-open-new-production-dialog', onOpenNewProjectDialog)
    return () =>
      window.removeEventListener('albatross-open-new-production-dialog', onOpenNewProjectDialog)
  }, [])

  const createMutation = useMutation({
    mutationFn: (data: NewProductionForm) =>
      createProductionFromTemplate({
        name: data.name,
        notes: data.notes ?? null,
        template: data.template,
        isEpisodic: data.isEpisodic,
        initialEpisodeName: data.isEpisodic ? data.initialEpisodeName?.trim() : undefined,
      }),
    onSuccess: (production) => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      setCurrentProductionId(production.id)
      setOpen(false)
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditProductionForm }) =>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
            {row.original.name}
          </span>
          {row.original.is_episodic && (
            <span className="rounded border border-violet-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-xs font-medium text-white-800 dark:border-violet-400/35 dark:bg-yellow-500/15 dark:text-white-300">
              Episodic
            </span>
          )}
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
            disabled={apfBusy !== null}
            onClick={() => void handleImportApf()}
            title="Import a project from an .apf file"
            aria-label="Import project"
          >
            {apfBusy === 'import' ? (
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-2 size-4 shrink-0" aria-hidden />
            )}
            <span className="max-[640px]:sr-only">Import project</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!currentProduction || apfBusy !== null}
            onClick={() => void handleExportApf()}
            title={
              currentProduction
                ? 'Export current production as .apf'
                : 'Choose a current production from the app header to export'
            }
            aria-label="Export project"
          >
            {apfBusy === 'export' ? (
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-2 size-4 shrink-0" aria-hidden />
            )}
            <span className="max-[640px]:sr-only">Export project</span>
          </Button>
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
              onSubmit={async (data) => {
                if (data.template !== 'demo') {
                  createMutation.mutate(data)
                  return
                }
                const existing = await findExistingDemoTemplateProduction()
                if (!existing) {
                  createMutation.mutate(data)
                  return
                }
                setDemoOverrideError(null)
                setDemoOverrideTarget({ production: existing, formData: data })
              }}
              onCancel={() => setOpen(false)}
              isLoading={createMutation.isPending}
              error={createMutation.isError ? (createMutation.error instanceof Error ? createMutation.error.message : 'Something went wrong') : null}
              onDismissError={() => createMutation.reset()}
            />
          </DialogContent>
          </Dialog>

          <Dialog
            open={demoOverrideTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDemoOverrideTarget(null)
                setDemoOverrideError(null)
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Creating a new project will override the existing demo project.</DialogTitle>
                <p className="text-muted-foreground text-sm leading-snug">
                  The current demo project will be permanently deleted. A new demo project will then be created with the name and description you entered.
                </p>
              </DialogHeader>
              {demoOverrideError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-destructive text-sm">
                  {demoOverrideError}
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDemoOverrideTarget(null)
                    setDemoOverrideError(null)
                  }}
                  disabled={overrideDeletePending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={overrideDeletePending || createMutation.isPending}
                  onClick={async () => {
                    if (!demoOverrideTarget) return
                    setDemoOverrideError(null)
                    setOverrideDeletePending(true)
                    try {
                      await permanentlyDeleteProduction(demoOverrideTarget.production.id)
                      if (currentProductionId === demoOverrideTarget.production.id) {
                        setCurrentProductionId(null)
                      }
                      setDemoOverrideTarget(null)
                      createMutation.mutate(demoOverrideTarget.formData)
                    } catch (err) {
                      setDemoOverrideError(err instanceof Error ? err.message : 'Delete failed')
                    } finally {
                      setOverrideDeletePending(false)
                    }
                  }}
                >
                  {overrideDeletePending || createMutation.isPending ? 'Overriding…' : 'Override demo project'}
                </Button>
              </DialogFooter>
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
                updateMutation.mutate({ id: editingId, data: { name: data.name, notes: data.notes } })
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
  error,
  onDismissError,
}: {
  onSubmit: (data: NewProductionForm) => void
  onCancel: () => void
  isLoading: boolean
  error?: string | null
  onDismissError?: () => void
}) {
  const form = useForm<NewProductionForm>({
    resolver: zodResolver(newProductionFormSchema),
    defaultValues: {
      name: '',
      notes: '',
      template: 'default',
      isEpisodic: false,
      initialEpisodeName: '',
    },
  })
  const isEpisodic = form.watch('isEpisodic')
  return (
    <>
      <DialogHeader className="space-y-1.5">
        <DialogTitle>New production</DialogTitle>
        <p className="text-muted-foreground text-sm leading-snug">
          Choose a template, then name your project. You can add a description below if you like.
        </p>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...form.register('name')} placeholder="e.g. My Feature" />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Project description</Label>
          <Textarea id="notes" {...form.register('notes')} rows={2} placeholder="Optional" className="resize-none" />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 space-y-3">
          <Controller
            name="isEpisodic"
            control={form.control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  className="mt-0.5"
                  id="is-episodic"
                />
                <div className="space-y-1 min-w-0">
                  <span className="text-sm font-medium text-foreground leading-snug">Episodic production</span>
                  <p className="text-muted-foreground text-xs leading-snug">
                    For series and multi-episode work. Scenes, schedule, and deliverables can be tied to episodes in later releases.
                  </p>
                </div>
              </label>
            )}
          />
          {isEpisodic && (
            <>
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium leading-snug border border-amber-500/35 rounded-md bg-amber-500/10 px-2.5 py-2">
                You cannot turn off episodic mode after the project is created. Be sure this is the right choice for this production.
              </p>
              <div className="space-y-2">
                <Label htmlFor="initial-episode">First episode name</Label>
                <Input
                  id="initial-episode"
                  {...form.register('initialEpisodeName')}
                  placeholder="e.g. Episode 1 or 101"
                />
                {form.formState.errors.initialEpisodeName && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.initialEpisodeName.message}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="space-y-2.5">
          <Label className="text-foreground">Project template</Label>
          <Controller
            name="template"
            control={form.control}
            render={({ field }) => (
              <div className="grid gap-2" role="radiogroup" aria-label="Project template">
                {VISIBLE_TEMPLATE_OPTIONS.map((opt) => {
                  const isSelected = field.value === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => field.onChange(opt.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          field.onChange(opt.value)
                        }
                      }}
                      className={`flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isSelected ? opt.selectedClass : opt.cardClass}`}
                    >
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg aria-hidden ${isSelected ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                        <opt.Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5 pt-px">
                        <p className="font-medium text-foreground">{opt.label}</p>
                        <p className="text-muted-foreground text-sm leading-snug">{opt.description}</p>
                        <p className="text-muted-foreground/80 text-xs">Preview: {opt.preview}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-destructive text-sm flex items-start justify-between gap-2">
            <span>{error}</span>
            {onDismissError && (
              <Button type="button" variant="ghost" size="sm" className="shrink-0 h-auto py-1 text-destructive hover:bg-destructive/20" onClick={onDismissError}>
                Dismiss
              </Button>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create'}
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
  onSubmit: (data: EditProductionForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<EditProductionForm>({
    resolver: zodResolver(editProductionSchema),
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
