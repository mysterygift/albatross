import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listMusicTracksByProduction,
  createMusicTrack,
} from '@/lib/db/repositories/music-clearance'
import { getProductionById } from '@/lib/db/repositories/production'
import { generateCueSheet } from '@/lib/pdf'
import { saveFileWithDialog } from '@/lib/files'
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
import { Plus } from 'lucide-react'

export function MusicClearancePage() {
  const { currentProductionId } = useCurrentProduction()
  const [addTrackOpen, setAddTrackOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [publisher, setPublisher] = useState('')
  const queryClient = useQueryClient()

  const { data: production } = useQuery({
    queryKey: ['production', currentProductionId],
    queryFn: () => getProductionById(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: tracks = [] } = useQuery({
    queryKey: ['music-tracks', currentProductionId],
    queryFn: () => listMusicTracksByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createTrackMutation = useMutation({
    mutationFn: () =>
      createMusicTrack({
        production_id: currentProductionId!,
        title,
        artist: artist || null,
        publisher_label: publisher || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music-tracks'] })
      setAddTrackOpen(false)
      setTitle('')
      setArtist('')
      setPublisher('')
    },
  })

  const generateCueSheetMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId || !production) return
      const rows = tracks.map((t) => ({
        title: t.title,
        artist: t.artist,
        publisher: t.publisher_label,
      }))
      const pdfBytes = await generateCueSheet(production.name, rows)
      const fileName = `cue-sheet-${new Date().toISOString().slice(0, 10)}.pdf`
      await saveFileWithDialog(
        {
          defaultPath: fileName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Save cue sheet',
        },
        new Uint8Array(pdfBytes)
      )
    },
  })

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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => generateCueSheetMutation.mutate()}
            disabled={tracks.length === 0 || generateCueSheetMutation.isPending}
          >
            Generate cue sheet PDF
          </Button>
          <Dialog open={addTrackOpen} onOpenChange={setAddTrackOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 size-4" />Add track</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New music track</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Artist</Label>
                  <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
                <div>
                  <Label>Publisher / Label</Label>
                  <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddTrackOpen(false)}>Cancel</Button>
                <Button onClick={() => createTrackMutation.mutate()} disabled={!title.trim() || createTrackMutation.isPending}>Add</Button>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.title}</TableCell>
                <TableCell>{t.artist ?? '—'}</TableCell>
                <TableCell>{t.publisher_label ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {tracks.length === 0 && (
        <p className="text-muted-foreground">Add music tracks to build a cue sheet.</p>
      )}
    </div>
  )
}
