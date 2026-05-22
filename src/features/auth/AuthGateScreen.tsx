import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeDb, getDb, openPlainDbIfExists } from '@/lib/db/client'
import { prepareEncryptedDatabaseForFirstAdmin, unlockLocalDatabaseWithPassword } from '@/lib/db/dbUnlock'
import { sqlAdminUsersCount } from '@/lib/auth/authSql'
import { login, setupInitialAdmin } from '@/lib/auth/authService'
import { AUTH_SESSION_TOKEN_SETTING_KEY } from '@/lib/auth/useAuthSession'
import { setSetting } from '@/lib/db/repositories/settings'
import { backfillClientEncryptionIfNeeded } from '@/lib/db/migrations/backfillClientEncryption'
import { backfillPeopleIsCastIntegerIfNeeded } from '@/lib/db/migrations/backfillPeopleIsCastInteger'
import { establishDataEncryptionKey } from '@/lib/security/dataEncryptionContext'
import { getLocalDbStatus } from '@/lib/security/dbFileEncryption'

async function getAdminsCount(): Promise<number> {
  const status = await getLocalDbStatus()
  if (status.encryptionMetaExists && !status.isPlainSqlite) {
    return 1
  }
  const db = await openPlainDbIfExists()
  const rows = await db.select<Array<{ count: number | string }>>(
    sqlAdminUsersCount(db.dialect),
    []
  )
  return Number(rows[0]?.count ?? 0)
}

type AuthGateScreenProps = {
  loadingAuthState: boolean
  encryptingDatabase?: boolean
}

export function AuthGateScreen({ loadingAuthState, encryptingDatabase = false }: AuthGateScreenProps) {
  const queryClient = useQueryClient()
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [bootstrapUsername, setBootstrapUsername] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const adminsCountQuery = useQuery({
    queryKey: ['auth-admins-count'],
    queryFn: getAdminsCount,
    enabled: !loadingAuthState,
  })

  const hasExistingAdmin = (adminsCountQuery.data ?? 0) > 0

  const persistSessionAndRefresh = async (sessionToken: string) => {
    await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, sessionToken)
    await queryClient.refetchQueries({ queryKey: ['auth-session'] })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await unlockLocalDatabaseWithPassword(loginPassword)
      const db = await getDb()
      const result = await login(db, {
        username: loginUsername,
        password: loginPassword,
      })
      await establishDataEncryptionKey(db, result.user.id, loginPassword)
      await backfillClientEncryptionIfNeeded(db)
      const repairedPeople = await backfillPeopleIsCastIntegerIfNeeded(db)
      await persistSessionAndRefresh(result.sessionToken)
      if (repairedPeople > 0) {
        await queryClient.invalidateQueries({ queryKey: ['crew'] })
        await queryClient.invalidateQueries({ queryKey: ['people'] })
      }
    } catch (authError) {
      await closeDb()
      setError(
        authError instanceof Error
          ? authError.message
          : typeof authError === 'string'
            ? authError
            : typeof authError === 'object' && authError !== null && 'message' in authError
              ? String((authError as { message: unknown }).message)
              : 'Login failed'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBootstrap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    let bootstrapStep = 'start'
    // #region agent log
    const debugLog = (
      message: string,
      data: Record<string, unknown>,
      hypothesisId: string
    ) => {
      fetch('http://127.0.0.1:7530/ingest/a9c70180-8925-49f9-9e35-9c55fc3480ae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '415200' },
        body: JSON.stringify({
          sessionId: '415200',
          location: 'AuthGateScreen.tsx:handleBootstrap',
          message,
          data,
          hypothesisId,
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    try {
      bootstrapStep = 'prepareEncryptedDatabaseForFirstAdmin'
      debugLog('bootstrap step', { step: bootstrapStep }, 'A')
      await prepareEncryptedDatabaseForFirstAdmin(bootstrapPassword)
      bootstrapStep = 'getDb'
      debugLog('bootstrap step', { step: bootstrapStep }, 'A')
      const db = await getDb()
      bootstrapStep = 'setupInitialAdmin'
      debugLog('bootstrap step', { step: bootstrapStep, dialect: db.dialect }, 'B')
      const result = await setupInitialAdmin(db, {
        username: bootstrapUsername,
        password: bootstrapPassword,
      })
      bootstrapStep = 'establishDataEncryptionKey'
      debugLog('bootstrap step', { step: bootstrapStep, userId: result.user.id }, 'C')
      await establishDataEncryptionKey(db, result.user.id, bootstrapPassword)
      bootstrapStep = 'backfillClientEncryptionIfNeeded'
      debugLog('bootstrap step', { step: bootstrapStep }, 'D')
      await backfillClientEncryptionIfNeeded(db)
      bootstrapStep = 'backfillPeopleIsCastIntegerIfNeeded'
      debugLog('bootstrap step', { step: bootstrapStep }, 'D')
      const repairedPeople = await backfillPeopleIsCastIntegerIfNeeded(db)
      bootstrapStep = 'persistSessionAndRefresh'
      debugLog('bootstrap step', { step: bootstrapStep, repairedPeople }, 'D')
      await persistSessionAndRefresh(result.sessionToken)
      debugLog('bootstrap complete', { step: 'done' }, 'A')
      if (repairedPeople > 0) {
        await queryClient.invalidateQueries({ queryKey: ['crew'] })
        await queryClient.invalidateQueries({ queryKey: ['people'] })
      }
    } catch (bootstrapError) {
      await closeDb()
      const errType = bootstrapError === null ? 'null' : typeof bootstrapError
      const errMessage =
        bootstrapError instanceof Error
          ? bootstrapError.message
          : typeof bootstrapError === 'string'
            ? bootstrapError
            : bootstrapError && typeof bootstrapError === 'object' && 'message' in bootstrapError
              ? String((bootstrapError as { message: unknown }).message)
              : String(bootstrapError)
      // #region agent log
      debugLog(
        'bootstrap failed',
        {
          step: bootstrapStep,
          errType,
          errMessage: errMessage.slice(0, 500),
          isErrorInstance: bootstrapError instanceof Error,
        },
        'E'
      )
      // #endregion
      setError(errMessage || 'Admin setup failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isSubmitting || encryptingDatabase

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {encryptingDatabase && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
            Encrypting local database…
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleLogin}>
              <div className="space-y-1.5">
                <Label htmlFor="auth-login-username">Username</Label>
                <Input
                  id="auth-login-username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-login-password">Password</Label>
                <Input
                  id="auth-login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || adminsCountQuery.isLoading}>
                {busy ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {!hasExistingAdmin && !adminsCountQuery.isLoading && (
          <Card>
            <CardHeader>
              <CardTitle>Set up admin account</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleBootstrap}>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-bootstrap-username">Admin username</Label>
                  <Input
                    id="auth-bootstrap-username"
                    value={bootstrapUsername}
                    onChange={(e) => setBootstrapUsername(e.target.value)}
                    autoComplete="username"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-bootstrap-password">Admin password</Label>
                  <Input
                    id="auth-bootstrap-password"
                    type="password"
                    value={bootstrapPassword}
                    onChange={(e) => setBootstrapPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full" disabled={busy}>
                  {busy ? 'Creating admin...' : 'Create admin account'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
