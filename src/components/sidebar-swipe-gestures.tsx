import { useEffect, useRef } from 'react'

import { useSidebar } from '@/components/ui/sidebar'
import { isMobilePlatform } from '@/lib/platform'

/** Touches starting this close to the left edge can swipe the sidebar open. */
export const EDGE_ZONE_PX = 24
/** Movement before a touch is classified as a horizontal swipe or a scroll. */
const LOCK_DISTANCE_PX = 10
/** A swipe must be this much more horizontal than vertical. */
const HORIZONTAL_RATIO = 1.5
/** Distance that completes a swipe on release... */
const COMPLETE_DISTANCE_PX = 60
/** ...or a shorter flick at this speed (px/ms). */
const FLICK_DISTANCE_PX = 30
const FLICK_VELOCITY = 0.4
/**
 * A touch held still this long before moving is a long-press drag (see usePlatformDragSensors),
 * not a swipe.
 */
const LONG_PRESS_MS = 250

type SwipeMode = 'open' | 'close'

type Gesture = {
  mode: SwipeMode
  x0: number
  y0: number
  t0: number
  locked: boolean
}

function hasOpenDialog(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') != null
}

/**
 * Touch gestures for the sidebar on iOS/Android: a one-finger swipe right from the left edge
 * shows it, and a one-finger swipe left on the sidebar hides it. Works for both the docked
 * sidebar (tablet widths) and the sheet used at phone widths.
 */
export function SidebarSwipeGestures() {
  const { isMobile, open, openMobile, setOpen, setOpenMobile } = useSidebar()
  const stateRef = useRef({ isMobile, open, openMobile, setOpen, setOpenMobile })
  useEffect(() => {
    stateRef.current = { isMobile, open, openMobile, setOpen, setOpenMobile }
  }, [isMobile, open, openMobile, setOpen, setOpenMobile])

  useEffect(() => {
    if (!isMobilePlatform()) return

    let gesture: Gesture | null = null

    const isSidebarOpen = () => {
      const s = stateRef.current
      return s.isMobile ? s.openMobile : s.open
    }
    const setSidebarOpen = (value: boolean) => {
      const s = stateRef.current
      if (s.isMobile) s.setOpenMobile(value)
      else s.setOpen(value)
    }

    const onTouchStart = (event: TouchEvent) => {
      gesture = null
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      const target = event.target instanceof Element ? event.target : null
      let mode: SwipeMode | null = null
      if (isSidebarOpen()) {
        if (target?.closest('[data-slot="sidebar"]')) mode = 'close'
      } else if (touch.clientX <= EDGE_ZONE_PX && !hasOpenDialog()) {
        mode = 'open'
      }
      if (mode) {
        gesture = { mode, x0: touch.clientX, y0: touch.clientY, t0: event.timeStamp, locked: false }
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture) return
      if (event.touches.length !== 1) {
        gesture = null
        return
      }
      const touch = event.touches[0]
      const dx = touch.clientX - gesture.x0
      const dy = touch.clientY - gesture.y0
      if (!gesture.locked) {
        if (Math.abs(dx) < LOCK_DISTANCE_PX && Math.abs(dy) < LOCK_DISTANCE_PX) return
        const towards = gesture.mode === 'open' ? dx > 0 : dx < 0
        const horizontal = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO
        if (!towards || !horizontal || event.timeStamp - gesture.t0 > LONG_PRESS_MS) {
          gesture = null
          return
        }
        gesture.locked = true
      }
      // Keep the page (or the sidebar list) from scrolling under a swipe.
      if (event.cancelable) event.preventDefault()
    }

    const onTouchEnd = (event: TouchEvent) => {
      const g = gesture
      gesture = null
      if (!g?.locked) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const distance = g.mode === 'open' ? touch.clientX - g.x0 : g.x0 - touch.clientX
      const elapsed = Math.max(1, event.timeStamp - g.t0)
      const complete =
        distance >= COMPLETE_DISTANCE_PX ||
        (distance >= FLICK_DISTANCE_PX && distance / elapsed >= FLICK_VELOCITY)
      if (complete) setSidebarOpen(g.mode === 'open')
    }

    const onTouchCancel = () => {
      gesture = null
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  return null
}
