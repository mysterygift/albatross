// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ mobile: false }))
vi.mock('@/lib/platform', () => ({ isMobilePlatform: () => platform.mobile }))

import { useTouchLayout } from './useTouchLayout'

const STORAGE_KEY = 'albatross.scriptSupervisor.touchLayout'

// Node 25+ ships a global `localStorage` that shadows jsdom's (and is undefined without
// --localstorage-file), so give the hook a plain in-memory store.
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  })
})
afterEach(() => {
  platform.mobile = false
  vi.unstubAllGlobals()
})

describe('useTouchLayout', () => {
  it('is always on with no toggle on iOS/Android, even if turned off before', () => {
    platform.mobile = true
    window.localStorage.setItem(STORAGE_KEY, 'false')
    const { result } = renderHook(() => useTouchLayout())
    expect(result.current).toEqual([true, null])
  })

  it('is an off-by-default, remembered preference on desktop', () => {
    const { result } = renderHook(() => useTouchLayout())
    expect(result.current[0]).toBe(false)
    act(() => result.current[1]!())
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
  })
})
