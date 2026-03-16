import { getSetting, setSetting, FIRST_LAUNCH_TUTORIAL_SEEN_KEY } from '@/lib/db/repositories/settings'
import { TUTORIAL_SECTION_IDS, type TutorialSectionId } from './tutorialSections'

const FIRST_LAUNCH_TUTORIAL_PROGRESS_KEY = 'first_launch_tutorial_progress'

export type TutorialSectionState = 'not_started' | 'in_progress' | 'complete'

export type FirstLaunchTutorialProgress = {
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
    seenIntro: false,
    dismissed: false,
    currentSection: null,
    sections,
    sectionSteps: {},
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
        progress.seenIntro = true
        progress.dismissed = true
        return progress
      }

      return getDefaultTutorialProgress()
    }

    try {
      const parsed = JSON.parse(raw) as Partial<FirstLaunchTutorialProgress>
      const base = getDefaultTutorialProgress()

      return {
        seenIntro: parsed.seenIntro ?? base.seenIntro,
        dismissed: parsed.dismissed ?? base.dismissed,
        currentSection: (parsed.currentSection as TutorialSectionId | null) ?? base.currentSection,
        sections: {
          ...base.sections,
          ...(parsed.sections ?? {}),
        },
        sectionSteps: {
          ...base.sectionSteps,
          ...(parsed.sectionSteps ?? {}),
        },
      }
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

