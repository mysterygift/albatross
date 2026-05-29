import { closeDb, isDbUnlocked, openDbWithFileKey, openPlainDbIfExists } from '@/lib/db/client'
import {
  deriveSqlCipherPassphraseFromPassword,
  isLegacyPasswordDerivedMode,
  isLocalDbEncryptionEnabled,
  migratePlainDbToSqlcipher,
  probeSqlCipherPassphrase,
  getPreSqlcipherBackupStatus,
  isKeyVerificationError,
  needsPlainToEncryptedMigration,
  readDbEncryptionMeta,
  removeDbEncryptionMeta,
  restoreSqliteFromPreSqlcipherBackup,
  usesInstanceKeyMode,
  writeDbEncryptionMeta,
  type DbEncryptionMetaV2,
} from '@/lib/security/dbFileEncryption'
import {
  findWrapperForUsername,
  generateInstanceKeyHex,
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
  unwrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import { setSetting } from '@/lib/db/repositories/settings'
import { DB_ENCRYPTION_SETTINGS_KEY } from '@/lib/security/dbFileEncryption'

export type UnlockCredentials = {
  username: string
  password: string
}

const UNLOCK_FAILED_MESSAGE = 'Unable to unlock local database'

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

async function openWithLegacyPasswordDerivedKey(
  credentials: UnlockCredentials,
  kdfSalt: string,
  allowBackupRestore: boolean
): Promise<void> {
  const passphrase = await deriveSqlCipherPassphraseFromPassword(
    credentials.password,
    kdfSalt
  )
  if (allowBackupRestore) {
    const keyOk = await probeSqlCipherPassphrase(passphrase)
    if (!keyOk) {
      const recovered = await recoverFromPreSqlcipherBackupIfAvailable()
      if (recovered) {
        return unlockLocalDatabaseWithPassword(credentials, { allowBackupRestore: false })
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
        return unlockLocalDatabaseWithPassword(credentials, { allowBackupRestore: false })
      }
    }
    throw unlockErr
  }
}

async function openWithInstanceKeyWrapper(
  credentials: UnlockCredentials
): Promise<void> {
  const wrappersMeta = await readInstanceKeyWrappersMeta()
  if (!wrappersMeta) {
    throw new Error(UNLOCK_FAILED_MESSAGE)
  }
  const wrapper = findWrapperForUsername(wrappersMeta, credentials.username)
  if (!wrapper || !isInstanceKeyWrapperActive(wrapper)) {
    throw new Error(UNLOCK_FAILED_MESSAGE)
  }
  let instanceKeyHex: string
  try {
    instanceKeyHex = await unwrapInstanceKeyForUser(credentials.password, wrapper)
  } catch {
    throw new Error(UNLOCK_FAILED_MESSAGE)
  }
  await closeDb()
  await openDbWithFileKey(instanceKeyHex)
}

async function createFreshInstanceKeyMeta(): Promise<DbEncryptionMetaV2> {
  return {
    version: 2,
    key_mode: 'instance_key',
  }
}

/**
 * Unlock the local DB for an authenticated session: open with SQLCipher key and migrate plain DB if needed.
 */
export async function unlockLocalDatabaseWithPassword(
  credentials: UnlockCredentials,
  options?: { allowBackupRestore?: boolean }
): Promise<void> {
  const allowBackupRestore = options?.allowBackupRestore !== false
  const needsMigration = await needsPlainToEncryptedMigration()

  if (needsMigration) {
    const instanceKeyHex = generateInstanceKeyHex()
    await migratePlainDbToSqlcipher(instanceKeyHex)
    await writeDbEncryptionMeta(await createFreshInstanceKeyMeta())
    await closeDb()
    await openDbWithFileKey(instanceKeyHex)
    await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '2')
    return
  }

  const meta = await readDbEncryptionMeta()
  if (meta) {
    if (usesInstanceKeyMode(meta)) {
      await openWithInstanceKeyWrapper(credentials)
      return
    }
    if (isLegacyPasswordDerivedMode(meta)) {
      await openWithLegacyPasswordDerivedKey(credentials, meta.kdf_salt, allowBackupRestore)
      return
    }
    throw new Error('Invalid database encryption metadata')
  }

  if (!isDbUnlocked()) {
    await openPlainDbIfExists()
  }
}

export type PrepareEncryptedDatabaseResult = {
  instanceKeyHex: string
}

/**
 * Prepare SQLCipher for initial admin setup using a random instance key (not password-derived).
 */
export async function prepareEncryptedDatabaseForFirstAdmin(
  _password: string
): Promise<PrepareEncryptedDatabaseResult> {
  const meta = await readDbEncryptionMeta()
  const needsMigration = await needsPlainToEncryptedMigration()
  const instanceKeyHex = generateInstanceKeyHex()

  if (isDbUnlocked()) {
    await closeDb()
  }

  if (meta) {
    if (usesInstanceKeyMode(meta)) {
      if (needsMigration) {
        await migratePlainDbToSqlcipher(instanceKeyHex)
        await openDbWithFileKey(instanceKeyHex)
        await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '2')
        return { instanceKeyHex }
      }
      throw new Error('Database encryption metadata is inconsistent')
    }
    if (isLegacyPasswordDerivedMode(meta)) {
      throw new Error(
        'Legacy password-derived encryption must be migrated on sign-in before initial admin setup'
      )
    }
    throw new Error('Invalid database encryption metadata')
  }

  if (needsMigration) {
    await migratePlainDbToSqlcipher(instanceKeyHex)
    await writeDbEncryptionMeta(await createFreshInstanceKeyMeta())
    await openDbWithFileKey(instanceKeyHex)
    await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '2')
    return { instanceKeyHex }
  }

  await writeDbEncryptionMeta(await createFreshInstanceKeyMeta())
  await openDbWithFileKey(instanceKeyHex)
  await setSetting(DB_ENCRYPTION_SETTINGS_KEY, '2')
  return { instanceKeyHex }
}

export async function isLocalDatabaseLocked(): Promise<boolean> {
  return (await isLocalDbEncryptionEnabled()) && !isDbUnlocked()
}
