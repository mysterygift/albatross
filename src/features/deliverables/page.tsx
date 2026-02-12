import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listDeliverablesByProduction,
  createDeliverable,
  getTechnicalSpecByDeliverable,
  upsertTechnicalSpec,
} from '@/lib/db/repositories/deliverable'
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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Settings } from 'lucide-react'
import { useEffect } from 'react'

export function DeliverablesPage() {
  const { currentProductionId } = useCurrentProduction()
  const [open, setOpen] = useState(false)
  const [specDeliverableId, setSpecDeliverableId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const queryClient = useQueryClient()

  const { data: deliverables = [] } = useQuery({
    queryKey: ['deliverables', currentProductionId],
    queryFn: () => listDeliverablesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createDeliverable({
        production_id: currentProductionId!,
        name,
        due_date: dueDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      setOpen(false)
      setName('')
      setDueDate('')
    },
  })

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Deliverables</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Deliverables</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 size-4" />Add deliverable</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New deliverable</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Specs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliverables.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.name}</TableCell>
                <TableCell>{d.due_date ?? '—'}</TableCell>
                <TableCell>{d.status}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setSpecDeliverableId(d.id)}>
                    <Settings className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {specDeliverableId && (
        <TechnicalSpecsPanel
          deliverableId={specDeliverableId}
          onClose={() => setSpecDeliverableId(null)}
        />
      )}
    </div>
  )
}

function TechnicalSpecsPanel({ deliverableId, onClose }: { deliverableId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: spec } = useQuery({
    queryKey: ['technical-spec', deliverableId],
    queryFn: () => getTechnicalSpecByDeliverable(deliverableId),
    enabled: !!deliverableId,
  })
  const [resolution, setResolution] = useState('')
  const [codec, setCodec] = useState('')
  const [notes, setNotes] = useState('')
  useEffect(() => {
    setResolution(spec?.resolution ?? '')
    setCodec(spec?.codec ?? '')
    setNotes(spec?.notes ?? '')
  }, [spec])

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertTechnicalSpec(deliverableId, { resolution: resolution || null, codec: codec || null, notes: notes || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technical-spec', deliverableId] })
    },
  })

  return (
    <Dialog open={!!deliverableId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Technical specs</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Resolution</Label>
            <Input value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <div>
            <Label>Codec</Label>
            <Input value={codec} onChange={(e) => setCodec(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
