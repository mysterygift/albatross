import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeDb, getDb } from '@/lib/db/client'
import { prepareEncryptedDatabaseForFirstAdmin } from '@/lib/db/dbUnlock'
import { setupInitialAdmin } from '@/lib/auth/authService'
import { backfillClientEncryptionIfNeeded } from '@/lib/db/migrations/backfillClientEncryption'
import { backfillPeopleIsCastIntegerIfNeeded } from '@/lib/db/migrations/backfillPeopleIsCastInteger'
import { establishDataEncryptionKey, exportDataEncryptionKeyHex } from '@/lib/security/dataEncryptionContext'
import { upsertUserInstanceKeyWrapper, wrapInstanceKeyForUser } from '@/lib/security/instanceKey'
import {
  generateRecoveryKey,
  hashRecoveryKey,
  persistRecoveryKeyMaterial,
  recoveryKeyMetaExists,
} from '@/lib/security/recoveryKey'

type SetupStep = 'credentials' | 'recoveryKey'

export type InitialAdminSetupResult = {
  sessionToken: string
  repairedPeople: number
}

type InitialAdminSetupWizardProps = {
  busy: boolean
  onComplete: (result: InitialAdminSetupResult) => Promise<void>
  onError: (message: string) => void
}

export function InitialAdminSetupWizard({ busy, onComplete, onError }: InitialAdminSetupWizardProps) {
  const [step, setStep] = useState<SetupStep>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [savedConfirmation, setSavedConfirmation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (step !== 'recoveryKey' || recoveryKey != null) return
    setRecoveryKey(generateRecoveryKey())
  }, [step, recoveryKey])

  const handleCredentialsContinue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onError('')
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      onError('Username is required')
      return
    }
    if (!password) {
      onError('Password is required')
      return
    }
    setSavedConfirmation(false)
    setStep('recoveryKey')
  }

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recoveryKey || !savedConfirmation) return
    onError('')
    setIsSubmitting(true)
    const plainRecoveryKey = recoveryKey
    try {
      if (await recoveryKeyMetaExists()) {
        throw new Error('Recovery key already registered')
      }
      const verifier = await hashRecoveryKey(plainRecoveryKey)
      const { instanceKeyHex } = await prepareEncryptedDatabaseForFirstAdmin(password)
      const db = await getDb()
      const result = await setupInitialAdmin(db, { username, password })
      const wrapper = await wrapInstanceKeyForUser(password, instanceKeyHex, {
        userId: result.user.id,
        username: result.user.username,
      })
      await upsertUserInstanceKeyWrapper(wrapper)
      await establishDataEncryptionKey(db, result.user.id, password)
      await persistRecoveryKeyMaterial({
        db,
        actorUserId: result.user.id,
        plainRecoveryKey,
        verifier,
        sqlCipherPassphraseHex: instanceKeyHex,
        dekHex: exportDataEncryptionKeyHex(),
      })
      await backfillClientEncryptionIfNeeded(db)
      const repairedPeople = await backfillPeopleIsCastIntegerIfNeeded(db)
      setRecoveryKey(null)
      await onComplete({ sessionToken: result.sessionToken, repairedPeople })
    } catch (bootstrapError) {
      await closeDb()
      onError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : typeof bootstrapError === 'string'
            ? bootstrapError
            : 'Admin setup failed'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const wizardBusy = busy || isSubmitting

  if (step === 'credentials') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up admin account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleCredentialsContinue}>
            <div className="space-y-1.5">
              <Label htmlFor="auth-bootstrap-username">Admin username</Label>
              <Input
                id="auth-bootstrap-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={wizardBusy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-bootstrap-password">Admin password</Label>
              <Input
                id="auth-bootstrap-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={wizardBusy}
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={wizardBusy}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Save your recovery key</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleCreateAdmin}>
          <p className="text-sm text-muted-foreground">
            This recovery key will not be shown again. Store it outside Albatross — for example in a
            password manager or written down in a safe place.
          </p>
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Without this recovery key, your local encrypted data cannot be recovered if you forget your
            password. Albatross cannot recover your data for you — there is no cloud or support reset.
          </p>
          {recoveryKey && (
            <div
              className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wide break-all select-all"
              aria-label="Recovery key"
            >
              {recoveryKey}
            </div>
          )}
          <div className="flex items-start gap-2">
            <Checkbox
              id="auth-recovery-key-saved"
              checked={savedConfirmation}
              onCheckedChange={(checked) => setSavedConfirmation(checked === true)}
              disabled={wizardBusy}
            />
            <Label htmlFor="auth-recovery-key-saved" className="cursor-pointer text-sm leading-snug">
              I have saved this recovery key
            </Label>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={wizardBusy || !savedConfirmation}
          >
            {wizardBusy ? 'Creating admin...' : 'Create admin account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
