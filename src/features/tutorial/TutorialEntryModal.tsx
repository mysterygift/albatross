import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type TutorialEntryModalProps = {
  open: boolean
  isPreparing: boolean
  error: string | null
  onStartTutorial: () => void
  onSkipForNow: () => void
  onOpenChange: (open: boolean) => void
}

export function TutorialEntryModal({
  open,
  isPreparing,
  error,
  onStartTutorial,
  onSkipForNow,
  onOpenChange,
}: TutorialEntryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-zinc-700 bg-zinc-900 text-foreground shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold">Welcome to Albatross</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Albatross includes a demo production so you can safely explore core workflows like scheduling, budgeting,
            crew and cast management, and equipment.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-800/50 p-3 text-sm">
          <p className="font-medium text-foreground">A guided tour, when you’re ready</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is just the entry point. You can start now, or skip and explore the app normally.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </p>
        )}

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onSkipForNow}
            className="border-zinc-600 text-sm"
            disabled={isPreparing}
          >
            Skip for now
          </Button>
          <Button onClick={onStartTutorial} className="text-sm" disabled={isPreparing}>
            {isPreparing ? 'Preparing tutorial…' : 'Start Tutorial'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

