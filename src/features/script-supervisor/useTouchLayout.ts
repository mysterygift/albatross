import { useCallback, useState } from 'react'

const STORAGE_KEY = 'albatross.scriptSupervisor.touchLayout'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Tablet (touch) layout for the Script Supervisor workspace: larger targets and a compact scene rail.
 * A per-device preference, so it is kept in local storage rather than the production database.
 */
export function useTouchLayout(): [boolean, () => void] {
  const [touch, setTouch] = useState<boolean>(readStored)
  const toggle = useCallback(() => {
    setTouch((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
      } catch {
        // Preference only; ignore storage failures.
      }
      return next
    })
  }, [])
  return [touch, toggle]
}
