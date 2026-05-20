'use client'

import type { Person } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type PersonDeleteConfirmDialogProps = {
  open: boolean
  person: Person | null
  kind: 'crew' | 'cast'
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending?: boolean
}

export function PersonDeleteConfirmDialog({
  open,
  person,
  kind,
  onOpenChange,
  onConfirm,
  isPending = false,
}: PersonDeleteConfirmDialogProps) {
  const title = kind === 'cast' ? 'Delete cast member' : 'Delete crew member'
  const description =
    kind === 'cast' ? (
      <>
        Remove <span className="font-medium text-foreground">{person?.name}</span> from this
        production? They will be removed from Cast Manager, scene and shot participation, and
        bookings. Shots and scenes are kept; only this person&apos;s links are removed.
      </>
    ) : (
      <>
        Remove <span className="font-medium text-foreground">{person?.name}</span> from this
        production? They will be removed from Crew Manager and bookings. Departmental tasks are
        not tied to individual crew records and will not be deleted.
      </>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {person && (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{description}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
                {isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
