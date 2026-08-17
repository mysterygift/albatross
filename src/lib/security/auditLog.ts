import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

type AuditMetadata = Record<string, unknown>
type MetadataValueValidator = (value: unknown) => boolean
type AuditMetadataPolicy = Readonly<Record<string, MetadataValueValidator>>

const isBoolean = (value: unknown): boolean => typeof value === 'boolean'
const isNonNegativeInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isRecoveryVersion = (value: unknown): boolean => value === 1 || value === 2 || value === 3
const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const isRole = (value: unknown): boolean => value === 'admin' || value === 'user'
const isNullableRole = (value: unknown): boolean => value === null || isRole(value)
const isAccessLevel = (value: unknown): boolean =>
  value === 'viewer' || value === 'editor' || value === 'administrator'
const isNullableAccessLevel = (value: unknown): boolean => value === null || isAccessLevel(value)
const isAdminOperation = (value: unknown): boolean =>
  typeof value === 'string' &&
  [
    'list_users',
    'create_user',
    'disable_user',
    'delete_user',
    'enable_user',
    'reset_password',
    'update_role',
    'list_productions_brief',
    'list_user_project_visibility',
    'grant_project_access',
    'update_project_access',
    'revoke_project_access',
  ].includes(value)
const isWrapperResetPath = (value: unknown): boolean =>
  value === 'old_password' || value === 'admin_unlock' || value === 'recovery_escrow'
const isDekWrapMode = (value: unknown): boolean => value === 'recovery' || value === 'file_passphrase'

/**
 * Metadata is denied by default. Each action must opt individual operational fields
 * in and constrain their values to a narrow scalar domain. Usernames and other
 * identifying/contact fields intentionally do not appear here: actor/target IDs are
 * the stable audit identities and avoid duplicating PII in an append-only store.
 */
export const AUDIT_METADATA_POLICY = {
  'project_access.member_added': { accessLevel: isAccessLevel },
  'project_access.member_access_changed': {
    beforeAccessLevel: isNullableAccessLevel,
    afterAccessLevel: isAccessLevel,
  },
  'project_access.member_revoked': { previousAccessLevel: isNullableAccessLevel },
  'admin.authorization_failed': { operation: isAdminOperation },
  'admin.user_created': { role: isRole },
  'admin.user_disabled': { targetRole: isRole },
  'admin.user_deleted': { deletedUserId: isUuid, deletedRole: isRole },
  'admin.user_enabled': {},
  'admin.user_password_reset': {
    sessionsRevoked: isBoolean,
    wrapperResetPath: isWrapperResetPath,
  },
  'admin.user_role_changed': {
    beforeRole: isNullableRole,
    afterRole: isRole,
    sessionsRevoked: isBoolean,
  },
  'admin.user_project_access_granted': { accessLevel: isAccessLevel },
  'admin.user_project_access_updated': { accessLevel: isAccessLevel },
  'admin.user_project_access_revoked': {},
  'auth.bootstrap_admin_created': { role: isRole },
  'auth.initial_admin_created': { role: isRole },
  'auth.login_succeeded': { role: isRole },
  'auth.password_recovered': {
    version: isRecoveryVersion,
    sessionsRevoked: isBoolean,
    adminsReset: isNonNegativeInteger,
    clientPiiReencrypted: isBoolean,
    instanceKeyMode: isBoolean,
  },
  'auth.recovery_key_registered': { version: isRecoveryVersion },
  'auth.dek_escrow_upgraded': { version: isRecoveryVersion, dek_wrap_mode: isDekWrapMode },
  'auth.recovery_escrow_refreshed': { version: isRecoveryVersion },
} as const satisfies Readonly<Record<string, AuditMetadataPolicy>>

export type KnownAuditAction = keyof typeof AUDIT_METADATA_POLICY

export type AuditLogEvent = {
  actorUserId: string | null
  targetUserId?: string | null
  projectId?: string | null
  action: KnownAuditAction | (string & {})
  metadata?: AuditMetadata
  ipAddress?: string | null
  userAgent?: string | null
}

function sanitizeMetadata(action: string, metadata: AuditMetadata | undefined): AuditMetadata {
  if (!Object.prototype.hasOwnProperty.call(AUDIT_METADATA_POLICY, action)) return {}

  const policy = AUDIT_METADATA_POLICY[action as KnownAuditAction] as AuditMetadataPolicy
  const source = metadata ?? {}
  const allowed: AuditMetadata = {}
  for (const [key, validator] of Object.entries(policy)) {
    const value = source[key]
    if (validator(value)) allowed[key] = value
  }
  return allowed
}

export async function appendAuditLog(db: DatabaseAdapter, event: AuditLogEvent): Promise<void> {
  try {
    const metadata = sanitizeMetadata(event.action, event.metadata)
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
