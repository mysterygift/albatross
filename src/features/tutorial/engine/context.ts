import { createContext, useContext } from 'react'
import type { FirstLaunchTutorialProgress, TutorialRunStatus } from '../progress'
import type { TutorialSectionId } from '../tutorialSections'
import type { MissingNeed } from '../prerequisites'
import type { TutorialFlow, TutorialStep } from './types'

/** A viewport-relative box. Covers every visible element that carries the same tutorial target. */
export type Box = { left: number; top: number; width: number; height: number }

export type StartOptions = {
  /** `all` continues into the following sections; `section` stops after one. */
  scope?: 'all' | 'section'
  /** Clears the section's completed steps first, so it runs from the beginning. */
  fresh?: boolean
}

export type TutorialContextValue = {
  progress: FirstLaunchTutorialProgress | null
  busy: boolean
  error: string | null
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void

  status: TutorialRunStatus
  flow: TutorialFlow | null
  step: TutorialStep | null
  stepIndex: number
  /** True when the step's requirement and its records are in place and Next may be pressed. */
  satisfied: boolean
  /** A record the step needs is missing from the tutorial project. */
  missingNeed: MissingNeed | null
  hint: string | null
  /** Box around the highlighted target(s), or null when there is no target on screen. */
  rect: Box | null
  /** A target is expected on this page but not rendered yet. */
  waiting: boolean
  /** A Radix dialog is open. The overlay stops blocking so the user can finish the form. */
  dialogOpen: boolean

  startAll: () => Promise<void>
  startSection: (id: TutorialSectionId, options?: StartOptions) => Promise<void>
  startForPage: () => Promise<void>
  restartAll: () => Promise<void>
  pause: () => void
  resume: () => void
  next: () => void
  back: () => void
  skipStep: () => void
  skipSection: () => void
  endTutorial: () => void
  dismissEntry: () => void
  reportOffStep: () => void
}

export const TutorialContext = createContext<TutorialContextValue | null>(null)

export function useTutorial(): TutorialContextValue {
  const value = useContext(TutorialContext)
  if (!value) throw new Error('useTutorial must be used inside TutorialProvider')
  return value
}
