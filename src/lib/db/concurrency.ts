export class OptimisticConcurrencyConflictError extends Error {
  readonly code = 'OPTIMISTIC_CONCURRENCY_CONFLICT'
  readonly entity: string
  readonly entityId: string
  readonly expectedUpdatedAt?: string

  constructor(args: {
    entity: string
    entityId: string
    expectedUpdatedAt?: string
    message?: string
  }) {
    super(
      args.message ??
        `Concurrent update detected for ${args.entity} (${args.entityId}). Reload before retrying.`
    )
    this.name = 'OptimisticConcurrencyConflictError'
    this.entity = args.entity
    this.entityId = args.entityId
    this.expectedUpdatedAt = args.expectedUpdatedAt
  }
}
