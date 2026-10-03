import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, PauseCircle } from 'lucide-react'
import { TUTORIAL_SECTIONS, type TutorialSectionId } from './tutorialSections'
import type { FirstLaunchTutorialProgress, TutorialSectionState } from './progress'

type TutorialHomeProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  progress: FirstLaunchTutorialProgress | null
  busy: boolean
  error: string | null
  onSelect: (id: TutorialSectionId) => void
}

function statusLabel(state: TutorialSectionState): string {
  if (state === 'complete') return 'Complete'
  if (state === 'in_progress') return 'In progress'
  return 'Not started'
}

function StatusIcon({ state }: { state: TutorialSectionState }) {
  if (state === 'complete') return <CheckCircle2 className="size-4 text-mint-300" aria-hidden />
  if (state === 'in_progress') return <PauseCircle className="size-4 text-amber-300" aria-hidden />
  return <Circle className="size-4 text-muted-foreground" aria-hidden />
}

/** Section picker. Choosing a section runs just that section, in the tutorial project. */
export function TutorialHome({ open, onOpenChange, progress, busy, error, onSelect }: TutorialHomeProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-zinc-700 bg-zinc-900 text-foreground shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold">Choose a section</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Each section opens in your tutorial project and walks you through it step by step. Your work stays in the
            project afterwards.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {TUTORIAL_SECTIONS.map((section) => {
            const state = progress?.sections[section.id] ?? 'not_started'
            const Icon = section.icon
            return (
              <Button
                key={section.id}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onSelect(section.id)}
                className="h-auto justify-start gap-3 border-zinc-700 px-3 py-2.5 text-left whitespace-normal"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{section.title}</span>
                  <span className="block text-xs text-muted-foreground">{section.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <StatusIcon state={state} />
                  {statusLabel(state)}
                </span>
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
