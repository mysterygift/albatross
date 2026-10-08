import { describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { appendAuditLog } from '@/lib/security/auditLog'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

async function makeAdapter() {
  const SQL = await initSqlJs({})
  const raw = new SQL.Database()
  raw.exec('PRAGMA foreign_keys = ON')
  applyAlbatrossMigrationsSqlJs(raw)
  return createSqlJsTauriAdapter(raw)
}

describe('appendAuditLog on SQLite', () => {
  it('records the event with sanitised metadata', async () => {
    const db = await makeAdapter()
    await db.execute(`INSERT INTO users (id, username, password_hash, role) VALUES ('u1', 'admin', 'x', 'admin')`, [])
    await appendAuditLog(db, {
      actorUserId: 'u1',
      targetUserId: 'u1',
      action: 'admin.user_password_reset',
      metadata: { sessionsRevoked: true, wrapperResetPath: 'admin_unlock', password: 'must-not-be-stored' },
    })
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT actor_user_id, target_user_id, action, metadata_json, created_at FROM audit_logs`,
      []
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_user_id: 'u1', target_user_id: 'u1', action: 'admin.user_password_reset' })
    expect(JSON.parse(String(rows[0]!.metadata_json))).toEqual({ sessionsRevoked: true, wrapperResetPath: 'admin_unlock' })
    expect(rows[0]!.created_at).toBeTruthy()
  })

  it('keeps the row but clears the actor when the user is deleted', async () => {
    const db = await makeAdapter()
    await db.execute(`INSERT INTO users (id, username, password_hash, role) VALUES ('u1', 'admin', 'x', 'admin')`, [])
    await appendAuditLog(db, { actorUserId: 'u1', action: 'auth.login_succeeded', metadata: { role: 'admin' } })
    await db.execute(`DELETE FROM users WHERE id = 'u1'`, [])
    const rows = await db.select<Record<string, unknown>[]>(`SELECT actor_user_id, action FROM audit_logs`, [])
    expect(rows).toEqual([{ actor_user_id: null, action: 'auth.login_succeeded' }])
  })

  it('warns instead of failing silently when the write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const db = await makeAdapter()
    await expect(appendAuditLog(db, { actorUserId: 'no-such-user', action: 'auth.login_succeeded' })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('auth.login_succeeded'), expect.any(String))
    warn.mockRestore()
  })
})
