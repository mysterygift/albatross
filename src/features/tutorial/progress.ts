import { getSetting, setSetting, FIRST_LAUNCH_TUTORIAL_SEEN_KEY } from '@/lib/db/repositories/settings'
import { TUTORIAL_SECTION_IDS, type TutorialSectionId } from './tutorialSections'

const FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY = 'first_launch_tutorial_progress'

const VALID_SECTION_STATES: TutorialSectionState[] = ['not_started', 'in_progress', 'complete']

export type TutorialSectionState = 'not_started' | 'in_progress' | 'complete'

export type FirstLaunchTutorialProgress = {
  /** True once the user has either skipped or started from the entry modal; prevents re-showing entry on next load. */
  seenEntryModal: boolean
  seenIntro: boolean
  dismissed: boolean
  currentSection: TutorialSectionId | null
  sections: Record<TutorialSectionId, TutorialSectionState>
  sectionSteps?: Partial<Record<TutorialSectionId, number>>
}

export function getDefaultTutorialProgress(): FirstLaunchTutorialProgress {
  const sections: Record<TutorialSectionId, TutorialSectionState> = {} as Record<
    TutorialSectionId,
    TutorialSectionState
  >

  for (const id of TUTORIAL_SECTION_IDS) {
    sections[id] = 'not_started'
  }

  return {
    seenEntryModal: false,
    seenIntro: false,
    dismissed: false,
    currentSection: null,
    sections,
    sectionSteps: {},
  }
}

/** Sanitize parsed progress so invalid keys/values don't break the app. */
function sanitizeProgress(parsed: Partial<FirstLaunchTutorialProgress>): FirstLaunchTutorialProgress {
  const base = getDefaultTutorialProgress()
  const sectionIdsSet = new Set(TUTORIAL_SECTION_IDS)
  const sections: Record<TutorialSectionId, TutorialSectionState> = { ...base.sections }
  if (parsed.sections && typeof parsed.sections === 'object') {
    for (const id of TUTORIAL_SECTION_IDS) {
      const v = parsed.sections[id]
      if (VALID_SECTION_STATES.includes(v as TutorialSectionState)) {
        sections[id] = v as TutorialSectionState
      }
    }
  }
  let currentSection: TutorialSectionId | null = base.currentSection
  if (parsed.currentSection != null && sectionIdsSet.has(parsed.currentSection as TutorialSectionId)) {
    currentSection = parsed.currentSection as TutorialSectionId
  }
  const sectionSteps: Partial<Record<TutorialSectionId, number>> = { ...base.sectionSteps }
  if (parsed.sectionSteps && typeof parsed.sectionSteps === 'object') {
    for (const id of TUTORIAL_SECTION_IDS) {
      const v = parsed.sectionSteps[id]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        sectionSteps[id] = Math.floor(v)
      }
    }
  }
  return {
    seenEntryModal: typeof parsed.seenEntryModal === 'boolean' ? parsed.seenEntryModal : base.seenEntryModal,
    seenIntro: typeof parsed.seenIntro === 'boolean' ? parsed.seenIntro : base.seenIntro,
    dismissed: typeof parsed.dismissed === 'boolean' ? parsed.dismissed : base.dismissed,
    currentSection,
    sections,
    sectionSteps,
  }
}

export async function getFirstLaunchTutorialProgress(): Promise<FirstLaunchTutorialProgress> {
  try {
    const raw = await getSetting(FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY)

    if (!raw) {
      // No structured progress yet – fall back to legacy boolean.
      const legacySeen = await (async () => {
        try {
          const legacyValue = await getSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY)
          return legacyValue === 'true'
        } catch {
          return false
        }
      })()

      if (legacySeen) {
        const progress = getDefaultTutorialProgress()
        for (const id of TUTORIAL_SECTION_IDS) {
          progress.sections[id] = 'complete'
        }
        progress.seenEntryModal = true
        progress.seenIntro = true
        progress.dismissed = true
        return progress
      }

      return getDefaultTutorialProgress()
    }

    try {
      const parsed = JSON.parse(raw) as Partial<FirstLaunchTutorialProgress>
      return sanitizeProgress(parsed)
    } catch {
      return getDefaultTutorialProgress()
    }
  } catch {
    return getDefaultTutorialProgress()
  }
}

export async function setFirstLaunchTutorialProgress(
  progress: FirstLaunchTutorialProgress,
): Promise<void> {
  try {
    await setSetting(FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY, JSON.stringify(progress))

    // Keep legacy boolean roughly in sync for callers that still read it.
    const allComplete = TUTORIAL_SECTION_IDS.every(
      (id) => progress.sections[id] === 'complete',
    )

    if (progress.dismissed || allComplete) {
      await setSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY, 'true')
    } else {
      await setSetting(FIRST_LAUNCH_TUTORIAL_SEEN_KEY, 'false')
    }
  } catch {
    // Best-effort only – failures should not break app shell.
  }
}

