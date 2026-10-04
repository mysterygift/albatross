// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApfDesktopOpenBridge } from '@/features/productions/ApfDesktopOpenBridge'

const native = vi.hoisted(() => ({
  queue: [] as string[],
  calls: [] as string[],
  handler: null as null | ((event: { payload: { paths: string[] } }) => unknown),
}))
const runImport = vi.hoisted(() => vi.fn(async (_path: string) => ({ kind: 'imported', message: 'ok' })))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    native.calls.push(cmd)
    if (cmd === 'pop_pending_apf_open_paths') return native.queue.splice(0)
    return undefined
  }),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: typeof native.handler) => {
    native.calls.push('listen')
    native.handler = handler
    return () => {}
  }),
}))
vi.mock('@/features/productions/apfImportFlow', () => ({ runApfImportWithUiFollowUp: runImport }))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ setCurrentProductionId: vi.fn(), refetchProductions: vi.fn() }),
}))
vi.mock('@/components/ui/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderBridge({ strict = false } = {}) {
  const tree = (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ApfDesktopOpenBridge />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  native.queue = []
  native.calls = []
  native.handler = null
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ApfDesktopOpenBridge', () => {
  it('starts listening before draining the cold-start queue, then imports the queued file', async () => {
    native.queue = ['/tmp/apf-open/Cold.apf']
    renderBridge()
    await flush()
    expect(native.calls.slice(0, 2)).toEqual(['listen', 'pop_pending_apf_open_paths'])
    expect(runImport).toHaveBeenCalledWith('/tmp/apf-open/Cold.apf', expect.any(Object))
  })

  it('imports the cold-start file when the effect is mounted twice (StrictMode)', async () => {
    native.queue = ['/tmp/apf-open/Cold.apf']
    renderBridge({ strict: true })
    await flush()
    expect(runImport).toHaveBeenCalledTimes(1)
    expect(runImport).toHaveBeenCalledWith('/tmp/apf-open/Cold.apf', expect.any(Object))
  })

  it('drains the queue when an open event arrives so the file is not imported again later', async () => {
    renderBridge()
    await flush()
    // iOS: Rust queues the file and emits the event.
    native.queue = ['/tmp/apf-open/Warm.apf']
    await act(async () => {
      await native.handler!({ payload: { paths: ['/tmp/apf-open/Warm.apf'] } })
    })
    await flush()
    expect(runImport).toHaveBeenCalledTimes(1)
    expect(runImport).toHaveBeenCalledWith('/tmp/apf-open/Warm.apf', expect.any(Object))
    expect(native.queue).toEqual([])
  })

  it('uses the event payload when nothing is queued (desktop second instance)', async () => {
    renderBridge()
    await flush()
    await act(async () => {
      await native.handler!({ payload: { paths: ['C:\\\\Projects\\\\Second.apf'] } })
    })
    await flush()
    expect(runImport).toHaveBeenCalledWith('C:\\\\Projects\\\\Second.apf', expect.any(Object))
  })
})
