import { getSetting, setSetting, FIRST_LAUNCH_TUTORIAL_SEEN_KEY } from '@/lib/db/repositories/settings'
import { TUTORIAL_SECTION_IDS, type TutorialSectionId } from './tutorialSections'

const FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY = 'first_launch_tutorial_progress'

export type TutorialSectionState = 'not_started' | 'in_progress' | 'complete'

/** `running` shows the overlay; `paused` keeps the position but hides it; `idle` is not started. */
export type TutorialRunStatus = 'idle' | 'running' | 'paused'

export type TutorialRun = {
  status: TutorialRunStatus
  sectionId: TutorialSectionId | null
  stepId: string | null
  /** `all` continues into the next section after each one completes; `section` stops at the end of one. */
  scope: 'all' | 'section'
}

export type FirstLaunchTutorialProgress = {
  version: 2
  /** True once the user has either skipped or started from the entry modal. */
  seenEntryModal: boolean
  /** True once the user has ended the tutorial with "Skip tutorial". */
  dismissed: boolean
  /** The tutorial project created for this user. It is an ordinary project after the tutorial ends. */
  tutorialProductionId: string | null
  run: TutorialRun
  sections: Record<TutorialSectionId, TutorialSectionState>
  /** Step ids completed per section. Stored as ids, not indices, so reordering steps is safe. */
  completedStepIds: Partial<Record<TutorialSectionId, string[]>>
}

export function getDefaultTutorialProgress(): FirstLaunchTutorialProgress {
  const sections = {} as Record<TutorialSectionId, TutorialSectionState>
  for (const id of TUTORIAL_SECTION_IDS) sections[id] = 'not_started'
  return {
    version: 2,
    seenEntryModal: false,
    dismissed: false,
    tutorialProductionId: null,
    run: { status: 'idle', sectionId: null, stepId: null, scope: 'all' },
    sections,
    completedStepIds: {},
  }
}

const VALID_SECTION_STATES: TutorialSectionState[] = ['not_started', 'in_progress', 'complete']
const VALID_RUN_STATUS: TutorialRunStatus[] = ['idle', 'running', 'paused']

function isSectionId(value: unknown): value is TutorialSectionId {
  return typeof value === 'string' && (TUTORIAL_SECTION_IDS as readonly string[]).includes(value)
}

/** Sanitize parsed progress so invalid keys/values never break the app. Older v1 payloads are upgraded in place. */
export function sanitizeTutorialProgress(parsed: Partial<FirstLaunchTutorialProgress>): FirstLaunchTutorialProgress {
  const base = getDefaultTutorialProgress()

  const sections = { ...base.sections }
  if (parsed.sections && typeof parsed.sections === 'object') {
    for (const id of TUTORIAL_SECTION_IDS) {
      const v = parsed.sections[id]
      if (VALID_SECTION_STATES.includes(v as TutorialSectionState)) sections[id] = v as TutorialSectionState
    }
  }

  const rawRun = (parsed.run ?? {}) as Partial<TutorialRun>
  const run: TutorialRun = {
    // A run persisted by v1 has no `run`, so it resets to idle and the user starts the section again.
    status: VALID_RUN_STATUS.includes(rawRun.status as TutorialRunStatus) ? (rawRun.status as TutorialRunStatus) : 'idle',
    sectionId: isSectionId(rawRun.sectionId) ? rawRun.sectionId : null,
    stepId: typeof rawRun.stepId === 'string' ? rawRun.stepId : null,
    scope: rawRun.scope === 'section' ? 'section' : 'all',
  }

  const completedStepIds: Partial<Record<TutorialSectionId, string[]>> = {}
  if (parsed.completedStepIds && typeof parsed.completedStepIds === 'object') {
    for (const id of TUTORIAL_SECTION_IDS) {
      const v = parsed.completedStepIds[id]
      if (Array.isArray(v)) completedStepIds[id] = v.filter((s): s is string => typeof s === 'string')
    }
  }

  return {
    version: 2,
    seenEntryModal: typeof parsed.seenEntryModal === 'boolean' ? parsed.seenEntryModal : base.seenEntryModal,
    dismissed: typeof parsed.dismissed === 'boolean' ? parsed.dismissed : base.dismissed,
    tutorialProductionId:
      typeof parsed.tutorialProductionId === 'string' ? parsed.tutorialProductionId : base.tutorialProductionId,
    run,
    sections,
    completedStepIds,
  }
}

export async function getFirstLaunchTutorialProgress(): Promise<FirstLaunchTutorialProgress> {
  try {
    const raw = await getSetting(FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY)

    if (!raw) {
      // No structured progress yet – fall back to the legacy boolean used before progress was stored.
      const legacySeen = await (async () => {
        try {
          return (await getSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY)) === 'true'
        } catch {
          return false
        }
      })()
      const progress = getDefaultTutorialProgress()
      if (legacySeen) {
        for (const id of TUTORIAL_SECTION_IDS) progress.sections[id] = 'complete'
        progress.seenEntryModal = true
        progress.dismissed = true
      }
      return progress
    }

    try {
      return sanitizeTutorialProgress(JSON.parse(raw) as Partial<FirstLaunchTutorialProgress>)
    } catch {
      return getDefaultTutorialProgress()
    }
  } catch {
    return getDefaultTutorialProgress()
  }
}

export async function setFirstLaunchTutorialProgress(progress: FirstLaunchTutorialProgress): Promise<void> {
  try {
    await setSetting(FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY, JSON.stringify(progress))
    // Keep the legacy boolean in sync for callers that still read it.
    const allComplete = TUTORIAL_SECTION_IDS.every((id) => progress.sections[id] === 'complete')
    await setSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY, progress.dismissed || allComplete ? 'true' : 'false')
  } catch {
    // Best-effort only – failures should not break the app shell.
  }
}
