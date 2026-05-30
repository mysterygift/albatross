import { closeDb, openPlainDbIfExists } from '@/lib/db/client'
import {
  getPlainDbAdminsCountIfAvailable,
  getUnlockedDbAdminsCountIfAvailable,
  isInitialSetupComplete,
} from '@/lib/auth/initialSetupStatus'
import {
  getLocalDbStatus,
  isLegacyPasswordDerivedMode,
  readDbEncryptionMeta,
  usesInstanceKeyMode,
  type LocalDbStatus,
} from '@/lib/security/dbFileEncryption'
import {
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
} from '@/lib/security/instanceKey'
import { recoveryKeyMetaExists } from '@/lib/security/recoveryKey'

export type InstallDetectionKind =
  | 'fresh_install'
  | 'complete_install'
  | 'encrypted_incomplete'
  | 'setup_encrypted_pending_admin'
  | 'setup_encrypted_pending_recovery'
  | 'legacy_plain_no_admin'
  | 'legacy_password_derived'
  | 'inconsistent_state'

export type InstallDetectionRoute = 'admin' | 'sign_in' | 'repair'

export type InstallDetectionDiagnostics = {
  dbFileExists: boolean
  encryptionMetaExists: boolean
  isPlainSqlite: boolean
  encryptionMode: 'none' | 'legacy_password_derived' | 'instance_key' | 'unknown'
  recoveryMetaExists: boolean
  activeWrapperCount: number
  plainAdminCount: number | null
}

export type InstallDetectionResult = {
  kind: InstallDetectionKind
  route: InstallDetectionRoute
  diagnostics: InstallDetectionDiagnostics
}

function encryptionModeFromMeta(
  meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
): InstallDetectionDiagnostics['encryptionMode'] {
  if (meta == null) {
    return 'none'
  }
  if (isLegacyPasswordDerivedMode(meta)) {
    return 'legacy_password_derived'
  }
  if (usesInstanceKeyMode(meta)) {
    return 'instance_key'
  }
  return 'unknown'
}

async function collectDiagnostics(
  status: LocalDbStatus,
  meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>,
  plainAdminCount: number | null
): Promise<InstallDetectionDiagnostics> {
  const recoveryMetaExists = await recoveryKeyMetaExists()
  const wrappersMeta = await readInstanceKeyWrappersMeta()
  const activeWrapperCount =
    wrappersMeta?.wrappers.filter((wrapper) => isInstanceKeyWrapperActive(wrapper)).length ?? 0

  return {
    dbFileExists: status.dbFileExists,
    encryptionMetaExists: status.encryptionMetaExists,
    isPlainSqlite: status.isPlainSqlite,
    encryptionMode: encryptionModeFromMeta(meta),
    recoveryMetaExists,
    activeWrapperCount,
    plainAdminCount,
  }
}

function result(
  kind: InstallDetectionKind,
  route: InstallDetectionRoute,
  diagnostics: InstallDetectionDiagnostics
): InstallDetectionResult {
  return { kind, route, diagnostics }
}

export async function detectInstallState(): Promise<InstallDetectionResult> {
  const status = await getLocalDbStatus()
  let meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
  try {
    meta = await readDbEncryptionMeta()
  } catch {
    const diagnostics = await collectDiagnostics(status, null, null)
    return result('inconsistent_state', 'repair', diagnostics)
  }

  if (meta != null && isLegacyPasswordDerivedMode(meta)) {
    const diagnostics = await collectDiagnostics(status, meta, null)
    return result('legacy_password_derived', 'sign_in', diagnostics)
  }

  if (await isInitialSetupComplete()) {
    const diagnostics = await collectDiagnostics(status, meta, null)
    return result('complete_install', 'sign_in', diagnostics)
  }

  if (status.encryptionMetaExists && !status.isPlainSqlite) {
    if (meta != null && usesInstanceKeyMode(meta)) {
      const adminCount = await getUnlockedDbAdminsCountIfAvailable()
      const diagnostics = await collectDiagnostics(status, meta, adminCount)

      if (!diagnostics.recoveryMetaExists && diagnostics.activeWrapperCount === 0) {
        if (adminCount === 0) {
          return result('setup_encrypted_pending_admin', 'admin', diagnostics)
        }
        if (adminCount != null && adminCount > 0) {
          return result('setup_encrypted_pending_recovery', 'admin', diagnostics)
        }
      }
    }

    const diagnostics = await collectDiagnostics(status, meta, null)
    return result('encrypted_incomplete', 'repair', diagnostics)
  }

  if (status.encryptionMetaExists && status.isPlainSqlite) {
    const diagnostics = await collectDiagnostics(status, meta, null)
    return result('inconsistent_state', 'repair', diagnostics)
  }

  if (!status.dbFileExists && !status.encryptionMetaExists) {
    const diagnostics = await collectDiagnostics(status, meta, 0)
    return result('fresh_install', 'admin', diagnostics)
  }

  if (status.isPlainSqlite) {
    const plainAdminCount = await getPlainDbAdminsCountIfAvailable()
    await closeDb()
    const diagnostics = await collectDiagnostics(status, meta, plainAdminCount)

    if (plainAdminCount === 0) {
      return result('legacy_plain_no_admin', 'admin', diagnostics)
    }

    if (plainAdminCount != null && plainAdminCount > 0) {
      return result('inconsistent_state', 'repair', diagnostics)
    }

    return result('inconsistent_state', 'repair', diagnostics)
  }

  const diagnostics = await collectDiagnostics(status, meta, null)
  return result('inconsistent_state', 'repair', diagnostics)
}

/**
 * Prepare a fresh or legacy plain database for later admin setup by opening it once
 * (which applies migrations via the SQLite adapter) and closing it again.
 */
export async function preparePlainDatabaseForSetup(): Promise<void> {
  const status = await getLocalDbStatus()
  if (!status.isPlainSqlite && status.encryptionMetaExists) {
    throw new Error('Cannot prepare an encrypted database without unlock')
  }
  await openPlainDbIfExists()
  await closeDb()
}
