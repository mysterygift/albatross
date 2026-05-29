import { describe, expect, it } from 'vitest'

import { appendAuditLog } from '@/lib/security/auditLog'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

describe('auditLog', () => {
  it('redacts recovery-related metadata keys before insert', async () => {
    const executed: unknown[][] = []
    const db = {
      dialect: 'postgres' as const,
      execute: async (_sql: string, params: unknown[]) => {
        executed.push(params)
      },
    } as unknown as DatabaseAdapter

    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'auth.recovery_key_registered',
      metadata: {
        version: 2,
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        plainRecoveryKey: 'secret',
      },
    })

    const metadataJson = executed[0]?.[4] as string
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>
    expect(parsed.version).toBe(2)
    expect(parsed.recoveryKey).toBe('[redacted]')
    expect(parsed.plainRecoveryKey).toBe('[redacted]')
    expect(metadataJson).not.toContain('11111111')
  })

  it('redacts password, token, secret, and hash metadata keys including nested values', async () => {
    const executed: unknown[][] = []
    const db = {
      dialect: 'postgres' as const,
      execute: async (_sql: string, params: unknown[]) => {
        executed.push(params)
      },
    } as unknown as DatabaseAdapter

    await appendAuditLog(db, {
      actorUserId: 'user-1',
      action: 'auth.login_succeeded',
      metadata: {
        credentials: {
          password: 'super-secret',
          token: 'session-token',
          secret: 'api-secret',
          hash: 'password-hash',
        },
        note: 'safe',
      },
    })

    const metadataJson = executed[0]?.[4] as string
    const parsed = JSON.parse(metadataJson) as {
      credentials: Record<string, unknown>
      note: string
    }
    expect(parsed.credentials.password).toBe('[redacted]')
    expect(parsed.credentials.token).toBe('[redacted]')
    expect(parsed.credentials.secret).toBe('[redacted]')
    expect(parsed.credentials.hash).toBe('[redacted]')
    expect(parsed.note).toBe('safe')
    expect(metadataJson).not.toContain('super-secret')
    expect(metadataJson).not.toContain('session-token')
  })
})
