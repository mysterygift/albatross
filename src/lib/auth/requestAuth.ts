import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

import {
  resolveAuthenticatedUserFromSessionToken,
  type AuthenticatedUser,
} from './authService'

type HeaderSource = Headers | Record<string, string | undefined | null>

function getHeader(source: HeaderSource, key: string): string | null {
  if (source instanceof Headers) {
    return source.get(key)
  }
  const target = key.toLowerCase()
  for (const [candidate, value] of Object.entries(source)) {
    if (candidate.toLowerCase() === target) return value ?? null
  }
  return null
}

export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^\s*Bearer\s+(.+)\s*$/i)
  if (!match) return null
  return match[1]?.trim() || null
}

export async function resolveRequestUserContext(
  db: DatabaseAdapter,
  headers: HeaderSource
): Promise<AuthenticatedUser | null> {
  const token = extractBearerToken(getHeader(headers, 'authorization'))
  if (!token) return null
  const auth = await resolveAuthenticatedUserFromSessionToken(db, token)
  return auth?.user ?? null
}
