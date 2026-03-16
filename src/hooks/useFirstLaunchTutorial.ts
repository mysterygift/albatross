import { useCallback, useEffect, useState } from 'react'
import { getFirstLaunchTutorialSeen, setFirstLaunchTutorialSeen } from '@/lib/db/repositories/settings'
import {
  getFirstLaunchTutorialProgress,
  getDefaultTutorialProgress,
  setFirstLaunchTutorialProgress,
  type FirstLaunchTutorialProgress,
} from '@/features/tutorial/progress'

const TUTORIAL_PROGRESS_EVENT = 'first_launch_tutorial_progress_changed'

type FirstLaunchTutorialState = {
  isLoading: boolean
  showFirstLaunchTutorial: boolean
  completeFirstLaunchTutorial: () => void
  resetFirstLaunchTutorial: () => void
  progress: FirstLaunchTutorialProgress | null
  updateProgress: (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => void
}

export function useFirstLaunchTutorial(): FirstLaunchTutorialState {
  const [isLoading, setIsLoading] = useState(true)
  const [showFirstLaunchTutorial, setShowFirstLaunchTutorial] = useState(false)
  const [progress, setProgress] = useState<FirstLaunchTutorialProgress | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        // Load structured progress first; fall back to legacy flag if needed.
        const structured = await getFirstLaunchTutorialProgress()
        const legacySeen = await getFirstLaunchTutorialSeen()

        if (!cancelled) {
          const effective = structured ?? getDefaultTutorialProgress()
          setProgress(effective)

          const allComplete = Object.values(effective.sections).every((s) => s === 'complete')
          const dismissed = effective.dismissed

          // Show tutorial when it has not been explicitly dismissed and not fully complete.
          const shouldShow = !dismissed && !allComplete && !legacySeen
          setShowFirstLaunchTutorial(shouldShow)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<FirstLaunchTutorialProgress>
      const next = custom.detail
      if (!next) return
      setProgress(next)
    }
    window.addEventListener(TUTORIAL_PROGRESS_EVENT, handler as EventListener)
    return () => window.removeEventListener(TUTORIAL_PROGRESS_EVENT, handler as EventListener)
  }, [])

  const completeFirstLaunchTutorial = useCallback(() => {
    setShowFirstLaunchTutorial(false)
    setProgress((prev) => {
      const base = prev ?? getDefaultTutorialProgress()
      const updated: FirstLaunchTutorialProgress = {
        ...base,
        // User dismissed the tutorial hub; do not mutate section completion.
        dismissed: true,
        seenIntro: true,
        currentSection: null,
      }
      void setFirstLaunchTutorialProgress(updated)
      void setFirstLaunchTutorialSeen(true)
      window.dispatchEvent(new CustomEvent(TUTORIAL_PROGRESS_EVENT, { detail: updated }))
      return updated
    })
  }, [])

  const resetFirstLaunchTutorial = useCallback(() => {
    const reset = getDefaultTutorialProgress()
    setProgress(reset)
    setShowFirstLaunchTutorial(true)
    void setFirstLaunchTutorialProgress(reset)
    void setFirstLaunchTutorialSeen(false)
    window.dispatchEvent(new CustomEvent(TUTORIAL_PROGRESS_EVENT, { detail: reset }))
  }, [])

  const updateProgress = useCallback(
    (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => {
      setProgress((prev) => {
        const base = prev ?? getDefaultTutorialProgress()
        const updated = updater(base)
        void setFirstLaunchTutorialProgress(updated)
        window.dispatchEvent(new CustomEvent(TUTORIAL_PROGRESS_EVENT, { detail: updated }))
        return updated
      })
    },
    [],
  )

  return {
    isLoading,
    showFirstLaunchTutorial,
    completeFirstLaunchTutorial,
    resetFirstLaunchTutorial,
    progress,
    updateProgress,
  }
}

