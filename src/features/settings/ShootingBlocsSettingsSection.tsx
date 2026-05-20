import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  addCalendarDaysToIso,
  describeShootingBlocDeletion,
  describeShootingBlocRangeChange,
} from '@/lib/db/shootingBlocAssociation'
import {
  createShootingBloc,
  deleteShootingBloc,
  listBlocTaggedShootDays,
  listShootingBlocsByProduction,
  updateShootingBloc,
} from '@/lib/db/repositories/shootingBlocs'
import type { ShootingBloc } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { invalidateStripboardCaches } from '@/features/schedule/stripboard-hooks'

type Props = { productionId: string }

function defaultBlocName(index: number): string {
  return `Block ${String.fromCharCode(65 + index)}`
}

function defaultAddBlocDates(blocs: ShootingBloc[]): { start: string; end: string } {
  if (blocs.length === 0) {
    const d = new Date()
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    const start = `${y}-${m}-${day}`
    return { start, end: addCalendarDaysToIso(start, 6) }
  }
  const last = blocs[blocs.length - 1]!
  const start = addCalendarDaysToIso(last.end_date, 1)
  return { start, end: addCalendarDaysToIso(start, 6) }
}

export function ShootingBlocsSettingsSection({ productionId }: Props) {
  const queryClient = useQueryClient()
  const qk = ['shooting-blocs', productionId] as const

  const { data: blocs = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => listShootingBlocsByProduction(productionId),
  })

  const refreshBlocs = async () => {
    await queryClient.refetchQueries({ queryKey: qk })
    void invalidateStripboardCaches(queryClient, productionId)
  }

  const invalidateBlocs = () => {
    void refreshBlocs()
  }

  const [editBloc, setEditBloc] = useState<ShootingBloc | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [rangeConfirmOpen, setRangeConfirmOpen] = useState(false)
  const [rangeConfirmLines, setRangeConfirmLines] = useState<string[]>([])
  const [rangeConfirmTitle, setRangeConfirmTitle] = useState('')

  const [deleteBloc, setDeleteBloc] = useState<ShootingBloc | null>(null)
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('')
  const [deleteConfirmLines, setDeleteConfirmLines] = useState<string[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; name: string; start_date: string; end_date: string }) =>
      updateShootingBloc(args.id, {
        name: args.name,
        start_date: args.start_date,
        end_date: args.end_date,
      }),
    onSuccess: () => {
      invalidateBlocs()
      setEditBloc(null)
      setRangeConfirmOpen(false)
      setEditError(null)
    },
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : 'Could not update shooting bloc')
    },
  })

  const createMutation = useMutation({
    mutationFn: (args: { name: string; start_date: string; end_date: string }) =>
      createShootingBloc({
        production_id: productionId,
        name: args.name,
        start_date: args.start_date,
        end_date: args.end_date,
      }),
    onSuccess: async (newBloc) => {
      queryClient.setQueryData<ShootingBloc[]>(qk, (prev) => {
        const list = prev ?? []
        if (list.some((b) => b.id === newBloc.id)) return list
        return [...list, newBloc].sort(
          (a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id)
        )
      })
      await refreshBlocs()
      setAddOpen(false)
      setAddName('')
      setAddStart('')
      setAddEnd('')
      setAddError(null)
    },
    onError: (err) => {
      setAddError(err instanceof Error ? err.message : 'Could not create shooting bloc')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (blocId: string) => deleteShootingBloc(blocId),
    onSuccess: () => {
      invalidateBlocs()
      setDeleteBloc(null)
      setDeleteError(null)
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete shooting bloc')
    },
  })

  const openEdit = (b: ShootingBloc) => {
    setEditError(null)
    setEditBloc(b)
    setEditName(b.name)
    setEditStart(b.start_date)
    setEditEnd(b.end_date)
  }

  const openAdd = () => {
    const { start, end } = defaultAddBlocDates(blocs)
    setAddError(null)
    setAddName(defaultBlocName(blocs.length))
    setAddStart(start)
    setAddEnd(end)
    setAddOpen(true)
  }

  const applyUpdate = () => {
    if (!editBloc) return
    const name = editName.trim()
    if (!name) {
      setEditError('Bloc name is required')
      return
    }
    const start = editStart.trim()
    const end = editEnd.trim()
    if (!start || !end) {
      setEditError('Start and end dates are required (YYYY-MM-DD)')
      return
    }
    if (start > end) {
      setEditError('Start date must be on or before end date')
      return
    }
    updateMutation.mutate({ id: editBloc.id, name, start_date: start, end_date: end })
  }

  const submitEdit = async () => {
    if (!editBloc) return
    setEditError(null)
    const name = editName.trim()
    if (!name) {
      setEditError('Bloc name is required')
      return
    }
    const start = editStart.trim()
    const end = editEnd.trim()
    if (!start || !end) {
      setEditError('Start and end dates are required (YYYY-MM-DD)')
      return
    }
    if (start > end) {
      setEditError('Start date must be on or before end date')
      return
    }

    const rangeUnchanged = start === editBloc.start_date && end === editBloc.end_date
    if (rangeUnchanged) {
      updateMutation.mutate({ id: editBloc.id, name, start_date: start, end_date: end })
      return
    }

    const tagged = await listBlocTaggedShootDays(productionId, editBloc.id)
    const desc = describeShootingBlocRangeChange(
      editBloc.start_date,
      editBloc.end_date,
      start,
      end,
      tagged
    )

    if (desc.kind === 'none' || desc.detailLines.length === 0) {
      applyUpdate()
      return
    }

    setRangeConfirmTitle(desc.title)
    setRangeConfirmLines(desc.detailLines)
    setRangeConfirmOpen(true)
  }

  const submitAdd = () => {
    setAddError(null)
    const name = addName.trim()
    if (!name) {
      setAddError('Bloc name is required')
      return
    }
    const start = addStart.trim()
    const end = addEnd.trim()
    if (!start || !end) {
      setAddError('Start and end dates are required (YYYY-MM-DD)')
      return
    }
    if (start > end) {
      setAddError('Start date must be on or before end date')
      return
    }
    createMutation.mutate({ name, start_date: start, end_date: end })
  }

  const openDeleteConfirm = async (b: ShootingBloc, blocIndex: number) => {
    if (blocIndex === 0) return
    const previous = blocs[blocIndex - 1]!
    const tagged = await listBlocTaggedShootDays(productionId, b.id)
    const willExtendPrevious = b.end_date > previous.end_date
    const desc = describeShootingBlocDeletion({
      blocName: b.name,
      previousBlocName: previous.name,
      taggedShootDays: tagged,
      willExtendPreviousEnd: willExtendPrevious,
      previousEndDate: previous.end_date,
      deletedEndDate: b.end_date,
    })
    setDeleteError(null)
    setDeleteBloc(b)
    setDeleteConfirmTitle(desc.title)
    setDeleteConfirmLines(desc.detailLines)
  }

  const closeDeleteConfirm = () => {
    if (deleteMutation.isPending) return
    setDeleteBloc(null)
    setDeleteError(null)
  }

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Shooting blocs</h3>
          <p className="text-muted-foreground text-xs">
            Calendar spans for episodic schedule blocks. Enabling episodic mode creates a default bloc named{' '}
            <span className="font-medium text-foreground">Block A</span>. Changing dates may shift or remove shoot
            days—confirmation is required.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openAdd} className="shrink-0">
          <Plus className="mr-1.5 size-4" />
          Add bloc
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading blocs…</p>
      ) : blocs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No shooting blocs yet. Enabling episodic mode creates a default shooting bloc named{' '}
          <span className="font-medium text-foreground">Block A</span>. Adjust dates here or add more blocs.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="whitespace-nowrap">Start</TableHead>
                <TableHead className="whitespace-nowrap">End</TableHead>
                <TableHead className="w-[140px] text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocs.map((b, index) => {
                const isFirst = index === 0
                const deleteTooltip = isFirst
                  ? blocs.length === 1
                    ? 'The only shooting bloc cannot be deleted.'
                    : 'The first shooting bloc cannot be deleted.'
                  : undefined

                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground text-sm">{b.start_date}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground text-sm">{b.end_date}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(b)}
                          aria-label={`Edit ${b.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {isFirst ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  disabled
                                  aria-label={`Delete ${b.name}`}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{deleteTooltip}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => void openDeleteConfirm(b, index)}
                            aria-label={`Delete ${b.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) {
            setAddName('')
            setAddStart('')
            setAddEnd('')
            setAddError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add shooting bloc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="add-bloc-name">Name</Label>
              <Input
                id="add-bloc-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="add-bloc-start">Start date</Label>
                <Input
                  id="add-bloc-start"
                  className="tabular-nums"
                  value={addStart}
                  onChange={(e) => setAddStart(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-bloc-end">End date</Label>
                <Input
                  id="add-bloc-end"
                  className="tabular-nums"
                  value={addEnd}
                  onChange={(e) => setAddEnd(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
            {addError && <p className="text-destructive text-sm">{addError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add bloc'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editBloc != null && !rangeConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditBloc(null)
            setEditError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit shooting bloc</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bloc-name">Name</Label>
              <Input
                id="bloc-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bloc-start">Start date</Label>
                <Input
                  id="bloc-start"
                  className="tabular-nums"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bloc-end">End date</Label>
                <Input
                  id="bloc-end"
                  className="tabular-nums"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
            {editError && <p className="text-destructive text-sm">{editError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditBloc(null)
                setEditError(null)
              }}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitEdit()} disabled={updateMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rangeConfirmOpen} onOpenChange={(open) => !open && setRangeConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{rangeConfirmTitle}</DialogTitle>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {rangeConfirmLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {editError && <p className="text-destructive text-sm">{editError}</p>}
          <p className="text-sm font-medium text-foreground">Apply this change?</p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRangeConfirmOpen(false)}
              disabled={updateMutation.isPending}
            >
              Back
            </Button>
            <Button type="button" onClick={() => applyUpdate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Applying…' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteBloc != null}
        onOpenChange={(open) => {
          if (!open) closeDeleteConfirm()
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!deleteMutation.isPending}
          onPointerDownOutside={(e) => {
            if (deleteMutation.isPending) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (deleteMutation.isPending) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>{deleteConfirmTitle}</DialogTitle>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {deleteConfirmLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteBloc && deleteMutation.mutate(deleteBloc.id)}
              disabled={deleteMutation.isPending}
              aria-label="Confirm delete shooting bloc"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
