import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  exportDataEncryptionKeyHex,
  isClientEncryptionEnabled,
} from '@/lib/security/dataEncryptionContext'
import {
  deriveSqlCipherPassphraseFromPassword,
  isLegacyPasswordDerivedMode,
  readDbEncryptionMeta,
  usesInstanceKeyMode,
} from '@/lib/security/dbFileEncryption'
import {
  findWrapperForUsername,
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
  unwrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import {
  readRecoveryKeyMeta,
  recoveryMetaSupportsClientPiiRecovery,
  recoveryMetaSupportsPasswordRecovery,
  upgradeRecoveryMetaWithDekEscrow,
} from '@/lib/security/recoveryKey'

async function resolveSqlCipherPassphraseHexForDekEscrow(
  password: string,
  username: string
): Promise<string | null> {
  const dbEncryptionMeta = await readDbEncryptionMeta()
  if (!dbEncryptionMeta) return null

  if (usesInstanceKeyMode(dbEncryptionMeta)) {
    const wrappersMeta = await readInstanceKeyWrappersMeta()
    if (!wrappersMeta) return null
    const wrapper = findWrapperForUsername(wrappersMeta, username)
    if (!wrapper || !isInstanceKeyWrapperActive(wrapper)) return null
    return unwrapInstanceKeyForUser(password, wrapper)
  }

  if (isLegacyPasswordDerivedMode(dbEncryptionMeta)) {
    return deriveSqlCipherPassphraseFromPassword(password, dbEncryptionMeta.kdf_salt)
  }

  return null
}

/**
 * Silently upgrade v2 recovery sidecar with DEK escrow on login (file-passphrase wrap chain).
 */
export async function ensureDekEscrowOnLogin(
  db: DatabaseAdapter,
  userId: string,
  username: string,
  password: string
): Promise<void> {
  const meta = await readRecoveryKeyMeta()
  if (!meta || !recoveryMetaSupportsPasswordRecovery(meta)) return
  if (recoveryMetaSupportsClientPiiRecovery(meta)) return
  if (!(await isClientEncryptionEnabled(db))) return

  const sqlCipherPassphraseHex = await resolveSqlCipherPassphraseHexForDekEscrow(
    password,
    username
  )
  if (!sqlCipherPassphraseHex) return

  const dekHex = exportDataEncryptionKeyHex()

  await upgradeRecoveryMetaWithDekEscrow({
    db,
    actorUserId: userId,
    sqlCipherPassphraseHex,
    dekHex,
    dek_wrap_mode: 'file_passphrase',
  })
}
