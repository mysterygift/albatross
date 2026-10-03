// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'

const store = vi.hoisted(() => ({ value: null as string | null, set: vi.fn() }))

vi.mock('@/lib/db/repositories/settings', () => ({
  DEVELOPER_MODE_SETTING_KEY: 'developer_mode',
  getSetting: vi.fn(async () => store.value),
  setSetting: vi.fn(async (_k: string, v: string) => {
    store.value = v
    store.set(v)
  }),
}))

import { useDeveloperMode } from './useDeveloperMode'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useDeveloperMode', () => {
  afterEach(() => {
    cleanup()
    store.value = null
    store.set.mockClear()
  })

  it('defaults to false', async () => {
    const { result } = renderHook(() => useDeveloperMode(), { wrapper })
    expect(result.current.developerMode).toBe(false)
    await waitFor(() => expect(result.current.developerMode).toBe(false))
  })

  it('reads a stored true value', async () => {
    store.value = 'true'
    const { result } = renderHook(() => useDeveloperMode(), { wrapper })
    await waitFor(() => expect(result.current.developerMode).toBe(true))
  })

  it('persists changes', async () => {
    const { result } = renderHook(() => useDeveloperMode(), { wrapper })
    act(() => result.current.setDeveloperMode(true))
    await waitFor(() => expect(store.set).toHaveBeenCalledWith('true'))
    await waitFor(() => expect(result.current.developerMode).toBe(true))
  })
})
