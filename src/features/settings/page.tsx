import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import {
  listBudgetCategoriesByProduction,
  createBudgetCategory,
  deleteBudgetCategory,
} from '@/lib/db/repositories/budget'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Wrench, AlertTriangle } from 'lucide-react'
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
  const [open, setOpen] = useState(false)
  const [cascadeResult, setCascadeResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null)
  const [cascadeLoading, setCascadeLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
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
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<'pre' | 'production' | 'post'>('pre')

  const { data: categories = [] } = useQuery({
    queryKey: ['budget-categories', currentProductionId],
    queryFn: () => listBudgetCategoriesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createBudgetCategory({
        production_id: currentProductionId!,
        code,
        name,
        phase,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-categories'] })
      setOpen(false)
      setCode('')
      setName('')
      setPhase('pre')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBudgetCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-categories'] }),
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
            <CardTitle>Budget categories</CardTitle>
            <CardDescription>
              Define budget codes for this production. Used in Budget and quick-add spend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 size-4" />Add category</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New budget category</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Code</Label>
                      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ART" />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Art Department" />
                    </div>
                    <div>
                      <Label>Phase</Label>
                      <Select value={phase} onValueChange={(v) => setPhase(v as typeof phase)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pre">Pre-production</SelectItem>
                          <SelectItem value="production">Production</SelectItem>
                          <SelectItem value="post">Post-production</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={() => createMutation.mutate()} disabled={!code.trim() || !name.trim() || createMutation.isPending}>Add</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.phase}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!currentProductionId && (
        <p className="text-muted-foreground">Select a production to manage budget categories and other settings.</p>
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
