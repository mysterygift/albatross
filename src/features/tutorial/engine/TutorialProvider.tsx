import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import {
  getDefaultTutorialProgress,
  getFirstLaunchTutorialProgress,
  setFirstLaunchTutorialProgress,
  type FirstLaunchTutorialProgress,
} from '../progress'
import { TUTORIAL_SECTION_IDS, type TutorialSectionId } from '../tutorialSections'
import { TUTORIAL_FLOWS, resolveTutorialSection } from '../flows'
import { ensureTutorialProject } from '../tutorialProject'
import { findMissingNeed, type MissingNeed } from '../prerequisites'
import { subscribeTutorialEvents } from './events'
import { TutorialContext, type Box, type StartOptions, type TutorialContextValue } from './context'
import { TutorialOverlay } from './TutorialOverlay'
import { TutorialEntryModal } from '../TutorialEntryModal'
import { TutorialHome } from '../TutorialHome'

const DEFAULT_HINT = 'Take the action described in the instruction to continue.'
/** After this long without the expected action, the step shows its hint. */
const IDLE_HINT_MS = 20_000

function firstIncompleteSection(p: FirstLaunchTutorialProgress): TutorialSectionId | null {
  return TUTORIAL_SECTION_IDS.find((id) => p.sections[id] !== 'complete') ?? null
}

function nextIncompleteSection(sections: FirstLaunchTutorialProgress['sections'], after: TutorialSectionId): TutorialSectionId | null {
  const index = TUTORIAL_SECTION_IDS.indexOf(after)
  return TUTORIAL_SECTION_IDS.slice(index + 1).find((id) => sections[id] !== 'complete') ?? null
}

/** Marks a section complete and moves on, or ends the run. Used by Next, Skip step and Skip section. */
function finishSection(p: FirstLaunchTutorialProgress, sid: TutorialSectionId): FirstLaunchTutorialProgress {
  const sections = { ...p.sections, [sid]: 'complete' as const }
  if (p.run.scope === 'all') {
    const following = nextIncompleteSection(sections, sid)
    if (following) {
      return {
        ...p,
        sections: { ...sections, [following]: 'in_progress' },
        run: { status: 'running', sectionId: following, stepId: TUTORIAL_FLOWS[following].steps[0]!.id, scope: 'all' },
      }
    }
  }
  return { ...p, sections, run: { status: 'idle', sectionId: null, stepId: null, scope: p.run.scope } }
}

function rectKey(r: Box | null): string {
  return r ? [r.left, r.top, r.width, r.height].map((n) => Math.round(n)).join(',') : ''
}

/** One box around every visible match. Lists such as the budget have one control per row, and any of them is the target. */
function unionOf(elements: HTMLElement[]): { box: Box | null; first: HTMLElement | null } {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let first: HTMLElement | null = null
  for (const el of elements) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    first ??= el
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  if (!first) return { box: null, first: null }
  return { box: { left, top, width: right - left, height: bottom - top }, first }
}

/**
 * Owns the guided tutorial: which section and step is active, persistence, navigation to each step's page,
 * and validation (view / click / domain event). Renders the overlay, the entry modal, and the section picker.
 */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { setCurrentProductionId, refetchProductions } = useCurrentProduction()

  const [progress, setProgress] = useState<FirstLaunchTutorialProgress | null>(null)
  const progressRef = useRef<FirstLaunchTutorialProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [rect, setRect] = useState<Box | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const advanceRef = useRef<() => void>(() => {})

  /** Writes progress synchronously to the ref, then to state and storage. */
  const commit = useCallback((update: (p: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => {
    const next = update(progressRef.current ?? getDefaultTutorialProgress())
    progressRef.current = next
    setProgress(next)
    void setFirstLaunchTutorialProgress(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void getFirstLaunchTutorialProgress().then((loaded) => {
      if (cancelled) return
      progressRef.current = loaded
      setProgress(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const run = progress?.run ?? null
  const running = run?.status === 'running'
  const flow = run?.sectionId ? TUTORIAL_FLOWS[run.sectionId] : null
  const stepIndex = flow && run?.stepId ? Math.max(0, flow.steps.findIndex((s) => s.id === run.stepId)) : 0
  const step = running && flow ? (flow.steps[stepIndex] ?? null) : null
  const stepKey = step ? `${run?.sectionId}:${step.id}` : 'none'

  const targetRoute = step ? (step.route ?? flow?.route ?? null) : null
  const viewParam = step?.view
  const atStepPlace =
    !!step &&
    location.pathname === targetRoute &&
    (!viewParam || new URLSearchParams(location.search).get(viewParam.param) === viewParam.value)

  const requirement = step?.requires
  const needs = step?.needs

  // Records the step builds on (a scene for a shot, a shoot day for a booking) must exist in the tutorial project.
  const [needCheck, setNeedCheck] = useState<{ key: string; missing: MissingNeed | null } | null>(null)
  const needsReady = !needs?.length || needCheck?.key === stepKey
  const missingNeed = needs?.length && needCheck?.key === stepKey ? needCheck.missing : null
  const needsKey = needs?.join(',') ?? ''
  useEffect(() => {
    if (!running || !needs?.length) return
    let cancelled = false
    const check = () => {
      const pid = progressRef.current?.tutorialProductionId
      if (!pid) return
      void findMissingNeed(needs, pid).then((missing) => {
        if (!cancelled) setNeedCheck({ key: stepKey, missing })
      })
    }
    check()
    const unsubscribe = subscribeTutorialEvents(check)
    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step and its needs
  }, [running, stepKey, needsKey])

  const satisfied =
    !!step &&
    needsReady &&
    !missingNeed &&
    (done || (requirement?.kind === 'view' && atStepPlace && (!step.target || rect != null)))
  const satisfiedRef = useRef(satisfied)
  satisfiedRef.current = satisfied
  // Read by the click listener, which runs outside render: true while a need is missing.
  const blockedRef = useRef(false)
  blockedRef.current = !needsReady || !!missingNeed

  // Each new step starts unsatisfied with no hint.
  useEffect(() => {
    setDone(false)
    setHint(null)
  }, [stepKey])

  // Move to the page the current step lives on (and to its view, for the stripboard).
  useEffect(() => {
    if (!running || !step || !targetRoute || atStepPlace) return
    const params = new URLSearchParams(location.pathname === targetRoute ? location.search : '')
    if (viewParam) params.set(viewParam.param, viewParam.value)
    const search = params.toString()
    navigate({ pathname: targetRoute, search: search ? `?${search}` : '' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step, not on every location change
  }, [running, stepKey, targetRoute, atStepPlace])

  // Track the target element's position, and whether a dialog is covering the page.
  useEffect(() => {
    if (!running) {
      setRect(null)
      setDialogOpen(false)
      return
    }
    const target = atStepPlace ? step?.target : undefined
    // null, not '', so the first tick always publishes: a step with no target must clear the previous box.
    let last: string | null = null
    let scrolled = false
    const tick = () => {
      const all = target ? Array.from(document.querySelectorAll<HTMLElement>(`[data-tutorial="${target}"]`)) : []
      const { box, first } = unionOf(all)
      if (first && !scrolled) {
        scrolled = true
        first.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      }
      const key = rectKey(box)
      if (key !== last) {
        last = key
        setRect(box)
      }
      setDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]:not([data-tutorial-ui])'))
    }
    tick()
    const id = window.setInterval(tick, 250)
    window.addEventListener('resize', tick)
    window.addEventListener('scroll', tick, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', tick)
      window.removeEventListener('scroll', tick, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `step` is represented by stepKey and atStepPlace
  }, [running, stepKey, atStepPlace])

  // Event validation: a successful write for the tutorial project matches the step.
  useEffect(() => {
    if (!running || requirement?.kind !== 'event') return
    const { event: name, match } = requirement
    return subscribeTutorialEvents((event) => {
      if (event.name !== name) return
      if (event.productionId !== progressRef.current?.tutorialProductionId) return
      if (match && !match(event)) return
      setDone(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step
  }, [running, stepKey])

  // Unsatisfied steps show their hint after a while, so the user is never left guessing.
  useEffect(() => {
    if (!running || !step || satisfied || requirement?.kind === 'view') return
    const id = window.setTimeout(() => setHint((prev) => prev ?? step.hint ?? DEFAULT_HINT), IDLE_HINT_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step and its satisfaction
  }, [running, stepKey, satisfied])

  const pause = useCallback(() => {
    commit((p) => (p.run.status === 'running' ? { ...p, run: { ...p.run, status: 'paused' } } : p))
  }, [commit])

  const resume = useCallback(() => {
    commit((p) => {
      if (!p.run.sectionId || !p.run.stepId) return p
      return { ...p, run: { ...p.run, status: 'running' } }
    })
  }, [commit])

  // Escape pauses, unless a dialog owns the key.
  useEffect(() => {
    if (!running) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialogOpen) pause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, dialogOpen, pause])

  const advance = useCallback(() => {
    const p = progressRef.current
    const sid = p?.run.sectionId
    if (!p || !sid || p.run.status !== 'running' || !p.run.stepId) return
    const steps = TUTORIAL_FLOWS[sid].steps
    const index = steps.findIndex((s) => s.id === p.run.stepId)
    const current = steps[index]
    if (!current) return
    const completed = [...new Set([...(p.completedStepIds[sid] ?? []), current.id])]
    const completedStepIds = { ...p.completedStepIds, [sid]: completed }
    const following = steps[index + 1]
    if (following) {
      commit((prev) => ({
        ...prev,
        completedStepIds,
        sections: { ...prev.sections, [sid]: 'in_progress' },
        run: { ...prev.run, stepId: following.id },
      }))
      return
    }
    commit((prev) => finishSection({ ...prev, completedStepIds }, sid))
    const after = progressRef.current
    if (after && TUTORIAL_SECTION_IDS.every((id) => after.sections[id] === 'complete')) {
      toast.success('Tutorial complete. Your tutorial project is yours to keep using.')
    } else if (after?.run.status === 'idle') {
      toast.success(`${TUTORIAL_FLOWS[sid].title} section complete.`)
    }
  }, [commit])

  // Click validation: the user clicks the highlighted target. A click that is followed by a
  // save step (for example "New scene", then the form) moves straight on, so the form's step
  // is the one showing when the dialog opens and the save is not missed.
  useEffect(() => {
    if (!running || !step || requirement?.kind !== 'click' || !step.target) return
    const target = step.target
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.(`[data-tutorial="${target}"]`)
      if (!el) return
      const p = progressRef.current
      const sid = p?.run.sectionId
      const steps = sid ? TUTORIAL_FLOWS[sid].steps : []
      const following = steps[steps.findIndex((s) => s.id === p?.run.stepId) + 1]
      if (!blockedRef.current && following?.requires.kind === 'event') advanceRef.current()
      else setDone(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the step
  }, [running, stepKey])

  advanceRef.current = advance

  const next = useCallback(() => {
    if (satisfiedRef.current) advance()
  }, [advance])

  const back = useCallback(() => {
    commit((p) => {
      const sid = p.run.sectionId
      if (!sid || p.run.status !== 'running') return p
      const steps = TUTORIAL_FLOWS[sid].steps
      const index = steps.findIndex((s) => s.id === p.run.stepId)
      const previous = steps[index - 1]
      return previous ? { ...p, run: { ...p.run, stepId: previous.id } } : p
    })
  }, [commit])

  const skipStep = useCallback(() => advance(), [advance])

  const skipSection = useCallback(() => {
    commit((p) => {
      const sid = p.run.sectionId
      if (!sid) return p
      const steps = TUTORIAL_FLOWS[sid].steps.map((s) => s.id)
      return finishSection({ ...p, completedStepIds: { ...p.completedStepIds, [sid]: steps } }, sid)
    })
  }, [commit])

  const endTutorial = useCallback(() => {
    commit((p) => ({ ...p, seenEntryModal: true, dismissed: true, run: { status: 'idle', sectionId: null, stepId: null, scope: 'all' } }))
  }, [commit])

  const dismissEntry = useCallback(() => {
    commit((p) => ({ ...p, seenEntryModal: true }))
  }, [commit])

  const reportOffStep = useCallback(() => {
    const p = progressRef.current
    const sid = p?.run.sectionId
    if (!p || !sid) return
    const current = TUTORIAL_FLOWS[sid].steps.find((s) => s.id === p.run.stepId)
    setHint(current?.hint ?? DEFAULT_HINT)
  }, [])

  /** Creates or reuses the tutorial project and makes it the current project. */
  const activateProject = useCallback(async (): Promise<string> => {
    const project = await ensureTutorialProject(progressRef.current?.tutorialProductionId ?? null)
    setCurrentProductionId(project.id)
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
    refetchProductions()
    return project.id
  }, [queryClient, refetchProductions, setCurrentProductionId])

  const startSection = useCallback(
    async (id: TutorialSectionId, options: StartOptions = {}) => {
      setBusy(true)
      setError(null)
      try {
        const projectId = await activateProject()
        commit((p) => {
          // Reviewing a finished section runs it again from the start.
          const restart = options.fresh === true || p.sections[id] === 'complete'
          const completed = restart ? [] : (p.completedStepIds[id] ?? [])
          const steps = TUTORIAL_FLOWS[id].steps
          const firstOpen = steps.find((s) => !completed.includes(s.id)) ?? steps[0]!
          return {
            ...p,
            seenEntryModal: true,
            dismissed: false,
            tutorialProductionId: projectId,
            completedStepIds: { ...p.completedStepIds, [id]: completed },
            sections: { ...p.sections, [id]: 'in_progress' },
            run: { status: 'running', sectionId: id, stepId: firstOpen.id, scope: options.scope ?? 'section' },
          }
        })
      } catch {
        setError('Unable to create the tutorial project. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [activateProject, commit],
  )

  const restartAll = useCallback(async () => {
    commit((p) => ({
      ...getDefaultTutorialProgress(),
      seenEntryModal: true,
      tutorialProductionId: p.tutorialProductionId,
    }))
    await startSection('dashboard', { scope: 'all', fresh: true })
  }, [commit, startSection])

  /** Continues from the first unfinished section, or starts the whole tutorial again if all are finished. */
  const startAll = useCallback(async () => {
    const id = firstIncompleteSection(progressRef.current ?? getDefaultTutorialProgress())
    if (id) await startSection(id, { scope: 'all' })
    else await restartAll()
  }, [restartAll, startSection])

  const startForPage = useCallback(async () => {
    const id = resolveTutorialSection(location.pathname)
    if (id) await startSection(id, { scope: 'section' })
  }, [location.pathname, startSection])

  // Settings can open the picker, and can reset progress first, via location state.
  useEffect(() => {
    const state = location.state as { openTutorialHome?: boolean; resetTutorial?: boolean } | null
    if (!state?.openTutorialHome) return
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} })
    if (state.resetTutorial) {
      commit((p) => ({ ...getDefaultTutorialProgress(), seenEntryModal: true, tutorialProductionId: p.tutorialProductionId }))
    }
    setPickerOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per navigation that carries the state
  }, [location.state])

  const value = useMemo<TutorialContextValue>(
    () => ({
      progress,
      busy,
      error,
      pickerOpen,
      setPickerOpen,
      status: run?.status ?? 'idle',
      flow,
      step,
      stepIndex,
      satisfied,
      missingNeed,
      hint,
      rect,
      waiting: !!step?.target && atStepPlace && rect == null,
      dialogOpen,
      startAll,
      startSection,
      startForPage,
      restartAll,
      pause,
      resume,
      next,
      back,
      skipStep,
      skipSection,
      endTutorial,
      dismissEntry,
      reportOffStep,
    }),
    [
      progress, busy, error, pickerOpen, run?.status, flow, step, stepIndex, satisfied, missingNeed, hint, rect, atStepPlace,
      dialogOpen, startAll, startSection, startForPage, restartAll, pause, resume, next, back, skipStep,
      skipSection, endTutorial, dismissEntry, reportOffStep,
    ],
  )

  const entryOpen = progress !== null && !progress.seenEntryModal && !progress.dismissed

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialEntryModal
        open={entryOpen}
        isPreparing={busy}
        error={error}
        onStartTutorial={() => void startAll()}
        onSkipForNow={dismissEntry}
        onOpenChange={(open) => {
          if (!open) dismissEntry()
        }}
      />
      <TutorialHome
        open={pickerOpen && !entryOpen}
        onOpenChange={setPickerOpen}
        progress={progress}
        busy={busy}
        error={error}
        onSelect={(id) => {
          setPickerOpen(false)
          void startSection(id, { scope: 'section' })
        }}
      />
      <TutorialOverlay />
    </TutorialContext.Provider>
  )
}
