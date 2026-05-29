import { clearPersistedAuthSession } from '@/lib/auth/authService'
import { closeDb, openDbWithFileKey } from '@/lib/db/client'
import { reencryptAllClientFields } from '@/lib/db/migrations/reencryptClientFields'
import {
  deriveDekFromPassword,
  dataEncryptionKeyFromHex,
  dekBytesToHex,
} from '@/lib/security/dataEncryptionContext'
import {
  deriveSqlCipherPassphraseFromPassword,
  isLegacyPasswordDerivedMode,
  readDbEncryptionMeta,
  rekeySqlCipherDatabase,
  usesInstanceKeyMode,
} from '@/lib/security/dbFileEncryption'
import {
  findWrapperForUsername,
  readInstanceKeyWrappersMeta,
  findWrapperForUserId,
  replaceUserInstanceKeyWrapper,
  upsertUserInstanceKeyWrapper,
} from '@/lib/security/instanceKey'
import {
  DEFAULT_AUTH_RECOVERY_RATE_LIMIT,
  enforceRateLimit,
  type RateLimitRule,
} from '@/lib/security/rateLimiter'
import { appendAuditLog } from '@/lib/security/auditLog'
import {
  hashRecoveryKey,
  readRecoveryKeyMeta,
  recoveryKeyMetaExists,
  recoveryMetaSupportsClientPiiRecovery,
  recoveryMetaSupportsPasswordRecovery,
  refreshRecoveryEscrowAfterRecovery,
  unwrapEscrowedDek,
  unwrapInstanceKeyFromRecoveryEscrow,
  unwrapSqlCipherPassphrase,
  verifyRecoveryKey,
} from '@/lib/security/recoveryKey'

export const RECOVERY_FAILED_MESSAGE = 'Recovery failed'

type ActiveAdminRow = {
  id: string
  username: string
  dek_salt: string | null
}

let dummyRecoveryVerifierPromise: Promise<string> | null = null

async function getDummyRecoveryVerifier(): Promise<string> {
  if (!dummyRecoveryVerifierPromise) {
    dummyRecoveryVerifierPromise = hashRecoveryKey(
      '00000000-00000000-00000000-00000000-00000000-00000000-00000000-00000000'
    )
  }
  return dummyRecoveryVerifierPromise
}

async function runRecoveryKeyVerificationForTiming(plainKey: string): Promise<void> {
  const meta = await readRecoveryKeyMeta()
  const verifier = meta?.verifier ?? (await getDummyRecoveryVerifier())
  const stubMeta = meta ?? {
    version: 1 as const,
    verifier,
    created_at: '1970-01-01T00:00:00.000Z',
  }
  await verifyRecoveryKey(plainKey, stubMeta)
}

function normalizeAdminUsername(username: string): string {
  return username.trim().toLowerCase()
}

function nowIso(): string {
  return new Date().toISOString()
}

export type RecoverAdminPasswordInput = {
  recoveryKey: string
  newPassword: string
  confirmPassword: string
  /** When multiple active admins exist, limits reset to this admin. */
  adminUsername?: string
  sourceIp?: string | null
  rateLimitRule?: RateLimitRule
  rateLimitNowMs?: number
}

export async function recoverAdminPasswordWithRecoveryKey(
  input: RecoverAdminPasswordInput
): Promise<void> {
  enforceRateLimit({
    scope: 'auth.recovery',
    key: input.sourceIp ?? 'local',
    rule: input.rateLimitRule ?? DEFAULT_AUTH_RECOVERY_RATE_LIMIT,
    nowMs: input.rateLimitNowMs,
  })

  if (!input.newPassword || !input.confirmPassword) {
    throw new Error('Password is required')
  }
  if (input.newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new Error('Passwords do not match')
  }

  if (!(await recoveryKeyMetaExists())) {
    await runRecoveryKeyVerificationForTiming(input.recoveryKey)
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }

  const recoveryMeta = await readRecoveryKeyMeta()
  if (!recoveryMeta || !recoveryMetaSupportsPasswordRecovery(recoveryMeta)) {
    await runRecoveryKeyVerificationForTiming(input.recoveryKey)
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }

  const recoveryValid = await verifyRecoveryKey(input.recoveryKey, recoveryMeta)
  if (!recoveryValid) {
    await verifyRecoveryKey(input.recoveryKey, {
      ...recoveryMeta,
      verifier: await getDummyRecoveryVerifier(),
    })
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }

  const dbEncryptionMeta = await readDbEncryptionMeta()
  if (!dbEncryptionMeta) {
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }

  const instanceKeyMode = usesInstanceKeyMode(dbEncryptionMeta)

  let sqlCipherKeyHex: string
  try {
    if (instanceKeyMode) {
      sqlCipherKeyHex = await unwrapInstanceKeyFromRecoveryEscrow(
        input.recoveryKey,
        recoveryMeta,
        { expectInstanceKeyMode: true }
      )
    } else {
      sqlCipherKeyHex = await unwrapSqlCipherPassphrase(input.recoveryKey, recoveryMeta)
    }
  } catch {
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }

  let escrowedDekHex: string | null = null
  if (recoveryMetaSupportsClientPiiRecovery(recoveryMeta)) {
    try {
      escrowedDekHex = await unwrapEscrowedDek(
        input.recoveryKey,
        sqlCipherKeyHex,
        recoveryMeta
      )
    } catch {
      throw new Error(RECOVERY_FAILED_MESSAGE)
    }
  }

  if (!instanceKeyMode && isLegacyPasswordDerivedMode(dbEncryptionMeta)) {
    const newPassphrase = await deriveSqlCipherPassphraseFromPassword(
      input.newPassword,
      dbEncryptionMeta.kdf_salt
    )
    try {
      await rekeySqlCipherDatabase(sqlCipherKeyHex, newPassphrase)
    } catch {
      throw new Error(RECOVERY_FAILED_MESSAGE)
    }
    sqlCipherKeyHex = newPassphrase
  }

  await closeDb()
  const db = await openDbWithFileKey(sqlCipherKeyHex)

  try {
    const { hashPassword } = await import('@/lib/auth/passwordHash')
    const passwordHash = await hashPassword(input.newPassword)
    const ts = nowIso()

    const activeAdmins = await db.select<ActiveAdminRow[]>(
      `SELECT id, username, dek_salt
       FROM users
       WHERE role = 'admin'
         AND disabled_at IS NULL
       ORDER BY created_at ASC`,
      []
    )
    if (activeAdmins.length === 0) {
      throw new Error(RECOVERY_FAILED_MESSAGE)
    }

    let targetAdminIds: string[]
    let primaryAdmin: ActiveAdminRow
    if (input.adminUsername?.trim()) {
      const normalized = normalizeAdminUsername(input.adminUsername)
      const match = activeAdmins.find((a) => a.username === normalized)
      if (!match) {
        throw new Error(RECOVERY_FAILED_MESSAGE)
      }
      targetAdminIds = [match.id]
      primaryAdmin = match
    } else if (activeAdmins.length === 1) {
      primaryAdmin = activeAdmins[0]!
      targetAdminIds = [primaryAdmin.id]
    } else {
      primaryAdmin = activeAdmins[0]!
      targetAdminIds = activeAdmins.map((a) => a.id)
    }

    for (const adminId of targetAdminIds) {
      await db.execute(
        `UPDATE users
         SET password_hash = $1, updated_at = $2
         WHERE id = $3`,
        [passwordHash, ts, adminId]
      )
    }

    if (instanceKeyMode) {
      const wrappersMeta = await readInstanceKeyWrappersMeta()
      const existing =
        wrappersMeta != null
          ? findWrapperForUsername(wrappersMeta, primaryAdmin.username)
          : null
      if (existing && existing.user_id !== primaryAdmin.id) {
        throw new Error(RECOVERY_FAILED_MESSAGE)
      }
      const prior =
        wrappersMeta != null ? findWrapperForUserId(wrappersMeta, primaryAdmin.id) : null
      const wrapper = await replaceUserInstanceKeyWrapper(
        input.newPassword,
        sqlCipherKeyHex,
        { userId: primaryAdmin.id, username: primaryAdmin.username },
        prior ?? existing
      )
      await upsertUserInstanceKeyWrapper(wrapper)
    }

    await db.execute(
      `UPDATE sessions
       SET revoked_at = $1
       WHERE revoked_at IS NULL`,
      [ts]
    )

    const actorId = targetAdminIds[0]!
    const actorAdmin = activeAdmins.find((a) => a.id === actorId)!
    let clientPiiReencrypted = false

    if (escrowedDekHex && actorAdmin.dek_salt?.trim()) {
      const fromDek = dataEncryptionKeyFromHex(escrowedDekHex)
      const toDek = await deriveDekFromPassword(input.newPassword, actorAdmin.dek_salt.trim())
      await reencryptAllClientFields(db, { fromDek, toDek })
      clientPiiReencrypted = true
      await refreshRecoveryEscrowAfterRecovery({
        db,
        actorUserId: actorId,
        plainRecoveryKey: input.recoveryKey,
        newSqlCipherPassphraseHex: sqlCipherKeyHex,
        newDekHex: dekBytesToHex(toDek),
      })
    }

    const recoveryVersion = recoveryMetaSupportsClientPiiRecovery(recoveryMeta) ? 3 : 2
    await appendAuditLog(db, {
      actorUserId: actorId,
      targetUserId: actorId,
      action: 'auth.password_recovered',
      metadata: {
        version: recoveryVersion,
        sessionsRevoked: true,
        adminsReset: targetAdminIds.length,
        clientPiiReencrypted,
        instanceKeyMode,
      },
    })

    await clearPersistedAuthSession(db)
  } catch (err) {
    await closeDb()
    if (err instanceof Error && err.message !== RECOVERY_FAILED_MESSAGE) {
      if (
        err.message === 'Password is required' ||
        err.message === 'Password must be at least 8 characters' ||
        err.message === 'Passwords do not match'
      ) {
        throw err
      }
    }
    if (err instanceof Error && err.message === RECOVERY_FAILED_MESSAGE) {
      throw err
    }
    throw new Error(RECOVERY_FAILED_MESSAGE)
  }
}
