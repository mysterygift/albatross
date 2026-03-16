import { useCallback, useEffect, useState } from 'react'
import { getFirstLaunchTutorialSeen, setFirstLaunchTutorialSeen } from '@/lib/db/repositories/settings'
import {
  getFirstLaunchTutorialProgress,
  getDefaultTutorialProgress,
  setFirstLaunchTutorialProgress,
  type FirstLaunchTutorialProgress,
} from '@/features/tutorial/progress'

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

  const completeFirstLaunchTutorial = useCallback(() => {
    setShowFirstLaunchTutorial(false)
    setProgress((prev) => {
      const base = prev ?? getDefaultTutorialProgress()
      const updated: FirstLaunchTutorialProgress = {
        ...base,
        dismissed: true,
        sections: Object.fromEntries(
          Object.entries(base.sections).map(([key]) => [key, 'complete']),
        ) as FirstLaunchTutorialProgress['sections'],
      }
      void setFirstLaunchTutorialProgress(updated)
      void setFirstLaunchTutorialSeen(true)
      return updated
    })
  }, [])

  const resetFirstLaunchTutorial = useCallback(() => {
    const reset = getDefaultTutorialProgress()
    setProgress(reset)
    setShowFirstLaunchTutorial(true)
    void setFirstLaunchTutorialProgress(reset)
    void setFirstLaunchTutorialSeen(false)
  }, [])

  const updateProgress = useCallback(
    (updater: (prev: FirstLaunchTutorialProgress) => FirstLaunchTutorialProgress) => {
      setProgress((prev) => {
        const base = prev ?? getDefaultTutorialProgress()
        const updated = updater(base)
        void setFirstLaunchTutorialProgress(updated)
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

