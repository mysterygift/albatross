import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { DatabaseAdapter, SqlDialect } from '@/lib/db/databaseAdapter'
import { getDb } from '@/lib/db/client'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'

import { clearPersistedAuthSession, resolveAuthenticatedUserFromSessionToken } from './authService'

export const AUTH_SESSION_TOKEN_SETTING_KEY = 'auth_session_token'

/** After true, we do not wipe the setting again until the next full app load (new JS runtime). */
let clearedPersistedSessionThisRuntime = false

export type AuthSessionState = {
  supported: boolean
  dbDialect: SqlDialect
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
  const db = await getDb()
  const dbDialect: SqlDialect = db.dialect === 'postgres' ? 'postgres' : 'sqlite'
  try {
    const supported = await isAuthSupportedForDb(db)
    if (!supported) {
      return { supported: false, dbDialect, sessionToken: null, user: null }
    }
    if (!clearedPersistedSessionThisRuntime) {
      await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, '')
      clearedPersistedSessionThisRuntime = true
    }
    const sessionToken = await getSetting(AUTH_SESSION_TOKEN_SETTING_KEY)
    if (!sessionToken) {
      return { supported: true, dbDialect, sessionToken: null, user: null }
    }
    const resolved = await resolveAuthenticatedUserFromSessionToken(db, sessionToken)
    if (!resolved) {
      await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, '')
      return { supported: true, dbDialect, sessionToken: null, user: null }
    }
    return {
      supported: true,
      dbDialect,
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
    isAuthenticated: query.data?.user != null,
    isInstanceAdmin: query.data?.user?.role === 'admin',
    currentUser: query.data?.user ?? null,
    clearSession: async () => {
      const db = await getDb()
      await clearPersistedAuthSession(db)
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
    },
  }
}
