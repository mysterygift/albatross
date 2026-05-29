import { expect } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'

import './encryptionTestHarness.setup'
import { getEncryptionHarnessState, sidecarPath } from './encryptionTestHarness.setup'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import {
  closeDb,
  getActiveSqlCipherKeyHex,
  setActiveSqlCipherKeyHexForTests,
  setDbAdapterForTests,
} from '@/lib/db/client'
import { prepareEncryptedDatabaseForFirstAdmin, isLocalDatabaseLocked } from '@/lib/db/dbUnlock'
import { setupInitialAdmin, clearPersistedAuthSession } from '@/lib/auth/authService'
import { performFullLoginSequence } from '@/lib/auth/loginOrchestration'
import {
  DB_META_FILENAME,
  probeSqlCipherPassphrase,
  rekeySqlCipherDatabase,
} from '@/lib/security/dbFileEncryption'
import {
  establishDataEncryptionKey,
  exportDataEncryptionKeyHex,
  clearDataEncryptionKey,
} from '@/lib/security/dataEncryptionContext'
import {
  INSTANCE_KEY_WRAPPERS_FILENAME,
  upsertUserInstanceKeyWrapper,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import {
  generateRecoveryKey,
  hashRecoveryKey,
  persistRecoveryKeyMaterial,
  RECOVERY_META_FILENAME,
  verifyRecoveryKey,
} from '@/lib/security/recoveryKey'
import { resetRateLimiterForTests } from '@/lib/security/rateLimiter'

const encryptionHarnessState = getEncryptionHarnessState()

export type SidecarSnapshot = {
  dbMeta: unknown | null
  recoveryMeta: unknown | null
  wrappersMeta: unknown | null
}

export type FreshEncryptedInstallResult = {
  username: string
  password: string
  recoveryKey: string
  instanceKeyHex: string
  sessionToken: string
  userId: string
}

export async function resetEncryptionHarness(): Promise<void> {
  const state = encryptionHarnessState
  state.sidecarFiles.clear()
  state.settings.clear()
  state.activeSqlCipherKeyHex = null
  state.storedSqlCipherKeyHex = null
  state.isPlainDb = true
  state.dbFileExists = true
  state.invokeCounts.migratePlain = 0
  state.invokeCounts.rekey = 0
  state.invokeCounts.probe = 0
  state.invokeCounts.backupBeforeRekey = 0
  if (state.sqlJsDb) {
    state.sqlJsDb.close()
    state.sqlJsDb = null
  }
  state.dbAdapter = null
  setDbAdapterForTests(null)
  setActiveSqlCipherKeyHexForTests(null)
  clearDataEncryptionKey()
  resetRateLimiterForTests()
}

export async function initSqlJsDatabase(options?: { skipMigrations?: boolean }): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  if (!options?.skipMigrations) {
    applyAlbatrossMigrationsSqlJs(db)
  }
  encryptionHarnessState.sqlJsDb = db
  encryptionHarnessState.dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

export function getHarnessDbAdapter() {
  return encryptionHarnessState.dbAdapter
}

export function readSidecarSnapshot(): SidecarSnapshot {
  const read = (filename: string): unknown | null => {
    const raw = encryptionHarnessState.sidecarFiles.get(sidecarPath(filename))
    if (!raw) return null
    return JSON.parse(raw) as unknown
  }
  return {
    dbMeta: read(DB_META_FILENAME),
    recoveryMeta: read(RECOVERY_META_FILENAME),
    wrappersMeta: read(INSTANCE_KEY_WRAPPERS_FILENAME),
  }
}

export function writeSidecarFile(filename: string, body: string): void {
  encryptionHarnessState.sidecarFiles.set(sidecarPath(filename), body)
}

export function assertNoPlaintextSecretsInSidecars(secrets: string[]): void {
  for (const [, body] of encryptionHarnessState.sidecarFiles) {
    for (const secret of secrets) {
      if (!secret) continue
      expect(body).not.toContain(secret)
      const compact = secret.replace(/-/g, '')
      if (compact !== secret) {
        expect(body).not.toContain(compact)
      }
    }
  }
}

export async function simulateColdStart(): Promise<void> {
  const db = encryptionHarnessState.dbAdapter
  if (db) {
    await clearPersistedAuthSession(db)
  } else {
    clearDataEncryptionKey()
    await closeDb()
  }
  encryptionHarnessState.settings.delete('auth_session_token')
}

export async function createFreshEncryptedInstall(args?: {
  username?: string
  password?: string
  recoveryKey?: string
}): Promise<FreshEncryptedInstallResult> {
  await resetEncryptionHarness()
  await initSqlJsDatabase()

  const username = args?.username ?? 'admin'
  const password = args?.password ?? 'AdminPass123!'
  const recoveryKey = args?.recoveryKey ?? generateRecoveryKey()
  const verifier = await hashRecoveryKey(recoveryKey)

  const { instanceKeyHex } = await prepareEncryptedDatabaseForFirstAdmin(password)
  const db = encryptionHarnessState.dbAdapter!
  const result = await setupInitialAdmin(db, { username, password })
  const wrapper = await wrapInstanceKeyForUser(password, instanceKeyHex, {
    userId: result.user.id,
    username: result.user.username,
  })
  await upsertUserInstanceKeyWrapper(wrapper)
  await establishDataEncryptionKey(db, result.user.id, password)
  await persistRecoveryKeyMaterial({
    db,
    actorUserId: result.user.id,
    plainRecoveryKey: recoveryKey,
    verifier,
    sqlCipherPassphraseHex: instanceKeyHex,
    dekHex: exportDataEncryptionKeyHex(),
  })

  return {
    username,
    password,
    recoveryKey,
    instanceKeyHex,
    sessionToken: result.sessionToken,
    userId: result.user.id,
  }
}

export async function performLoginSequence(credentials: {
  username: string
  password: string
}): Promise<Awaited<ReturnType<typeof performFullLoginSequence>>> {
  return performFullLoginSequence(credentials)
}

export async function assertRecoveryKeyValid(recoveryKey: string): Promise<boolean> {
  const snapshot = readSidecarSnapshot()
  const meta = snapshot.recoveryMeta as { verifier?: string } | null
  if (!meta?.verifier) return false
  return verifyRecoveryKey(recoveryKey, meta as Parameters<typeof verifyRecoveryKey>[1])
}

export function getInvokeCounts() {
  return { ...encryptionHarnessState.invokeCounts }
}

export function getActiveInstanceKeyHex(): string | null {
  return encryptionHarnessState.activeSqlCipherKeyHex
}

export function setHarnessPlainDb(isPlain: boolean): void {
  encryptionHarnessState.isPlainDb = isPlain
}

export async function assertWrongPassphraseRejected(): Promise<void> {
  const wrong = '0'.repeat(64)
  expect(await probeSqlCipherPassphrase(wrong)).toBe(false)
}

export async function assertActivePassphraseAccepted(): Promise<void> {
  const key = encryptionHarnessState.activeSqlCipherKeyHex
  expect(key).toBeTruthy()
  expect(await probeSqlCipherPassphrase(key!)).toBe(true)
}

export function expectNoRekeySince(lastCount: number): void {
  expect(encryptionHarnessState.invokeCounts.rekey).toBe(lastCount)
}

export { isLocalDatabaseLocked, getActiveSqlCipherKeyHex, rekeySqlCipherDatabase }
