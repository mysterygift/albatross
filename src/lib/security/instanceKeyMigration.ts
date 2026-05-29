import { closeDb, openDbWithFileKey } from '@/lib/db/client'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  backupEncryptedDbBeforeRekey,
  deriveSqlCipherPassphraseFromPassword,
  isLegacyPasswordDerivedMode,
  readDbEncryptionMeta,
  rekeySqlCipherDatabase,
  restoreSqliteFromInstanceKeyBackup,
  usesInstanceKeyMode,
  writeDbEncryptionMeta,
} from '@/lib/security/dbFileEncryption'
import {
  generateInstanceKeyHex,
  upsertUserInstanceKeyWrapper,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import {
  readRecoveryKeyMeta,
  recoveryMetaSupportsPasswordRecovery,
  updateRecoveryEscrowInstanceKey,
} from '@/lib/security/recoveryKey'

export const INSTANCE_KEY_MIGRATION_FAILED_MESSAGE = 'Instance key migration failed'

export type InstanceKeyMigrationUser = {
  userId: string
  username: string
}

async function rollbackInstanceKeyMigration(): Promise<void> {
  try {
    await restoreSqliteFromInstanceKeyBackup()
  } catch {
    // Best-effort rollback
  }
  await closeDb()
}

/**
 * One-time upgrade from password-derived SQLCipher key (meta v1) to random instance key (meta v2).
 * Call only after legacy unlock and successful password verification.
 */
export async function migrateToInstanceKeyModeIfNeeded(
  db: DatabaseAdapter,
  user: InstanceKeyMigrationUser,
  password: string
): Promise<boolean> {
  const meta = await readDbEncryptionMeta()
  if (!meta || usesInstanceKeyMode(meta)) return false
  if (!isLegacyPasswordDerivedMode(meta)) {
    throw new Error('Invalid database encryption metadata')
  }

  const legacyPassphrase = await deriveSqlCipherPassphraseFromPassword(password, meta.kdf_salt)
  await db.select('SELECT 1 AS ok', [])

  const instanceKeyHex = generateInstanceKeyHex()
  let backupTaken = false

  try {
    await backupEncryptedDbBeforeRekey()
    backupTaken = true
    await rekeySqlCipherDatabase(legacyPassphrase, instanceKeyHex)

    const recoveryMeta = await readRecoveryKeyMeta()
    if (recoveryMeta && recoveryMetaSupportsPasswordRecovery(recoveryMeta)) {
      await updateRecoveryEscrowInstanceKey({
        recoveryMeta,
        legacyPassphraseHex: legacyPassphrase,
        instanceKeyHex,
      })
    }

    const wrapper = await wrapInstanceKeyForUser(password, instanceKeyHex, {
      userId: user.userId,
      username: user.username,
    })
    await upsertUserInstanceKeyWrapper(wrapper)

    await writeDbEncryptionMeta({
      version: 2,
      key_mode: 'instance_key',
      legacy_kdf_salt: meta.kdf_salt,
      migrated_at: new Date().toISOString(),
    })

    await closeDb()
    await openDbWithFileKey(instanceKeyHex)
    return true
  } catch (err) {
    if (backupTaken) {
      await rollbackInstanceKeyMigration()
    } else {
      await closeDb()
    }
    if (err instanceof Error && err.message === INSTANCE_KEY_MIGRATION_FAILED_MESSAGE) {
      throw err
    }
    throw new Error(INSTANCE_KEY_MIGRATION_FAILED_MESSAGE)
  }
}
