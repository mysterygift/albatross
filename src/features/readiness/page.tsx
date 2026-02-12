import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listChecklistByProduction,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from '@/lib/db/repositories/checklist'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

export function ReadinessPage() {
  const { currentProductionId } = useCurrentProduction()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const queryClient = useQueryClient()

  const { data: items = [] } = useQuery({
    queryKey: ['checklist', currentProductionId],
    queryFn: () => listChecklistByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createChecklistItem({
        production_id: currentProductionId!,
        title,
        is_required: isRequired ? 1 : 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist'] })
      setOpen(false)
      setTitle('')
      setIsRequired(true)
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'pending' | 'complete' }) =>
      updateChecklistItem(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChecklistItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist'] }),
  })

  const complete = items.filter((i) => i.status === 'complete').length
  const total = items.length
  const score = total === 0 ? 100 : Math.round((complete / total) * 100)

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Readiness Checklist</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Readiness Checklist</h1>
        <div className="flex items-center gap-4">
          <Badge variant="secondary">Score: {score}%</Badge>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 size-4" />Add item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New checklist item</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Budget approved" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={isRequired} onCheckedChange={(v) => setIsRequired(!!v)} />
                  <Label>Required</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.is_required ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: item.id,
                        status: item.status === 'complete' ? 'pending' : 'complete',
                      })
                    }
                  >
                    {item.status === 'complete' ? 'Complete' : 'Pending'}
                  </Button>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
