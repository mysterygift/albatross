import { describe, expect, it, vi } from 'vitest'

import { appendAuditLog, AUDIT_METADATA_POLICY } from '@/lib/security/auditLog'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

function createDb() {
  const execute = vi.fn(async () => undefined)
  return { db: { dialect: 'postgres', execute } as unknown as DatabaseAdapter, execute }
}

function insertedMetadata(execute: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const params = execute.mock.calls[0]?.[1] as unknown[]
  return JSON.parse(params[4] as string) as Record<string, unknown>
}

const KNOWN_ACTION_CASES = [
  ['project_access.member_added', { accessLevel: 'viewer' }],
  ['project_access.member_access_changed', { beforeAccessLevel: null, afterAccessLevel: 'administrator' }],
  ['project_access.member_revoked', { previousAccessLevel: 'editor' }],
  ['admin.authorization_failed', { operation: 'reset_password' }],
  ['admin.user_created', { role: 'user' }],
  ['admin.user_disabled', { targetRole: 'admin' }],
  ['admin.user_deleted', { deletedUserId: '123e4567-e89b-42d3-a456-426614174000', deletedRole: 'user' }],
  ['admin.user_enabled', {}],
  ['admin.user_password_reset', { sessionsRevoked: true, wrapperResetPath: 'admin_unlock' }],
  ['admin.user_role_changed', { beforeRole: 'user', afterRole: 'admin', sessionsRevoked: true }],
  ['admin.user_project_access_granted', { accessLevel: 'viewer' }],
  ['admin.user_project_access_updated', { accessLevel: 'editor' }],
  ['admin.user_project_access_revoked', {}],
  ['auth.bootstrap_admin_created', { role: 'admin' }],
  ['auth.initial_admin_created', { role: 'admin' }],
  ['auth.login_succeeded', { role: 'user' }],
  [
    'auth.password_recovered',
    { version: 3, sessionsRevoked: true, adminsReset: 2, clientPiiReencrypted: true, instanceKeyMode: false },
  ],
  ['auth.recovery_key_registered', { version: 3 }],
  ['auth.dek_escrow_upgraded', { version: 3, dek_wrap_mode: 'file_passphrase' }],
  ['auth.recovery_escrow_refreshed', { version: 3 }],
] as const

describe('auditLog metadata policy', () => {
  it('has a preservation test case for every known audit action', () => {
    expect(KNOWN_ACTION_CASES.map(([action]) => action).sort()).toEqual(
      Object.keys(AUDIT_METADATA_POLICY).sort()
    )
  })

  it.each(KNOWN_ACTION_CASES)('preserves the allowed operational fields for %s', async (action, metadata) => {
    const { db, execute } = createDb()
    await appendAuditLog(db, { actorUserId: 'user-1', action, metadata: { ...metadata } })
    expect(insertedMetadata(execute)).toEqual(metadata)
  })

  it('drops identifying, contact, secret, and unknown fields at every nesting shape', async () => {
    const { db, execute } = createDb()
    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'auth.password_recovered',
      metadata: {
        version: 3,
        email: 'person@example.com',
        phone: '+44 7700 900123',
        address: '1 Private Street',
        name: 'Private Person',
        username: 'private-person',
        contact: { email: 'nested@example.com' },
        password: 'super-secret',
        token: 'session-token',
        recoveryKey: 'recovery-secret',
        nested: { role: 'admin', secret: 'nested-secret' },
        entries: [{ address: 'Array Address' }],
      },
    })

    expect(insertedMetadata(execute)).toEqual({ version: 3 })
    const serialized = JSON.stringify(insertedMetadata(execute))
    expect(serialized).not.toContain('person@example.com')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('Array Address')
  })

  it('drops arrays and objects even when supplied under an allowed field name', async () => {
    const { db, execute } = createDb()
    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'admin.user_role_changed',
      metadata: {
        beforeRole: { role: 'user', email: 'nested@example.com' },
        afterRole: ['admin', { phone: '07700900123' }],
        sessionsRevoked: { value: true, password: 'secret' },
      },
    })
    expect(insertedMetadata(execute)).toEqual({})
  })

  it('drops all metadata for unknown actions but still records the event', async () => {
    const { db, execute } = createDb()
    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'future.unreviewed_action',
      metadata: { role: 'admin', email: 'person@example.com' },
    })
    expect(execute).toHaveBeenCalledOnce()
    expect(insertedMetadata(execute)).toEqual({})
  })

  it('drops invalid values rather than admitting arbitrary strings through allowed keys', async () => {
    const { db, execute } = createDb()
    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'admin.authorization_failed',
      metadata: { operation: 'person@example.com' },
    })
    expect(insertedMetadata(execute)).toEqual({})
  })

  it('keeps audit writes best-effort when persistence fails', async () => {
    const execute = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    const db = { dialect: 'postgres', execute } as unknown as DatabaseAdapter
    await expect(
      appendAuditLog(db, { actorUserId: 'user-1', action: 'auth.login_succeeded', metadata: { role: 'admin' } })
    ).resolves.toBeUndefined()
  })
})
