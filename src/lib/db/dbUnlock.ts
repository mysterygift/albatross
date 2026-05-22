import { closeDb, isDbUnlocked, openDbWithFileKey, openPlainDbIfExists } from '@/lib/db/client'
import {
  deriveSqlCipherPassphraseFromPassword,
  generateInstanceKdfSaltHex,
  isLocalDbEncryptionEnabled,
  migratePlainDbToSqlcipher,
  probeSqlCipherPassphrase,
  getPreSqlcipherBackupStatus,
  isKeyVerificationError,
  needsPlainToEncryptedMigration,
  readDbEncryptionMeta,
  removeDbEncryptionMeta,
  restoreSqliteFromPreSqlcipherBackup,
  writeDbEncryptionMeta,
} from '@/lib/security/dbFileEncryption'
import { setSetting } from '@/lib/db/repositories/settings'
import { DB_ENCRYPTION_SETTINGS_KEY } from '@/lib/security/dbFileEncryption'

/**
 * Restore plain DB from `albatross.db.pre-sqlcipher-backup` and clear stale encryption meta.
 * Used when the encrypted file does not match meta (e.g. after a bad first migration).
 */
export async function recoverFromPreSqlcipherBackupIfAvailable(): Promise<boolean> {
  const backup = await getPreSqlcipherBackupStatus()
  if (!backup.backupExists || !backup.backupIsPlainSqlite) return false
  await restoreSqliteFromPreSqlcipherBackup()
  await removeDbEncryptionMeta()
  await closeDb()
  return true
}

/**
 * Unlock the local DB for an authenticated session: open with SQLCipher key and migrate plain DB if needed.
 */
export async function unlockLocalDatabaseWithPassword(
  password: string,
  options?: { allowBackupRestore?: boolean }
): Promise<void> {
  const allowBackupRestore = options?.allowBackupRestore !== false
  const needsMigration = await needsPlainToEncryptedMigration()

  if (needsMigration) {
    const instanceKdfSalt = await generateInstanceKdfSaltHex()
    const passphrase = await deriveSqlCipherPassphraseFromPassword(password, instanceKdfSalt)
    await migratePlainDbToSqlcipher(passphrase)
    await writeDbEncryptionMeta({ version: 1, kdf_salt: instanceKdfSalt })
    await closeDb()
    await openDbWithFileKey(passphrase)
    await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '1')
    return
  }

  const meta = await readDbEncryptionMeta()
  if (meta) {
    const passphrase = await deriveSqlCipherPassphraseFromPassword(password, meta.kdf_salt)
    if (allowBackupRestore) {
      const keyOk = await probeSqlCipherPassphrase(passphrase)
      if (!keyOk) {
        const recovered = await recoverFromPreSqlcipherBackupIfAvailable()
        if (recovered) {
          return unlockLocalDatabaseWithPassword(password, { allowBackupRestore: false })
        }
      }
    }
    try {
      await closeDb()
      await openDbWithFileKey(passphrase)
    } catch (unlockErr) {
      if (allowBackupRestore && isKeyVerificationError(unlockErr)) {
        const recovered = await recoverFromPreSqlcipherBackupIfAvailable()
        if (recovered) {
          return unlockLocalDatabaseWithPassword(password, { allowBackupRestore: false })
        }
      }
      throw unlockErr
    }
    return
  }

  if (!isDbUnlocked()) {
    await openPlainDbIfExists()
  }
}

export async function prepareEncryptedDatabaseForFirstAdmin(password: string): Promise<void> {
  // #region agent log
  const debugLog = (message: string, data: Record<string, unknown>, hypothesisId: string) => {
    fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '415200' },
      body: JSON.stringify({
        sessionId: '415200',
        location: 'dbUnlock.ts:prepareEncryptedDatabaseForFirstAdmin',
        message,
        data,
        hypothesisId,
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }
  // #endregion

  const meta = await readDbEncryptionMeta()
  const needsMigration = await needsPlainToEncryptedMigration()
  debugLog('prepareEncrypted entry', { hasMeta: meta != null, needsMigration, isDbUnlocked: isDbUnlocked() }, 'A')

  // Close any plain DB opened at startup (e.g. settings defaults) before SQLCipher open/migrate.
  if (isDbUnlocked()) {
    await closeDb()
  }

  if (meta) {
    const passphrase = await deriveSqlCipherPassphraseFromPassword(password, meta.kdf_salt)
    if (needsMigration) {
      debugLog('migrating plain db with existing meta', {}, 'A')
      await migratePlainDbToSqlcipher(passphrase)
      await openDbWithFileKey(passphrase)
      await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '1')
      debugLog('prepareEncrypted complete after migrate (meta)', { isDbUnlocked: isDbUnlocked() }, 'A')
      return
    }
    debugLog('opening db with existing meta', {}, 'A')
    await openDbWithFileKey(passphrase)
    return
  }

  const instanceKdfSalt = await generateInstanceKdfSaltHex()
  const passphrase = await deriveSqlCipherPassphraseFromPassword(password, instanceKdfSalt)

  if (needsMigration) {
    debugLog('migrating plain db for first admin', {}, 'A')
    await migratePlainDbToSqlcipher(passphrase)
    await writeDbEncryptionMeta({ version: 1, kdf_salt: instanceKdfSalt })
    await openDbWithFileKey(passphrase)
    await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '1')
    debugLog('prepareEncrypted complete after migrate', { isDbUnlocked: isDbUnlocked() }, 'A')
    return
  }

  debugLog('creating new encrypted db for first admin', {}, 'A')
  await writeDbEncryptionMeta({ version: 1, kdf_salt: instanceKdfSalt })
  await openDbWithFileKey(passphrase)
  await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '1')
  debugLog('prepareEncrypted complete', { isDbUnlocked: isDbUnlocked() }, 'A')
}

export async function isLocalDatabaseLocked(): Promise<boolean> {
  return (await isLocalDbEncryptionEnabled()) && !isDbUnlocked()
}
