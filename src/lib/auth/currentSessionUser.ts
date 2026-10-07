import { getDb } from '@/lib/db/client'
import { getSetting } from '@/lib/db/repositories/settings'

import { resolveAuthenticatedUserFromSessionToken } from './authService'

/** Same setting key as `useAuthSession` and `authService`. */
const AUTH_SESSION_TOKEN_SETTING_KEY = 'auth_session_token'

/**
 * Id of the user signed in on this install, read from the persisted session, or `null` when sign-in is not in
 * use, no one is signed in, or the session has expired. Never throws: callers use it to add optional ownership.
 */
export async function getCurrentSessionUserId(): Promise<string | null> {
  try {
    const token = await getSetting(AUTH_SESSION_TOKEN_SETTING_KEY)
    if (!token) return null
    const resolved = await resolveAuthenticatedUserFromSessionToken(await getDb(), token)
    return resolved?.user.id ?? null
  } catch {
    return null
  }
}
