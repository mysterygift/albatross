export const SYNC_V2_PROTOCOL_VERSION = '2.0' as const

export type SyncV2ProtocolVersion = typeof SYNC_V2_PROTOCOL_VERSION

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

/** A durable feed position. It is encoded on the wire as `<epoch>:<sequence>`. */
export type SyncCursor = {
  epoch: string
  sequence: number
}

export type SyncV2Capability =
  | 'bootstrap'
  | 'snapshot'
  | 'pull'
  | 'push'
  | 'ack'
  | 'encrypted_sensitive_fields'

export type SyncV2Discovery = {
  serverInstanceId: string
  apiVersions: string[]
  schemaVersion: number
  registryHash: string
  tlsIdentity: {
    algorithm: string
    fingerprint: string
  } | null
  capabilities: SyncV2Capability[]
  limits: {
    maxMutationOperations: number
    maxPullBatches: number
    maxSnapshotBytes: number
  }
}

export type SyncV2CompatibilityRequirements = {
  protocolVersion: string
  schemaVersion: number
  registryHash: string
  requiredCapabilities?: SyncV2Capability[]
}

export type SyncV2Compatibility =
  | { compatible: true }
  | {
      compatible: false
      reasons: Array<
        | 'protocol_version'
        | 'schema_version'
        | 'registry_hash'
        | `missing_capability:${SyncV2Capability}`
      >
    }

export type SnapshotMetadata = {
  projectId: string
  productionId: string
  cursor: SyncCursor
  schemaVersion: number
  registryHash: string
  snapshotHash: string
  format: string
  byteLength: number
  tableCounts: Record<string, number>
  assetsManifestHash: string | null
}

export type ChangeTombstone = {
  deletedAt: string
  deletedBy: string | null
  reason: string | null
}

export type UpsertChangeRow = {
  ordinal: number
  table: string
  rowId: string
  operation: 'upsert'
  rowVersion: number
  row: JsonObject
}

export type DeleteChangeRow = {
  ordinal: number
  table: string
  rowId: string
  operation: 'delete'
  rowVersion: number
  tombstone: ChangeTombstone
}

export type ChangeRow = UpsertChangeRow | DeleteChangeRow

export type ChangeBatch = {
  cursor: SyncCursor
  transactionId: string
  actorUserId: string | null
  clientId: string
  mutationId: string
  committedAt: string
  changes: ChangeRow[]
}

export type PullChangesResponse = {
  projectId: string
  after: SyncCursor
  head: SyncCursor
  batches: ChangeBatch[]
  hasMore: boolean
}

type MutationOperationBase = {
  table: string
  rowId: string
}

export type CreateMutationOperation = MutationOperationBase & {
  operation: 'create'
  baseVersion: null
  fullRow: JsonObject
}

export type PatchMutationOperation = MutationOperationBase & {
  operation: 'patch'
  baseVersion: number
  baseValues: JsonObject
  patch: JsonObject
}

export type DeleteMutationOperation = MutationOperationBase & {
  operation: 'delete'
  baseVersion: number
  baseValues: JsonObject
}

export type MutationOperation =
  | CreateMutationOperation
  | PatchMutationOperation
  | DeleteMutationOperation

/** One request is one all-or-nothing local logical transaction. */
export type PushMutationRequest = {
  protocolVersion: SyncV2ProtocolVersion
  schemaVersion: number
  registryHash: string
  mutationId: string
  clientId: string
  baseCursor: SyncCursor
  operations: MutationOperation[]
}

export type PushMutationResponse = {
  mutationId: string
  replayed: boolean
  committedCursor: SyncCursor
  batch: ChangeBatch
}

export type AckRequest = {
  clientId: string
  appliedCursor: SyncCursor
}

export type AckResponse = {
  acknowledgedCursor: SyncCursor
  serverHead: SyncCursor
}

export const SYNC_V2_ERROR_CODES = [
  'incompatible_protocol',
  'incompatible_schema',
  'registry_mismatch',
  'unauthorized',
  'forbidden',
  'validation_failed',
  'conflict',
  'cursor_expired',
  'epoch_changed',
  'device_revoked',
  'mutation_id_reused',
  'payload_too_large',
  'rate_limited',
  'server_error',
] as const

export type SyncV2ErrorCode = (typeof SYNC_V2_ERROR_CODES)[number]

export type SyncV2ErrorBody = {
  error: {
    code: SyncV2ErrorCode
    message: string
    retryable: boolean
    requestId: string | null
    details: JsonObject | null
  }
}
