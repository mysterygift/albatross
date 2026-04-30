import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { createBooking, deleteBooking } from '@/lib/db/repositories/booking'
import { getDb } from '@/lib/db/client'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import {
  createBookingForActor,
  deleteBookingForActor,
  listBookingsByProductionForActor,
  listPeopleByProductionForActor,
  listShootDaysByProductionForActor,
} from '@/lib/access/projectDomainService'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

export function BookingsPage() {
  const { currentProductionId } = useCurrentProduction()
  const authSession = useAuthSession()
  const [open, setOpen] = useState(false)
  const [personId, setPersonId] = useState('')
  const [shootDayId, setShootDayId] = useState('')
  const queryClient = useQueryClient()

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listBookingsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listPeopleByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listPeopleByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
        })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createBookingForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId!,
          personId,
          shootDayId: shootDayId || null,
        })
      }
      return createBooking({
        production_id: currentProductionId!,
        person_id: personId,
        shoot_day_id: shootDayId || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setOpen(false)
      setPersonId('')
      setShootDayId('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return deleteBookingForActor({
          db,
          actor: authSession.currentUser,
          bookingId,
        })
      }
      return deleteBooking(bookingId)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  })

  const getPersonName = (id: string) => people.find((p) => p.id === id)?.name ?? '—'
  const getDayLabel = (id: string | null) =>
    id ? shootDays.find((d) => d.id === id)?.shoot_date ?? '—' : '—'

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 size-4" />Add booking</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign person to shoot day</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Person</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Shoot day</Label>
                <Select value={shootDayId} onValueChange={setShootDayId}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {shootDays.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.shoot_date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!personId || createMutation.isPending}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Shoot day</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{getPersonName(b.person_id)}</TableCell>
                <TableCell>{getDayLabel(b.shoot_day_id)}</TableCell>
                <TableCell>{b.role ?? '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(b.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
