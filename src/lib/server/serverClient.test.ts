import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettingMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn<(key: string) => Promise<string | null>>(),
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: getSettingMock,
  setSetting: vi.fn(),
}))

import { serverFetchJson, serverGetMe } from '@/lib/server/serverClient'

describe('serverClient', () => {
  beforeEach(() => {
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === 'dev_simulate_server_offline') return ''
      return null
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('throws network when dev_simulate_server_offline is true', async () => {
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === 'dev_simulate_server_offline') return 'true'
      return null
    })
    await expect(serverFetchJson('http://localhost', '/v1/me')).rejects.toMatchObject({
      kind: 'network',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maps 401 to unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(serverGetMe('http://localhost', 'tok')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    })
  })

  it('maps 409 to conflict', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('merge', { status: 409 }))
    await expect(serverFetchJson('http://localhost', '/v1/x', { token: 't' })).rejects.toMatchObject({
      kind: 'conflict',
      status: 409,
    })
  })

  it('maps transport errors to network', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(serverFetchJson('http://localhost', '/v1/x')).rejects.toMatchObject({
      kind: 'network',
    })
  })
})
