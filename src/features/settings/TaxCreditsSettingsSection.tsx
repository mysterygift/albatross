import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { PercentageInput } from '@/components/budget/PercentageInput'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { TaxCreditScheme } from '@/lib/db/types'
import {
  createTaxCreditScheme,
  deleteTaxCreditScheme,
  getProductionBudgetFeatures,
  listTaxCreditSchemes,
  setDefaultVatRatePercent,
  setTaxCreditSchemeEnabled,
  setTaxCreditsEnabled,
  setVatTrackingEnabledWithSeed,
  updateTaxCreditScheme,
} from '@/lib/db/repositories/taxCredits'
import { listVatReclaimRates, updateVatReclaimRate } from '@/lib/db/repositories/vatReclaim'
import type { VatReclaimTransactionType } from '@/lib/db/types'
import { seedAvecTaxCreditSchemes } from '@/lib/db/taxCreditSeedService'

type Props = { productionId: string }

type SchemeFormValues = {
  name: string
  net_rate_percent: number
  cap_percent: number | null
  min_qualifying_percent: number | null
  max_qualifying_amount: number | null
  max_core_budget: number | null
  is_vfx: boolean
}

const emptyForm: SchemeFormValues = {
  name: '',
  net_rate_percent: 25.5,
  cap_percent: 80,
  min_qualifying_percent: 10,
  max_qualifying_amount: null,
  max_core_budget: null,
  is_vfx: false,
}

function schemeToForm(s: TaxCreditScheme): SchemeFormValues {
  return {
    name: s.name,
    net_rate_percent: s.net_rate * 100,
    cap_percent: s.cap_percent == null ? null : s.cap_percent * 100,
    min_qualifying_percent: s.min_qualifying_percent == null ? null : s.min_qualifying_percent * 100,
    max_qualifying_amount: s.max_qualifying_amount,
    max_core_budget: s.max_core_budget,
    is_vfx: s.is_vfx,
  }
}

function formToSchemeData(productionId: string, form: SchemeFormValues) {
  return {
    production_id: productionId,
    name: form.name.trim(),
    net_rate: form.net_rate_percent / 100,
    cap_percent: form.cap_percent == null ? null : form.cap_percent / 100,
    min_qualifying_percent:
      form.min_qualifying_percent == null ? null : form.min_qualifying_percent / 100,
    max_qualifying_amount: form.max_qualifying_amount,
    max_core_budget: form.max_core_budget,
    is_vfx: form.is_vfx,
  }
}

function SchemeFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: SchemeFormValues
  onSubmit: (values: SchemeFormValues) => void
  isPending: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)
  const handleOpen = (next: boolean) => {
    if (next) setForm(initial)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="scheme-name">Name</Label>
            <Input
              id="scheme-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. AVEC (Live action)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ValidatedField label="Net rate (%)" htmlFor="scheme-rate">
              <PercentageInput
                id="scheme-rate"
                value={form.net_rate_percent}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, net_rate_percent: v ?? 0 }))
                }
              />
            </ValidatedField>
            <div className="space-y-1">
              <Label htmlFor="scheme-cap">Cap (% of core spend)</Label>
              <Input
                id="scheme-cap"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="None"
                value={form.cap_percent ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    cap_percent: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="scheme-min">Min qualifying (%)</Label>
              <Input
                id="scheme-min"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="None"
                value={form.min_qualifying_percent ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    min_qualifying_percent: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <ValidatedField label="Max qualifying amount" htmlFor="scheme-max-qual">
              <MoneyAmountInput
                id="scheme-max-qual"
                mode="nonNegative"
                placeholder="None"
                value={form.max_qualifying_amount}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, max_qualifying_amount: v }))
                }
              />
            </ValidatedField>
          </div>
          <ValidatedField label="Max core budget" htmlFor="scheme-max-budget">
            <MoneyAmountInput
              id="scheme-max-budget"
              mode="nonNegative"
              placeholder="None"
              value={form.max_core_budget}
              onValueChange={(v) => setForm((f) => ({ ...f, max_core_budget: v }))}
            />
          </ValidatedField>
          <div className="flex items-center gap-2">
            <Checkbox
              id="scheme-vfx"
              checked={form.is_vfx}
              onCheckedChange={(c) => setForm((f) => ({ ...f, is_vfx: c === true }))}
            />
            <Label htmlFor="scheme-vfx">VFX scheme (no cap by default)</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={isPending || !form.name.trim()}
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const VAT_RECLAIM_TYPE_LABELS: Record<VatReclaimTransactionType, string> = {
  labour: 'Labour',
  purchase: 'Purchase',
  rental: 'Rental',
  allow: 'Allow',
  deposit: 'Deposit',
  untyped: 'Legacy untyped',
}

const VAT_RECLAIM_TYPE_ORDER: VatReclaimTransactionType[] = [
  'labour',
  'purchase',
  'rental',
  'allow',
  'deposit',
]

export function TaxCreditsSettingsSection({ productionId }: Props) {
  const queryClient = useQueryClient()
  const featuresKey = ['production-budget-features', productionId] as const
  const schemesKey = ['tax-credit-schemes', productionId] as const
  const reclaimRatesKey = ['vat-reclaim-rates', productionId] as const

  const { data: features } = useQuery({
    queryKey: featuresKey,
    queryFn: () => getProductionBudgetFeatures(productionId),
  })

  const { data: schemes = [] } = useQuery({
    queryKey: schemesKey,
    queryFn: () => listTaxCreditSchemes(productionId),
  })

  const { data: reclaimRates = [] } = useQuery({
    queryKey: reclaimRatesKey,
    queryFn: () => listVatReclaimRates(productionId),
    enabled: features?.vat_tracking_enabled === true,
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [editScheme, setEditScheme] = useState<TaxCreditScheme | null>(null)
  const [schemeToDelete, setSchemeToDelete] = useState<TaxCreditScheme | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [defaultVatDraft, setDefaultVatDraft] = useState('')

  useEffect(() => {
    if (features?.default_vat_rate_percent != null) {
      setDefaultVatDraft(String(features.default_vat_rate_percent))
    }
  }, [features?.default_vat_rate_percent])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: featuresKey })
    queryClient.invalidateQueries({ queryKey: schemesKey })
    queryClient.invalidateQueries({ queryKey: reclaimRatesKey })
  }

  const taxCreditsToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) await seedAvecTaxCreditSchemes(productionId)
      return setTaxCreditsEnabled(productionId, enabled)
    },
    onSuccess: invalidate,
  })

  const vatToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => setVatTrackingEnabledWithSeed(productionId, enabled),
    onSuccess: invalidate,
  })

  const reclaimRateMutation = useMutation({
    mutationFn: ({ id, percent }: { id: string; percent: number }) =>
      updateVatReclaimRate(id, percent),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reclaimRatesKey }),
  })

  const defaultVatMutation = useMutation({
    mutationFn: (rate: number | null) => setDefaultVatRatePercent(productionId, rate),
    onSuccess: invalidate,
  })

  const createMutation = useMutation({
    mutationFn: (values: SchemeFormValues) =>
      createTaxCreditScheme(formToSchemeData(productionId, values)),
    onSuccess: () => {
      invalidate()
      setCreateOpen(false)
      setFormError(null)
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Could not create scheme'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: SchemeFormValues }) => {
      const data = formToSchemeData(productionId, values)
      return updateTaxCreditScheme(id, {
        name: data.name,
        net_rate: data.net_rate,
        cap_percent: data.cap_percent,
        min_qualifying_percent: data.min_qualifying_percent,
        max_qualifying_amount: data.max_qualifying_amount,
        max_core_budget: data.max_core_budget,
        is_vfx: data.is_vfx,
      })
    },
    onSuccess: () => {
      invalidate()
      setEditScheme(null)
      setFormError(null)
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Could not update scheme'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTaxCreditScheme,
    onSuccess: () => {
      invalidate()
      setSchemeToDelete(null)
      setDeleteError(null)
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete scheme')
    },
  })

  const enableMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setTaxCreditSchemeEnabled(id, enabled),
    onSuccess: invalidate,
  })

  const taxCreditsOn = features?.tax_credits_enabled ?? false
  const vatOn = features?.vat_tracking_enabled ?? false

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tax credits</CardTitle>
          <CardDescription>
            Tag spend against tax credit schemes on the Budget page. Qualifying spend and estimated
            credits appear in cost summaries. Scheme data is preserved when this feature is turned
            off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tax-credits-enabled"
              checked={taxCreditsOn}
              onCheckedChange={(c) =>
                taxCreditsToggleMutation.mutate(c === true)
              }
              disabled={taxCreditsToggleMutation.isPending}
            />
            <Label htmlFor="tax-credits-enabled">Enable tax credits for this production</Label>
          </div>

          {taxCreditsOn && (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setFormError(null); setCreateOpen(true) }}>
                  <Plus className="mr-2 size-4" />
                  Add tax credit scheme
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Net rate</TableHead>
                      <TableHead className="text-right">Cap</TableHead>
                      <TableHead className="w-[80px]">On</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schemes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-sm">
                          No schemes yet. Enable tax credits to seed AVEC defaults, or add a scheme.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schemes.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(s.net_rate * 100).toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.cap_percent == null ? '—' : `${(s.cap_percent * 100).toFixed(0)}%`}
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={s.is_enabled}
                              onCheckedChange={(c) =>
                                enableMutation.mutate({ id: s.id, enabled: c === true })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setFormError(null); setEditScheme(s) }}
                              aria-label="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                setDeleteError(null)
                                setSchemeToDelete(s)
                              }}
                              aria-label="Delete"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VAT</CardTitle>
          <CardDescription>
            Track VAT on individual expenses when logging spend. VAT is shown separately and does not
            change account actuals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="vat-tracking-enabled"
              checked={vatOn}
              onCheckedChange={(c) => vatToggleMutation.mutate(c === true)}
              disabled={vatToggleMutation.isPending}
            />
            <Label htmlFor="vat-tracking-enabled">Track VAT on spend</Label>
          </div>
          {vatOn && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="default-vat-rate">Default VAT rate (%)</Label>
                <Input
                  id="default-vat-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="w-[120px]"
                  placeholder="20"
                  value={defaultVatDraft}
                  onChange={(e) => setDefaultVatDraft(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={defaultVatMutation.isPending}
                onClick={() => {
                  const raw = defaultVatDraft.trim()
                  const rate = raw === '' ? null : Number(raw)
                  defaultVatMutation.mutate(rate)
                }}
              >
                Save default
              </Button>
            </div>
          )}
          {vatOn && reclaimRates.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">VAT reclaim % by expense type</Label>
              <p className="text-xs text-muted-foreground">
                Percentage of VAT paid that is reclaimable for each transaction type.
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense type</TableHead>
                      <TableHead className="w-[140px] text-right">Reclaim %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VAT_RECLAIM_TYPE_ORDER.map((typeKey) => {
                      const row = reclaimRates.find((r) => r.transaction_type === typeKey)
                      if (!row) return null
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{VAT_RECLAIM_TYPE_LABELS[typeKey]}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              className="w-[100px] ml-auto h-8"
                              defaultValue={row.reclaim_percent}
                              onBlur={(e) => {
                                const next = Number(e.target.value)
                                if (!Number.isFinite(next) || next === row.reclaim_percent) return
                                reclaimRateMutation.mutate({ id: row.id, percent: next })
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SchemeFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add tax credit scheme"
        initial={emptyForm}
        onSubmit={(v) => createMutation.mutate(v)}
        isPending={createMutation.isPending}
        error={formError}
      />

      {editScheme && (
        <SchemeFormDialog
          open={!!editScheme}
          onOpenChange={(o) => { if (!o) setEditScheme(null) }}
          title="Edit tax credit scheme"
          initial={schemeToForm(editScheme)}
          onSubmit={(v) => updateMutation.mutate({ id: editScheme.id, values: v })}
          isPending={updateMutation.isPending}
          error={formError}
        />
      )}

      <Dialog
        open={schemeToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setSchemeToDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent
          showCloseButton={!deleteMutation.isPending}
          onEscapeKeyDown={(e) => {
            if (deleteMutation.isPending) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete tax credit scheme?</DialogTitle>
            <DialogDescription>
              {schemeToDelete
                ? `Remove "${schemeToDelete.name}" from this production? This cannot be undone.`
                : 'Remove this tax credit scheme from this production? This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSchemeToDelete(null)
                setDeleteError(null)
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!schemeToDelete || deleteMutation.isPending}
              onClick={() => schemeToDelete && deleteMutation.mutate(schemeToDelete.id)}
              aria-label="Confirm delete tax credit scheme"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
