import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import {
  listAccounts,
  createAccount,
  updateAccountName,
  updateAccountColor,
  archiveAccount,
  unarchiveAccount,
  hardDeleteAccount,
  getHardDeleteEligibleAccountIds,
} from '@/lib/db/repositories/budgetAccounts'
import { buildAccountTree } from '@/lib/budget/calculations'
import type { AccountTreeNode } from '@/lib/budget/calculations'
import { getAccountBandColor, ACCOUNT_COLOR_PRESETS } from '@/lib/budget/accountBandColor'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wrench, AlertTriangle, Plus, Pencil, Trash2, Archive, ArchiveRestore, ChevronRight, ChevronDown, Users } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import {
  ensureDemoData,
  resetDemoData,
  getLastSeededAt,
  getSeedVersion,
  verifyCascades,
} from '@/lib/db/seed/demoProductionSeed'
import { getProductionBySlug } from '@/lib/db/repositories/production'
import { enableEpisodicProduction } from '@/lib/db/episodicProductionService'
import { getSetting, setSetting, FIRST_LAUNCH_TUTORIAL_SEEN_KEY, setFirstLaunchTutorialSeen } from '@/lib/db/repositories/settings'
import { CrewStructureEditor } from '@/features/settings/CrewStructureEditor'
import { EpisodesSettingsSection } from '@/features/settings/EpisodesSettingsSection'
import { ShootingBlocsSettingsSection } from '@/features/settings/ShootingBlocsSettingsSection'
import {
  API_CALL_TRACKER_IDS,
  API_CALL_TRACKER_LABELS,
  API_CALL_TRACKING_SETTING_KEY,
  getApiCallCounts,
  setApiCallTrackingEnabled,
  subscribeApiCallTracker,
} from '@/lib/dev/apiCallTracker'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { getRate } from '@/lib/money/exchangeRates'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import type { BudgetAccount } from '@/lib/db/types'
import { useAuthSession } from '@/lib/auth/useAuthSession'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'
const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'

function ApiCallTrackerPanel({ trackingOn }: { trackingOn: boolean }) {
  const [, bump] = useState(0)
  useEffect(() => subscribeApiCallTracker(() => bump((n) => n + 1)), [])
  const counts = getApiCallCounts()
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-amber-800 dark:text-amber-200">
        Counts are for this app session only and reset when you quit. With tracking off, numbers do not
        increase.
      </p>
      {!trackingOn && (
        <p className="text-xs text-amber-700/90 dark:text-amber-300/90">Tracking is off — enable above to record new calls.</p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>API</TableHead>
            <TableHead className="text-right w-24">Calls</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {API_CALL_TRACKER_IDS.map((id) => (
            <TableRow key={id}>
              <TableCell className="text-sm">{API_CALL_TRACKER_LABELS[id]}</TableCell>
              <TableCell className="text-right tabular-nums">{counts[id]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { currentProductionId, currentProduction, setCurrentProductionId, refetchProductions } =
    useCurrentProduction()
  const { data: workingBudgetRevision } = useWorkingBudgetRevision(currentProductionId)
  const revisionId = workingBudgetRevision?.id
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
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<BudgetAccount | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<BudgetAccount | null>(null)
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set())
  const [colorToast, setColorToast] = useState<string | null>(null)
  const [settingsTab, setSettingsTab] = useState<'budget' | 'people' | 'apis' | 'developer_tools'>('budget')
  const queryClient = useQueryClient()
  const [tutorialToast, setTutorialToast] = useState<string | null>(null)
  const [orsApiKeyDraft, setOrsApiKeyDraft] = useState('')
  const [orsApiKeyToast, setOrsApiKeyToast] = useState<string | null>(null)
  const [episodicEnableOpen, setEpisodicEnableOpen] = useState(false)
  const [episodicInitialEpisode, setEpisodicInitialEpisode] = useState('')
  const [episodicEnableError, setEpisodicEnableError] = useState<string | null>(null)
  const authSession = useAuthSession()

  const toggleAccountExpanded = useCallback((accountId: string) => {
    setExpandedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }, [])

  const invalidateAccountKeys = () => {
    if (currentProductionId) {
      queryClient.invalidateQueries({ queryKey: ['budget-accounts', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['budgetAccounts', currentProductionId, 'postable'] })
    }
  }

  const { data: dbPerfEnabledSetting } = useQuery({
    queryKey: ['settings', DB_PERF_SETTING_KEY],
    queryFn: () => getSetting(DB_PERF_SETTING_KEY),
  })
  const { data: apiCallTrackingSetting } = useQuery({
    queryKey: ['settings', API_CALL_TRACKING_SETTING_KEY],
    queryFn: () => getSetting(API_CALL_TRACKING_SETTING_KEY),
  })
  const { data: orsApiKeySetting } = useQuery({
    queryKey: ['settings', OPENROUTESERVICE_API_KEY_SETTING],
    queryFn: () => getSetting(OPENROUTESERVICE_API_KEY_SETTING),
  })
  const dbPerfEnabled = dbPerfEnabledSetting !== 'false'
  const apiCallTrackingEnabled = apiCallTrackingSetting === 'true'
  useEffect(() => {
    if (dbPerfEnabledSetting !== undefined) {
      setPerfLoggingEnabled(dbPerfEnabledSetting !== 'false')
    }
  }, [dbPerfEnabledSetting])
  useEffect(() => {
    if (apiCallTrackingSetting !== undefined) {
      setApiCallTrackingEnabled(apiCallTrackingSetting === 'true')
    }
  }, [apiCallTrackingSetting])
  useEffect(() => {
    setOrsApiKeyDraft(orsApiKeySetting ?? '')
  }, [orsApiKeySetting])

  const setDbPerfEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setSetting(DB_PERF_SETTING_KEY, enabled ? 'true' : 'false'),
    onMutate: (enabled) => {
      setPerfLoggingEnabled(enabled)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', DB_PERF_SETTING_KEY] })
    },
  })
  const setApiCallTrackingMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setSetting(API_CALL_TRACKING_SETTING_KEY, enabled ? 'true' : 'false'),
    onMutate: (enabled) => {
      setApiCallTrackingEnabled(enabled)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', API_CALL_TRACKING_SETTING_KEY] })
    },
  })
  const enableEpisodicMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) throw new Error('No production selected')
      const name = episodicInitialEpisode.trim()
      if (!name) throw new Error('Enter a name for the first episode')
      return enableEpisodicProduction({ productionId: currentProductionId, initialEpisodeName: name })
    },
    onSuccess: () => {
      setEpisodicEnableOpen(false)
      setEpisodicInitialEpisode('')
      setEpisodicEnableError(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: ['episodes-management', currentProductionId] })
      }
      refetchProductions()
    },
    onError: (err) => {
      setEpisodicEnableError(err instanceof Error ? err.message : 'Could not enable episodic mode')
    },
  })

  const setOrsApiKeyMutation = useMutation({
    mutationFn: async (nextValue: string) => {
      const trimmed = nextValue.trim()
      await setSetting(OPENROUTESERVICE_API_KEY_SETTING, trimmed)
      return trimmed
    },
    onSuccess: (savedValue) => {
      queryClient.setQueryData(['settings', OPENROUTESERVICE_API_KEY_SETTING], savedValue)
      setOrsApiKeyDraft(savedValue)
      setOrsApiKeyToast(savedValue ? 'OpenRouteService API key saved.' : 'OpenRouteService API key cleared.')
      setTimeout(() => setOrsApiKeyToast(null), 3000)
    },
  })
  const { data: costReportGroups = [] } = useQuery({
    queryKey: ['cost-report-groups', currentProductionId, revisionId],
    queryFn: () => listCostReportGroups(currentProductionId ?? '', revisionId),
    enabled: !!currentProductionId,
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', currentProductionId],
    queryFn: () => listAccounts(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: hardDeleteEligibleIds = new Set<string>() } = useQuery({
    queryKey: ['budget-accounts-eligible-delete', currentProductionId],
    queryFn: () => getHardDeleteEligibleAccountIds(currentProductionId ?? ''),
    enabled: !!currentProductionId,
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
        revision_id: revisionId,
        name: data.name.trim(),
        code: data.code.trim() || null,
        accountIds: data.accountIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!, revisionId] })
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups-with-accounts', currentProductionId!, revisionId] })
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
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!, revisionId] })
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups-with-accounts', currentProductionId!, revisionId] })
      setEditGroup(null)
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => deleteCostReportGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', currentProductionId!, revisionId] })
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups-with-accounts', currentProductionId!, revisionId] })
    },
  })

  const createAccountMutation = useMutation({
    mutationFn: (data: { code: string; name: string; parent_account_id?: string | null; is_postable: boolean; sort_order: number }) =>
      createAccount({
        production_id: currentProductionId!,
        code: data.code,
        name: data.name,
        parent_account_id: data.parent_account_id ?? null,
        is_postable: data.is_postable,
        sort_order: data.sort_order,
      }),
    onSuccess: () => {
      invalidateAccountKeys()
      setAddAccountOpen(false)
    },
  })

  const updateAccountNameMutation = useMutation({
    mutationFn: ({ accountId, name }: { accountId: string; name: string }) => updateAccountName(accountId, name),
    onSuccess: () => {
      invalidateAccountKeys()
      setEditAccount(null)
    },
  })

  const archiveAccountMutation = useMutation({
    mutationFn: (accountId: string) => archiveAccount(accountId),
    onSuccess: () => {
      invalidateAccountKeys()
      queryClient.invalidateQueries({ queryKey: ['budget-accounts-eligible-delete', currentProductionId] })
    },
  })

  const unarchiveAccountMutation = useMutation({
    mutationFn: (accountId: string) => unarchiveAccount(accountId),
    onSuccess: () => {
      invalidateAccountKeys()
      queryClient.invalidateQueries({ queryKey: ['budget-accounts-eligible-delete', currentProductionId] })
    },
  })

  const hardDeleteAccountMutation = useMutation({
    mutationFn: (accountId: string) => hardDeleteAccount(accountId),
    onSuccess: () => {
      invalidateAccountKeys()
      queryClient.invalidateQueries({ queryKey: ['budget-accounts-eligible-delete', currentProductionId] })
      setAccountToDelete(null)
    },
  })

  const updateAccountColorMutation = useMutation({
    mutationFn: ({ accountId, colorHex }: { accountId: string; colorHex: string | null }) =>
      updateAccountColor(accountId, colorHex),
    onSuccess: () => {
      invalidateAccountKeys()
      setColorToast('Account colour updated.')
    },
  })

  useEffect(() => {
    if (!colorToast) return
    const t = setTimeout(() => setColorToast(null), 3000)
    return () => clearTimeout(t)
  }, [colorToast])

  useEffect(() => {
    if (!tutorialToast) return
    const t = setTimeout(() => setTutorialToast(null), 3200)
    return () => clearTimeout(t)
  }, [tutorialToast])

  const accountTree = buildAccountTree(accounts)

  return (
    <TooltipProvider>
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as 'budget' | 'people' | 'apis' | 'developer_tools')} className="w-full">
        <TabsList className="h-9 rounded-md border border-border bg-muted/30 w-fit">
          <TabsTrigger value="budget" className="px-4 text-sm data-[state=active]:bg-background">Budget</TabsTrigger>
          <TabsTrigger value="people" className="px-4 text-sm data-[state=active]:bg-background">People</TabsTrigger>
          <TabsTrigger value="apis" className="px-4 text-sm data-[state=active]:bg-background">APIs</TabsTrigger>
          <TabsTrigger value="developer_tools" className="px-4 text-sm data-[state=active]:bg-background">Developer Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="budget" className="space-y-5 mt-5 outline-none">
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

      {currentProductionId && currentProduction && (
        <Card>
          <CardHeader>
            <CardTitle>Episodic production</CardTitle>
            <CardDescription>
              For series and multi-episode work. When enabled, episodes organize script, schedule, and deliveries in later releases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentProduction.is_episodic ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Episodic mode is <span className="font-medium text-foreground">on</span> for this production. This
                  cannot be turned off.
                </p>
                <EpisodesSettingsSection productionId={currentProductionId} />
                <ShootingBlocsSettingsSection productionId={currentProductionId} />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Enable episodic mode only if this project is a series or has multiple episodes. You will need at least one episode name to continue.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEpisodicEnableError(null)
                    setEpisodicInitialEpisode('')
                    setEpisodicEnableOpen(true)
                  }}
                >
                  Enable episodic mode…
                </Button>
              </>
            )}
            <Dialog
              open={episodicEnableOpen}
              onOpenChange={(open) => {
                setEpisodicEnableOpen(open)
                if (!open) {
                  setEpisodicEnableError(null)
                  setEpisodicInitialEpisode('')
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Enable episodic mode</DialogTitle>
                  <p className="text-muted-foreground text-sm leading-snug">
                    This choice is permanent. You will not be able to disable episodic mode for this production later. Episodic projects must have at least one episode—you are about to create the first one.
                  </p>
                </DialogHeader>
                <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200 text-xs leading-snug">
                  This cannot be undone. Only continue if this production should stay episodic for its lifetime.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="episodic-first-episode">First episode name</Label>
                  <Input
                    id="episodic-first-episode"
                    value={episodicInitialEpisode}
                    onChange={(e) => setEpisodicInitialEpisode(e.target.value)}
                    placeholder="e.g. Episode 1"
                  />
                </div>
                {episodicEnableError && (
                  <p className="text-destructive text-sm">{episodicEnableError}</p>
                )}
                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEpisodicEnableOpen(false)}
                    disabled={enableEpisodicMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => enableEpisodicMutation.mutate()}
                    disabled={enableEpisodicMutation.isPending}
                  >
                    {enableEpisodicMutation.isPending ? 'Enabling…' : 'Enable episodic mode'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

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

      {currentProductionId && (
        <Card>
          <CardHeader>
            <CardTitle>Chart of accounts</CardTitle>
            <CardDescription>
              Manage account structure for budgeting and reporting. Archiving prevents new posting without changing historical totals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setAddAccountOpen(true)}>
                <Plus className="mr-2 size-4" />
                Add account
              </Button>
            </div>
            <ChartOfAccountsTree
              tree={accountTree}
              expandedAccountIds={expandedAccountIds}
              onToggleExpand={toggleAccountExpanded}
              hardDeleteEligibleIds={hardDeleteEligibleIds}
              onEditName={(acc) => setEditAccount(acc)}
              onArchive={(id) => archiveAccountMutation.mutate(id)}
              onUnarchive={(id) => unarchiveAccountMutation.mutate(id)}
              onRequestDelete={(acc) => setAccountToDelete(acc)}
              onUpdateColor={(accountId, colorHex) => updateAccountColorMutation.mutate({ accountId, colorHex })}
              archivePending={archiveAccountMutation.isPending}
              unarchivePending={unarchiveAccountMutation.isPending}
              deletePending={hardDeleteAccountMutation.isPending}
              colorPending={updateAccountColorMutation.isPending}
            />
            {colorToast && (
              <p className="text-sm text-muted-foreground rounded-md border border-border bg-card px-3 py-2">
                {colorToast}
              </p>
            )}
          </CardContent>
        </Card>
      )}

          {!currentProductionId && (
            <div className="rounded-lg border border-border bg-muted/20 py-6 px-4 text-center">
              <p className="text-sm text-muted-foreground">Select a production to configure cost report groups and chart of accounts.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="people" className="space-y-5 mt-5 outline-none">
      {currentProductionId && (
        <Card className="border-zinc-700 bg-zinc-900 text-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-100">
              <Users className="size-5" />
              Crew Structure
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Configure departments, roles, Heads of Department, and task department mappings for this production.
              This drives Crew Manager options, HOD derivation, task responsibility mapping, and call-sheet crew grouping and order.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CrewStructureEditor productionId={currentProductionId} />
          </CardContent>
        </Card>
      )}

      {!currentProductionId && (
            <div className="rounded-lg border border-border bg-muted/20 py-6 px-4 text-center">
              <p className="text-sm text-muted-foreground">Select a production to configure crew structure.</p>
            </div>
      )}
        </TabsContent>

        <TabsContent value="apis" className="space-y-5 mt-5 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>OpenRouteService API key</CardTitle>
              <CardDescription>
                Paste your personal OpenRouteService API key to enable route-based travel times. You can get a free key from openrouteservice.org.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ors-api-key">API key</Label>
                <Input
                  id="ors-api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={orsApiKeyDraft}
                  onChange={(e) => setOrsApiKeyDraft(e.target.value)}
                  placeholder="Paste your OpenRouteService API key"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setOrsApiKeyMutation.mutate(orsApiKeyDraft)}
                  disabled={setOrsApiKeyMutation.isPending}
                >
                  {setOrsApiKeyMutation.isPending ? 'Saving…' : 'Save key'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOrsApiKeyMutation.mutate('')}
                  disabled={setOrsApiKeyMutation.isPending}
                >
                  Clear key
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => shellOpen('https://openrouteservice.org')}
                >
                  Get free key
                </Button>
              </div>
              {setOrsApiKeyMutation.error instanceof Error && (
                <p className="text-sm text-destructive">{setOrsApiKeyMutation.error.message}</p>
              )}
              {orsApiKeyToast && (
                <p className="text-sm text-muted-foreground rounded-md border border-border bg-card px-3 py-2">
                  {orsApiKeyToast}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developer_tools" className="space-y-5 mt-5 outline-none">
      {authSession.authSupported && authSession.isAuthenticated && authSession.isInstanceAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage server users (create, disable, reset password, and role changes).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button type="button" onClick={() => navigate('/settings/users')}>
              Open User Management
            </Button>
          </CardContent>
        </Card>
      )}

      {authSession.authSupported && authSession.isAuthenticated && currentProductionId && (
        <Card>
          <CardHeader>
            <CardTitle>Project Access</CardTitle>
            <CardDescription>
              Manage which users can access the selected project and set viewer/editor/administrator levels.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/settings/project-access')}>
              Open Project Access
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Onboarding tutorial</CardTitle>
          <CardDescription>
            Reopen the tutorial hub at any time, or reset tutorial progress. This does not affect demo production data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigate('/settings', { state: { openTutorialHome: true } })
            }}
          >
            Open Tutorial Home
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!window.confirm('Reset tutorial progress?')) return
              navigate('/settings', { state: { openTutorialHome: true, resetTutorial: true } })
              setTutorialToast('Tutorial progress reset.')
            }}
          >
            Reset tutorial progress
          </Button>
          {tutorialToast && (
            <p className="w-full text-sm text-muted-foreground rounded-md border border-border bg-card px-3 py-2">
              {tutorialToast}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data location</CardTitle>
          <CardDescription>
            SQLite database and attachments are stored in the app data directory. See README for paths per platform.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle>Demo projects</CardTitle>
          <CardDescription>
            Regenerate the canonical demo project (slug: {DEMO_SLUG}). Reset only affects demo projects and never deletes user productions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setDemoError(null)
                try {
                  await ensureDemoData()
                  queryClient.invalidateQueries({ queryKey: ['productions'] })
                  queryClient.invalidateQueries({ queryKey: ['crew'] })
                  queryClient.invalidateQueries({ queryKey: ['people'] })
                  queryClient.invalidateQueries({ queryKey: ['deliverables'] })
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
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await resetDemoData()
                queryClient.invalidateQueries({ queryKey: ['productions'] })
                queryClient.invalidateQueries({ queryKey: ['crew'] })
                queryClient.invalidateQueries({ queryKey: ['people'] })
                queryClient.invalidateQueries({ queryKey: ['deliverables'] })
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
          </div>
          {demoError && (
            <p className="w-full text-sm text-destructive">
              {demoError}
            </p>
          )}
          <DemoSeedMeta />
        </CardContent>
      </Card>

      {import.meta.env.DEV && (
        <Card className="mt-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-5" />
              Developer tools
            </CardTitle>
            <CardDescription>
              Diagnostics and experimental development controls.
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
                  id="api-call-tracker-toggle"
                  checked={apiCallTrackingEnabled}
                  onChange={(e) => setApiCallTrackingMutation.mutate(e.target.checked)}
                  disabled={setApiCallTrackingMutation.isPending}
                  className="rounded border-amber-600"
                />
                <Label htmlFor="api-call-tracker-toggle" className="font-medium text-amber-800 dark:text-amber-200">
                  Track external API calls (this session)
                </Label>
              </div>
              <ApiCallTrackerPanel trackingOn={apiCallTrackingEnabled} />
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
                  const prevApi = (await getSetting('enable_currency_conversion_api')) ?? 'true'
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
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await setFirstLaunchTutorialSeen(false)
                  queryClient.invalidateQueries({ queryKey: ['settings', FIRST_LAUNCH_TUTORIAL_SEEN_KEY] })
                  // The tutorial will appear on next app load when AppLayout reads the setting.
                }}
              >
                Trigger First-Launch Tutorial on Next Load
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
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-lg">
          {addGroupOpen && currentProductionId && (
            <CostReportGroupForm
              accounts={accounts.filter((a) => !a.archived_at)}
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
              accounts={accounts.filter((a) => !a.archived_at)}
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

      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent className="max-w-lg">
          {addAccountOpen && currentProductionId && (
            <AddAccountForm
              productionId={currentProductionId}
              accounts={accounts.filter((a) => !a.archived_at)}
              onSubmit={(data) => createAccountMutation.mutate(data)}
              onCancel={() => setAddAccountOpen(false)}
              isLoading={createAccountMutation.isPending}
              error={createAccountMutation.error instanceof Error ? createAccountMutation.error.message : undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editAccount != null} onOpenChange={(open) => !open && setEditAccount(null)}>
        <DialogContent className="max-w-md">
          {editAccount && (
            <EditAccountNameForm
              account={editAccount}
              onSubmit={(name) => updateAccountNameMutation.mutate({ accountId: editAccount.id, name })}
              onCancel={() => setEditAccount(null)}
              isLoading={updateAccountNameMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={accountToDelete != null} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <DialogContent className="max-w-md">
          {accountToDelete && (
            <>
              <DialogHeader>
                <DialogTitle>Delete account</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Permanently remove &quot;{accountToDelete.code} — {accountToDelete.name}&quot;? This cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAccountToDelete(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={hardDeleteAccountMutation.isPending}
                  onClick={() => hardDeleteAccountMutation.mutate(accountToDelete.id)}
                >
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}

const COLOR_HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

function ChartOfAccountsTree({
  tree,
  expandedAccountIds,
  onToggleExpand,
  hardDeleteEligibleIds,
  onEditName,
  onArchive,
  onUnarchive,
  onRequestDelete,
  onUpdateColor,
  archivePending,
  unarchivePending,
  deletePending,
  colorPending,
}: {
  tree: AccountTreeNode[]
  expandedAccountIds: Set<string>
  onToggleExpand: (accountId: string) => void
  hardDeleteEligibleIds: Set<string>
  onEditName: (account: BudgetAccount) => void
  onArchive: (accountId: string) => void
  onUnarchive: (accountId: string) => void
  onRequestDelete: (account: BudgetAccount) => void
  onUpdateColor: (accountId: string, colorHex: string | null) => void
  archivePending: boolean
  unarchivePending: boolean
  deletePending: boolean
  colorPending: boolean
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      {tree.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">No accounts yet. Add an account to get started.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tree.map((node) => (
            <ChartOfAccountsRow
              key={node.account.id}
              node={node}
              depth={0}
              expandedAccountIds={expandedAccountIds}
              onToggleExpand={onToggleExpand}
              hardDeleteEligibleIds={hardDeleteEligibleIds}
              onEditName={onEditName}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onRequestDelete={onRequestDelete}
              onUpdateColor={onUpdateColor}
              archivePending={archivePending}
              unarchivePending={unarchivePending}
              deletePending={deletePending}
              colorPending={colorPending}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ChartOfAccountsRow({
  node,
  depth,
  expandedAccountIds,
  onToggleExpand,
  hardDeleteEligibleIds,
  onEditName,
  onArchive,
  onUnarchive,
  onRequestDelete,
  onUpdateColor,
  archivePending,
  unarchivePending,
  deletePending,
  colorPending,
}: {
  node: AccountTreeNode
  depth: number
  expandedAccountIds: Set<string>
  onToggleExpand: (accountId: string) => void
  hardDeleteEligibleIds: Set<string>
  onEditName: (account: BudgetAccount) => void
  onArchive: (accountId: string) => void
  onUnarchive: (accountId: string) => void
  onRequestDelete: (account: BudgetAccount) => void
  onUpdateColor: (accountId: string, colorHex: string | null) => void
  archivePending: boolean
  unarchivePending: boolean
  deletePending: boolean
  colorPending: boolean
}) {
  const acc = node.account
  const isArchived = !!acc.archived_at
  const canHardDelete = hardDeleteEligibleIds.has(acc.id)
  const isRollup = !acc.is_postable
  const hasChildren = node.children.length > 0
  const isExpanded = expandedAccountIds.has(acc.id)
  const bandColor = getAccountBandColor(acc)
  const bandOpacity = isArchived ? 0.6 : 0.9
  const [isHovered, setIsHovered] = useState(false)
  const showGlow = isHovered || (isRollup && isExpanded)
  const glowStyle = showGlow ? `0 0 0 2px ${bandColor}${isRollup && isExpanded ? '40' : '20'}` : undefined

  return (
    <>
      <li
        className="flex items-stretch min-h-[40px] transition-[opacity,box-shadow] duration-150 ease-out"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className="w-1 shrink-0 rounded-r transition-[opacity,box-shadow] duration-150 ease-out"
          style={{
            backgroundColor: bandColor,
            opacity: isHovered ? 1 : bandOpacity,
            boxShadow: glowStyle,
          } as React.CSSProperties}
        />
        <div
          className="flex flex-1 items-center gap-2 py-2 pr-3 pl-2 min-w-0 transition-[box-shadow] duration-150 ease-out rounded-r"
          style={{ boxShadow: glowStyle }}
        >
          {isRollup && hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleExpand(acc.id)}
              className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden />
          )}
          <span className={`flex-1 min-w-0 text-sm truncate ${isArchived ? 'text-muted-foreground' : ''}`}>
            <span className="font-mono">{acc.code}</span>
            <span className="mx-2">—</span>
            <span>{acc.name}</span>
            {isArchived && (
              <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Archived
              </span>
            )}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {isRollup && (
              <AccountColorPopover
                account={acc}
                bandColor={bandColor}
                onSelect={(colorHex) => onUpdateColor(acc.id, colorHex)}
                disabled={colorPending}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEditName(acc)}
              aria-label="Edit name"
            >
              <Pencil className="size-4" />
            </Button>
            {isArchived ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onUnarchive(acc.id)}
                disabled={unarchivePending}
                aria-label="Unarchive"
              >
                <ArchiveRestore className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onArchive(acc.id)}
                disabled={archivePending}
                aria-label="Archive"
              >
                <Archive className="size-4" />
              </Button>
            )}
            {canHardDelete ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onRequestDelete(acc)}
                disabled={deletePending}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Account must have no children, line items, expenses, or rule/group references to delete.</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </li>
      {isExpanded &&
        node.children.map((child) => (
          <ChartOfAccountsRow
            key={child.account.id}
            node={child}
            depth={depth + 1}
            expandedAccountIds={expandedAccountIds}
            onToggleExpand={onToggleExpand}
            hardDeleteEligibleIds={hardDeleteEligibleIds}
            onEditName={onEditName}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onRequestDelete={onRequestDelete}
            onUpdateColor={onUpdateColor}
            archivePending={archivePending}
            unarchivePending={unarchivePending}
            deletePending={deletePending}
            colorPending={colorPending}
          />
        ))}
    </>
  )
}

function AccountColorPopover({
  account: _account,
  bandColor,
  onSelect,
  disabled,
}: {
  account: BudgetAccount
  bandColor: string
  onSelect: (colorHex: string | null) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [customHex, setCustomHex] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)

  const handleCustomSubmit = () => {
    const trimmed = customHex.trim()
    if (!trimmed) {
      setCustomError('Enter a hex value (e.g. #9DBBAA)')
      return
    }
    if (!COLOR_HEX_REGEX.test(trimmed)) {
      setCustomError('Must be 6-digit hex (e.g. #9DBBAA)')
      return
    }
    setCustomError(null)
    onSelect(trimmed)
    setOpen(false)
    setCustomHex('')
  }

  const handleClear = () => {
    onSelect(null)
    setOpen(false)
    setCustomHex('')
    setCustomError(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          aria-label="Set account colour"
        >
          <span
            className="inline-block size-4 rounded border border-border"
            style={{ backgroundColor: bandColor }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 bg-card border-border">
        <div className="space-y-3">
          <p className="text-sm font-medium">Account colour</p>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLOR_PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                className="size-8 rounded border border-border hover:ring-2 hover:ring-mint-500/50 focus:outline-none focus:ring-2 focus:ring-mint-500"
                style={{ backgroundColor: hex }}
                onClick={() => {
                  onSelect(hex)
                  setOpen(false)
                }}
                aria-label={`Use ${hex}`}
              />
            ))}
          </div>
          <div>
            <Label htmlFor="custom-hex" className="text-xs text-muted-foreground">Custom hex</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="custom-hex"
                value={customHex}
                onChange={(e) => {
                  setCustomHex(e.target.value)
                  setCustomError(null)
                }}
                placeholder="#9DBBAA"
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleCustomSubmit}>
                Apply
              </Button>
            </div>
            {customError && <p className="text-xs text-destructive mt-1">{customError}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AddAccountForm({
  productionId: _productionId,
  accounts,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  productionId: string
  accounts: BudgetAccount[]
  onSubmit: (data: { code: string; name: string; parent_account_id?: string | null; is_postable: boolean; sort_order: number }) => void
  onCancel: () => void
  isLoading: boolean
  error?: string
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [isPostable, setIsPostable] = useState(true)
  const parentOptions = accounts.filter((a) => !a.is_postable)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (!trimmedCode || !trimmedName) return
    if (isPostable && parentId) {
      const parent = accounts.find((a) => a.id === parentId)
      if (parent?.is_postable) return
    }
    onSubmit({
      code: trimmedCode,
      name: trimmedName,
      parent_account_id: parentId,
      is_postable: isPostable,
      sort_order: 0,
    })
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add account</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="coa-code">Code</Label>
          <Input
            id="coa-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 3111"
            required
          />
        </div>
        <div>
          <Label htmlFor="coa-name">Name</Label>
          <Input
            id="coa-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Art Purchases"
            required
          />
        </div>
        <div>
          <Label htmlFor="coa-parent">Parent (optional)</Label>
          <Select value={parentId ?? 'none'} onValueChange={(v) => setParentId(v === 'none' ? null : v)}>
            <SelectTrigger id="coa-parent" className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {parentOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs mt-1">Only non-postable (header) accounts can be parents.</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="coa-postable"
            checked={isPostable}
            onCheckedChange={(c) => setIsPostable(c === true)}
          />
          <Label htmlFor="coa-postable">Postable (can receive line items and expenses)</Label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading || !code.trim() || !name.trim()}>Add</Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditAccountNameForm({
  account,
  onSubmit,
  onCancel,
  isLoading,
}: {
  account: BudgetAccount
  onSubmit: (name: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [name, setName] = useState(account.name)
  useEffect(() => {
    queueMicrotask(() => setName(account.name))
  }, [account.id, account.name])
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit account name</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="edit-name">Name</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <p className="text-muted-foreground text-xs mt-1">Code: {account.code} (cannot be changed)</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading || !name.trim()}>Save</Button>
        </DialogFooter>
      </form>
    </>
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
    queueMicrotask(() => {
      setName(initialName)
      setCode(initialCode)
    })
  }, [initialName, initialCode])

  useEffect(() => {
    queueMicrotask(() => setAccountIds(initialAccountIds))
  }, [initialAccountIds])

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
