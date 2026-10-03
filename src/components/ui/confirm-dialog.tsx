import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onConfirm()
    } catch {
      // Keep the dialog open; the caller is responsible for surfacing the error.
      setPending(false)
      return
    }
    setPending(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent showCloseButton={false} {...(description ? {} : { 'aria-describedby': undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'>

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): { confirm: (opts: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
  }, [])

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false)
        resolveRef.current = resolve
        setOpts(next)
      }),
    []
  )

  const dialog = opts ? (
    <ConfirmDialog
      {...opts}
      open
      onOpenChange={(open) => {
        if (!open) {
          settle(false)
          setOpts(null)
        }
      }}
      onConfirm={() => {
        settle(true)
      }}
    />
  ) : null

  return { confirm, dialog }
}
