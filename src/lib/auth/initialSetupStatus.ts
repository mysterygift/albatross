import { DatabaseLockedError, getDb, isDbUnlocked, openPlainDbIfExists } from '@/lib/db/client'
import { sqlAdminUsersCount } from '@/lib/auth/authSql'
import {
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
} from '@/lib/security/instanceKey'
import { recoveryKeyMetaExists } from '@/lib/security/recoveryKey'
import {
  getLocalDbStatus,
  isLegacyPasswordDerivedMode,
  readDbEncryptionMeta,
  usesInstanceKeyMode,
} from '@/lib/security/dbFileEncryption'

export const INITIAL_SETUP_STATUS_QUERY_KEY = ['initial-setup-complete'] as const
export const AUTH_GATE_MODE_QUERY_KEY = ['auth-gate-mode'] as const

export type AuthGateMode = 'sign_in' | 'setup'

async function hasActiveInstanceKeyWrapper(): Promise<boolean> {
  const wrappersMeta = await readInstanceKeyWrappersMeta()
  if (wrappersMeta == null) {
    return false
  }
  return wrappersMeta.wrappers.some((wrapper) => isInstanceKeyWrapperActive(wrapper))
}

async function hasRecoveryAndActiveWrapper(): Promise<boolean> {
  if (!(await recoveryKeyMetaExists())) {
    return false
  }
  return hasActiveInstanceKeyWrapper()
}

export async function getPlainDbAdminsCountIfAvailable(): Promise<number | null> {
  const status = await getLocalDbStatus()
  if (status.encryptionMetaExists && !status.isPlainSqlite) {
    return null
  }
  if (!status.dbFileExists && !status.encryptionMetaExists) {
    return 0
  }
  try {
    const db = await openPlainDbIfExists()
    const rows = await db.select<Array<{ count: number | string }>>(
      sqlAdminUsersCount(db.dialect),
      []
    )
    return Number(rows[0]?.count ?? 0)
  } catch (error) {
    if (error instanceof DatabaseLockedError) {
      return null
    }
    throw error
  }
}

export async function getUnlockedDbAdminsCountIfAvailable(): Promise<number | null> {
  if (!isDbUnlocked()) {
    return null
  }
  try {
    const db = await getDb()
    const rows = await db.select<Array<{ count: number | string }>>(
      sqlAdminUsersCount(db.dialect),
      []
    )
    return Number(rows[0]?.count ?? 0)
  } catch (error) {
    if (error instanceof DatabaseLockedError) {
      return null
    }
    throw error
  }
}

export async function getAdminsCount(): Promise<number | null> {
  const plainCount = await getPlainDbAdminsCountIfAvailable()
  if (plainCount != null) {
    return plainCount
  }
  return getUnlockedDbAdminsCountIfAvailable()
}

/**
 * Asserts all durable setup predicates when the database is unlocked (commit-time check).
 * Requires admin row, recovery meta, active instance-key wrapper, and valid encryption meta.
 */
export async function verifySetupCommitPredicates(): Promise<boolean> {
  if (!isDbUnlocked()) {
    return false
  }

  const adminCount = await getUnlockedDbAdminsCountIfAvailable()
  if (adminCount == null || adminCount <= 0) {
    return false
  }

  if (!(await recoveryKeyMetaExists())) {
    return false
  }

  if (!(await hasActiveInstanceKeyWrapper())) {
    return false
  }

  const status = await getLocalDbStatus()
  let meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
  try {
    meta = await readDbEncryptionMeta()
  } catch {
    return false
  }

  if (status.encryptionMetaExists && !status.isPlainSqlite) {
    if (meta == null || !usesInstanceKeyMode(meta)) {
      return false
    }
  }

  return true
}

export async function isInitialSetupComplete(): Promise<boolean> {
  const status = await getLocalDbStatus()
  let meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
  try {
    meta = await readDbEncryptionMeta()
  } catch {
    return false
  }

  const sidecarsComplete = await hasRecoveryAndActiveWrapper()
  if (!sidecarsComplete) {
    return false
  }

  if (status.encryptionMetaExists && !status.isPlainSqlite) {
    if (meta == null) {
      return false
    }
    if (usesInstanceKeyMode(meta) || isLegacyPasswordDerivedMode(meta)) {
      return true
    }
    return false
  }

  const adminCount = await getPlainDbAdminsCountIfAvailable()
  return adminCount != null && adminCount > 0
}

export async function resolveAuthGateMode(): Promise<AuthGateMode> {
  if (await isInitialSetupComplete()) {
    return 'sign_in'
  }
  let meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
  try {
    meta = await readDbEncryptionMeta()
  } catch {
    return 'setup'
  }
  if (meta != null && isLegacyPasswordDerivedMode(meta)) {
    return 'sign_in'
  }
  return 'setup'
}
