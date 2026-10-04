import {
  closeDb,
  getActiveSqlCipherKeyHex,
  isDbUnlocked,
} from '@/lib/db/client'
import {
  prepareEncryptedDatabaseForFirstAdmin,
  recoverFromPreSqlcipherBackupIfAvailable,
} from '@/lib/db/dbUnlock'
import {
  detectInstallState,
  type InstallDetectionResult,
} from '@/lib/auth/installDetection'
import { readSetupProgress, type SetupProgressState } from '@/lib/auth/setupProgress'
import {
  discardUnopenableSetupDatabase,
  needsPlainToEncryptedMigration,
  readDbEncryptionMeta,
  removeDbEncryptionMeta,
  usesInstanceKeyMode,
} from '@/lib/security/dbFileEncryption'
import {
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
} from '@/lib/security/instanceKey'
import { recoveryKeyMetaExists } from '@/lib/security/recoveryKey'

export type SetupEncryptionStatus = {
  status: 'ready'
  keyMode: 'instance_key'
}

export const SETUP_ENCRYPTION_FAILED_MESSAGE =
  'Could not secure the local database. Try setup again from the beginning.'

/**
 * First-admin encryption ordering (admin password is never the SQLCipher file key):
 * 1. Generate instance key
 * 2. Migrate plain DB → SQLCipher (if needed)
 * 3. Write v2 metadata (key_mode: 'instance_key')
 * 4. Open DB with instance key (in memory only)
 * 5. Later setup phases: admin row → wrapper → DEK → recovery escrow
 */
export async function isSetupEncryptionAlreadyPrepared(): Promise<boolean> {
  if (!isDbUnlocked()) {
    return false
  }

  let meta: Awaited<ReturnType<typeof readDbEncryptionMeta>>
  try {
    meta = await readDbEncryptionMeta()
  } catch {
    return false
  }

  if (meta == null || !usesInstanceKeyMode(meta)) {
    return false
  }

  if (await recoveryKeyMetaExists()) {
    return false
  }

  const wrappersMeta = await readInstanceKeyWrappersMeta()
  const activeWrapperCount =
    wrappersMeta?.wrappers.filter((wrapper) => isInstanceKeyWrapperActive(wrapper)).length ?? 0
  if (activeWrapperCount > 0) {
    return false
  }

  try {
    getActiveSqlCipherKeyHex()
    return true
  } catch {
    return false
  }
}

/** In-process only — for later commit steps in the same setup session. */
export function getPreparedInstanceKeyForSetup(): string {
  return getActiveSqlCipherKeyHex()
}

export async function runSetupEncryption(): Promise<SetupEncryptionStatus> {
  if (await isSetupEncryptionAlreadyPrepared()) {
    return { status: 'ready', keyMode: 'instance_key' }
  }

  const hadPlainDb = await needsPlainToEncryptedMigration()

  try {
    await prepareEncryptedDatabaseForFirstAdmin()

    if (!isDbUnlocked()) {
      throw new Error('Database unlock failed after encryption setup')
    }

    const meta = await readDbEncryptionMeta()
    if (meta == null || !usesInstanceKeyMode(meta)) {
      throw new Error('Invalid encryption metadata after setup')
    }

    return { status: 'ready', keyMode: 'instance_key' }
  } catch {
    if (hadPlainDb) {
      await recoverFromPreSqlcipherBackupIfAvailable()
    }
    await closeDb()
    throw new Error(SETUP_ENCRYPTION_FAILED_MESSAGE)
  }
}

/**
 * The instance key lives only in memory until the first admin's wrapper is written. If the app
 * exits in between (iOS may kill a backgrounded app at any time), the encrypted file can never be
 * opened again. When setup is still before the admin step and no wrapper or recovery escrow was
 * ever written, roll back to the pre-SQLCipher backup (or remove the file) so setup can restart.
 */
export async function discardStrandedSetupEncryption(
  detection: InstallDetectionResult,
  progress: SetupProgressState | null
): Promise<boolean> {
  if (progress == null || progress.phase === 'recovery_pending') {
    return false
  }
  if (detection.kind !== 'encrypted_incomplete' || isDbUnlocked()) {
    return false
  }
  const { diagnostics } = detection
  if (
    diagnostics.encryptionMode !== 'instance_key' ||
    !diagnostics.dbFileExists ||
    diagnostics.isPlainSqlite ||
    diagnostics.recoveryMetaExists
  ) {
    return false
  }
  // Any wrapper, even a revoked one, means the key was persisted at some point.
  const wrappersMeta = await readInstanceKeyWrappersMeta()
  if ((wrappersMeta?.wrappers.length ?? 0) > 0) {
    return false
  }

  await closeDb()
  await discardUnopenableSetupDatabase()
  await removeDbEncryptionMeta()
  return true
}

/** Install detection for the setup detect step, recovering from an interrupted earlier attempt. */
export async function detectInstallStateForSetup(): Promise<InstallDetectionResult> {
  const detection = await detectInstallState()
  if (await discardStrandedSetupEncryption(detection, await readSetupProgress())) {
    return detectInstallState()
  }
  return detection
}
