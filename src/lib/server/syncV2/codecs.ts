import { z } from 'zod'
import { decodeSyncCursor } from '@/lib/server/syncV2/cursor'
import {
  SYNC_V2_ERROR_CODES,
  type AckResponse,
  type ChangeBatch,
  type JsonObject,
  type JsonValue,
  type PullChangesResponse,
  type PushMutationRequest,
  type PushMutationResponse,
  type SnapshotMetadata,
  type SyncV2Discovery,
  type SyncV2ErrorBody,
} from '@/lib/server/syncV2/types'

const nonEmptyString = z.string().trim().min(1)
const durableId = z.string().trim().min(8).max(200)
const positiveVersion = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)
const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema)

export const syncCursorSchema = z.string().transform((value, context) => {
  try {
    return decodeSyncCursor(value)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid sync cursor.',
    })
    return z.NEVER
  }
})

export const discoverySchema = z.strictObject({
  serverInstanceId: durableId,
  apiVersions: z.array(nonEmptyString).min(1),
  schemaVersion: positiveVersion,
  registryHash: nonEmptyString,
  tlsIdentity: z.strictObject({
    algorithm: nonEmptyString,
    fingerprint: nonEmptyString,
  }).nullable(),
  capabilities: z.array(z.enum([
    'bootstrap',
    'snapshot',
    'pull',
    'push',
    'ack',
    'encrypted_sensitive_fields',
  ])),
  limits: z.strictObject({
    maxMutationOperations: z.number().int().positive(),
    maxPullBatches: z.number().int().positive(),
    maxSnapshotBytes: z.number().int().positive(),
  }),
})

export const snapshotMetadataSchema = z.strictObject({
  projectId: durableId,
  productionId: durableId,
  cursor: syncCursorSchema,
  schemaVersion: positiveVersion,
  registryHash: nonEmptyString,
  snapshotHash: nonEmptyString,
  format: nonEmptyString,
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  tableCounts: z.record(z.string(), z.number().int().nonnegative()),
  assetsManifestHash: nonEmptyString.nullable(),
})

const changeRowBase = {
  ordinal: z.number().int().nonnegative(),
  table: nonEmptyString,
  rowId: nonEmptyString,
  rowVersion: positiveVersion,
}

export const changeRowSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    ...changeRowBase,
    operation: z.literal('upsert'),
    row: jsonObjectSchema,
  }),
  z.strictObject({
    ...changeRowBase,
    operation: z.literal('delete'),
    tombstone: z.strictObject({
      deletedAt: z.iso.datetime({ offset: true }),
      deletedBy: nonEmptyString.nullable(),
      reason: z.string().nullable(),
    }),
  }),
])

export const changeBatchSchema: z.ZodType<ChangeBatch> = z.strictObject({
  cursor: syncCursorSchema,
  transactionId: durableId,
  actorUserId: nonEmptyString.nullable(),
  clientId: durableId,
  mutationId: durableId,
  committedAt: z.iso.datetime({ offset: true }),
  changes: z.array(changeRowSchema).min(1),
}).superRefine((batch, context) => {
  for (let index = 0; index < batch.changes.length; index += 1) {
    if (batch.changes[index]?.ordinal !== index) {
      context.addIssue({
        code: 'custom',
        path: ['changes', index, 'ordinal'],
        message: 'Change ordinals must be contiguous and zero-based.',
      })
    }
  }
})

export const pullChangesResponseSchema = z.strictObject({
  projectId: durableId,
  after: syncCursorSchema,
  head: syncCursorSchema,
  batches: z.array(changeBatchSchema),
  hasMore: z.boolean(),
}).superRefine((response, context) => {
  const epoch = response.after.epoch
  if (response.head.epoch !== epoch) {
    context.addIssue({ code: 'custom', path: ['head'], message: 'Pull cursors must share one epoch.' })
  }

  let previous = response.after.sequence
  for (let index = 0; index < response.batches.length; index += 1) {
    const cursor = response.batches[index]?.cursor
    if (!cursor || cursor.epoch !== epoch || cursor.sequence <= previous) {
      context.addIssue({
        code: 'custom',
        path: ['batches', index, 'cursor'],
        message: 'Change batch cursors must be ordered after the requested cursor in one epoch.',
      })
      continue
    }
    if (cursor.sequence > response.head.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['batches', index, 'cursor'],
        message: 'Change batch cursor cannot be ahead of the server head.',
      })
    }
    previous = cursor.sequence
  }
})

const mutationOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    table: nonEmptyString,
    rowId: nonEmptyString,
    operation: z.literal('create'),
    baseVersion: z.null(),
    fullRow: jsonObjectSchema,
  }),
  z.strictObject({
    table: nonEmptyString,
    rowId: nonEmptyString,
    operation: z.literal('patch'),
    baseVersion: positiveVersion,
    baseValues: jsonObjectSchema,
    patch: jsonObjectSchema,
  }),
  z.strictObject({
    table: nonEmptyString,
    rowId: nonEmptyString,
    operation: z.literal('delete'),
    baseVersion: positiveVersion,
    baseValues: jsonObjectSchema,
  }),
])

export const pushMutationRequestSchema = z.strictObject({
  protocolVersion: z.literal('2.0'),
  schemaVersion: positiveVersion,
  registryHash: nonEmptyString,
  mutationId: durableId,
  clientId: durableId,
  baseCursor: syncCursorSchema,
  operations: z.array(mutationOperationSchema).min(1),
})

export const pushMutationResponseSchema = z.strictObject({
  mutationId: durableId,
  replayed: z.boolean(),
  committedCursor: syncCursorSchema,
  batch: changeBatchSchema,
}).superRefine((response, context) => {
  if (
    response.committedCursor.epoch !== response.batch.cursor.epoch
    || response.committedCursor.sequence !== response.batch.cursor.sequence
  ) {
    context.addIssue({
      code: 'custom',
      path: ['batch', 'cursor'],
      message: 'Committed cursor must identify the returned batch.',
    })
  }
  if (response.mutationId !== response.batch.mutationId) {
    context.addIssue({
      code: 'custom',
      path: ['batch', 'mutationId'],
      message: 'Returned batch must belong to the requested mutation.',
    })
  }
})

export const ackResponseSchema = z.strictObject({
  acknowledgedCursor: syncCursorSchema,
  serverHead: syncCursorSchema,
}).superRefine((response, context) => {
  if (response.acknowledgedCursor.epoch !== response.serverHead.epoch) {
    context.addIssue({ code: 'custom', message: 'Acknowledgement and head must share one epoch.' })
  }
  if (response.acknowledgedCursor.sequence > response.serverHead.sequence) {
    context.addIssue({ code: 'custom', message: 'Acknowledgement cannot be ahead of the server head.' })
  }
})

export const syncV2ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(SYNC_V2_ERROR_CODES),
    message: nonEmptyString,
    retryable: z.boolean(),
    requestId: nonEmptyString.nullable(),
    details: jsonObjectSchema.nullable(),
  }),
})

function parse<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new Error(`Invalid ${label}: ${z.prettifyError(result.error)}`)
}

export const parseSyncV2Discovery = (input: unknown): SyncV2Discovery =>
  parse(discoverySchema, input, 'sync-v2 discovery response')

export const parseSnapshotMetadata = (input: unknown): SnapshotMetadata =>
  parse(snapshotMetadataSchema, input, 'snapshot metadata')

export const parsePullChangesResponse = (input: unknown): PullChangesResponse =>
  parse(pullChangesResponseSchema, input, 'pull changes response')

export const parsePushMutationRequest = (input: unknown): PushMutationRequest =>
  parse(pushMutationRequestSchema, input, 'push mutation request')

export const parsePushMutationResponse = (input: unknown): PushMutationResponse =>
  parse(pushMutationResponseSchema, input, 'push mutation response')

export const parseAckResponse = (input: unknown): AckResponse =>
  parse(ackResponseSchema, input, 'acknowledgement response')

export const parseSyncV2ErrorBody = (input: unknown): SyncV2ErrorBody =>
  parse(syncV2ErrorBodySchema, input, 'sync-v2 error response')
