import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { listAccounts } from '@/lib/db/repositories/budgetAccounts'
import {
  listCostReportGroups,
  createCostReportGroup,
  updateCostReportGroup,
  deleteCostReportGroup,
  listGroupAccountIds,
  setGroupAccountIds,
  type CostReportGroupWithCount,
} from '@/lib/db/repositories/costReportGroups'
import { CURRENCY_OPTIONS } from '@/lib/money/formatMoney'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Wrench, AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  ensureDemoData,
  resetDemoData,
  getLastSeededAt,
  getSeedVersion,
  verifyCascades,
} from '@/lib/db/seed/demoProductionSeed'
import { getProductionBySlug } from '@/lib/db/repositories/production'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { getRate } from '@/lib/money/exchangeRates'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import type { BudgetAccount } from '@/lib/db/types'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function SettingsPage() {
  const { currentProductionId, setCurrentProductionId, refetchProductions } = useCurrentProduction()
  const {
    displayCurrency,
    setDisplayCurrency,
    conversionApiEnabled,
    setConversionApiEnabled,
    conversionBanner,
  } = useCurrency()
  const [cascadeResult, setCascadeResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null)
  const [cascadeLoading, setCascadeLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<CostReportGroupWithCount | null>(null)
  const queryClient = useQueryClient()

  const { data: dbPerfEnabledSetting } = useQuery({
    queryKey: ['settings', DB_PERF_SETTING_KEY],
    queryFn: () => getSetting(DB_PERF_SETTING_KEY),
  })
  const dbPerfEnabled = dbPerfEnabledSetting !== 'false'
  useEffect(() => {
    if (dbPerfEnabledSetting !== undefined) {
      setPerfLoggingEnabled(dbPerfEnabledSetting !== 'false')
    }
  }, [dbPerfEnabledSetting])

  const setDbPerfEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setSetting(DB_PERF_SETTING_KEY, enabled ? 'true' : 'false'),
    onMutate: (enabled) => {
      setPerfLoggingEnabled(enabled)
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['settings', DB_PERF_SETTING_KEY] })
    },
  })
  const { data: costReportGroups = [] } = useQuery({
    queryKey: ['cost-report-groups', currentProductionId],
    queryFn: () => listCostReportGroups(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', currentProductionId],
    queryFn: () => listAccounts(currentProductionId ?? ''),
    enabled: !!currentProductionId && (addGroupOpen || editGroup != null),
  })

  const { data: editGroupAccountIds = [] } = useQuery({
    queryKey: ['cost-report-group-accounts', editGroup?.id],
    queryFn: () => listGroupAccountIds(editGroup!.id),
    enabled: !!editGroup?.id,
  })

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; code: string; accountIds: string[] }) =>
      createCostReportGroup({
        production_id: currentProductionId!,
        name: data.name.trim(),
        code: data.code.trim() || null,
        accountIds: data.accountIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!] })
      setAddGroupOpen(false)
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: (data: { name: string; code: string; accountIds: string[] }) =>
      Promise.all([
        updateCostReportGroup(editGroup!.id, { name: data.name.trim(), code: data.code.trim() || null }),
        setGroupAccountIds(editGroup!.id, data.accountIds),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!] })
      setEditGroup(null)
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => deleteCostReportGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!] })
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card className="bg-[hsl(var(--card))] border-border">
        <CardHeader>
          <CardTitle>Currency</CardTitle>
          <CardDescription>
            Display currency for budget and money values. Default: British Pound (GBP). Values are stored in each production&apos;s base currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground">Display currency</Label>
            <Select
              value={displayCurrency}
              onValueChange={(v) => setDisplayCurrency(v)}
            >
              <SelectTrigger className="w-[180px] bg-[hsl(var(--input))] border-border text-foreground focus-visible:ring-[hsl(var(--mint))]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {conversionBanner && (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              {conversionBanner}
            </p>
          )}
        </CardContent>
      </Card>

      {currentProductionId && (
        <Card>
          <CardHeader>
            <CardTitle>Cost report groups</CardTitle>
            <CardDescription>
              Organise accounts for reporting and exports. Groups do not affect accounting totals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex justify-end">
              <Button onClick={() => setAddGroupOpen(true)}>
                <Plus className="mr-2 size-4" />
                Add group
              </Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-[100px]">Accounts</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costReportGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground text-sm">No groups yet.</TableCell>
                    </TableRow>
                  ) : (
                    costReportGroups.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>{g.name}</TableCell>
                        <TableCell>{g.code ?? '—'}</TableCell>
                        <TableCell>{g.accountCount}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditGroup(g)}
                            aria-label="Edit"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete group "${g.name}"?`)) {
                                deleteGroupMutation.mutate(g.id)
                              }
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
          </CardContent>
        </Card>
      )}

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-lg">
          {addGroupOpen && currentProductionId && (
            <CostReportGroupForm
              accounts={accounts}
              initialName=""
              initialCode=""
              initialAccountIds={[]}
              onSubmit={(data) => createGroupMutation.mutate(data)}
              onCancel={() => setAddGroupOpen(false)}
              isLoading={createGroupMutation.isPending}
              submitLabel="Add"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editGroup != null} onOpenChange={(open) => !open && setEditGroup(null)}>
        <DialogContent className="max-w-lg">
          {editGroup && currentProductionId && (
            <CostReportGroupForm
              accounts={accounts}
              initialName={editGroup.name}
              initialCode={editGroup.code ?? ''}
              initialAccountIds={editGroup.id ? editGroupAccountIds : []}
              onSubmit={(data) => updateGroupMutation.mutate(data)}
              onCancel={() => setEditGroup(null)}
              isLoading={updateGroupMutation.isPending}
              submitLabel="Save"
            />
          )}
        </DialogContent>
      </Dialog>

      {!currentProductionId && (
        <p className="text-muted-foreground">Select a production to manage cost report groups and other settings.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Data location</CardTitle>
          <CardDescription>
            SQLite database and attachments are stored in the app data directory. See README for paths per platform.
          </CardDescription>
        </CardHeader>
      </Card>

      {import.meta.env.DEV && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Developer tools
            </CardTitle>
            <CardDescription>
              Demo production seed (slug: {DEMO_SLUG}). Only affects this slug; never deletes user productions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="db-perf-toggle"
                  checked={dbPerfEnabled}
                  onChange={(e) => setDbPerfEnabledMutation.mutate(e.target.checked)}
                  disabled={setDbPerfEnabledMutation.isPending}
                  className="rounded border-amber-600"
                />
                <Label htmlFor="db-perf-toggle" className="font-medium text-amber-800 dark:text-amber-200">
                  DB Perf logging (HUD + Log to console)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="currency-api-toggle"
                  checked={conversionApiEnabled}
                  onChange={(e) => setConversionApiEnabled(e.target.checked)}
                  className="rounded border-amber-600"
                />
                <Label htmlFor="currency-api-toggle" className="font-medium text-amber-800 dark:text-amber-200">
                  Enable Currency Conversion API (Experimental)
                </Label>
              </div>
              <p className="text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                Experimental — likely to break projects. Do not use.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setDemoError(null)
                  try {
                    await ensureDemoData()
                    queryClient.invalidateQueries({ queryKey: ['productions'] })
                    await refetchProductions()
                    const prod = await getProductionBySlug(DEMO_SLUG)
                    if (prod) setCurrentProductionId(prod.id)
                  } catch (e) {
                    setDemoError(e instanceof Error ? e.message : String(e))
                    setTimeout(() => setDemoError(null), 5000)
                  }
                }}
              >
                Create Demo Production
              </Button>
              {demoError && (
                <p className="w-full text-sm text-destructive">
                  {demoError}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await resetDemoData()
                  queryClient.invalidateQueries({ queryKey: ['productions'] })
                }}
              >
                Reset Demo Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const prod = await getProductionBySlug(DEMO_SLUG)
                  if (prod) {
                    setCurrentProductionId(prod.id)
                    refetchProductions()
                  }
                }}
              >
                Open Demo Production
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={cascadeLoading}
                onClick={async () => {
                  setCascadeLoading(true)
                  setCascadeResult(null)
                  try {
                    const result = await verifyCascades()
                    setCascadeResult(result)
                  } finally {
                    setCascadeLoading(false)
                  }
                }}
              >
                {cascadeLoading ? 'Verifying…' : 'Verify Cascades'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const prevDisplay = (await getSetting('display_currency')) ?? 'GBP'
                  const prevApi = (await getSetting('enable_currency_conversion_api')) ?? 'false'
                  await setSetting('display_currency', 'USD')
                  await setSetting('enable_currency_conversion_api', 'true')
                  const rate = await getRate('GBP', 'USD')
                  const testAmounts = [1000, 25000, 1234.56]
                  console.log('[Demo currency test] GBP→USD rate:', rate)
                  testAmounts.forEach((gbp) => {
                    const usd = rate != null ? gbp * rate : null
                    console.log(`  ${gbp} GBP → ${usd != null ? usd.toFixed(2) : 'N/A'} USD`)
                  })
                  await setSetting('display_currency', prevDisplay)
                  await setSetting('enable_currency_conversion_api', prevApi)
                  queryClient.invalidateQueries({ queryKey: ['settings'] })
                }}
              >
                Test Currency Conversion (Demo)
              </Button>
            </div>
            {cascadeResult && (
              <p className={`text-sm ${cascadeResult.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {cascadeResult.message}
                {cascadeResult.details != null && (
                  <span className="block text-muted-foreground">{cascadeResult.details}</span>
                )}
              </p>
            )}
            <DemoSeedMeta />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CostReportGroupForm({
  accounts,
  initialName,
  initialCode,
  initialAccountIds,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: {
  accounts: BudgetAccount[]
  initialName: string
  initialCode: string
  initialAccountIds: string[]
  onSubmit: (data: { name: string; code: string; accountIds: string[] }) => void
  onCancel: () => void
  isLoading: boolean
  submitLabel: string
}) {
  const [name, setName] = useState(initialName)
  const [code, setCode] = useState(initialCode)
  const [accountIds, setAccountIds] = useState<string[]>(initialAccountIds)

  useEffect(() => {
    setName(initialName)
    setCode(initialCode)
  }, [initialName, initialCode])

  useEffect(() => {
    setAccountIds(initialAccountIds)
  }, [initialAccountIds.join(',')])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), code: code.trim(), accountIds })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{submitLabel === 'Add' ? 'Add group' : 'Edit group'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="crg-name">Name</Label>
          <Input
            id="crg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Above the line"
            required
          />
        </div>
        <div>
          <Label htmlFor="crg-code">Code (optional)</Label>
          <Input
            id="crg-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ATL"
            maxLength={10}
          />
        </div>
        <div>
          <Label>Accounts</Label>
          <p className="text-muted-foreground text-xs mb-2">Select accounts to include. Header accounts are allowed.</p>
          <div className="max-h-40 overflow-auto space-y-2 rounded border border-border p-2">
            {accounts.map((acc) => (
              <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={accountIds.includes(acc.id)}
                  onCheckedChange={(checked) => {
                    setAccountIds((prev) =>
                      checked ? [...prev, acc.id] : prev.filter((id) => id !== acc.id)
                    )
                  }}
                />
                <span className="text-sm">
                  {acc.code} — {acc.name}
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !name.trim()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function DemoSeedMeta() {
  const { data: lastSeeded } = useQuery({
    queryKey: ['seed-meta', 'last_seeded_at'],
    queryFn: getLastSeededAt,
  })
  const { data: version } = useQuery({
    queryKey: ['seed-meta', 'seed_version'],
    queryFn: getSeedVersion,
  })
  return (
    <p className="text-muted-foreground text-sm">
      Last seeded: {lastSeeded ?? '—'} {version != null ? `(v${version})` : ''}
    </p>
  )
}
