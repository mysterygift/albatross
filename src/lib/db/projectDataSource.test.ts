import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  ensureSettingsDefaults: vi.fn(async () => undefined),
  getLinkedProjectByProductionId: vi.fn(),
  getServerConnectionById: vi.fn(),
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: mocks.getSetting,
  ensureSettingsDefaults: mocks.ensureSettingsDefaults,
}))
vi.mock('@/lib/server/linkedProjectRepository', () => ({
  getLinkedProjectByProductionId: mocks.getLinkedProjectByProductionId,
}))
vi.mock('@/lib/server/serverConnectionRepository', () => ({
  getServerConnectionById: mocks.getServerConnectionById,
}))

import {
  getEffectiveDataSourceForProduction,
  resolveServerPublishContext,
} from '@/lib/db/projectDataSource'
import {
  LEGACY_SERVER_PUBLISH_ENABLED_KEY,
  LOCAL_COLLABORATION_ENABLED_KEY,
} from '@/lib/server/constants'

describe('project collaboration data source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps repositories on SQLite when collaboration is disabled', async () => {
    mocks.getSetting.mockImplementation(async (key: string) =>
      key === LOCAL_COLLABORATION_ENABLED_KEY ? 'false' : null
    )

    await expect(getEffectiveDataSourceForProduction('production-1')).resolves.toBe('local_sqlite')
    expect(mocks.getLinkedProjectByProductionId).not.toHaveBeenCalled()
  })

  it('does not activate the beta remote runtime from the sync-v2 setting', async () => {
    mocks.getSetting.mockImplementation(async (key: string) =>
      key === LOCAL_COLLABORATION_ENABLED_KEY ? 'true' : 'false'
    )
    mocks.getLinkedProjectByProductionId.mockResolvedValue({ link_state: 'linked' })

    await expect(getEffectiveDataSourceForProduction('production-1')).resolves.toBe('local_sqlite')
    expect(mocks.getLinkedProjectByProductionId).not.toHaveBeenCalled()
  })

  it('retains the beta remote runtime only for an explicitly legacy-enabled link', async () => {
    mocks.getSetting.mockResolvedValue('true')
    mocks.getLinkedProjectByProductionId.mockResolvedValue({ link_state: 'linked' })

    await expect(getEffectiveDataSourceForProduction('production-1')).resolves.toBe('remote_server')
  })

  it('does not resolve credentials while collaboration is paused globally', async () => {
    mocks.getSetting.mockResolvedValue('false')

    await expect(resolveServerPublishContext('production-1')).resolves.toBeNull()
    expect(mocks.getLinkedProjectByProductionId).not.toHaveBeenCalled()
    expect(mocks.getServerConnectionById).not.toHaveBeenCalled()
  })

  it('resolves an enabled linked production without conflating production and server project ids', async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      if (key === LOCAL_COLLABORATION_ENABLED_KEY) return 'true'
      if (key === LEGACY_SERVER_PUBLISH_ENABLED_KEY) return 'true'
      if (key === 'server_session_token:connection-1') return 'secret-token'
      return null
    })
    mocks.getLinkedProjectByProductionId.mockResolvedValue({
      production_id: 'production-1',
      connection_id: 'connection-1',
      remote_project_id: 'server-project-9',
      link_state: 'linked',
    })
    mocks.getServerConnectionById.mockResolvedValue({
      id: 'connection-1',
      base_url: 'https://host.local:7443',
    })

    await expect(resolveServerPublishContext('production-1')).resolves.toEqual({
      productionId: 'production-1',
      connectionId: 'connection-1',
      baseUrl: 'https://host.local:7443',
      token: 'secret-token',
      remoteProjectId: 'server-project-9',
      linkState: 'linked',
    })
  })
})
