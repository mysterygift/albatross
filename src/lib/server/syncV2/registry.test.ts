import { describe, expect, it } from 'vitest'

import {
  COLLABORATION_REGISTRY_DESCRIPTOR,
  COLLABORATION_REGISTRY_HASH,
  canonicalizeRegistry,
  computeCollaborationRegistryHash,
  getAssetColumns,
  getCollaborationTable,
  getDeleteTableOrder,
  getDeferredForeignKeyColumns,
  getLocalOnlyColumns,
  getSensitiveColumns,
  getSnapshotTableOrder,
  mergePilotInboundRow,
  preparePilotRowForReplication,
} from './registry'

describe('sync v2 pilot collaboration registry', () => {
  it('is explicitly a partial pilot registry', () => {
    expect(COLLABORATION_REGISTRY_DESCRIPTOR).toMatchObject({
      protocol: 'sync-v2',
      version: 'pilot-v1.0.0',
      scope: 'pilot-v1-partial',
      fullSchemaParity: false,
    })
    expect(COLLABORATION_REGISTRY_DESCRIPTOR.tables.map(({ table }) => table)).toEqual([
      'productions',
      'scenes',
      'shots',
    ])
  })

  it('orders parent rows before children and reverses that order for deletes', () => {
    expect(getSnapshotTableOrder()).toEqual(['productions', 'scenes', 'shots'])
    expect(getDeleteTableOrder()).toEqual(['shots', 'scenes', 'productions'])
  })

  it('describes direct and transitive production ownership', () => {
    expect(getCollaborationTable('productions')?.ownership).toEqual({
      kind: 'self',
      column: 'id',
    })
    expect(getCollaborationTable('scenes')?.ownership).toEqual({
      kind: 'column',
      column: 'production_id',
    })
    expect(getCollaborationTable('shots')?.ownership).toEqual({
      kind: 'parent',
      column: 'scene_id',
      parentTable: 'scenes',
    })
  })

  it('classifies policy hooks without silently claiming foreign-key closure', () => {
    for (const table of ['productions', 'scenes', 'shots']) {
      expect(getSensitiveColumns(table)).toEqual([])
      expect(getAssetColumns(table)).toEqual([])
      expect(getLocalOnlyColumns(table)).toEqual([])
    }
    expect(getDeferredForeignKeyColumns('productions')).toEqual(['client_id'])
    expect(getDeferredForeignKeyColumns('scenes')).toEqual(['location_id', 'episode_id'])
    expect(getDeferredForeignKeyColumns('shots')).toEqual([])
    expect(getCollaborationTable('not_registered')).toBeUndefined()
  })

  it('omits deferred nullable foreign keys from pilot wire rows', () => {
    expect(preparePilotRowForReplication('scenes', {
      id: 'scene-1',
      production_id: 'production-1',
      location_id: 'location-1',
      episode_id: 'episode-1',
      title: 'Arrival',
    })).toEqual({
      id: 'scene-1',
      production_id: 'production-1',
      title: 'Arrival',
    })
  })

  it('preserves deferred fields on host echo and omits them on a new replica', () => {
    const wireRow = preparePilotRowForReplication('scenes', {
      id: 'scene-1',
      production_id: 'production-1',
      location_id: 'location-1',
      episode_id: 'episode-1',
      title: 'Arrival',
    })

    expect(mergePilotInboundRow('scenes', wireRow, {
      location_id: 'location-1',
      episode_id: 'episode-1',
    })).toMatchObject({
      location_id: 'location-1',
      episode_id: 'episode-1',
    })
    expect(mergePilotInboundRow('scenes', wireRow)).not.toHaveProperty('location_id')
    expect(mergePilotInboundRow('scenes', wireRow)).not.toHaveProperty('episode_id')
  })

  it('canonicalizes object keys independently of insertion order', () => {
    expect(canonicalizeRegistry({ z: 1, nested: { b: 2, a: 1 } })).toBe(
      canonicalizeRegistry({ nested: { a: 1, b: 2 }, z: 1 }),
    )
  })

  it('keeps the pinned registry hash synchronized with the canonical descriptor', async () => {
    await expect(computeCollaborationRegistryHash()).resolves.toBe(COLLABORATION_REGISTRY_HASH)
  })
})
