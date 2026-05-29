type Bucket = {
  hits: number[]
}

export type RateLimitRule = {
  maxAttempts: number
  windowMs: number
}

export const DEFAULT_AUTH_LOGIN_RATE_LIMIT: RateLimitRule = {
  maxAttempts: 5,
  windowMs: 60_000,
}

export const DEFAULT_AUTH_RECOVERY_RATE_LIMIT: RateLimitRule = {
  maxAttempts: 5,
  windowMs: 60_000,
}

export const DEFAULT_AUTH_BOOTSTRAP_RATE_LIMIT: RateLimitRule = {
  maxAttempts: 3,
  windowMs: 5 * 60_000,
}

export const DEFAULT_ADMIN_MUTATION_RATE_LIMIT: RateLimitRule = {
  maxAttempts: 30,
  windowMs: 60_000,
}

export const DEFAULT_ACCESS_MUTATION_RATE_LIMIT: RateLimitRule = {
  maxAttempts: 40,
  windowMs: 60_000,
}

export const RATE_LIMIT_ERROR_MESSAGE = 'Too many requests, please try again later'

export class RateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

const buckets = new Map<string, Bucket>()

export function enforceRateLimit(args: {
  scope: string
  key: string
  rule: RateLimitRule
  nowMs?: number
}): void {
  const now = args.nowMs ?? Date.now()
  const bucketKey = `${args.scope}:${args.key}`
  const bucket = buckets.get(bucketKey) ?? { hits: [] }
  const cutoff = now - args.rule.windowMs
  bucket.hits = bucket.hits.filter((ts) => ts > cutoff)
  if (bucket.hits.length >= args.rule.maxAttempts) {
    const oldest = bucket.hits[0] ?? now
    const retryAfterMs = Math.max(1, args.rule.windowMs - (now - oldest))
    throw new RateLimitError(RATE_LIMIT_ERROR_MESSAGE, retryAfterMs)
  }
  bucket.hits.push(now)
  buckets.set(bucketKey, bucket)
}

export function resetRateLimiterForTests(): void {
  buckets.clear()
}
