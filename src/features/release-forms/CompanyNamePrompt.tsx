import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { useSaveReleaseFormSettings } from '@/features/release-forms/useReleaseFormSettings'
import type { ReleaseFormSettings } from '@/lib/releaseForms/settings'

/**
 * Asks for the production company before the first release form. It is required: the terms grant
 * rights to it, so a release must never be signed with that part left blank.
 */
export function CompanyNamePrompt({
  settings,
  onSaved,
}: {
  settings: ReleaseFormSettings
  onSaved?: () => void
}) {
  const [companyName, setCompanyName] = useState('')
  const save = useSaveReleaseFormSettings()
  const trimmed = companyName.trim()

  const handleSave = () => {
    if (!trimmed) return
    save.mutate(
      { ...settings, companyName: trimmed },
      {
        onSuccess: () => onSaved?.(),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save the production company'),
      }
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Set your production company first</p>
          <p className="text-muted-foreground text-sm">
            Release forms grant their rights to your production company, so it has to be filled in before anyone signs.
            You can change it later with Edit terms.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="release-company-prompt">Production company</Label>
        <Input
          id="release-company-prompt"
          value={companyName}
          placeholder="e.g. Maverick Live"
          autoFocus
          className="pointer-coarse:h-11 pointer-coarse:text-base"
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!trimmed || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save and continue'}
        </Button>
      </div>
    </form>
  )
}
