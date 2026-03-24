import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { describeShootingBlocRangeChange } from '@/lib/db/shootingBlocAssociation'
import {
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
import { Pencil } from 'lucide-react'
import { stripboardQueryKeys } from '@/features/schedule/stripboard-hooks'

type Props = { productionId: string }

export function ShootingBlocsSettingsSection({ productionId }: Props) {
  const queryClient = useQueryClient()
  const qk = ['shooting-blocs', productionId] as const

  const { data: blocs = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => listShootingBlocsByProduction(productionId),
  })

  const [editBloc, setEditBloc] = useState<ShootingBloc | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [rangeConfirmOpen, setRangeConfirmOpen] = useState(false)
  const [rangeConfirmLines, setRangeConfirmLines] = useState<string[]>([])
  const [rangeConfirmTitle, setRangeConfirmTitle] = useState('')

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; name: string; start_date: string; end_date: string }) =>
      updateShootingBloc(args.id, {
        name: args.name,
        start_date: args.start_date,
        end_date: args.end_date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk })
      queryClient.invalidateQueries({ queryKey: ['shoot-days', productionId] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
      setEditBloc(null)
      setRangeConfirmOpen(false)
      setEditError(null)
    },
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : 'Could not update shooting bloc')
    },
  })

  const openEdit = (b: ShootingBloc) => {
    setEditError(null)
    setEditBloc(b)
    setEditName(b.name)
    setEditStart(b.start_date)
    setEditEnd(b.end_date)
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

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Shooting blocs</h3>
        <p className="text-muted-foreground text-xs">
          Calendar spans for episodic schedule blocks. Changing dates may shift or remove shoot days—confirmation is required.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading blocs…</p>
      ) : blocs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No shooting blocs yet. They are created when you enable episodic data or import a project.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="whitespace-nowrap">Start</TableHead>
                <TableHead className="whitespace-nowrap">End</TableHead>
                <TableHead className="w-[100px] text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocs.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground text-sm">{b.start_date}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground text-sm">{b.end_date}</TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
    </div>
  )
}
