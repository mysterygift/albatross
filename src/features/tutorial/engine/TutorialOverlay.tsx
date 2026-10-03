import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useTutorial, type Box } from './context'
import { TUTORIAL_SECTIONS } from '../tutorialSections'

const PAD = 8
const CARD_WIDTH = 340
const CARD_HEIGHT_ESTIMATE = 280
const DIM = 'rgba(0, 0, 0, 0.6)'

/** Four panels that dim everything outside the spotlight. Clicks on them count as off-step. */
function surroundingBoxes(hole: Box): Box[] {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const top = Math.max(0, hole.top)
  const bottom = Math.min(vh, hole.top + hole.height)
  const left = Math.max(0, hole.left)
  const right = Math.min(vw, hole.left + hole.width)
  return [
    { left: 0, top: 0, width: vw, height: top },
    { left: 0, top: bottom, width: vw, height: vh - bottom },
    { left: 0, top, width: left, height: bottom - top },
    { left: right, top, width: vw - right, height: bottom - top },
  ]
}

function cardPosition(rect: Box | null): { left: number; top: number } | null {
  if (!rect) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.min(Math.max(16, rect.left), vw - CARD_WIDTH - 16)
  const below = rect.top + rect.height + PAD + 12
  const top = below + CARD_HEIGHT_ESTIMATE < vh ? below : Math.max(16, rect.top - PAD - 12 - CARD_HEIGHT_ESTIMATE)
  return { left, top }
}

/**
 * The spotlight and instruction card for the active step. While a dialog is open the overlay stops blocking,
 * so the user can finish a form; the card then sits in the corner and the tour detects the save.
 */
export function TutorialOverlay() {
  const t = useTutorial()
  const cardRef = useRef<HTMLDivElement>(null)
  const { status, step, rect, dialogOpen } = t

  useEffect(() => {
    if (status === 'running') cardRef.current?.focus({ preventScroll: true })
  }, [status, step?.id])

  useEffect(() => {
    if (status !== 'running') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && t.satisfied && !dialogOpen && event.target === document.body) {
        event.preventDefault()
        t.next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handler reads the latest values through `t`
  }, [status, t.satisfied, dialogOpen])

  if (status !== 'running' || !step || !t.flow) return null

  // Blocking is lifted while a dialog is open, and for steps that need the user to prepare the target.
  const blocking = !dialogOpen && !step.passthrough
  // The ring is drawn whenever the target is on screen, even if a dialog is open, so the target is always visible.
  const hole = rect ? { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null
  // The card moves to the corner for passthrough steps, so it does not cover the controls the user needs.
  const position = dialogOpen || step.passthrough ? null : cardPosition(rect)
  const cardStyle = position
    ? { left: position.left, top: position.top, width: CARD_WIDTH }
    : { right: 24, bottom: 24, width: CARD_WIDTH }
  const total = t.flow.steps.length
  const stepLabel = `Step ${t.stepIndex + 1} of ${total}`
  const offStepPanels = !dialogOpen && !step.passthrough
    ? hole
      ? surroundingBoxes(hole)
      : [{ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }]
    : []

  return createPortal(
    <>
      {offStepPanels.map((box, i) => (
        <div
          key={i}
          aria-hidden
          data-tutorial-ui="block"
          onPointerDown={() => t.reportOffStep()}
          style={{ position: 'fixed', ...box, background: DIM, zIndex: 9000, pointerEvents: blocking ? 'auto' : 'none' }}
        />
      ))}
      {hole && (
        <div
          aria-hidden
          data-tutorial-ui="spotlight"
          style={{
            position: 'fixed',
            ...hole,
            zIndex: 9001,
            pointerEvents: 'none',
            borderRadius: 8,
            boxShadow: '0 0 0 2px rgba(110, 231, 183, 0.9)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={false}
        aria-label={`Tutorial: ${step.title}`}
        tabIndex={-1}
        data-tutorial-ui="card"
        style={{ position: 'fixed', ...cardStyle, zIndex: 9002, pointerEvents: 'auto' }}
        className="max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-foreground shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-mint-300">{t.flow.title}</span>
          <span>{stepLabel}</span>
        </div>
        <h2 className="mt-2 text-sm font-semibold">{step.title}</h2>
        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{step.body}</p>

        <div className="mt-3 rounded-md border border-mint-400/40 bg-mint-400/10 p-2.5 text-xs text-foreground">
          {step.instruction}
        </div>
        {dialogOpen && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            The form is open. Complete it there; the tutorial continues once it is saved.
          </p>
        )}

        {t.missingNeed && !dialogOpen && (
          <div role="status" className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            <p>
              This step needs {t.missingNeed.label} in your tutorial project first.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 border-amber-500/40 px-2.5 text-[11px]"
              onClick={() => void t.startSection(t.missingNeed!.section, { scope: 'section' })}
            >
              Open {TUTORIAL_SECTIONS.find((s) => s.id === t.missingNeed!.section)?.title ?? 'the'} tutorial
            </Button>
          </div>
        )}
        {t.hint && !t.satisfied && !t.missingNeed && (
          <p role="status" className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
            {t.hint}
          </p>
        )}
        {t.waiting && !dialogOpen && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {step.hint ?? 'Waiting for the page to show this…'}
          </p>
        )}
        {t.satisfied ? (
          <p className="mt-2 text-[11px] text-mint-300">Done. Press Next to continue.</p>
        ) : step.requires.kind !== 'view' && !dialogOpen ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Waiting for you to complete this step.</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={t.pause}>
              Pause
            </Button>
            {(step.optional || t.hint) && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={t.skipStep}>
                Skip step
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-zinc-700 px-2.5 text-[11px]"
              onClick={t.back}
              disabled={t.stepIndex === 0}
            >
              Back
            </Button>
            <Button size="sm" className="h-7 px-3 text-[11px]" onClick={t.next} disabled={!t.satisfied}>
              {t.stepIndex === total - 1 ? 'Finish section' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
