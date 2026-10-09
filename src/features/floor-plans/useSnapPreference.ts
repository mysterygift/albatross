import { useState } from 'react'

const SNAP_STORAGE_KEY = 'albatross.floorPlans.snap90'

/** Snap to 90° is a per-viewer preference, on by default. */
export function useSnapPreference(): [boolean, (on: boolean) => void] {
  const [snap, setSnap] = useState(() => {
    try {
      return localStorage.getItem(SNAP_STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const update = (on: boolean) => {
    setSnap(on)
    try {
      localStorage.setItem(SNAP_STORAGE_KEY, on ? 'true' : 'false')
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  }
  return [snap, update]
}
