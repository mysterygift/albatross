/**
 * Platform detection for the iOS/iPadOS build. Desktop Tauri (macOS/Windows/Linux) has a native
 * menu bar and a mouse; iOS has neither, so a few surfaces switch behaviour on these checks.
 */

function userAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
}

/**
 * True on iPhone and iPad. iPadOS reports a desktop Mac user agent, so an iPad is recognised as
 * "Macintosh" with a multi-touch screen (desktop Macs report zero touch points).
 */
export function isIosPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = userAgent()
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
}

/** True on iOS and Android: touch-first, sandboxed, no native menu bar. */
export function isMobilePlatform(): boolean {
  return isIosPlatform() || /Android/i.test(userAgent())
}

/**
 * Whether the native (Tauri desktop) menu bar is present. False in a plain browser (dev) and on
 * mobile, where menu-only actions need an in-app entry point instead.
 */
export function hasNativeMenuBar(): boolean {
  if (typeof window === 'undefined') return false
  // Same check as `isTauri()` from @tauri-apps/api/core, without importing it (tests mock that module).
  const isTauri = Boolean((globalThis as unknown as { isTauri?: boolean }).isTauri)
  return isTauri && !isMobilePlatform()
}

/** Tags `<html>` with `data-platform` so CSS can apply mobile-only fixes (safe areas, touch). */
export function applyPlatformAttribute(root: HTMLElement = document.documentElement): void {
  if (isIosPlatform()) root.dataset.platform = 'ios'
  else if (isMobilePlatform()) root.dataset.platform = 'android'
}

/** Below Tailwind's `md` breakpoint: iPhone portrait, where side-by-side panels don't fit. */
export const PHONE_MAX_WIDTH = 767

/**
 * True when the viewport is phone-sized: narrower than `md` (iPhone portrait) or shorter than a
 * tablet in landscape (iPhone landscape). Read once for initial state; layouts that must follow
 * rotation should use `useIsPhone` instead.
 */
export function isPhoneViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px), (max-height: 500px)`).matches
}
