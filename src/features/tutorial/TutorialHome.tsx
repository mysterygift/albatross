import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, PauseCircle, ArrowRight } from 'lucide-react'
import { TUTORIAL_SECTIONS, type TutorialSectionId } from './tutorialSections'
import type { FirstLaunchTutorialProgress, TutorialSectionState } from './progress'

type TutorialHomeProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  progress: FirstLaunchTutorialProgress | null
  onProgressChange: (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => void
  /** When false, show a notice that the tutorial is designed for the demo production and offer to open it. */
  isDemoProductionCurrent?: boolean
  onOpenDemoProduction?: () => void | Promise<void>
  /** Shown while demo is being ensured after reset (or Settings reset navigation). */
  isPreparingDemo?: boolean
  tutorialHubError?: string | null
  onDismissTutorialHubError?: () => void
  /** Return false to stay on the hub (e.g. demo prepare failed). */
  onBeforeSectionNavigate?: () => Promise<boolean>
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

function getSectionStatusIcon(state: TutorialSectionState) {
  if (state === 'complete') return CheckCircle2
  if (state === 'in_progress') return PauseCircle
  return Circle
}

export function TutorialHome({
  open,
  onOpenChange,
  progress,
  onProgressChange,
  isDemoProductionCurrent = true,
  onOpenDemoProduction,
  isPreparingDemo = false,
  tutorialHubError = null,
  onDismissTutorialHubError,
  onBeforeSectionNavigate,
}: TutorialHomeProps) {
  const navigate = useNavigate()
  const [isSectionNavBusy, setIsSectionNavBusy] = useState(false)
  const sectionInteractDisabled = isPreparingDemo || isSectionNavBusy

  const allComplete = useMemo(() => {
    if (!progress) return false
    return Object.values(progress.sections).every((s) => s === 'complete')
  }, [progress])

  const handleSectionClick = useCallback(
    async (id: TutorialSectionId) => {
      if (!progress || sectionInteractDisabled) return

      if (onBeforeSectionNavigate) {
        setIsSectionNavBusy(true)
        try {
          const ok = await onBeforeSectionNavigate()
          if (!ok) return
        } finally {
          setIsSectionNavBusy(false)
        }
      }

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
    [navigate, onBeforeSectionNavigate, onOpenChange, onProgressChange, progress, sectionInteractDisabled],
  )

  const handleContinueLater = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-zinc-700 bg-zinc-900 text-foreground shadow-2xl">
        <div className="relative">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-semibold">
              {allComplete ? 'Core workflows explored' : 'Welcome to Albatross'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {allComplete
                ? `You’ve now seen the main operational areas. Keep using the demo production to experiment safely, or continue into normal day-to-day work.`
                : `We’ve loaded a demo production so you can explore schedules, budgets, crew, cast, and equipment safely without touching real projects. Use this hub to dip into key areas at your own pace.`}
            </DialogDescription>
          </DialogHeader>

          {tutorialHubError && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-foreground"
            >
              <p>{tutorialHubError}</p>
              {onDismissTutorialHubError && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 border-destructive/40"
                  onClick={onDismissTutorialHubError}
                >
                  Dismiss
                </Button>
              )}
            </div>
          )}

          {isPreparingDemo && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-zinc-950/80 text-sm text-foreground"
              aria-live="polite"
              aria-busy="true"
            >
              <span>Preparing demo production…</span>
            </div>
          )}

          {!isDemoProductionCurrent && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-200">
                This tutorial is designed for the demo production.
              </p>
              {onOpenDemoProduction && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                  onClick={() => void onOpenDemoProduction()}
                >
                  Open demo production
                </Button>
              )}
            </div>
          )}

          {allComplete && (
            <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-zinc-900 text-mint-300">
                  <CheckCircle2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">All core areas completed</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can revisit any section below in <span className="text-foreground">Review</span> mode.
                  </p>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        onOpenChange(false)
                        navigate('/')
                      }}
                    >
                      Go to Dashboard
                      <ArrowRight className="ml-2 size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TUTORIAL_SECTIONS.map((section) => {
              const state: TutorialSectionState =
                progress?.sections[section.id] ?? ('not_started' as TutorialSectionState)
              const label = getSectionLabel(state)
              const actionLabel = getSectionActionLabel(state)
              const Icon = section.icon
              const StatusIcon = getSectionStatusIcon(state)

              return (
                <button
                  key={section.id}
                  type="button"
                  disabled={sectionInteractDisabled}
                  onClick={() => void handleSectionClick(section.id)}
                  className="flex w-full flex-col items-stretch gap-3 rounded-md border border-zinc-700 bg-zinc-800/70 p-4 text-left transition-colors hover:border-mint-500/80 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-mint-400">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-col gap-2">
                        <span className="min-w-0 font-medium leading-snug text-foreground">{section.title}</span>
                        <Badge
                          variant={
                            state === 'complete' ? 'default' : state === 'in_progress' ? 'secondary' : 'outline'
                          }
                          className="flex w-fit shrink-0 items-center gap-1 self-start whitespace-nowrap text-xs"
                        >
                          <StatusIcon className="size-3.5 shrink-0" />
                          {label}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{section.description}</p>
                      <div>
                        <Button size="xs" variant="outline" disabled={sectionInteractDisabled}>
                          {actionLabel}
                        </Button>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleContinueLater} className="text-xs border-zinc-600">
              Continue later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

