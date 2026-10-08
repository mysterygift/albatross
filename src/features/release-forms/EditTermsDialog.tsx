import { useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useSaveReleaseFormSettings } from '@/features/release-forms/useReleaseFormSettings'
import { STANDARD_RELEASE_TERMS, type ReleaseFormSettings } from '@/lib/releaseForms/settings'
import { RELEASE_TOKENS } from '@/lib/releaseForms/terms'

type TermsKey = keyof typeof STANDARD_RELEASE_TERMS

const TERMS_TABS: Array<{ key: TermsKey; label: string; tokens: readonly string[] }> = [
  { key: 'contributorTerms', label: 'Contributor', tokens: ['production_company', 'production_name'] },
  { key: 'guardianTerms', label: 'Parent or guardian', tokens: ['production_company', 'production_name'] },
  {
    key: 'locationTerms',
    label: 'Location',
    tokens: ['production_company', 'production_name', 'location_address', 'shoot_dates'],
  },
]

export type EditTermsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ReleaseFormSettings
}

/** Edits the app-wide production company and release terms; signed releases are never affected. */
export function EditTermsDialog(props: EditTermsDialogProps) {
  // Mounted only while open, so every opening starts from the saved settings.
  return props.open ? <EditTermsDialogBody {...props} /> : null
}

function EditTermsDialogBody({ open, onOpenChange, settings }: EditTermsDialogProps) {
  const [draft, setDraft] = useState<ReleaseFormSettings>(settings)
  const [tab, setTab] = useState<TermsKey>('contributorTerms')
  const textareaRefs = useRef<Partial<Record<TermsKey, HTMLTextAreaElement | null>>>({})
  const save = useSaveReleaseFormSettings()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const insertToken = (key: TermsKey, token: string) => {
    const el = textareaRefs.current[key]
    const text = `{{${token}}}`
    const value = draft[key]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    setDraft((d) => ({ ...d, [key]: value.slice(0, start) + text + value.slice(end) }))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const restoreStandard = async (key: TermsKey, label: string) => {
    const ok = await confirm({
      title: `Restore the standard ${label.toLowerCase()} terms?`,
      description: 'Your edits to these terms will be replaced when you save.',
      confirmLabel: 'Restore',
    })
    if (ok) setDraft((d) => ({ ...d, [key]: STANDARD_RELEASE_TERMS[key] }))
  }

  const handleSave = () => {
    save.mutate(draft, {
      onSuccess: () => {
        toast.success('Release terms saved. New release forms will use them.')
        onOpenChange(false)
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save the terms'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Release form terms</DialogTitle>
          <DialogDescription>These terms and the company name are used on every production.</DialogDescription>
        </DialogHeader>

        <Alert>
          <Info />
          <AlertDescription>
            Changes apply to new release forms only. Signed releases keep the terms they were signed under.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="release-company-name">Production company</Label>
          <Input
            id="release-company-name"
            value={draft.companyName}
            placeholder="e.g. Maverick Live"
            onChange={(e) => setDraft((d) => ({ ...d, companyName: e.target.value }))}
          />
          <p className="text-muted-foreground text-xs">
            Fills in <code>{'{{production_company}}'}</code>. The production name comes from the current production.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TermsKey)}>
          <TabsList>
            {TERMS_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TERMS_TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Insert:</span>
                {RELEASE_TOKENS.filter((tk) => t.tokens.includes(tk.token)).map((tk) => (
                  <Button
                    key={tk.token}
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => insertToken(t.key, tk.token)}
                  >
                    {tk.label}
                  </Button>
                ))}
              </div>
              <Textarea
                ref={(el) => {
                  textareaRefs.current[t.key] = el
                }}
                aria-label={`${t.label} terms`}
                className="min-h-72 font-serif text-sm leading-relaxed"
                value={draft[t.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">Leave a blank line between paragraphs.</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void restoreStandard(t.key, t.label)}>
                  Restore standard terms
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save terms'}
          </Button>
        </DialogFooter>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}
