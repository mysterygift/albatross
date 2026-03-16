import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TUTORIAL_SECTIONS, type TutorialSectionId } from './tutorialSections'
import type { FirstLaunchTutorialProgress, TutorialSectionState } from './progress'

type TutorialHomeProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  progress: FirstLaunchTutorialProgress | null
  onProgressChange: (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => void
  onSkip: () => void
}

function getSectionLabel(state: TutorialSectionState): string {
  if (state === 'complete') return 'Complete'
  if (state === 'in_progress') return 'In progress'
  return 'Not started'
}

function getSectionActionLabel(state: TutorialSectionState): string {
  if (state === 'complete') return 'Review'
  if (state === 'in_progress') return 'Resume'
  return 'Start'
}

export function TutorialHome({ open, onOpenChange, progress, onProgressChange, onSkip }: TutorialHomeProps) {
  const navigate = useNavigate()

  const handleSectionClick = useCallback(
    (id: TutorialSectionId) => {
      if (!progress) return

      const current = progress.sections[id]
      const nextState: TutorialSectionState = current === 'not_started' ? 'in_progress' : current

      onProgressChange((prev) => ({
        ...prev,
        currentSection: id,
        seenIntro: true,
        sections: {
          ...prev.sections,
          [id]: nextState,
        },
        sectionSteps: {
          ...(prev.sectionSteps ?? {}),
          [id]: prev.sectionSteps?.[id] ?? 0,
        },
      }))

      const target = TUTORIAL_SECTIONS.find((s) => s.id === id)
      if (target) {
        onOpenChange(false)
        navigate(target.route)
      }
    },
    [navigate, onOpenChange, onProgressChange, progress],
  )

  const handleContinueLater = () => {
    onOpenChange(false)
  }

  const handleSkip = () => {
    onSkip()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-zinc-700 bg-zinc-900 text-foreground shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold">Welcome to Albatross</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            We&apos;ve loaded a demo production so you can explore schedules, budgets, crew, cast, and equipment
            safely without touching real projects. Use this hub to dip into key areas at your own pace.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {TUTORIAL_SECTIONS.map((section) => {
            const state: TutorialSectionState =
              progress?.sections[section.id] ?? ('not_started' as TutorialSectionState)
            const label = getSectionLabel(state)
            const actionLabel = getSectionActionLabel(state)
            const Icon = section.icon

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionClick(section.id)}
                className="flex flex-col items-start gap-2 rounded-md border border-zinc-700 bg-zinc-800/70 p-3 text-left transition-colors hover:border-mint-500/80 hover:bg-zinc-800"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-zinc-900 text-mint-400">
                    <Icon className="size-4" />
                  </span>
                  <span className="font-medium text-foreground">{section.title}</span>
                  <Badge
                    variant={state === 'complete' ? 'default' : state === 'in_progress' ? 'secondary' : 'outline'}
                    className="ml-auto text-xs"
                  >
                    {label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{section.description}</p>
                <div className="mt-1">
                  <Button size="xs" variant="outline">
                    {actionLabel}
                  </Button>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleContinueLater} className="text-xs border-zinc-600">
              Continue later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

