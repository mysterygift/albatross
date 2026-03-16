import { useCallback, useEffect, useState } from 'react'
import { getFirstLaunchTutorialSeen, setFirstLaunchTutorialSeen } from '@/lib/db/repositories/settings'

type FirstLaunchTutorialState = {
  isLoading: boolean
  showFirstLaunchTutorial: boolean
  completeFirstLaunchTutorial: () => void
  resetFirstLaunchTutorial: () => void
}

export function useFirstLaunchTutorial(): FirstLaunchTutorialState {
  const [isLoading, setIsLoading] = useState(true)
  const [showFirstLaunchTutorial, setShowFirstLaunchTutorial] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const seen = await getFirstLaunchTutorialSeen()
        if (!cancelled) {
          setShowFirstLaunchTutorial(!seen)
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
    void setFirstLaunchTutorialSeen(true)
  }, [])

  const resetFirstLaunchTutorial = useCallback(() => {
    setShowFirstLaunchTutorial(true)
    void setFirstLaunchTutorialSeen(false)
  }, [])

  return {
    isLoading,
    showFirstLaunchTutorial,
    completeFirstLaunchTutorial,
    resetFirstLaunchTutorial,
  }
}

