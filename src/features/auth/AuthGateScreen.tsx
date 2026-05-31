import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ForgotPasswordRecoveryCard } from '@/features/auth/ForgotPasswordRecoveryCard'
import { SetupWizard } from '@/features/auth/setup/SetupWizard'
import { closeDb, getDb } from '@/lib/db/client'
import { completeLoginAfterDatabaseUnlock } from '@/lib/auth/loginOrchestration'
import { unlockLocalDatabaseWithPassword } from '@/lib/db/dbUnlock'
import {
  AUTH_GATE_MODE_QUERY_KEY,
  INITIAL_SETUP_STATUS_QUERY_KEY,
  resolveAuthGateMode,
} from '@/lib/auth/initialSetupStatus'
import { AUTH_SESSION_TOKEN_SETTING_KEY } from '@/lib/auth/useAuthSession'
import { setSetting } from '@/lib/db/repositories/settings'
import { recoveryPasswordResetAvailable } from '@/lib/security/recoveryKey'
import { useSetupWorkspaceHandoff } from '@/hooks/useSetupWorkspaceHandoff'

type AuthGateScreenProps = {
  loadingAuthState: boolean
  encryptingDatabase?: boolean
}

type AuthGateView = 'signIn' | 'forgotPassword'

export function AuthGateScreen({ loadingAuthState, encryptingDatabase = false }: AuthGateScreenProps) {
  const queryClient = useQueryClient()
  const handoff = useSetupWorkspaceHandoff()
  const [view, setView] = useState<AuthGateView>('signIn')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const authGateModeQuery = useQuery({
    queryKey: AUTH_GATE_MODE_QUERY_KEY,
    queryFn: resolveAuthGateMode,
    enabled: !loadingAuthState,
  })

  const recoveryAvailableQuery = useQuery({
    queryKey: ['auth-recovery-available'],
    queryFn: recoveryPasswordResetAvailable,
    enabled: !loadingAuthState && authGateModeQuery.data === 'sign_in',
  })

  const showForgotPasswordLink =
    authGateModeQuery.data === 'sign_in' &&
    (recoveryAvailableQuery.data ?? false) &&
    view === 'signIn'

  const persistSessionAndRefresh = async (sessionToken: string) => {
    await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, sessionToken)
    await queryClient.refetchQueries({ queryKey: ['auth-session'] })
    await queryClient.invalidateQueries({ queryKey: INITIAL_SETUP_STATUS_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: AUTH_GATE_MODE_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await unlockLocalDatabaseWithPassword({
        username: loginUsername,
        password: loginPassword,
      })
      const db = await getDb()
      const result = await completeLoginAfterDatabaseUnlock(db, {
        username: loginUsername,
        password: loginPassword,
      })
      const { repairedPeople } = result
      if (!result.sessionToken) {
        throw new Error('Login succeeded but no session token was issued')
      }
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

  const busy = isSubmitting || encryptingDatabase

  const handleRequireSignIn = async () => {
    await queryClient.invalidateQueries({ queryKey: AUTH_GATE_MODE_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: INITIAL_SETUP_STATUS_QUERY_KEY })
  }

  if (authGateModeQuery.isLoading || loadingAuthState) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }

  const showSetupWizard = authGateModeQuery.data === 'setup' || handoff.armed

  if (showSetupWizard) {
    return (
      <>
        <SetupWizard
          busy={busy}
          onRequireSignIn={() => void handleRequireSignIn()}
          onError={(message) => setError(message || null)}
          onSetupComplete={async ({ sessionToken, repairedPeople }) => {
            await persistSessionAndRefresh(sessionToken)
            if (repairedPeople > 0) {
              await queryClient.invalidateQueries({ queryKey: ['crew'] })
              await queryClient.invalidateQueries({ queryKey: ['people'] })
            }
          }}
        />
        {error && (
          <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4">
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          </div>
        )}
      </>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {encryptingDatabase && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
            Encrypting local database…
          </p>
        )}
        {view === 'forgotPassword' ? (
          <ForgotPasswordRecoveryCard
            busy={busy}
            onBack={() => {
              setView('signIn')
              setError(null)
            }}
            onSuccess={() => {
              setLoginPassword('')
              setError(null)
            }}
          />
        ) : (
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
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Signing in...' : 'Sign in'}
                </Button>
                {showForgotPasswordLink && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-full p-0 text-sm"
                    onClick={() => {
                      setError(null)
                      setView('forgotPassword')
                    }}
                    disabled={busy}
                  >
                    Forgot password?
                  </Button>
                )}
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
