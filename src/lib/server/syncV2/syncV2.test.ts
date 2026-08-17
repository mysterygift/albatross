import { describe, expect, it, vi } from 'vitest'
import {
  SYNC_V2_PROTOCOL_VERSION,
  SyncV2Client,
  SyncV2RequestError,
  checkSyncV2Compatibility,
  decodeSyncCursor,
  encodeSyncCursor,
  parsePullChangesResponse,
  parsePushMutationResponse,
  type PushMutationRequest,
  type SyncV2Discovery,
  type SyncV2Transport,
  type SyncV2TransportRequest,
  type SyncV2TransportResponse,
} from '@/lib/server/syncV2'

const EPOCH = '32e8ed48-560c-4692-9c9c-25b436e43a1d'

function discovery(): SyncV2Discovery {
  return {
    serverInstanceId: 'server-instance-1',
    apiVersions: ['2.0'],
    schemaVersion: 68,
    registryHash: 'sha256:registry',
    tlsIdentity: { algorithm: 'sha256', fingerprint: 'AA:BB:CC' },
    capabilities: ['snapshot', 'pull', 'push', 'ack', 'encrypted_sensitive_fields'],
    limits: {
      maxMutationOperations: 100,
      maxPullBatches: 50,
      maxSnapshotBytes: 1_000_000,
    },
  }
}

function changeBatch(sequence = 4) {
  return {
    cursor: `${EPOCH}:${sequence}`,
    transactionId: 'transaction-0001',
    actorUserId: 'user-1',
    clientId: 'client-install-1',
    mutationId: 'mutation-0001',
    committedAt: '2026-08-17T12:00:00.000Z',
    changes: [
      {
        ordinal: 0,
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'upsert' as const,
        rowVersion: 3,
        row: { id: 'scene-1', heading: 'EXT. BEACH - DAY' },
      },
      {
        ordinal: 1,
        table: 'scenes',
        rowId: 'scene-old',
        operation: 'delete' as const,
        rowVersion: 8,
        tombstone: {
          deletedAt: '2026-08-17T12:00:00.000Z',
          deletedBy: 'user-1',
          reason: null,
        },
      },
    ],
  }
}

function mutation(): PushMutationRequest {
  return {
    protocolVersion: SYNC_V2_PROTOCOL_VERSION,
    schemaVersion: 68,
    registryHash: 'sha256:registry',
    mutationId: 'mutation-0001',
    clientId: 'client-install-1',
    baseCursor: { epoch: EPOCH, sequence: 3 },
    operations: [
      {
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'patch',
        baseVersion: 2,
        baseValues: { heading: 'EXT. COAST - DAY' },
        patch: { heading: 'EXT. BEACH - DAY' },
      },
    ],
  }
}

function fakeTransport(handler: (request: SyncV2TransportRequest) => SyncV2TransportResponse): {
  transport: SyncV2Transport
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(async (input: SyncV2TransportRequest) => handler(input))
  return { transport: { request }, request }
}

describe('sync-v2 cursor codec', () => {
  it('round trips an epoch and safe sequence', () => {
    const cursor = { epoch: EPOCH, sequence: 42 }
    expect(decodeSyncCursor(encodeSyncCursor(cursor))).toEqual(cursor)
  })

  it.each(['', EPOCH, `${EPOCH}:-1`, `${EPOCH}:01`, `${EPOCH}:1.5`])(
    'rejects malformed cursor %j',
    (value) => expect(() => decodeSyncCursor(value)).toThrow('Invalid sync cursor'),
  )
})

describe('sync-v2 response codecs', () => {
  it('decodes ordered batches, full rows, versions, and tombstones', () => {
    const result = parsePullChangesResponse({
      projectId: 'project-0001',
      after: `${EPOCH}:3`,
      head: `${EPOCH}:5`,
      batches: [changeBatch(4)],
      hasMore: true,
    })

    expect(result.batches[0]?.cursor).toEqual({ epoch: EPOCH, sequence: 4 })
    expect(result.batches[0]?.changes[1]).toMatchObject({
      operation: 'delete',
      rowVersion: 8,
      tombstone: { deletedBy: 'user-1' },
    })
  })

  it('rejects reordered batch cursors and non-contiguous change ordinals', () => {
    const batch = changeBatch(3)
    batch.changes[1]!.ordinal = 4
    expect(() => parsePullChangesResponse({
      projectId: 'project-0001',
      after: `${EPOCH}:3`,
      head: `${EPOCH}:5`,
      batches: [batch],
      hasMore: false,
    })).toThrow('Change ordinals must be contiguous')
  })

  it('requires the committed cursor and mutation ID to match the returned batch', () => {
    expect(() => parsePushMutationResponse({
      mutationId: 'different-mutation',
      replayed: false,
      committedCursor: `${EPOCH}:5`,
      batch: changeBatch(4),
    })).toThrow('Committed cursor must identify the returned batch')
  })
})

describe('sync-v2 discovery compatibility', () => {
  it('accepts a matching protocol, registry, schema, and required capabilities', () => {
    expect(checkSyncV2Compatibility(discovery(), {
      protocolVersion: '2.0',
      schemaVersion: 68,
      registryHash: 'sha256:registry',
      requiredCapabilities: ['pull', 'encrypted_sensitive_fields'],
    })).toEqual({ compatible: true })
  })

  it('reports every incompatibility before any join or publish mutation', () => {
    expect(checkSyncV2Compatibility(discovery(), {
      protocolVersion: '2.1',
      schemaVersion: 69,
      registryHash: 'sha256:other',
      requiredCapabilities: ['bootstrap'],
    })).toEqual({
      compatible: false,
      reasons: [
        'protocol_version',
        'schema_version',
        'registry_hash',
        'missing_capability:bootstrap',
      ],
    })
  })
})

describe('SyncV2Client', () => {
  it('discovers without auth and parses the versioned contract', async () => {
    const fake = fakeTransport(() => ({ status: 200, body: discovery() }))
    const client = new SyncV2Client({
      baseUrl: 'http://lan-host:4123/',
      token: 'secret',
      transport: fake.transport,
    })

    await expect(client.discover()).resolves.toEqual(discovery())
    expect(fake.request).toHaveBeenCalledWith({
      method: 'GET',
      url: 'http://lan-host:4123/.well-known/albatross',
      headers: { Accept: 'application/json' },
      body: undefined,
    })
  })

  it('encodes pull cursors and never relies on realtime hints for change data', async () => {
    const fake = fakeTransport(() => ({
      status: 200,
      body: {
        projectId: 'project/one',
        after: `${EPOCH}:3`,
        head: `${EPOCH}:4`,
        batches: [changeBatch(4)],
        hasMore: false,
      },
    }))
    const client = new SyncV2Client({ baseUrl: 'https://host', token: 'tok', transport: fake.transport })

    const result = await client.pull('project/one', { epoch: EPOCH, sequence: 3 }, 25)

    expect(result.head.sequence).toBe(4)
    expect(fake.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: `https://host/v2/projects/project%2Fone/sync/changes?after=${encodeURIComponent(`${EPOCH}:3`)}&limit=25`,
      headers: { Accept: 'application/json', Authorization: 'Bearer tok' },
    }))
  })

  it('pushes one logical mutation transaction with its durable ID and base versions', async () => {
    const fake = fakeTransport(() => ({
      status: 200,
      body: {
        mutationId: 'mutation-0001',
        replayed: false,
        committedCursor: `${EPOCH}:4`,
        batch: changeBatch(4),
      },
    }))
    const client = new SyncV2Client({ baseUrl: 'http://host', token: 'tok', transport: fake.transport })

    const result = await client.push('project-0001', mutation())

    expect(result.committedCursor.sequence).toBe(4)
    expect(fake.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'http://host/v2/projects/project-0001/sync/mutations',
      body: expect.objectContaining({
        mutationId: 'mutation-0001',
        baseCursor: `${EPOCH}:3`,
        operations: [expect.objectContaining({ baseVersion: 2, operation: 'patch' })],
      }),
    }))
  })

  it('requests snapshot metadata and acknowledges the atomically applied cursor', async () => {
    const fake = fakeTransport((request) => request.headers.Accept.includes('snapshot-metadata')
      ? {
          status: 200,
          body: {
            projectId: 'project-0001',
            productionId: 'production-0001',
            cursor: `${EPOCH}:10`,
            schemaVersion: 68,
            registryHash: 'sha256:registry',
            snapshotHash: 'sha256:snapshot',
            format: 'application/vnd.albatross.snapshot+zip;version=2',
            byteLength: 42,
            tableCounts: { scenes: 2 },
            assetsManifestHash: null,
          },
        }
      : {
          status: 200,
          body: {
            acknowledgedCursor: `${EPOCH}:10`,
            serverHead: `${EPOCH}:12`,
          },
        })
    const client = new SyncV2Client({ baseUrl: 'http://host', token: 'tok', transport: fake.transport })

    await expect(client.getSnapshotMetadata('project-0001')).resolves.toMatchObject({
      productionId: 'production-0001',
      cursor: { sequence: 10 },
    })
    await expect(client.acknowledge('project-0001', {
      clientId: 'client-install-1',
      appliedCursor: { epoch: EPOCH, sequence: 10 },
    })).resolves.toMatchObject({ serverHead: { sequence: 12 } })

    expect(fake.request).toHaveBeenLastCalledWith(expect.objectContaining({
      body: { clientId: 'client-install-1', appliedCursor: `${EPOCH}:10` },
    }))
  })

  it('rejects successful responses that do not belong to the request', async () => {
    const pullTransport = fakeTransport(() => ({
      status: 200,
      body: {
        projectId: 'wrong-project',
        after: `${EPOCH}:3`,
        head: `${EPOCH}:4`,
        batches: [changeBatch(4)],
        hasMore: false,
      },
    }))
    const client = new SyncV2Client({ baseUrl: 'http://host', transport: pullTransport.transport })

    await expect(client.pull('project-0001', { epoch: EPOCH, sequence: 3 })).rejects.toMatchObject({
      code: 'invalid_response',
      retryable: false,
    })

    const ackTransport = fakeTransport(() => ({
      status: 200,
      body: { acknowledgedCursor: `${EPOCH}:9`, serverHead: `${EPOCH}:10` },
    }))
    const ackClient = new SyncV2Client({ baseUrl: 'http://host', transport: ackTransport.transport })
    await expect(ackClient.acknowledge('project-0001', {
      clientId: 'client-install-1',
      appliedCursor: { epoch: EPOCH, sequence: 10 },
    })).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('preserves structured retry and conflict details from non-success responses', async () => {
    const fake = fakeTransport(() => ({
      status: 409,
      body: {
        error: {
          code: 'conflict',
          message: 'Scene changed on the server.',
          retryable: false,
          requestId: 'request-0001',
          details: { table: 'scenes', rowId: 'scene-1', currentVersion: 3 },
        },
      },
    }))
    const client = new SyncV2Client({ baseUrl: 'http://host', transport: fake.transport })

    const error = await client.push('project-0001', mutation()).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(SyncV2RequestError)
    expect(error).toMatchObject({
      status: 409,
      code: 'conflict',
      retryable: false,
      requestId: 'request-0001',
      details: { currentVersion: 3 },
    })
  })

  it('rejects malformed successful responses instead of trusting server JSON', async () => {
    const fake = fakeTransport(() => ({ status: 200, body: { apiVersions: ['2.0'] } }))
    const client = new SyncV2Client({ baseUrl: 'http://host', transport: fake.transport })

    await expect(client.discover()).rejects.toMatchObject({
      code: 'invalid_response',
      retryable: false,
    })
  })
})
