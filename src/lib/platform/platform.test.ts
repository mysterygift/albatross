// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPlatformAttribute, hasNativeMenuBar, isIosPlatform, isMobilePlatform } from '@/lib/platform'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
// iPadOS sends a desktop Safari user agent.
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)'

function stubNavigator(userAgent: string, maxTouchPoints: number) {
  vi.stubGlobal('navigator', { ...navigator, userAgent, maxTouchPoints })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.platform
})

describe('platform detection', () => {
  it('recognises iPhone and iPad (desktop UA with touch) as iOS', () => {
    stubNavigator(IPHONE_UA, 5)
    expect(isIosPlatform()).toBe(true)
    stubNavigator(IPAD_UA, 5)
    expect(isIosPlatform()).toBe(true)
    expect(isMobilePlatform()).toBe(true)
  })

  it('treats a Mac without touch as desktop', () => {
    stubNavigator(IPAD_UA, 0)
    expect(isIosPlatform()).toBe(false)
    expect(isMobilePlatform()).toBe(false)
  })

  it('recognises Android as mobile but not iOS', () => {
    stubNavigator(ANDROID_UA, 5)
    expect(isIosPlatform()).toBe(false)
    expect(isMobilePlatform()).toBe(true)
  })

  it('reports a native menu bar only for desktop Tauri', () => {
    stubNavigator(IPAD_UA, 0)
    expect(hasNativeMenuBar()).toBe(false)
    vi.stubGlobal('isTauri', true)
    expect(hasNativeMenuBar()).toBe(true)
    stubNavigator(IPAD_UA, 5)
    expect(hasNativeMenuBar()).toBe(false)
  })

  it('tags <html> with data-platform on mobile only', () => {
    stubNavigator(IPAD_UA, 0)
    applyPlatformAttribute()
    expect(document.documentElement.dataset.platform).toBeUndefined()
    stubNavigator(IPAD_UA, 5)
    applyPlatformAttribute()
    expect(document.documentElement.dataset.platform).toBe('ios')
  })
})
