import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb } from '@/lib/db/client'

import {
  EncryptionKeyUnavailableError,
  getDataEncryptionKey,
  isClientEncryptionEnabled,
} from './dataEncryptionContext'

export { EncryptionKeyUnavailableError }

export const ENCRYPTION_KEY_UNAVAILABLE_MESSAGE = 'Sign in again to access client data.'

export function isEncryptionKeyUnavailable(err: unknown): err is EncryptionKeyUnavailableError {
  return err instanceof EncryptionKeyUnavailableError
}

/** User-facing message for UI when client PII cannot be decrypted. */
export function encryptionKeyUnavailableMessage(err: unknown): string {
  if (isEncryptionKeyUnavailable(err)) {
    return err.message || ENCRYPTION_KEY_UNAVAILABLE_MESSAGE
  }
  return ENCRYPTION_KEY_UNAVAILABLE_MESSAGE
}

export async function isSensitiveDataProtectionActive(db?: DatabaseAdapter): Promise<boolean> {
  const conn = db ?? (await getDb())
  return isClientEncryptionEnabled(conn)
}

/**
 * When UAM1 is enabled, requires an in-memory DEK (established at login).
 * Pre-login getDb() for users/sessions/settings does not call this.
 */
/** Throws {@link EncryptionKeyUnavailableError} when UAM1 is enabled and no DEK is in memory. */
export async function requireSensitiveDataAccess(db?: DatabaseAdapter): Promise<void> {
  const conn = db ?? (await getDb())
  if (await isClientEncryptionEnabled(conn)) {
    getDataEncryptionKey()
  }
}

/** Use as React Query `enabled` for queries that return decrypted client PII. */
export function canFetchSensitiveClientData(
  authSupported: boolean,
  isAuthenticated: boolean
): boolean {
  return !authSupported || isAuthenticated
}
