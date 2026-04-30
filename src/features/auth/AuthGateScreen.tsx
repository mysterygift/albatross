import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDb } from '@/lib/db/client'
import { sqlAdminUsersCount } from '@/lib/auth/authSql'
import { login, setupInitialAdmin } from '@/lib/auth/authService'
import { AUTH_SESSION_TOKEN_SETTING_KEY } from '@/lib/auth/useAuthSession'
import { setSetting } from '@/lib/db/repositories/settings'

async function getAdminsCount(): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ count: number | string }>>(
    sqlAdminUsersCount(db.dialect),
    []
  )
  return Number(rows[0]?.count ?? 0)
}

type AuthGateScreenProps = {
  loadingAuthState: boolean
}

export function AuthGateScreen({ loadingAuthState }: AuthGateScreenProps) {
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
    await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const db = await getDb()
      const result = await login(db, {
        username: loginUsername,
        password: loginPassword,
      })
      await persistSessionAndRefresh(result.sessionToken)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBootstrap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const db = await getDb()
      const result = await setupInitialAdmin(db, {
        username: bootstrapUsername,
        password: bootstrapPassword,
      })
      await persistSessionAndRefresh(result.sessionToken)
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : 'Admin setup failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || adminsCountQuery.isLoading}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                  />
                </div>
                <Button type="submit" variant="outline" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating admin...' : 'Create admin account'}
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
