import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getActiveSqlCipherKeyHex, isDbUnlocked } from '@/lib/db/client'
import { readDbEncryptionMeta, usesInstanceKeyMode } from '@/lib/security/dbFileEncryption'
import {
  findWrapperForUserId,
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
  removeUserInstanceKeyWrapper,
  replaceUserInstanceKeyWrapper,
  rewrapInstanceKeyForUser,
  unwrapInstanceKeyForUser,
  upsertUserInstanceKeyWrapper,
  type InstanceKeyWrapperEntry,
} from '@/lib/security/instanceKey'
import {
  readRecoveryKeyMeta,
  recoveryMetaSupportsPasswordRecovery,
  unwrapInstanceKeyFromRecoveryEscrow,
  verifyRecoveryKey,
} from '@/lib/security/recoveryKey'

export type AdminPasswordResetWrapperPath = 'old_password' | 'admin_unlock' | 'recovery_escrow'

export const ADMIN_PASSWORD_RESET_NO_KEY_ACCESS_MESSAGE =
  'Cannot reset password without encryption key access. Provide the user\'s current password, sign in with an unlocked encrypted database, or use recovery authorization.'

export const ADMIN_PASSWORD_RESET_WRONG_CURRENT_PASSWORD_MESSAGE = 'Current password is incorrect'

export const ADMIN_PASSWORD_RESET_RECOVERY_FAILED_MESSAGE = 'Recovery authorization failed'

export type ResolvedAdminPasswordResetWrapper = {
  path: AdminPasswordResetWrapperPath
  wrapperEntry: InstanceKeyWrapperEntry
  priorSidecarEntry: InstanceKeyWrapperEntry | null
}

type UserWrapperMirrorRow = {
  id: string
  username: string
  instance_key_wrap_version: number | null
  instance_key_wrap_salt: string | null
  instance_key_wrapped: string | null
  instance_key_wrap_created_at: string | null
  instance_key_wrap_rotated_at: string | null
}

function wrapperEntryFromMirror(row: UserWrapperMirrorRow): InstanceKeyWrapperEntry | null {
  if (
    row.instance_key_wrap_version !== 1 ||
    !row.instance_key_wrap_salt?.trim() ||
    !row.instance_key_wrapped?.trim()
  ) {
    return null
  }
  return {
    user_id: row.id,
    username: row.username,
    wrap_salt: row.instance_key_wrap_salt,
    wrapped_instance_key: row.instance_key_wrapped,
    version: 1,
    created_at: row.instance_key_wrap_created_at ?? new Date(0).toISOString(),
    rotated_at: row.instance_key_wrap_rotated_at,
    revoked_at: null,
  }
}

async function loadActiveTargetWrapper(
  db: DatabaseAdapter,
  targetUserId: string
): Promise<{ wrapper: InstanceKeyWrapperEntry | null; priorSidecarEntry: InstanceKeyWrapperEntry | null }> {
  const wrappersMeta = await readInstanceKeyWrappersMeta()
  const priorSidecarEntry = wrappersMeta ? findWrapperForUserId(wrappersMeta, targetUserId) : null
  if (
    priorSidecarEntry?.wrapped_instance_key?.trim() &&
    isInstanceKeyWrapperActive(priorSidecarEntry)
  ) {
    return { wrapper: priorSidecarEntry, priorSidecarEntry }
  }

  const rows = await db.select<UserWrapperMirrorRow[]>(
    `SELECT id,
            username,
            instance_key_wrap_version,
            instance_key_wrap_salt,
            instance_key_wrapped,
            instance_key_wrap_created_at,
            instance_key_wrap_rotated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [targetUserId]
  )
  const mirror = rows[0] ? wrapperEntryFromMirror(rows[0]) : null
  if (mirror && isInstanceKeyWrapperActive(mirror)) {
    return { wrapper: mirror, priorSidecarEntry }
  }
  return { wrapper: null, priorSidecarEntry }
}

export async function restorePriorSidecarEntry(
  priorSidecarEntry: InstanceKeyWrapperEntry | null,
  args: { userId: string; username: string }
): Promise<void> {
  if (priorSidecarEntry) {
    await upsertUserInstanceKeyWrapper(priorSidecarEntry)
    return
  }
  await removeUserInstanceKeyWrapper({ userId: args.userId, username: args.username })
}

export async function resolveAdminPasswordResetWrapper(args: {
  db: DatabaseAdapter
  targetUserId: string
  targetUsername: string
  targetPasswordHash: string
  newPassword: string
  targetOldPassword?: string
  recoveryKey?: string
}): Promise<ResolvedAdminPasswordResetWrapper> {
  const target = { userId: args.targetUserId, username: args.targetUsername }
  const { wrapper: activeWrapper, priorSidecarEntry } = await loadActiveTargetWrapper(
    args.db,
    args.targetUserId
  )

  if (args.targetOldPassword?.trim()) {
    const { verifyPassword } = await import('@/lib/auth/passwordHash')
    const valid = await verifyPassword(args.targetOldPassword, args.targetPasswordHash)
    if (!valid) {
      throw new Error(ADMIN_PASSWORD_RESET_WRONG_CURRENT_PASSWORD_MESSAGE)
    }
    if (activeWrapper) {
      try {
        const instanceKeyHex = await unwrapInstanceKeyForUser(args.targetOldPassword, activeWrapper)
        const wrapperEntry = await rewrapInstanceKeyForUser(
          args.targetOldPassword,
          args.newPassword,
          activeWrapper,
          instanceKeyHex
        )
        return { path: 'old_password', wrapperEntry, priorSidecarEntry }
      } catch {
        throw new Error(ADMIN_PASSWORD_RESET_WRONG_CURRENT_PASSWORD_MESSAGE)
      }
    }
  }

  if (isDbUnlocked()) {
    const instanceKeyHex = getActiveSqlCipherKeyHex()
    const wrapperEntry = await replaceUserInstanceKeyWrapper(
      args.newPassword,
      instanceKeyHex,
      target,
      priorSidecarEntry
    )
    return { path: 'admin_unlock', wrapperEntry, priorSidecarEntry }
  }

  if (args.recoveryKey?.trim()) {
    const recoveryMeta = await readRecoveryKeyMeta()
    if (!recoveryMeta || !recoveryMetaSupportsPasswordRecovery(recoveryMeta)) {
      throw new Error(ADMIN_PASSWORD_RESET_RECOVERY_FAILED_MESSAGE)
    }
    const recoveryValid = await verifyRecoveryKey(args.recoveryKey, recoveryMeta)
    if (!recoveryValid) {
      throw new Error(ADMIN_PASSWORD_RESET_RECOVERY_FAILED_MESSAGE)
    }
    const dbEncryptionMeta = await readDbEncryptionMeta()
    if (!dbEncryptionMeta || !usesInstanceKeyMode(dbEncryptionMeta)) {
      throw new Error(ADMIN_PASSWORD_RESET_RECOVERY_FAILED_MESSAGE)
    }
    let instanceKeyHex: string
    try {
      instanceKeyHex = await unwrapInstanceKeyFromRecoveryEscrow(args.recoveryKey, recoveryMeta, {
        expectInstanceKeyMode: true,
      })
    } catch {
      throw new Error(ADMIN_PASSWORD_RESET_RECOVERY_FAILED_MESSAGE)
    }
    const wrapperEntry = await replaceUserInstanceKeyWrapper(
      args.newPassword,
      instanceKeyHex,
      target,
      priorSidecarEntry
    )
    return { path: 'recovery_escrow', wrapperEntry, priorSidecarEntry }
  }

  throw new Error(ADMIN_PASSWORD_RESET_NO_KEY_ACCESS_MESSAGE)
}
