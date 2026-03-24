import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  appendEpisode,
  archiveEpisode,
  getEpisodeHardDeleteEligibility,
  hardDeleteArchivedEpisode,
  loadEpisodesForSettings,
  renameEpisode,
  reorderEpisodes,
} from '@/lib/db/episodeManagementService'
import type { Episode } from '@/lib/db/types'
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
import { Archive, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'

type Props = { productionId: string }

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: (err) => {
      window.alert(err instanceof Error ? err.message : 'Could not archive episode')
    },
  })

  const archivedIds = useMemo(
    () => episodes.filter((e) => e.deleted_at != null).map((e) => e.id),
    [episodes]
  )
  const archivedIdsKey = archivedIds.slice().sort().join(',')

  const { data: hardDeleteEligibilityById = {} } = useQuery({
    queryKey: ['episode-hard-delete-eligibility', productionId, archivedIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        archivedIds.map(async (id) => {
          const el = await getEpisodeHardDeleteEligibility(productionId, id)
          return [id, el] as const
        })
      )
      return Object.fromEntries(entries)
    },
    enabled: archivedIds.length > 0,
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => hardDeleteArchivedEpisode(productionId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk })
      queryClient.invalidateQueries({ queryKey: ['episode-hard-delete-eligibility', productionId] })
      queryClient.invalidateQueries({ queryKey: ['episodes', productionId] })
      queryClient.invalidateQueries({ queryKey: ['episodes-management', productionId] })
    },
    onError: (err) => {
      window.alert(err instanceof Error ? err.message : 'Could not delete episode')
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

  const confirmArchive = (ep: Episode) => {
    if (
      !window.confirm(
        `Archive "${ep.name}"? Archived episodes stay on file but won’t appear in active lists.`
      )
    ) {
      return
    }
    archiveMutation.mutate(ep.id)
  }

  const confirmHardDelete = (ep: Episode) => {
    const el = hardDeleteEligibilityById[ep.id]
    if (el && !el.allowed) {
      window.alert(el.reason)
      return
    }
    if (
      !window.confirm(
        `Permanently delete "${ep.name}"? This cannot be undone. Only use when the episode has no scenes, music tracks, or deliverables.`
      )
    ) {
      return
    }
    hardDeleteMutation.mutate(ep.id)
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
                            {(() => {
                              const el = hardDeleteEligibilityById[ep.id]
                              const allowed = el?.allowed === true
                              const title =
                                el && !el.allowed
                                  ? el.reason
                                  : allowed
                                    ? 'Delete this archived episode permanently'
                                    : 'Checking whether delete is allowed…'
                              return (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  disabled={hardDeleteMutation.isPending || (el != null && !allowed)}
                                  onClick={() => confirmHardDelete(ep)}
                                  aria-label="Delete permanently"
                                  title={title}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )
                            })()}
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
                              onClick={() => confirmArchive(ep)}
                              aria-label="Archive"
                              title={
                                activeInOrder.length <= 1
                                  ? 'Cannot archive the last active episode'
                                  : undefined
                              }
                            >
                              <Archive className="size-4" />
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
