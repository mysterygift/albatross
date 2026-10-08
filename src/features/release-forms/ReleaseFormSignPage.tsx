import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Clock, PenLine } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import { saveReleaseCopy } from '@/features/release-forms/exportReleasePdf'
import { useReleaseFormSettings } from '@/features/release-forms/useReleaseFormSettings'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import type { ReleaseFormPdfInput } from '@/lib/pdf/releaseForm'
import type { ReleaseFormSettings } from '@/lib/releaseForms/settings'
import { signReleaseForm } from '@/lib/releaseForms/signReleaseForm'
import {
  RELEASE_FORM_TITLES,
  formatSignedAt,
  isReleaseFormType,
  renderTerms,
  termsParagraphs,
  type ReleaseFormType,
} from '@/lib/releaseForms/terms'
import { cn } from '@/lib/utils'

type DetailField = {
  key: string
  label: string
  /** Fills a terms token of the same name; required fields must be filled before signing. */
  required?: boolean
  type?: 'text' | 'email' | 'tel'
  placeholder?: string
  wide?: boolean
}

const DETAIL_FIELDS: Record<ReleaseFormType, DetailField[]> = {
  contributor: [
    { key: 'address', label: 'Address', wide: true },
    { key: 'city', label: 'City' },
    { key: 'county', label: 'County' },
    { key: 'postcode', label: 'Postcode' },
    { key: 'telephone', label: 'Telephone', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email', wide: true },
  ],
  location: [
    { key: 'location_address', label: 'Location address', required: true, wide: true },
    { key: 'shoot_dates', label: 'Shoot date(s)', placeholder: 'e.g. 14–16 October 2026', wide: true },
    { key: 'telephone', label: 'Telephone', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
  ],
}

/** Larger controls on touch screens, so fields and buttons are easy to hit on iPad and iPhone. */
const TOUCH_INPUT = 'pointer-coarse:h-11 pointer-coarse:text-base'

/** Current time, refreshed every 30 seconds for the date and time line. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function ReleaseFormSignPage() {
  const { formType } = useParams<{ formType: string }>()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { data: settings, isError } = useReleaseFormSettings()

  if (!isReleaseFormType(formType)) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Unknown release form.</p>
        <Button variant="outline" asChild>
          <Link to="/release-forms">
            <ArrowLeft />
            Back to Release Forms
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <RequireProduction title={RELEASE_FORM_TITLES[formType]}>
      {isError ? (
        <p className="text-destructive text-sm">Could not load the release terms.</p>
      ) : !settings || !currentProductionId ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <ReleaseFormSigner
          key={`${currentProductionId}-${formType}`}
          formType={formType}
          productionId={currentProductionId}
          productionName={currentProduction?.name ?? ''}
          settings={settings}
        />
      )}
    </RequireProduction>
  )
}

function ReleaseFormSigner({
  formType,
  productionId,
  productionName,
  settings,
}: {
  formType: ReleaseFormType
  productionId: string
  productionName: string
  settings: ReleaseFormSettings
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const now = useNow()

  // Snapshot the terms when the form opens: edits saved elsewhere never change a form being signed.
  const [snapshot] = useState(settings)
  const [details, setDetails] = useState<Record<string, string>>({})
  const [signerName, setSignerName] = useState('')
  const [under18, setUnder18] = useState(false)
  const [guardianName, setGuardianName] = useState('')
  const [producerName, setProducerName] = useState('')
  const [padEmpty, setPadEmpty] = useState({ signer: true, guardian: true, producer: true })
  const signerPad = useRef<SignaturePadHandle>(null)
  const guardianPad = useRef<SignaturePadHandle>(null)
  const producerPad = useRef<SignaturePadHandle>(null)

  const title = RELEASE_FORM_TITLES[formType]
  const fields = DETAIL_FIELDS[formType]
  const value = (key: string) => details[key]?.trim() ?? ''

  const tokens = {
    production_company: snapshot.companyName,
    production_name: productionName,
    location_address: details.location_address,
    shoot_dates: details.shoot_dates,
  }
  const terms = termsParagraphs(
    renderTerms(formType === 'contributor' ? snapshot.contributorTerms : snapshot.locationTerms, tokens)
  )
  const guardianTerms = termsParagraphs(renderTerms(snapshot.guardianTerms, tokens))

  const needsGuardian = formType === 'contributor' && under18
  const wantsProducer = formType === 'location' && (!padEmpty.producer || producerName.trim() !== '')
  const missing: string[] = []
  for (const f of fields) if (f.required && !value(f.key)) missing.push(f.label.toLowerCase())
  if (padEmpty.signer) missing.push('signature')
  if (!signerName.trim()) missing.push('full print name')
  if (needsGuardian && padEmpty.guardian) missing.push('parent or guardian signature')
  if (needsGuardian && !guardianName.trim()) missing.push('parent or guardian name')
  if (wantsProducer && padEmpty.producer) missing.push('producer signature')
  if (wantsProducer && !producerName.trim()) missing.push('producer name')

  const isDirty =
    Object.values(details).some((v) => v.trim()) ||
    !!signerName.trim() ||
    !!guardianName.trim() ||
    !!producerName.trim() ||
    !padEmpty.signer ||
    !padEmpty.guardian ||
    !padEmpty.producer

  const sign = useMutation({
    mutationFn: async () => {
      const signedAt = new Date()
      const pngOf = async (pad: SignaturePadHandle | null, label: string) => {
        const png = await pad?.toPng()
        if (!png) throw new Error(`The ${label} could not be captured. Please sign again.`)
        return png
      }
      const pdf: ReleaseFormPdfInput = {
        title,
        companyName: snapshot.companyName,
        productionName,
        termsParagraphs: terms,
        details: fields.map((f) => ({ label: f.label, value: value(f.key) })),
        signer: { name: signerName.trim(), signaturePng: await pngOf(signerPad.current, 'signature') },
        guardian: needsGuardian
          ? {
              name: guardianName.trim(),
              signaturePng: await pngOf(guardianPad.current, 'parent or guardian signature'),
              termsParagraphs: guardianTerms,
            }
          : null,
        producer: wantsProducer
          ? { name: producerName.trim(), signaturePng: await pngOf(producerPad.current, 'producer signature') }
          : null,
        signedAt,
        signedAtLabel: formatSignedAt(signedAt),
      }
      return signReleaseForm({ productionId, formType, pdf })
    },
    onSuccess: async (result) => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
      toast.success('Release signed and saved to Documents → Releases')
      try {
        await saveReleaseCopy(result.fileName, result.bytes)
      } catch (err) {
        toast.error(err instanceof Error ? `Could not save a copy: ${err.message}` : 'Could not save a copy')
      }
      navigate('/release-forms')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not sign the release'),
  })

  const handleCancel = async () => {
    if (
      isDirty &&
      !(await confirm({
        title: 'Discard this release?',
        description: 'The details and signatures entered so far will be lost.',
        confirmLabel: 'Discard',
        destructive: true,
      }))
    ) {
      return
    }
    navigate('/release-forms')
  }

  const padChange = (key: keyof typeof padEmpty) => (empty: boolean) =>
    setPadEmpty((p) => (p[key] === empty ? p : { ...p, [key]: empty }))

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <PageHeader
        title={title}
        description={productionName ? `For ${productionName}` : undefined}
        actions={
          <Button variant="outline" onClick={() => void handleCancel()} disabled={sign.isPending}>
            <ArrowLeft />
            Cancel
          </Button>
        }
      />

      {!snapshot.companyName && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>
            No production company is set, so the terms show a blank line in its place. Set it with Edit terms on the
            Release Forms page.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {formType === 'location'
              ? 'The location address and shoot dates are filled into the terms below.'
              : 'Optional contact details for the person signing.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={cn('space-y-1.5', f.wide && 'sm:col-span-2')}>
              <Label htmlFor={`release-${f.key}`}>
                {f.label}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`release-${f.key}`}
                type={f.type ?? 'text'}
                // Keep the device owner's saved details out of someone else's release.
                autoComplete="off"
                placeholder={f.placeholder}
                className={TOUCH_INPUT}
                value={details[f.key] ?? ''}
                onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          {formType === 'contributor' && (
            <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <Checkbox
                checked={under18}
                onCheckedChange={(checked) => setUnder18(checked === true)}
                className="pointer-coarse:size-5"
              />
              <span className="text-sm">The person signing is under 18 (a parent or guardian must also sign)</span>
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms</CardTitle>
          {snapshot.companyName ? <CardDescription>{snapshot.companyName}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <div className="space-y-3 font-serif text-[0.95rem] leading-relaxed">
            {terms.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </CardContent>
      </Card>

      {needsGuardian && (
        <Card>
          <CardHeader>
            <CardTitle>Consent of parent or guardian</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 font-serif text-[0.95rem] leading-relaxed">
              {guardianTerms.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <SignaturePad
              ref={guardianPad}
              label="Parent or guardian signature"
              onChange={padChange('guardian')}
              disabled={sign.isPending}
            />
            <NameField id="release-guardian-name" label="Parent or guardian full name" value={guardianName} onChange={setGuardianName} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Signature</CardTitle>
          <CardDescription>Sign with a finger, Apple Pencil or mouse, then print your full name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignaturePad ref={signerPad} label="Signature" onChange={padChange('signer')} disabled={sign.isPending} />
          <NameField id="release-signer-name" label="Full print name" value={signerName} onChange={setSignerName} />
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock className="size-4" aria-hidden="true" />
            <span>
              Date and time: <span className="text-foreground font-medium">{formatSignedAt(now)}</span>{' '}
              <span className="text-xs">(stamped when you press Sign)</span>
            </span>
          </p>
        </CardContent>
      </Card>

      {formType === 'location' && (
        <Card>
          <CardHeader>
            <CardTitle>Producer signature</CardTitle>
            <CardDescription>Optional countersignature from the production.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SignaturePad
              ref={producerPad}
              label="Producer signature"
              onChange={padChange('producer')}
              disabled={sign.isPending}
            />
            <NameField id="release-producer-name" label="Producer full name" value={producerName} onChange={setProducerName} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {missing.length > 0 && (
          <p className="text-muted-foreground text-sm sm:mr-auto">Still needed: {missing.join(', ')}.</p>
        )}
        <Button
          size="lg"
          className="pointer-coarse:h-12"
          onClick={() => sign.mutate()}
          disabled={missing.length > 0 || sign.isPending}
        >
          <PenLine />
          {sign.isPending ? 'Signing…' : 'Sign'}
        </Button>
      </div>
      {confirmDialog}
    </div>
  )
}

function NameField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        <span className="text-destructive"> *</span>
      </Label>
      {/* iPadOS Scribble lets Apple Pencil users handwrite straight into this field. */}
      <Input
        id={id}
        autoComplete="off"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        className={TOUCH_INPUT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
