import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, FileText, ImageUp, Loader2, Receipt, X } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { ExperimentalBadge } from '@/components/experimental-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { useCurrentProduction } from '@/features/productions/context'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import { uuid } from '@/lib/db/client'
import { listPostableAccounts } from '@/lib/db/repositories/budgetAccounts'
import { listBudgetItemsByProduction, listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listVendors } from '@/lib/db/repositories/vendors'
import { listFloatsByProduction } from '@/lib/db/repositories/floats'
import { listFloatExpenseLinksByProduction } from '@/lib/db/repositories/floatReconciliation'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { getProductionBudgetFeatures } from '@/lib/db/repositories/taxCredits'
import { listReceiptStatusByExpenseIds, expenseReceiptStatusQueryKey } from '@/lib/db/repositories/expenseReceipts'
import { invalidateExpenseFinanceQueries } from '@/lib/budget/vendors/invalidateVendorFinanceQueries'
import { saveCapturedReceipt } from '@/lib/db/receiptCaptureService'
import { prepareReceiptFile } from '@/lib/receipts/prepareReceiptPhoto'
import {
  buildFloatOptions,
  emptyReceiptCaptureDraft,
  parseAmount,
  parseVatRate,
  receiptFileName,
  validateReceiptCapture,
  type ReceiptCaptureDraft,
} from '@/lib/receipts/receiptCapture'
import { formatMoney } from '@/lib/money/formatMoney'
import { localIsoDate } from '@/lib/dates/localIsoDate'
import { roundMoney } from '@/lib/money/roundMoney'
import { cn } from '@/lib/utils'

const NONE = '__none__'

type Photo = { file: File; previewUrl: string | null }

export function ReceiptCapturePage() {
  return (
    <RequireProduction title="Receipt Capture">
      <ReceiptCaptureWorkspace />
    </RequireProduction>
  )
}

function ReceiptCaptureWorkspace() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const productionId = currentProductionId!
  const currency = currentProduction?.currency_code || 'GBP'
  const queryClient = useQueryClient()
  const { data: workingRevision } = useWorkingBudgetRevision(productionId)
  const revisionId = workingRevision?.id ?? null
  const today = localIsoDate()

  const [draft, setDraft] = useState<ReceiptCaptureDraft>(() => emptyReceiptCaptureDraft(today))
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // One id per capture: a retry after a failed or uncertain save reuses it, so nothing is saved twice.
  const expenseIdRef = useRef(uuid())
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['postable-accounts', productionId],
    queryFn: () => listPostableAccounts(productionId),
  })
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', productionId],
    queryFn: () => listVendors(productionId),
  })
  const { data: floats = [] } = useQuery({
    queryKey: ['floats', productionId, revisionId],
    queryFn: () => listFloatsByProduction(productionId, revisionId),
    enabled: workingRevision !== undefined,
  })
  const { data: floatLinks = [] } = useQuery({
    queryKey: ['float-expense-links-by-production', productionId, revisionId],
    queryFn: () => listFloatExpenseLinksByProduction(productionId, revisionId),
    enabled: workingRevision !== undefined,
  })
  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budget-items', productionId, revisionId],
    queryFn: () => listBudgetItemsByProduction(productionId, { revisionId }),
    enabled: workingRevision !== undefined,
  })
  const { data: people = [] } = useQuery({
    queryKey: ['people', productionId],
    queryFn: () => listPeopleByProduction(productionId),
  })
  const { data: budgetFeatures } = useQuery({
    queryKey: ['production-budget-features', productionId],
    queryFn: () => getProductionBudgetFeatures(productionId),
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', productionId],
    queryFn: () => listExpensesByProduction(productionId),
  })

  const vatEnabled = budgetFeatures?.vat_tracking_enabled === true
  const defaultVat = budgetFeatures?.default_vat_rate_percent ?? null
  // The production's default VAT rate applies until the field is edited.
  const [vatEdited, setVatEdited] = useState(false)
  const vatText = vatEdited ? draft.vatRatePercentText : defaultVat != null ? String(defaultVat) : ''

  // Revoke the preview URL when the photo changes or the page closes.
  useEffect(() => {
    const url = photo?.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo])

  const floatOptions = useMemo(
    () => buildFloatOptions({ floats, links: floatLinks, people, budgetItems }),
    [floats, floatLinks, people, budgetItems]
  )
  const selectedFloat = floatOptions.find((f) => f.floatId === draft.floatId) ?? null
  const amount = parseAmount(draft.amountText)
  const floatLeftAfter = selectedFloat && amount != null ? roundMoney(selectedFloat.remaining - amount) : null

  const todaysExpenses = useMemo(() => expenses.filter((e) => e.date === today).slice(0, 8), [expenses, today])
  const todaysIds = useMemo(() => todaysExpenses.map((e) => e.id), [todaysExpenses])
  const { data: receiptStatus = {} } = useQuery({
    queryKey: expenseReceiptStatusQueryKey(productionId, todaysIds),
    queryFn: () => listReceiptStatusByExpenseIds(todaysIds),
    enabled: todaysIds.length > 0,
  })
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])

  const set = <K extends keyof ReceiptCaptureDraft>(key: K, value: ReceiptCaptureDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const choosePhoto = (file: File | undefined) => {
    if (!file) return
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    setPhoto({ file, previewUrl })
    setError(null)
  }

  const chooseFloat = (value: string) => {
    const floatId = value === NONE ? null : value
    const option = floatOptions.find((f) => f.floatId === floatId)
    // Spend from a float belongs on the float's budget line, so pick it; the user can still change it.
    setDraft((d) => ({ ...d, floatId, accountId: option?.accountId ?? d.accountId }))
  }

  const reset = () => {
    setDraft(emptyReceiptCaptureDraft(localIsoDate()))
    setVatEdited(false)
    setPhoto(null)
    setError(null)
    expenseIdRef.current = uuid()
  }

  const save = useMutation({
    mutationFn: async () => {
      const problem = validateReceiptCapture({ ...draft, vatRatePercentText: vatEnabled ? vatText : '' }, photo != null)
      if (problem) throw new Error(problem)
      const prepared = await prepareReceiptFile(photo!.file)
      const vendorName = draft.vendorId ? vendorById.get(draft.vendorId)?.company_name ?? null : null
      return saveCapturedReceipt({
        expenseId: expenseIdRef.current,
        productionId,
        productionCurrency: currency,
        revisionId,
        accountId: draft.accountId!,
        amount: parseAmount(draft.amountText)!,
        date: draft.date,
        description: draft.description,
        vendorId: draft.vendorId,
        vendorName,
        notes: draft.notes,
        reference: draft.reference,
        vatRatePercent: vatEnabled ? parseVatRate(vatText) : null,
        floatId: draft.floatId,
        receipt: {
          fileName: receiptFileName(draft.date, vendorName, prepared.name, prepared.mimeType),
          bytes: prepared.bytes,
          mimeType: prepared.mimeType,
        },
      })
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', productionId] })
      queryClient.invalidateQueries({ queryKey: ['floats', productionId] })
      queryClient.invalidateQueries({ queryKey: ['float-expense-links-by-production', productionId] })
      queryClient.invalidateQueries({ queryKey: ['expense-with-details', result.expense.id] })
      invalidateExpenseFinanceQueries(queryClient, {
        productionId,
        expenseId: result.expense.id,
        vendorId: result.expense.vendor_id,
      })
      if (result.floatError) {
        toast.warning('Spend saved, but not matched to the float', {
          description: `${result.floatError} Match it from the float in Budget.`,
        })
      } else {
        toast.success(`Saved ${formatMoney(result.expense.amount, currency)} with its receipt`)
      }
      reset()
    },
    onError: (e: Error) => setError(e.message),
  })

  const touchField = 'h-11 text-base md:text-base'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt Capture"
        description="Photograph a receipt and log it as spend. The photo is saved as the expense's receipt."
        actions={<ExperimentalBadge />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5" aria-hidden />
              Receipt
            </CardTitle>
            <CardDescription>Flat on a dark surface, the whole receipt in frame.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* `capture` opens the rear camera on iPad and iPhone; desktop browsers ignore it and show a file picker. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                choosePhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                choosePhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {photo ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-lg border bg-muted/40">
                  {photo.previewUrl ? (
                    <img
                      src={photo.previewUrl}
                      alt="Receipt photo"
                      className="mx-auto max-h-[28rem] w-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-3 p-6 text-sm">
                      <FileText className="size-6 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{photo.file.name}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-11" onClick={() => cameraInputRef.current?.click()}>
                    <Camera aria-hidden />
                    Retake
                  </Button>
                  <Button type="button" variant="ghost" className="h-11" onClick={() => setPhoto(null)}>
                    <X aria-hidden />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Button
                  type="button"
                  className="h-28 flex-col gap-2 text-base"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="size-7" aria-hidden />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-28 flex-col gap-2 text-base"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUp className="size-7" aria-hidden />
                  Choose photo or PDF
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spend</CardTitle>
            <CardDescription>Saved as a purchase on the budget line you choose.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="rc-amount">Total ({currency})</Label>
                  <Input
                    id="rc-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={draft.amountText}
                    onChange={(e) => set('amountText', e.target.value)}
                    className="h-14 font-mono text-2xl md:text-2xl tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-date">Date on receipt</Label>
                  <Input
                    id="rc-date"
                    type="date"
                    value={draft.date}
                    onChange={(e) => set('date', e.target.value)}
                    className="h-14 text-base md:text-base"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rc-description">What was bought</Label>
                <Input
                  id="rc-description"
                  placeholder="e.g. Beer mats and pint glasses for Sc 10"
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  className={touchField}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rc-float">Paid from</Label>
                  <Select value={draft.floatId ?? NONE} onValueChange={chooseFloat}>
                    <SelectTrigger id="rc-float" className={cn('w-full', touchField)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not from a float</SelectItem>
                      {floatOptions.map((f) => (
                        <SelectItem key={f.floatId} value={f.floatId}>
                          {f.label} · {formatMoney(f.remaining, f.currency)} left
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedFloat && floatLeftAfter != null ? (
                    <p
                      className={cn(
                        'text-xs',
                        floatLeftAfter < 0 ? 'font-medium text-amber-600' : 'text-muted-foreground'
                      )}
                    >
                      {floatLeftAfter < 0
                        ? `Overspends ${selectedFloat.personName}'s float by ${formatMoney(-floatLeftAfter, selectedFloat.currency)}.`
                        : `${formatMoney(floatLeftAfter, selectedFloat.currency)} left on the float after this.`}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-account">Budget line</Label>
                  <Select value={draft.accountId ?? undefined} onValueChange={(v) => set('accountId', v)}>
                    <SelectTrigger id="rc-account" className={cn('w-full', touchField)}>
                      <SelectValue placeholder="Choose a budget line" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-muted-foreground">{a.code}</span> {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rc-vendor">Vendor</Label>
                  <Select
                    value={draft.vendorId ?? NONE}
                    onValueChange={(v) => set('vendorId', v === NONE ? null : v)}
                  >
                    <SelectTrigger id="rc-vendor" className={cn('w-full', touchField)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No vendor</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-reference">Receipt number</Label>
                  <Input
                    id="rc-reference"
                    autoComplete="off"
                    placeholder="Optional"
                    value={draft.reference}
                    onChange={(e) => set('reference', e.target.value)}
                    className={touchField}
                  />
                </div>
              </div>

              {vatEnabled ? (
                <div className="space-y-1.5 sm:max-w-48">
                  <Label htmlFor="rc-vat">VAT rate (%)</Label>
                  <Input
                    id="rc-vat"
                    inputMode="decimal"
                    value={vatText}
                    onChange={(e) => {
                      setVatEdited(true)
                      set('vatRatePercentText', e.target.value)
                    }}
                    className={touchField}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="rc-notes">Notes</Label>
                <Textarea
                  id="rc-notes"
                  rows={2}
                  placeholder="Optional"
                  value={draft.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="text-base md:text-base"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" className="h-12" onClick={reset} disabled={save.isPending}>
                  Clear
                </Button>
                <Button type="submit" className="h-12 px-6 text-base" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  Save spend
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend dated today</CardTitle>
        </CardHeader>
        <CardContent>
          {todaysExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged for today yet.</p>
          ) : (
            <ul className="divide-y" aria-label="Spend dated today">
              {todaysExpenses.map((e) => {
                const account = e.account_id ? accountById.get(e.account_id) : undefined
                const vendor = e.vendor_id ? vendorById.get(e.vendor_id)?.company_name : null
                const hasReceipt = (receiptStatus[e.id]?.receiptCount ?? 0) > 0
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-24 shrink-0 font-mono tabular-nums font-medium">{formatMoney(e.amount, currency)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {vendor ?? e.notes ?? 'Spend'}
                      {account ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · <span className="font-mono">{account.code}</span> {account.name}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 text-xs',
                        hasReceipt ? 'text-muted-foreground' : 'font-medium text-amber-600'
                      )}
                    >
                      {hasReceipt ? <Check className="size-3.5" aria-hidden /> : null}
                      {hasReceipt ? 'Receipt' : 'No receipt'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
