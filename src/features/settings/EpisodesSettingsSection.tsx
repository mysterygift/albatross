import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  appendEpisode,
  archiveEpisode,
  deleteEpisodeClearingReferences,
  loadEpisodesForSettings,
  renameEpisode,
  reorderEpisodes,
} from '@/lib/db/episodeManagementService'
import type { Episode } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Archive, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'

type Props = { productionId: string }

type ConfirmAction =
  | null
  | { type: 'archive'; episodeId: string; episodeName: string }
  | {
      type: 'delete'
      episodeId: string
      episodeName: string
      isArchived: boolean
    }

export function EpisodesSettingsSection({ productionId }: Props) {
  const queryClient = useQueryClient()
  const qk = ['episodes-management', productionId] as const

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => loadEpisodesForSettings(productionId),
  })

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [editEpisode, setEditEpisode] = useState<Episode | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const appendMutation = useMutation({
    mutationFn: (name: string) => appendEpisode(productionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk })
      setAddOpen(false)
      setAddName('')
      setAddError(null)
    },
    onError: (err) => {
      setAddError(err instanceof Error ? err.message : 'Could not add episode')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameEpisode(productionId, id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk })
      setEditEpisode(null)
      setEditName('')
      setEditError(null)
    },
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : 'Could not rename episode')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderEpisodes(productionId, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveEpisode(productionId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk })
      setConfirmAction(null)
    },
    onError: (err) => {
      setConfirmError(err instanceof Error ? err.message : 'Could not archive episode')
    },
  })

  const deleteEpisodeMutation = useMutation({
    mutationFn: (id: string) => deleteEpisodeClearingReferences(productionId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk })
      void queryClient.invalidateQueries({ queryKey: ['episodes', productionId] })
      void queryClient.invalidateQueries({ queryKey: ['episodes-management', productionId] })
      void queryClient.invalidateQueries({ queryKey: ['scenes', productionId] })
      void queryClient.invalidateQueries({ queryKey: ['stripboard', productionId] })
      void queryClient.invalidateQueries({ queryKey: ['music-tracks', productionId] })
      void queryClient.invalidateQueries({ queryKey: ['deliverables', productionId] })
      setConfirmAction(null)
    },
    onError: (err) => {
      setConfirmError(err instanceof Error ? err.message : 'Could not delete episode')
    },
  })

  const activeInOrder = episodes.filter((e) => e.deleted_at == null)

  const moveActive = (episodeId: string, direction: 'up' | 'down') => {
    const ids = activeInOrder.map((e) => e.id)
    const idx = ids.indexOf(episodeId)
    if (idx < 0) return
    const j = direction === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= ids.length) return
    const next = [...ids]
    ;[next[idx], next[j]] = [next[j]!, next[idx]!]
    reorderMutation.mutate(next)
  }

  const openAdd = () => {
    setAddError(null)
    setAddName('')
    setAddOpen(true)
  }

  const submitAdd = () => {
    setAddError(null)
    const trimmed = addName.trim()
    if (!trimmed) {
      setAddError('Enter an episode name')
      return
    }
    appendMutation.mutate(trimmed)
  }

  const openEdit = (ep: Episode) => {
    setEditError(null)
    setEditName(ep.name)
    setEditEpisode(ep)
  }

  const submitEdit = () => {
    if (!editEpisode) return
    setEditError(null)
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditError('Enter an episode name')
      return
    }
    renameMutation.mutate({ id: editEpisode.id, name: trimmed })
  }

  const openArchiveConfirm = (ep: Episode) => {
    setConfirmError(null)
    setConfirmAction({ type: 'archive', episodeId: ep.id, episodeName: ep.name })
  }

  const openDeleteConfirm = (ep: Episode, isArchived: boolean) => {
    if (!isArchived && activeInOrder.length <= 1) return
    setConfirmError(null)
    setConfirmAction({
      type: 'delete',
      episodeId: ep.id,
      episodeName: ep.name,
      isArchived,
    })
  }

  const confirmPending = archiveMutation.isPending || deleteEpisodeMutation.isPending

  const closeConfirm = () => {
    if (confirmPending) return
    setConfirmAction(null)
    setConfirmError(null)
  }

  const submitArchiveConfirm = () => {
    if (confirmAction?.type !== 'archive') return
    setConfirmError(null)
    archiveMutation.mutate(confirmAction.episodeId)
  }

  const submitDeleteConfirm = () => {
    if (confirmAction?.type !== 'delete') return
    setConfirmError(null)
    deleteEpisodeMutation.mutate(confirmAction.episodeId)
  }

  return (
    <div className="space-y-3 border-t pt-4 mt-1">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Episodes</h3>
          <p className="text-muted-foreground text-xs">
            Order is used across schedule, call sheets, and deliveries as those features adopt episodes.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openAdd} className="shrink-0">
          <Plus className="mr-1.5 size-4" />
          Add episode
        </Button>
      </div>

      {activeInOrder.length === 0 && !isLoading && (
        <p className="text-amber-700 dark:text-amber-200 text-sm rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2">
          This production has no active episodes. Add one to continue.
        </p>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading episodes…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[56px]">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {episodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-sm">
                    No episodes yet.
                  </TableCell>
                </TableRow>
              ) : (
                episodes.map((ep, index) => {
                  const isArchived = ep.deleted_at != null
                  const activeIndex = isArchived ? -1 : activeInOrder.findIndex((a) => a.id === ep.id)
                  return (
                    <TableRow
                      key={ep.id}
                      className={isArchived ? 'bg-muted/40 text-muted-foreground' : undefined}
                    >
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <span className={isArchived ? 'line-through decoration-muted-foreground/50' : ''}>
                          {ep.name}
                        </span>
                        {isArchived && (
                          <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Archived
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isArchived && (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={deleteEpisodeMutation.isPending}
                              onClick={() => openDeleteConfirm(ep, true)}
                              aria-label="Delete archived episode"
                              title="Delete this archived episode permanently"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                        {!isArchived && (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={reorderMutation.isPending || activeIndex <= 0}
                              onClick={() => moveActive(ep.id, 'up')}
                              aria-label="Move up"
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                reorderMutation.isPending || activeIndex >= activeInOrder.length - 1
                              }
                              onClick={() => moveActive(ep.id, 'down')}
                              aria-label="Move down"
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={renameMutation.isPending}
                              onClick={() => openEdit(ep)}
                              aria-label="Rename"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                archiveMutation.isPending || activeInOrder.length <= 1
                              }
                              onClick={() => openArchiveConfirm(ep)}
                              aria-label="Archive"
                              title={
                                activeInOrder.length <= 1
                                  ? 'Cannot archive the last active episode'
                                  : undefined
                              }
                            >
                              <Archive className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={
                                deleteEpisodeMutation.isPending || activeInOrder.length <= 1
                              }
                              onClick={() => openDeleteConfirm(ep, false)}
                              aria-label="Delete episode"
                              title={
                                activeInOrder.length <= 1
                                  ? 'Cannot delete the last active episode'
                                  : 'Delete episode and unassign linked scenes, tracks, and deliverables'
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={confirmAction != null}
        onOpenChange={(open) => {
          if (!open) closeConfirm()
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!confirmPending}
          onEscapeKeyDown={(e) => {
            if (confirmPending) e.preventDefault()
          }}
        >
          {confirmAction?.type === 'archive' ? (
            <>
              <DialogHeader>
                <DialogTitle>Archive &quot;{confirmAction.episodeName}&quot;?</DialogTitle>
                <DialogDescription>
                  Archived episodes stay on file but won&apos;t appear in active lists. You can permanently delete
                  them later from this table.
                </DialogDescription>
              </DialogHeader>
              {confirmError && <p className="text-destructive text-sm">{confirmError}</p>}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={closeConfirm} disabled={confirmPending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={submitArchiveConfirm}
                  disabled={confirmPending}
                  aria-label="Confirm archive"
                >
                  {archiveMutation.isPending ? 'Archiving…' : 'Archive'}
                </Button>
              </DialogFooter>
            </>
          ) : confirmAction?.type === 'delete' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmAction.isArchived ? 'Delete archived episode?' : 'Delete episode?'}
                </DialogTitle>
                <DialogDescription>
                  {confirmAction.isArchived
                    ? `Permanently remove "${confirmAction.episodeName}" from this production. This cannot be undone.`
                    : `Remove "${confirmAction.episodeName}" from this production. Scenes, music tracks, and deliverables assigned to this episode will have no episode until you assign them again. This cannot be undone.`}
                </DialogDescription>
              </DialogHeader>
              {confirmError && <p className="text-destructive text-sm">{confirmError}</p>}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={closeConfirm} disabled={confirmPending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={submitDeleteConfirm}
                  disabled={confirmPending}
                  aria-label="Confirm delete episode"
                >
                  {deleteEpisodeMutation.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) {
            setAddName('')
            setAddError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="episode-add-name">Name</Label>
            <Input
              id="episode-add-name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Episode 2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAdd()
              }}
            />
            {addError && <p className="text-destructive text-sm">{addError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={appendMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitAdd}
              disabled={appendMutation.isPending || !addName.trim()}
            >
              {appendMutation.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editEpisode != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditEpisode(null)
            setEditName('')
            setEditError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="episode-edit-name">Name</Label>
            <Input
              id="episode-edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitEdit()
              }}
            />
            {editError && <p className="text-destructive text-sm">{editError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditEpisode(null)
                setEditError(null)
              }}
              disabled={renameMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitEdit}
              disabled={renameMutation.isPending || !editName.trim()}
            >
              {renameMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
