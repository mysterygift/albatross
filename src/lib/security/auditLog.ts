import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

type AuditMetadata = Record<string, unknown>

export type AuditLogEvent = {
  actorUserId: string | null
  targetUserId?: string | null
  projectId?: string | null
  action: string
  metadata?: AuditMetadata
  ipAddress?: string | null
  userAgent?: string | null
}

const SENSITIVE_KEY_PATTERN = /(password|hash|token|secret|recovery)/i

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[redacted]'] as const
      }
      return [key, sanitize(raw)] as const
    })
    return Object.fromEntries(entries)
  }
  return value
}

export async function appendAuditLog(db: DatabaseAdapter, event: AuditLogEvent): Promise<void> {
  try {
    const metadata = sanitize(event.metadata ?? {})
    await db.execute(
      `INSERT INTO audit_logs
       (actor_user_id, target_user_id, project_id, action, metadata_json, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, CURRENT_TIMESTAMP)`,
      [
        event.actorUserId,
        event.targetUserId ?? null,
        event.projectId ?? null,
        event.action,
        JSON.stringify(metadata),
        event.ipAddress ?? null,
        event.userAgent ?? null,
      ]
    )
  } catch {
    // Best-effort append-only auditing: callers should not leak internals on write failures.
  }
}
