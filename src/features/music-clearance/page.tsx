import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { musicArchiveTutorialSteps } from '@/features/tutorial/sections/musicArchiveTutorial'
import {
  listMusicTracksByProduction,
  createMusicTrack,
  updateMusicTrack,
  type ListMusicTracksOptions,
} from '@/lib/db/repositories/music-clearance'
import { getProductionById } from '@/lib/db/repositories/production'
import { listEpisodesForProductionManagement } from '@/lib/db/repositories/episodes'
import { generateCueSheet } from '@/lib/pdf'
import { saveFileWithDialog } from '@/lib/files'
import { createCueSheet } from '@/lib/db/repositories/music-clearance'
import { persistProductionDocument, documentsQueryKey } from '@/lib/documents/persistDocument'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import type { MusicTrack } from '@/lib/db/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
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
import { Pencil, Plus } from 'lucide-react'

const SCOPE_PROJECT = '__project_wide__'
const FILTER_ALL = '__filter_all__'

function scopeSelectValueFromTrack(track: MusicTrack): string {
  return track.episode_id?.trim() ? track.episode_id : SCOPE_PROJECT
}

function listOptsFromFilterValue(v: string): ListMusicTracksOptions | undefined {
  if (v === FILTER_ALL) return { filter: 'all' }
  if (v === SCOPE_PROJECT) return { filter: 'project_wide' }
  const tid = v.trim()
  if (!tid) return { filter: 'all' }
  return { filter: 'episode', episodeId: tid }
}

export function MusicClearancePage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const isEpisodic = currentProduction?.is_episodic === true
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [addTrackOpen, setAddTrackOpen] = useState(false)
  const [editTrackOpen, setEditTrackOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [publisher, setPublisher] = useState('')
  const [scopeForAdd, setScopeForAdd] = useState(SCOPE_PROJECT)
  const [scopeForEdit, setScopeForEdit] = useState(SCOPE_PROJECT)
  const [listFilter, setListFilter] = useState(FILTER_ALL)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (progress?.currentSection === 'music_archive') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

  useEffect(() => {
    if (!isEpisodic) {
      setListFilter(FILTER_ALL)
      setScopeForAdd(SCOPE_PROJECT)
    }
  }, [isEpisodic])

  useEffect(() => {
    setListFilter(FILTER_ALL)
    setScopeForAdd(SCOPE_PROJECT)
  }, [currentProductionId])

  const { data: production } = useQuery({
    queryKey: ['production', currentProductionId],
    queryFn: () => getProductionById(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: episodesForLabels = [] } = useQuery({
    queryKey: ['episodes-management', currentProductionId],
    queryFn: () => listEpisodesForProductionManagement(currentProductionId!),
    enabled: !!currentProductionId && isEpisodic,
  })

  const activeEpisodes = useMemo(
    () => episodesForLabels.filter((e) => e.deleted_at == null),
    [episodesForLabels]
  )

  const episodeLabelById = useMemo(
    () => new Map(episodesForLabels.map((e) => [e.id, e] as const)),
    [episodesForLabels]
  )

  const listQueryOpts = useMemo(
    () => (isEpisodic ? listOptsFromFilterValue(listFilter) : undefined),
    [isEpisodic, listFilter]
  )

  const { data: tracks = [] } = useQuery({
    queryKey: ['music-tracks', currentProductionId, listQueryOpts],
    queryFn: () => listMusicTracksByProduction(currentProductionId ?? '', listQueryOpts),
    enabled: !!currentProductionId,
  })

  const { data: allTracksForCue = [] } = useQuery({
    queryKey: ['music-tracks', currentProductionId, 'cue-eligible'],
    queryFn: () => listMusicTracksByProduction(currentProductionId ?? '', { filter: 'all' }),
    enabled: !!currentProductionId,
  })

  const invalidateTracks = () => {
    queryClient.invalidateQueries({ queryKey: ['music-tracks'] })
  }

  const createTrackMutation = useMutation({
    mutationFn: () => {
      const episode_id = scopeForAdd === SCOPE_PROJECT ? null : scopeForAdd
      if (isEpisodic && episode_id && !activeEpisodes.some((e) => e.id === episode_id)) {
        return Promise.reject(new Error('Choose an active episode or Project-wide.'))
      }
      return createMusicTrack({
        production_id: currentProductionId!,
        title,
        artist: artist || null,
        publisher_label: publisher || null,
        episode_id,
      })
    },
    onSuccess: () => {
      invalidateTracks()
      setAddTrackOpen(false)
      setTitle('')
      setArtist('')
      setPublisher('')
      setScopeForAdd(SCOPE_PROJECT)
    },
  })

  const updateTrackMutation = useMutation({
    mutationFn: () => {
      if (!editingTrack) return Promise.reject(new Error('No track'))
      const episode_id = scopeForEdit === SCOPE_PROJECT ? null : scopeForEdit
      if (isEpisodic && episode_id && !activeEpisodes.some((e) => e.id === episode_id)) {
        return Promise.reject(new Error('Choose an active episode or Project-wide.'))
      }
      return updateMusicTrack(editingTrack.id, {
        title,
        artist: artist || null,
        publisher_label: publisher || null,
        episode_id,
      })
    },
    onSuccess: () => {
      invalidateTracks()
      setEditTrackOpen(false)
      setEditingTrack(null)
    },
  })

  const openEdit = (t: MusicTrack) => {
    setEditingTrack(t)
    setTitle(t.title)
    setArtist(t.artist ?? '')
    setPublisher(t.publisher_label ?? '')
    setScopeForEdit(scopeSelectValueFromTrack(t))
    setEditTrackOpen(true)
  }

  useEffect(() => {
    if (!editTrackOpen) {
      setEditingTrack(null)
    }
  }, [editTrackOpen])

  const generateCueSheetMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId || !production) return
      const allTracks = await listMusicTracksByProduction(currentProductionId)
      const rows = allTracks.map((t) => ({
        title: t.title,
        artist: t.artist,
        publisher: t.publisher_label,
      }))
      const pdfBytes = await generateCueSheet(production.name, rows)
      const fileName = `cue-sheet-${new Date().toISOString().slice(0, 10)}.pdf`
      const bytes = new Uint8Array(pdfBytes)
      const { documentId } = await persistProductionDocument({
        productionId: currentProductionId,
        fileName,
        bytes,
        mimeType: 'application/pdf',
        entityType: DOCUMENT_ENTITY_TYPES.cueSheet,
      })
      await createCueSheet(currentProductionId, documentId)
      await saveFileWithDialog(
        {
          defaultPath: fileName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Export a copy of cue sheet',
        },
        bytes
      )
    },
    onSuccess: () => {
      if (currentProductionId) {
        void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      }
    },
  })

  const scopeCellText = (t: MusicTrack) => {
    if (!t.episode_id) return 'Project-wide'
    const ep = episodeLabelById.get(t.episode_id)
    if (!ep) return 'Unknown episode'
    return ep.deleted_at ? `${ep.name} (archived)` : ep.name
  }

  const addCanSubmit =
    title.trim() &&
    (!isEpisodic ||
      scopeForAdd === SCOPE_PROJECT ||
      (scopeForAdd !== SCOPE_PROJECT && activeEpisodes.some((e) => e.id === scopeForAdd)))

  const archivedEpisodeIdForEdit =
    editingTrack?.episode_id &&
    !activeEpisodes.some((e) => e.id === editingTrack.episode_id)
      ? editingTrack.episode_id
      : null

  const editCanSubmit =
    editingTrack &&
    title.trim() &&
    (!isEpisodic ||
      scopeForEdit === SCOPE_PROJECT ||
      activeEpisodes.some((e) => e.id === scopeForEdit) ||
      (!!archivedEpisodeIdForEdit && scopeForEdit === archivedEpisodeIdForEdit))

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Music & Archive Clearance</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Music & Archive Clearance</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isEpisodic && (
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground whitespace-nowrap text-sm">Show</Label>
              <Select value={listFilter} onValueChange={setListFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All tracks</SelectItem>
                  <SelectItem value={SCOPE_PROJECT}>Project-wide</SelectItem>
                  {activeEpisodes.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => generateCueSheetMutation.mutate()}
            disabled={allTracksForCue.length === 0 || generateCueSheetMutation.isPending}
          >
            Generate cue sheet PDF
          </Button>
          <Dialog
            open={addTrackOpen}
            onOpenChange={(open) => {
              setAddTrackOpen(open)
              if (open) {
                setScopeForAdd(SCOPE_PROJECT)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                Add track
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New music track</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {isEpisodic && (
                  <div>
                    <Label className="py-2">Applies to</Label>
                    <Select value={scopeForAdd} onValueChange={setScopeForAdd}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SCOPE_PROJECT}>Project-wide</SelectItem>
                        {activeEpisodes.map((ep) => (
                          <SelectItem key={ep.id} value={ep.id}>
                            {ep.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Project-wide assets are not tied to a single episode.
                    </p>
                  </div>
                )}
                <div>
                  <Label className="py-2">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label className="py-2">Artist</Label>
                  <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
                <div>
                  <Label className="py-2">Publisher / Label</Label>
                  <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddTrackOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createTrackMutation.mutate()}
                  disabled={!addCanSubmit || createTrackMutation.isPending}
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead>Publisher / Label</TableHead>
              {isEpisodic && <TableHead className="w-[180px]">Scope</TableHead>}
              <TableHead className="w-[80px] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.title}</TableCell>
                <TableCell>{t.artist ?? '—'}</TableCell>
                <TableCell>{t.publisher_label ?? '—'}</TableCell>
                {isEpisodic && <TableCell className="text-muted-foreground text-sm">{scopeCellText(t)}</TableCell>}
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => openEdit(t)}
                    aria-label={`Edit ${t.title}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={editTrackOpen} onOpenChange={setEditTrackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit music track</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isEpisodic && (
              <div>
                <Label className="py-2">Applies to</Label>
                <Select value={scopeForEdit} onValueChange={setScopeForEdit}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SCOPE_PROJECT}>Project-wide</SelectItem>
                    {activeEpisodes.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        {ep.name}
                      </SelectItem>
                    ))}
                    {archivedEpisodeIdForEdit && (
                      <SelectItem value={archivedEpisodeIdForEdit}>
                        {scopeCellText(editingTrack!)} (current)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {editingTrack?.episode_id &&
                  episodeLabelById.get(editingTrack.episode_id)?.deleted_at != null &&
                  scopeForEdit === editingTrack.episode_id && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      This track is assigned to an archived episode. Choose Project-wide or an active episode to
                      reassign.
                    </p>
                  )}
              </div>
            )}
            <div>
              <Label className="py-2">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="py-2">Artist</Label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div>
              <Label className="py-2">Publisher / Label</Label>
              <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTrackOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateTrackMutation.mutate()}
              disabled={!editCanSubmit || updateTrackMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {tracks.length === 0 && (
        <p className="text-muted-foreground">
          {isEpisodic && listFilter !== FILTER_ALL
            ? 'No tracks match this filter.'
            : 'Add music tracks to build a cue sheet.'}
        </p>
      )}
      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'music_archive' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                music_archive:
                  prev.sections.music_archive === 'not_started'
                    ? 'in_progress'
                    : prev.sections.music_archive,
              },
            }))
          }
        }}
        sectionId="music_archive"
        sectionTitle="Music & Archive"
        steps={musicArchiveTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'music_archive' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              music_archive: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}
