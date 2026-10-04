// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { SidebarSwipeGestures } from '@/components/sidebar-swipe-gestures'

const sidebar = vi.hoisted(() => ({
  isMobile: false,
  open: false,
  openMobile: false,
  setOpen: vi.fn(),
  setOpenMobile: vi.fn(),
}))
const platform = vi.hoisted(() => ({ mobile: true }))

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => sidebar }))
vi.mock('@/lib/platform', () => ({ isMobilePlatform: () => platform.mobile }))

type Point = { x: number; y: number }

function touchEvent(
  type: string,
  target: EventTarget,
  points: Point[],
  timeStamp: number,
  changed: Point[] = points
): Event {
  const toTouches = (list: Point[]) =>
    list.map((p) => ({ clientX: p.x, clientY: p.y, target }))
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: toTouches(points) })
  Object.defineProperty(event, 'changedTouches', { value: toTouches(changed) })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
  return event
}

/** One-finger swipe from `from` to `to`; returns the first touchmove event. */
function swipe(target: EventTarget, from: Point, to: Point, { holdMs = 0, durationMs = 150 } = {}) {
  touchEvent('touchstart', target, [from], 0)
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const move = touchEvent('touchmove', target, [mid], holdMs + durationMs / 2)
  touchEvent('touchmove', target, [to], holdMs + durationMs)
  touchEvent('touchend', target, [], holdMs + durationMs, [to])
  return move
}

let content: HTMLElement
let sidebarEl: HTMLElement
let rerender: (ui: React.ReactElement) => void

/** Changes the mocked sidebar state and re-renders, as a real state change would. */
function setSidebar(patch: Partial<typeof sidebar>) {
  Object.assign(sidebar, patch)
  rerender(<SidebarSwipeGestures />)
}

beforeEach(() => {
  platform.mobile = true
  Object.assign(sidebar, { isMobile: false, open: false, openMobile: false })
  content = document.createElement('main')
  sidebarEl = document.createElement('div')
  sidebarEl.dataset.slot = 'sidebar'
  const item = document.createElement('a')
  sidebarEl.appendChild(item)
  document.body.append(sidebarEl, content)
  ;({ rerender } = render(<SidebarSwipeGestures />))
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('SidebarSwipeGestures', () => {
  it('opens the sidebar on a swipe right from the left edge', () => {
    const move = swipe(content, { x: 5, y: 300 }, { x: 160, y: 310 })
    expect(sidebar.setOpen).toHaveBeenCalledWith(true)
    expect(move.defaultPrevented).toBe(true)
  })

  it('opens the phone sheet instead when the sidebar is in mobile mode', () => {
    setSidebar({ isMobile: true })
    swipe(content, { x: 5, y: 300 }, { x: 160, y: 300 })
    expect(sidebar.setOpenMobile).toHaveBeenCalledWith(true)
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('ignores swipes that start away from the edge', () => {
    swipe(content, { x: 120, y: 300 }, { x: 300, y: 300 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('ignores mostly vertical drags from the edge and lets them scroll', () => {
    const move = swipe(content, { x: 5, y: 300 }, { x: 60, y: 500 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
    expect(move.defaultPrevented).toBe(false)
  })

  it('ignores short swipes that are too slow to count as a flick', () => {
    swipe(content, { x: 5, y: 300 }, { x: 45, y: 300 }, { durationMs: 200 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('accepts a short fast flick', () => {
    swipe(content, { x: 5, y: 300 }, { x: 45, y: 300 }, { durationMs: 60 })
    expect(sidebar.setOpen).toHaveBeenCalledWith(true)
  })

  it('leaves long-press drags alone', () => {
    swipe(content, { x: 5, y: 300 }, { x: 200, y: 300 }, { holdMs: 400 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('does not open over a dialog', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    swipe(content, { x: 5, y: 300 }, { x: 200, y: 300 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('closes the sidebar on a swipe left on the sidebar', () => {
    setSidebar({ open: true })
    swipe(sidebarEl.firstElementChild!, { x: 200, y: 300 }, { x: 40, y: 290 })
    expect(sidebar.setOpen).toHaveBeenCalledWith(false)
  })

  it('does not close on a swipe right on the sidebar or a swipe left on the page', () => {
    setSidebar({ open: true })
    swipe(sidebarEl, { x: 40, y: 300 }, { x: 200, y: 300 })
    swipe(content, { x: 600, y: 300 }, { x: 300, y: 300 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('cancels when a second finger touches down', () => {
    touchEvent('touchstart', content, [{ x: 5, y: 300 }], 0)
    touchEvent('touchmove', content, [{ x: 40, y: 300 }, { x: 400, y: 300 }], 50)
    touchEvent('touchend', content, [], 100, [{ x: 200, y: 300 }])
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })

  it('does nothing on desktop', () => {
    cleanup()
    platform.mobile = false
    render(<SidebarSwipeGestures />)
    swipe(content, { x: 5, y: 300 }, { x: 200, y: 300 })
    expect(sidebar.setOpen).not.toHaveBeenCalled()
  })
})
