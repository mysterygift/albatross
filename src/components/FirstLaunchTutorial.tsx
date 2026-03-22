import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type FirstLaunchTutorialProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export function FirstLaunchTutorial({ open, onOpenChange, onComplete }: FirstLaunchTutorialProps) {
  const handleComplete = () => {
    onComplete()
    onOpenChange(false)
  }

  const handleSkip = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-zinc-700 bg-zinc-900 text-foreground shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Welcome to Albatross</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Get a quick overview of how Albatross keeps your production on track. You can revisit
            these areas any time from the navigation on the left.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-md border border-zinc-700 bg-zinc-800/70 p-3">
            <p className="font-medium text-foreground">Dashboard</p>
            <p className="text-xs text-muted-foreground">
              See the high-level status of your production, key tasks, and upcoming milestones.
            </p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-800/70 p-3">
            <p className="font-medium text-foreground">Schedule</p>
            <p className="text-xs text-muted-foreground">
              Plan shoot days, manage stripboards, and coordinate shot lists from a single place.
            </p>
          </div>
          <div className="rounded-md border border-zinc-700 bg-zinc-800/70 p-3">
            <p className="font-medium text-foreground">Budget & People</p>
            <p className="text-xs text-muted-foreground">
              Track spend against budget, manage vendors, and keep cast and crew details organised.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="border-zinc-600 text-sm"
          >
            Skip for now
          </Button>
          <Button
            onClick={handleComplete}
            className="text-sm"
          >
            Get started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

