import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { DatabaseAdapter, SqlDialect } from '@/lib/db/databaseAdapter'
import { clearDbFileKey, closeDb, getDb, isDbUnlocked } from '@/lib/db/client'
import { clearDataEncryptionKey } from '@/lib/security/dataEncryptionContext'
import { isLocalDatabaseLocked } from '@/lib/db/dbUnlock'
import { getLocalDbStatus } from '@/lib/security/dbFileEncryption'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'

import { clearPersistedAuthSession, resolveAuthenticatedUserFromSessionToken } from './authService'

export const AUTH_SESSION_TOKEN_SETTING_KEY = 'auth_session_token'

/** After true, we do not wipe the setting again until the next full app load (new JS runtime). */
let clearedPersistedSessionThisRuntime = false

export type AuthSessionState = {
  supported: boolean
  dbDialect: SqlDialect
  dbLocked: boolean
  sessionToken: string | null
  user: { id: string; username: string; role: 'user' | 'admin' } | null
}

function isMissingTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('no such table') || (message.includes('relation') && message.includes('does not exist'))
}

async function isAuthSupportedForDb(db: DatabaseAdapter): Promise<boolean> {
  try {
    if (db.dialect === 'sqlite') {
      const rows = await db.select<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1`
      )
      return rows.length > 0
    }
    const rows = await db.select<Array<{ exists: string | null }>>(
      `SELECT to_regclass(current_schema() || '.users') AS exists`
    )
    return rows[0]?.exists != null
  } catch (error) {
    if (isMissingTableError(error)) return false
    throw error
  }
}

async function fetchAuthSessionState(): Promise<AuthSessionState> {
  const locked = await isLocalDatabaseLocked()
  if (locked) {
    // DB not open yet — cannot clear settings here. Mark cold-start handled so the first
    // unlocked fetch after sign-in does not wipe the token we just persisted.
    if (!clearedPersistedSessionThisRuntime) {
      clearedPersistedSessionThisRuntime = true
    }
    const status = await getLocalDbStatus()
    const supported = status.encryptionMetaExists || status.dbFileExists
    return {
      supported,
      dbDialect: 'sqlite',
      dbLocked: true,
      sessionToken: null,
      user: null,
    }
  }

  const db = await getDb()
  const dbDialect: SqlDialect = db.dialect === 'postgres' ? 'postgres' : 'sqlite'
  try {
    const supported = await isAuthSupportedForDb(db)
    if (!supported) {
      return { supported: false, dbDialect, dbLocked: false, sessionToken: null, user: null }
    }
    if (!clearedPersistedSessionThisRuntime) {
      await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, '')
      clearedPersistedSessionThisRuntime = true
    }
    const sessionToken = await getSetting(AUTH_SESSION_TOKEN_SETTING_KEY)
    if (!sessionToken) {
      return { supported: true, dbDialect, dbLocked: false, sessionToken: null, user: null }
    }
    const resolved = await resolveAuthenticatedUserFromSessionToken(db, sessionToken)
    if (!resolved) {
      await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, '')
      return { supported: true, dbDialect, dbLocked: false, sessionToken: null, user: null }
    }
    return {
      supported: true,
      dbDialect,
      dbLocked: false,
      sessionToken,
      user: {
        id: resolved.user.id,
        username: resolved.user.username,
        role: resolved.user.role,
      },
    }
  } catch (err) {
    throw err
  }
}

export function useAuthSession() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSessionState,
  })

  return {
    ...query,
    authSupported: query.data?.supported ?? false,
    authDbDialect: query.data?.dbDialect ?? null,
    dbLocked: query.data?.dbLocked ?? false,
    isAuthenticated: query.data?.user != null,
    isInstanceAdmin: query.data?.user?.role === 'admin',
    currentUser: query.data?.user ?? null,
    clearSession: async () => {
      if (isDbUnlocked()) {
        const db = await getDb()
        await clearPersistedAuthSession(db)
      } else {
        clearDataEncryptionKey()
        clearDbFileKey()
        await closeDb()
      }
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
    },
  }
}
