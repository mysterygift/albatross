// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { useIsPhone, usePhoneWidth } from '@/hooks/use-is-phone'

/** matchMedia stub that evaluates min/max width/height terms against a settable viewport. */
const viewport = { width: 390, height: 844 }
const listeners = new Set<() => void>()

function evaluate(query: string): boolean {
  return query.split(',').some((part) =>
    [...part.matchAll(/\((max|min)-(width|height):\s*(\d+)px\)/g)].every(([, kind, dim, px]) => {
      const value = dim === 'width' ? viewport.width : viewport.height
      return kind === 'max' ? value <= Number(px) : value >= Number(px)
    })
  )
}

function resize(width: number, height: number) {
  viewport.width = width
  viewport.height = height
  act(() => listeners.forEach((l) => l()))
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return evaluate(query)
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }))
})

afterEach(() => {
  cleanup()
  listeners.clear()
  vi.unstubAllGlobals()
})

describe('phone viewport rule', () => {
  it('treats an iPhone as a phone in portrait and in landscape, including the widest models', () => {
    resize(390, 844)
    const { result } = renderHook(() => useIsPhone())
    expect(result.current).toBe(true)
    resize(932, 430) // iPhone Pro Max on its side: wider than the `md` breakpoint
    expect(result.current).toBe(true)
  })

  it('does not treat a tablet as a phone in either orientation', () => {
    resize(1024, 768)
    const { result } = renderHook(() => useIsPhone())
    expect(result.current).toBe(false)
    resize(768, 1024)
    expect(result.current).toBe(false)
  })

  it('keeps usePhoneWidth width-only', () => {
    resize(932, 430)
    const { result } = renderHook(() => usePhoneWidth())
    expect(result.current).toBe(false)
    resize(390, 844)
    expect(result.current).toBe(true)
  })
})
