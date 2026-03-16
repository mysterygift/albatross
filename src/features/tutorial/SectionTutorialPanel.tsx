import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { FirstLaunchTutorialProgress } from './progress'
import type { TutorialSectionId } from './tutorialSections'

export type TutorialStep = {
  id: string
  title: string
  body: string
}

type SectionTutorialPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionId: TutorialSectionId
  sectionTitle: string
  steps: TutorialStep[]
  progress: FirstLaunchTutorialProgress | null
  updateProgress: (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => void
  onCompleteSection: () => void
}

export function SectionTutorialPanel({
  open,
  onOpenChange,
  sectionId,
  sectionTitle,
  steps,
  progress,
  updateProgress,
  onCompleteSection,
}: SectionTutorialPanelProps) {
  const totalSteps = steps.length
  const currentIndex =
    (progress?.sectionSteps && progress.sectionSteps[sectionId] !== undefined
      ? progress.sectionSteps[sectionId]
      : 0) ?? 0
  const clampedIndex = Math.min(Math.max(currentIndex, 0), Math.max(0, totalSteps - 1))
  const step = steps[clampedIndex]

  const handleStepChange = (nextIndex: number) => {
    updateProgress((prev) => ({
      ...prev,
      sectionSteps: {
        ...(prev.sectionSteps ?? {}),
        [sectionId]: nextIndex,
      },
    }))
  }

  const handleNext = () => {
    if (clampedIndex < totalSteps - 1) {
      handleStepChange(clampedIndex + 1)
    }
  }

  const handleBack = () => {
    if (clampedIndex > 0) {
      handleStepChange(clampedIndex - 1)
    }
  }

  const handleComplete = () => {
    onCompleteSection()
  }

  const handleContinueLater = () => {
    onOpenChange(false)
  }

  if (!step) return null

  const stepLabel = `${clampedIndex + 1} of ${totalSteps}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        showOverlay={false}
        className="max-w-md border-zinc-700 bg-zinc-900 text-foreground shadow-2xl sm:top-6 sm:translate-y-0"
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-mint-300">
              Tutorial
            </span>
            <span>{sectionTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {step.title}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3 text-sm">
          <p className="text-xs text-muted-foreground whitespace-pre-line">{step.body}</p>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[11px] border-zinc-700 text-muted-foreground">
              Step {stepLabel}
            </Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-muted-foreground hover:text-foreground px-2"
            onClick={handleContinueLater}
          >
            Continue later
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] border-zinc-700 px-2"
              onClick={handleBack}
              disabled={clampedIndex === 0}
            >
              Back
            </Button>
            {clampedIndex < totalSteps - 1 ? (
              <Button size="sm" className="text-[11px] px-3" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button size="sm" className="text-[11px] px-3" onClick={handleComplete}>
                Mark complete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

