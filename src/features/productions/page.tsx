import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listProductions,
  updateProduction,
  permanentlyDeleteProduction,
  duplicateProduction,
  deleteProduction,
  findExistingDemoTemplateProduction,
} from '@/lib/db/repositories/production'
import { createProductionFromTemplate } from '@/lib/db/createProductionFromTemplate'
import { createClient, listClients } from '@/lib/db/repositories/clients'
import {
  canFetchSensitiveClientData,
  encryptionKeyUnavailableMessage,
} from '@/lib/security/sensitiveDataAccess'
import {
  CLIENT_PHONE_MAX_DIGITS,
  clientDraftSchema,
  clientDraftToRepoFields,
  optionalClientEmailField,
  optionalClientPhoneField,
} from '@/lib/clients/clientFieldValidation'
import { ClientContactCard } from '@/features/productions/ClientContactCard'
import { getDb } from '@/lib/db/client'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { canAdminProject, canEditProject } from '@/lib/access/projectAccess'
import {
  archiveProjectForActor,
  duplicateProductionForActor,
  listVisibleProjectsForActor,
  permanentlyDeleteProductionForActor,
  unarchiveProjectForActor,
  updateProjectMetadataForActor,
} from '@/lib/access/projectAccessService'
import { getProjectAccessLevelsForUserOnProductions } from '@/lib/db/repositories/projectMemberships'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm, Controller, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Archive,
  PackageOpen,
  File,
  FileStack,
  FileText,
  Download,
  Upload,
  Loader2,
  Cloud,
  Unlink,
} from 'lucide-react'
import type { Client, Production } from '@/lib/db/types'
import { useCurrentProduction } from './context'
import { useApfActions } from '@/features/productions/useApfActions'
import { useServerPublishEnabled } from '@/hooks/useServerPublishEnabled'
import { usePublishToServerActions } from '@/features/server/usePublishToServerActions'
import { ConnectServerDialog } from '@/features/server/ConnectServerDialog'
import { PreflightPublishSheet } from '@/features/server/PreflightPublishSheet'
import { listAllLinkedProjects, deleteLinkedProject, getLinkedProjectByProductionId } from '@/lib/server/linkedProjectRepository'
import { getServerConnectionById } from '@/lib/server/serverConnectionRepository'
import { getSetting } from '@/lib/db/repositories/settings'
import { serverSessionTokenSettingKey } from '@/lib/server/constants'
import { serverUnlinkProject } from '@/lib/server/serverClient'

const templateEnum = z.enum(['blank', 'demo', 'default'])
const CLIENT_MODE_NONE = 'none' as const
const CLIENT_MODE_EXISTING = 'existing' as const
const CLIENT_MODE_NEW = 'new' as const

const productionClientFieldsSchema = {
  clientMode: z.enum([CLIENT_MODE_NONE, CLIENT_MODE_EXISTING, CLIENT_MODE_NEW]),
  clientId: z.string().optional(),
  newClientName: z.string().optional(),
  newClientEmail: optionalClientEmailField,
  newClientPhone: optionalClientPhoneField,
  deliveryDate: z.string().optional(),
}

function refineProductionClientFields(
  data: {
    clientMode: string
    clientId?: string
    newClientName?: string
    isEpisodic?: boolean
    initialEpisodeName?: string
  },
  ctx: z.RefinementCtx
) {
  if (data.clientMode === CLIENT_MODE_EXISTING && !(data.clientId ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select a client',
      path: ['clientId'],
    })
  }
  if (data.clientMode === CLIENT_MODE_NEW) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Save the new client before continuing',
      path: ['newClientName'],
    })
  }
}

const PRODUCTION_DIALOG_CONTENT_CLASS =
  '!flex max-h-[min(85vh,720px)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg'

const editProductionSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    notes: z.string().optional(),
    ...productionClientFieldsSchema,
  })
  .superRefine(refineProductionClientFields)

const newProductionFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    notes: z.string().optional(),
    template: templateEnum,
    ...productionClientFieldsSchema,
    isEpisodic: z.boolean(),
    initialEpisodeName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    refineProductionClientFields(data, ctx)
    if (!data.isEpisodic) return
    if (!(data.initialEpisodeName ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a name for the first episode',
        path: ['initialEpisodeName'],
      })
    }
  })
type NewProductionForm = z.infer<typeof newProductionFormSchema>
type EditProductionForm = z.infer<typeof editProductionSchema>

const TEMPLATE_OPTIONS: {
  value: NewProductionForm['template']
  label: string
  description: string
  preview: string
  Icon: typeof File
  cardClass: string
  selectedClass: string
}[] = [
  {
    value: 'blank',
    label: 'Blank',
    description: 'A truly clean slate. No accounts, tasks, or deliverables—you add everything yourself.',
    preview: 'No starter data',
    Icon: File,
    cardClass: 'border-border hover:border-muted-foreground/40',
    selectedClass: 'border-muted-foreground/60 bg-muted/30 ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
  },
  {
    value: 'demo',
    label: 'Demo',
    description: 'A full sample production: scenes, cast, schedule, budget, tasks, and deliverables. Perfect for exploring Albatross.',
    preview: 'Scenes, schedule, budget, tasks, deliverables',
    Icon: FileStack,
    cardClass: 'border-border hover:border-indigo-500/40',
    selectedClass: 'border-indigo-500/60 bg-indigo-500/5 ring-2 ring-indigo-500/30 ring-offset-2 ring-offset-background',
  },
  {
    value: 'default',
    label: 'Default',
    description: 'A practical starting point: chart of accounts, starter tasks (Pre-Production, Principal, Post), and a small deliverables set.',
    preview: 'Budget codes + starter tasks + deliverables',
    Icon: FileText,
    cardClass: 'border-border hover:border-primary/40',
    selectedClass: 'border-primary/50 bg-primary/10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
  },
]

/** Template options visible in the New Production modal. Demo is hidden for now. */
const VISIBLE_TEMPLATE_OPTIONS = TEMPLATE_OPTIONS.filter((opt) => opt.value !== 'demo')

type ProductionClientFormValues = {
  clientMode: typeof CLIENT_MODE_NONE | typeof CLIENT_MODE_EXISTING | typeof CLIENT_MODE_NEW
  clientId?: string
  newClientName?: string
  newClientEmail?: string
  newClientPhone?: string
  deliveryDate?: string
}

function formatProjectDeliveryDate(isoDate: string | null | undefined): string {
  const t = isoDate?.trim() ?? ''
  if (!t) return '—'
  try {
    return new Date(t + 'T12:00:00').toLocaleDateString()
  } catch {
    return t
  }
}

function clientOptionsFromForm(data: ProductionClientFormValues) {
  return {
    clientId: data.clientMode === CLIENT_MODE_EXISTING ? data.clientId?.trim() ?? null : null,
    deliveryDate: data.deliveryDate?.trim() || null,
  }
}

function defaultClientFieldsFromProduction(production: Production): ProductionClientFormValues {
  return {
    clientMode: production.client_id ? CLIENT_MODE_EXISTING : CLIENT_MODE_NONE,
    clientId: production.client_id ?? '',
    newClientName: '',
    newClientEmail: '',
    newClientPhone: '',
    deliveryDate: production.delivery_date ?? '',
  }
}

type ProductionClientFormControl = Pick<
  UseFormReturn<ProductionClientFormValues>,
  'register' | 'watch' | 'setValue' | 'getValues' | 'setError' | 'formState' | 'clearErrors'
>

function ProductionClientAndDeliveryFields({
  form,
  clients,
  clientsLoading,
  idPrefix,
}: {
  form: ProductionClientFormControl
  clients: Client[]
  clientsLoading: boolean
  idPrefix: string
}) {
  const queryClient = useQueryClient()
  const [saveClientError, setSaveClientError] = useState<string | null>(null)
  const [saveClientSuccess, setSaveClientSuccess] = useState<string | null>(null)

  const saveClientMutation = useMutation({
    mutationFn: async () => {
      const parsed = clientDraftSchema.safeParse({
        name: form.getValues('newClientName') ?? '',
        email: form.getValues('newClientEmail') ?? '',
        phone: form.getValues('newClientPhone') ?? '',
      })
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path[0]
          if (path === 'name') {
            form.setError('newClientName', { type: 'manual', message: issue.message })
          } else if (path === 'email') {
            form.setError('newClientEmail', { type: 'manual', message: issue.message })
          } else if (path === 'phone') {
            form.setError('newClientPhone', { type: 'manual', message: issue.message })
          }
        }
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid client details')
      }
      return createClient(clientDraftToRepoFields(parsed.data))
    },
    onSuccess: (created) => {
      setSaveClientError(null)
      setSaveClientSuccess('Client saved — selected below.')
      void queryClient.invalidateQueries({ queryKey: ['clients'] })
      form.setValue('clientMode', CLIENT_MODE_EXISTING)
      form.setValue('clientId', created.id)
      form.setValue('newClientName', '')
      form.setValue('newClientEmail', '')
      form.setValue('newClientPhone', '')
      form.clearErrors(['newClientName', 'newClientEmail', 'newClientPhone'])
    },
    onError: (err: unknown) => {
      setSaveClientSuccess(null)
      let message = 'Failed to save client'
      if (err instanceof Error) message = err.message
      else if (typeof err === 'string' && err.trim()) message = err
      setSaveClientError(message)
    },
  })

  const clientMode = form.watch('clientMode')
  const clientId = form.watch('clientId')
  const selectedClient =
    clientMode === CLIENT_MODE_EXISTING && clientId
      ? clients.find((c) => c.id === clientId) ?? null
      : null
  const clientSelectValue =
    clientMode === CLIENT_MODE_NEW
      ? '__new__'
      : clientMode === CLIENT_MODE_EXISTING && clientId
        ? clientId
        : '__none__'

  function handleClientSelectChange(value: string) {
    if (value === '__none__') {
      form.setValue('clientMode', CLIENT_MODE_NONE)
      form.setValue('clientId', '')
      form.setValue('newClientName', '')
      form.setValue('newClientEmail', '')
      form.setValue('newClientPhone', '')
      return
    }
    if (value === '__new__') {
      form.setValue('clientMode', CLIENT_MODE_NEW)
      form.setValue('clientId', '')
      setSaveClientError(null)
      setSaveClientSuccess(null)
      return
    }
    form.setValue('clientMode', CLIENT_MODE_EXISTING)
    form.setValue('clientId', value)
    form.setValue('newClientName', '')
    form.setValue('newClientEmail', '')
    form.setValue('newClientPhone', '')
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-client-select`}>Client</Label>
        <Select value={clientSelectValue} onValueChange={handleClientSelectChange}>
          <SelectTrigger id={`${idPrefix}-client-select`}>
            <SelectValue placeholder={clientsLoading ? 'Loading…' : 'Optional'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectItem value="__new__">Add new client…</SelectItem>
          </SelectContent>
        </Select>
        {clientMode === CLIENT_MODE_EXISTING && form.formState.errors.clientId && (
          <p className="text-destructive text-sm">{form.formState.errors.clientId.message}</p>
        )}
        {clientMode === CLIENT_MODE_EXISTING && clientId && (
          <ClientContactCard client={selectedClient} />
        )}
        {clientMode === CLIENT_MODE_NEW && (
          <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 space-y-3 mt-2">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-new-client-name`}>Client name</Label>
              <Input
                id={`${idPrefix}-new-client-name`}
                {...form.register('newClientName')}
                placeholder="Person or business name"
              />
              {form.formState.errors.newClientName && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.newClientName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-new-client-email`}>Email</Label>
              <Input
                id={`${idPrefix}-new-client-email`}
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                {...form.register('newClientEmail')}
                placeholder="Optional (e.g. user@domain.com)"
              />
              {form.formState.errors.newClientEmail && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.newClientEmail.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-new-client-phone`}>Phone</Label>
              <Input
                id={`${idPrefix}-new-client-phone`}
                type="tel"
                maxLength={CLIENT_PHONE_MAX_DIGITS + 1}
                {...form.register('newClientPhone')}
                placeholder="Optional (e.g. +441234567890)"
              />
              {form.formState.errors.newClientPhone && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.newClientPhone.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                disabled={saveClientMutation.isPending}
                onClick={() => void saveClientMutation.mutate()}
              >
                {saveClientMutation.isPending ? 'Saving…' : 'Save client'}
              </Button>
              {saveClientError && (
                <p className="text-destructive text-sm">{saveClientError}</p>
              )}
              {saveClientSuccess && !saveClientError && (
                <p className="text-mint-700 dark:text-mint-400 text-sm">{saveClientSuccess}</p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-delivery-date`}>Delivery date</Label>
        <Input id={`${idPrefix}-delivery-date`} type="date" {...form.register('deliveryDate')} />
        <p className="text-muted-foreground text-xs">Optional target delivery date for this project.</p>
      </div>
    </>
  )
}

export function ProductionsPage() {
  const authSession = useAuthSession()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [productionToHardDelete, setProductionToHardDelete] = useState<Production | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<Production | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateSuccessResult, setDuplicateSuccessResult] = useState<{ name: string; slug: string } | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [verifyDeleteResult, setVerifyDeleteResult] = useState<string | null>(null)
  const [verifyDeletePending, setVerifyDeletePending] = useState(false)
  const [demoOverrideTarget, setDemoOverrideTarget] = useState<{
    production: Production
    formData: NewProductionForm
  } | null>(null)
  const [demoOverrideError, setDemoOverrideError] = useState<string | null>(null)
  const [overrideDeletePending, setOverrideDeletePending] = useState(false)
  const [showArchived, setShowArchived] = useState(() => {
    try {
      return localStorage.getItem('showArchivedProductions') === 'true'
    } catch {
      return false
    }
  })
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction, setCurrentProductionId, refetchProductions } =
    useCurrentProduction()
  const { apfBusy, handleImportApf, handleExportApf } = useApfActions({
    onMessage: (msg) => {
      setActionToast({ type: msg.type, message: msg.message })
      setTimeout(() => setActionToast(null), msg.timeoutMs)
    },
  })
  const featureServer = useServerPublishEnabled()
  const publishActions = usePublishToServerActions()
  const [unlinkTarget, setUnlinkTarget] = useState<Production | null>(null)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const { data: linkMap = new Map<string, { link_state: string }>() } = useQuery({
    queryKey: ['linked-projects-map'],
    queryFn: async () => {
      const rows = await listAllLinkedProjects()
      return new Map(rows.map((r) => [r.production_id, r]))
    },
    enabled: featureServer.data === true,
  })

  const {
    data: clients = [],
    isError: clientsLoadFailed,
    error: clientsLoadError,
  } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
    enabled: canFetchSensitiveClientData(authSession.authSupported, authSession.isAuthenticated),
  })

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients]
  )

  const { data: productions = [] } = useQuery({
    queryKey: [
      'productions',
      {
        includeArchived: showArchived,
        authSupported: authSession.authSupported,
        actorId: authSession.currentUser?.id ?? null,
      },
    ],
    queryFn: async () => {
      if (authSession.isLoading) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listVisibleProjectsForActor(db, authSession.currentUser, { includeArchived: showArchived })
      }
      return listProductions({ includeArchived: showArchived })
    },
  })

  const productionIds = productions.map((p) => p.id)
  const memberAccessMapEnabled =
    authSession.authSupported &&
    Boolean(authSession.currentUser) &&
    !authSession.isInstanceAdmin &&
    productionIds.length > 0

  const { data: memberAccessMap, isFetching: memberAccessFetching } = useQuery({
    queryKey: ['production-row-member-access', authSession.currentUser?.id, productionIds.join('|')],
    enabled: memberAccessMapEnabled,
    queryFn: async () => {
      const db = await getDb()
      return getProjectAccessLevelsForUserOnProductions(db, authSession.currentUser!.id, productionIds)
    },
  })

  const rowActionCaps = (productionId: string) => {
    if (!authSession.authSupported || !authSession.currentUser) {
      return { canEdit: true, canAdmin: true }
    }
    if (authSession.isInstanceAdmin) {
      return { canEdit: true, canAdmin: true }
    }
    if (memberAccessMapEnabled && memberAccessFetching) {
      return { canEdit: false, canAdmin: false }
    }
    const level = memberAccessMap?.get(productionId) ?? null
    return {
      canEdit: canEditProject(level, false),
      canAdmin: canAdminProject(level, false),
    }
  }

  function toggleShowArchived() {
    const next = !showArchived
    setShowArchived(next)
    try {
      localStorage.setItem('showArchivedProductions', String(next))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const onRevealArchived = () => setShowArchived(true)
    window.addEventListener('albatross-reveal-archived-productions', onRevealArchived)
    return () => window.removeEventListener('albatross-reveal-archived-productions', onRevealArchived)
  }, [])

  useEffect(() => {
    const onOpenNewProjectDialog = () => setOpen(true)
    window.addEventListener('albatross-open-new-production-dialog', onOpenNewProjectDialog)
    return () =>
      window.removeEventListener('albatross-open-new-production-dialog', onOpenNewProjectDialog)
  }, [])

  useEffect(() => {
    const onPublishMenu = () => {
      if (!currentProduction) {
        setActionToast({
          type: 'error',
          message: 'Choose a current production from the app header before publishing.',
        })
        setTimeout(() => setActionToast(null), 5000)
        return
      }
      void publishActions.beginPublish(currentProduction.id, currentProduction.name)
    }
    window.addEventListener('albatross-menu-publish-to-server', onPublishMenu)
    return () => window.removeEventListener('albatross-menu-publish-to-server', onPublishMenu)
  }, [currentProduction, publishActions])

  const createMutation = useMutation({
    mutationFn: (data: NewProductionForm) =>
      createProductionFromTemplate({
        name: data.name,
        notes: data.notes ?? null,
        template: data.template,
        isEpisodic: data.isEpisodic,
        initialEpisodeName: data.isEpisodic ? data.initialEpisodeName?.trim() : undefined,
        ...clientOptionsFromForm(data),
      }),
    onSuccess: (production) => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setCurrentProductionId(production.id)
      setOpen(false)
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditProductionForm }) => {
      const clientOpts = clientOptionsFromForm(data)
      const payload = {
        name: data.name,
        notes: data.notes ?? null,
        ...clientOpts,
      }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await updateProjectMetadataForActor({
          db,
          actor: authSession.currentUser,
          productionId: id,
          ...payload,
        })
        return
      }
      return updateProduction(id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setEditingId(null)
    },
  })

  const hardDeleteMutation = useMutation({
    mutationFn: async (productionId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await permanentlyDeleteProductionForActor(db, authSession.currentUser, productionId)
        return
      }
      return permanentlyDeleteProduction(productionId)
    },
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setProductionToHardDelete(null)
      setActionToast({ type: 'success', message: 'Production permanently deleted.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      setTimeout(() => setActionToast(null), 5000)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async (productionId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await archiveProjectForActor(db, authSession.currentUser, productionId)
        return
      }
      return import('@/lib/db/repositories/production').then((m) => m.archiveProduction(productionId))
    },
    onSuccess: (_, id) => {
      if (currentProductionId === id) setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setActionToast({ type: 'success', message: 'Project archived.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Archive failed' })
      setTimeout(() => setActionToast(null), 5000)
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: async (productionId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await unarchiveProjectForActor(db, authSession.currentUser, productionId)
        return
      }
      return import('@/lib/db/repositories/production').then((m) => m.unarchiveProduction(productionId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setActionToast({ type: 'success', message: 'Project restored.' })
      setTimeout(() => setActionToast(null), 4000)
    },
    onError: (err) => {
      setActionToast({ type: 'error', message: err instanceof Error ? err.message : 'Unarchive failed' })
      setTimeout(() => setActionToast(null), 5000)
    },
  })

  async function runVerifyProductionDelete() {
    setVerifyDeletePending(true)
    setVerifyDeleteResult(null)
    try {
      const list = await listProductions()
      const source = list[0]
      if (!source) {
        setVerifyDeleteResult('Failed: no production to duplicate')
        return
      }
      const { id } = await duplicateProduction(source.id, 'Verify Delete Temp')
      await deleteProduction(id)
      const afterSoft = await listProductions()
      if (afterSoft.some((p) => p.id === id)) {
        setVerifyDeleteResult('Failed at soft delete: production still in list')
        return
      }
      await permanentlyDeleteProduction(id)
      const afterHard = await listProductions()
      if (afterHard.some((p) => p.id === id)) {
        setVerifyDeleteResult('Failed at hard delete: production still in list')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setVerifyDeleteResult('Verify Production Delete: success')
    } catch (e) {
      setVerifyDeleteResult('Verify Production Delete: failed — ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setVerifyDeletePending(false)
    }
  }

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, newName }: { sourceId: string; newName: string }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return duplicateProductionForActor(db, authSession.currentUser, sourceId, newName)
      }
      return duplicateProduction(sourceId, newName)
    },
    onSuccess: (result) => {
      setDuplicateError(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      refetchProductions()
      setCurrentProductionId(result.id)
      setDuplicateSource(null)
      setDuplicateName('')
      setDuplicateSuccessResult({ name: result.name, slug: result.slug })
      setTimeout(() => setDuplicateSuccessResult(null), 6000)
    },
    onError: (err) => {
      setDuplicateError(err instanceof Error ? err.message : 'Duplication failed')
    },
  })

  const columns: ColumnDef<Production>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
            {row.original.name}
          </span>
          {row.original.is_episodic === true && (
            <span className="rounded border border-violet-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-xs font-medium text-white-800 dark:border-violet-400/35 dark:bg-yellow-500/15 dark:text-white-300">
              Episodic
            </span>
          )}
          {featureServer.data && linkMap.get(row.original.id)?.link_state === 'linked' && (
            <span className="rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:text-sky-200">
              Linked to Server
            </span>
          )}
          {row.original.archived_at && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400 text-xs font-medium">
              Archived
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ getValue, row }) => (
        <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
          {(getValue() as string)?.slice(0, 50) ?? '—'}
        </span>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      cell: ({ row }) => {
        if (clientsLoadFailed && row.original.client_id) {
          return (
            <span className="text-destructive text-xs" title={encryptionKeyUnavailableMessage(clientsLoadError)}>
              Unavailable
            </span>
          )
        }
        const name = row.original.client_id
          ? clientNameById.get(row.original.client_id) ?? '—'
          : '—'
        return (
          <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>{name}</span>
        )
      },
    },
    {
      id: 'delivery_date',
      header: 'Delivery date',
      cell: ({ row }) => (
        <span className={row.original.archived_at ? 'text-muted-foreground' : ''}>
          {formatProjectDeliveryDate(row.original.delivery_date)}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const isArchived = !!row.original.archived_at
        const caps = rowActionCaps(row.original.id)
        return (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingId(row.original.id)}
              title="Edit"
              disabled={!caps.canEdit}
            >
              <Pencil className="size-4" />
            </Button>
            {!isArchived && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setDuplicateSource(row.original)
                  setDuplicateName(`${row.original.name} (Copy)`)
                  setDuplicateError(null)
                }}
                title="Duplicate production"
                disabled={!caps.canEdit}
              >
                <Copy className="size-4" />
              </Button>
            )}
            {featureServer.data && linkMap.get(row.original.id)?.link_state === 'linked' && caps.canAdmin && (
              <Button
                variant="ghost"
                size="icon"
                title="Unlink from server"
                onClick={() => setUnlinkTarget(row.original)}
                className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
              >
                <Unlink className="size-4" />
              </Button>
            )}
            {isArchived ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => unarchiveMutation.mutate(row.original.id)}
                disabled={unarchiveMutation.isPending || !caps.canAdmin}
                title="Unarchive project"
                className="text-mint-600 hover:bg-mint-500/10 hover:text-mint-700 dark:text-mint-400 dark:hover:text-mint-300"
              >
                <Archive className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => archiveMutation.mutate(row.original.id)}
                disabled={archiveMutation.isPending || !caps.canAdmin}
                title="Archive project"
                className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <Archive className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setProductionToHardDelete(row.original)}
              title="Delete permanently"
              disabled={!caps.canAdmin}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: productions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productions</h1>
        <div className="flex min-w-0 flex-none items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={apfBusy !== null}
            onClick={() => void handleImportApf()}
            title="Import a project from an .apf file"
            aria-label="Import project"
          >
            {apfBusy === 'import' ? (
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-2 size-4 shrink-0" aria-hidden />
            )}
            <span className="max-[640px]:sr-only">Import project</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!currentProduction || apfBusy !== null}
            onClick={() => void handleExportApf()}
            title={
              currentProduction
                ? 'Export current production as .apf'
                : 'Choose a current production from the app header to export'
            }
            aria-label="Export project"
          >
            {apfBusy === 'export' ? (
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-2 size-4 shrink-0" aria-hidden />
            )}
            <span className="max-[640px]:sr-only">Export project</span>
          </Button>
          {featureServer.data === true && (
            <Button
              variant="outline"
              size="sm"
              disabled={!currentProduction || apfBusy !== null || !!currentProduction?.archived_at}
              onClick={() =>
                currentProduction &&
                void publishActions.beginPublish(currentProduction.id, currentProduction.name)
              }
              title="Publish current production to collaboration server"
            >
              <Cloud className="mr-2 size-4 shrink-0" aria-hidden />
              <span className="max-[640px]:sr-only">Publish to Server</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleShowArchived}
            title={showArchived ? 'Hide archived projects' : 'Show archived projects'}
            aria-label={showArchived ? 'Hide archived projects' : 'Show archived projects'}
            className={`flex max-w-[260px] flex-none items-center overflow-hidden transition-colors duration-200 ease-out focus-visible:ring-mint-500 ${showArchived ? 'border-mint-500/40 bg-mint-500/5 pr-2 text-mint-700 hover:bg-mint-500/15 hover:text-foreground dark:text-mint-400 dark:hover:bg-mint-500/20 dark:hover:text-foreground' : ''}`}
          >
            <PackageOpen className="size-4 shrink-0" />
            <span
              className={`inline-block shrink-0 whitespace-nowrap overflow-hidden transition-all duration-200 ease-out max-[900px]:!max-w-0 max-[900px]:!opacity-0 max-[900px]:!ml-0 ${showArchived ? 'max-w-[220px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'}`}
            >
              Hide archived projects
            </span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex-none shrink-0">
                <Plus className="mr-2 size-4" />
                New production
              </Button>
            </DialogTrigger>
          <DialogContent className={PRODUCTION_DIALOG_CONTENT_CLASS}>
            <ProductionFormDialog
              onSubmit={async (data) => {
                if (data.template !== 'demo') {
                  createMutation.mutate(data)
                  return
                }
                const existing = await findExistingDemoTemplateProduction()
                if (!existing) {
                  createMutation.mutate(data)
                  return
                }
                setDemoOverrideError(null)
                setDemoOverrideTarget({ production: existing, formData: data })
              }}
              onCancel={() => setOpen(false)}
              isLoading={createMutation.isPending}
              error={createMutation.isError ? (createMutation.error instanceof Error ? createMutation.error.message : 'Something went wrong') : null}
              onDismissError={() => createMutation.reset()}
            />
          </DialogContent>
          </Dialog>

          <Dialog
            open={demoOverrideTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDemoOverrideTarget(null)
                setDemoOverrideError(null)
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Creating a new project will override the existing demo project.</DialogTitle>
                <p className="text-muted-foreground text-sm leading-snug">
                  The current demo project will be permanently deleted. A new demo project will then be created with the name and description you entered.
                </p>
              </DialogHeader>
              {demoOverrideError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-destructive text-sm">
                  {demoOverrideError}
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDemoOverrideTarget(null)
                    setDemoOverrideError(null)
                  }}
                  disabled={overrideDeletePending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={overrideDeletePending || createMutation.isPending}
                  onClick={async () => {
                    if (!demoOverrideTarget) return
                    setDemoOverrideError(null)
                    setOverrideDeletePending(true)
                    try {
                      if (authSession.authSupported && authSession.currentUser) {
                        const db = await getDb()
                        await permanentlyDeleteProductionForActor(
                          db,
                          authSession.currentUser,
                          demoOverrideTarget.production.id
                        )
                      } else {
                        await permanentlyDeleteProduction(demoOverrideTarget.production.id)
                      }
                      if (currentProductionId === demoOverrideTarget.production.id) {
                        setCurrentProductionId(null)
                      }
                      setDemoOverrideTarget(null)
                      createMutation.mutate(demoOverrideTarget.formData)
                    } catch (err) {
                      setDemoOverrideError(err instanceof Error ? err.message : 'Delete failed')
                    } finally {
                      setOverrideDeletePending(false)
                    }
                  }}
                >
                  {overrideDeletePending || createMutation.isPending ? 'Overriding…' : 'Override demo project'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {duplicateSuccessResult && (
        <p className="rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-mint-700 dark:text-mint-400 text-sm">
          <strong>Production duplicated.</strong> New production: &quot;{duplicateSuccessResult.name}&quot; (slug: <code className="rounded bg-mint-500/20 px-1">{duplicateSuccessResult.slug}</code>). It has been set as the current production and will appear in the list below.
        </p>
      )}
      {duplicateError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-400 text-sm">
          {duplicateError}
        </p>
      )}
      {actionToast && (
        <p
          className={
            actionToast.type === 'success'
              ? 'rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-mint-700 dark:text-mint-400 text-sm'
              : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-400 text-sm'
          }
        >
          {actionToast.message}
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No productions. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.original.archived_at ? 'bg-muted/40 text-muted-foreground' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingId && (
        <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
          <DialogContent className={PRODUCTION_DIALOG_CONTENT_CLASS}>
            <EditProductionForm
              production={productions.find((p) => p.id === editingId)!}
              clients={clients}
              onSubmit={(data) => updateMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={!!duplicateSource}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateSource(null)
            setDuplicateName('')
            setDuplicateError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate production</DialogTitle>
            <p className="text-muted-foreground text-sm">
              Create a copy of &quot;{duplicateSource?.name}&quot; with all its data. You can change the name below.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="dup-name">New production name</Label>
            <Input
              id="dup-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="e.g. My Production (Copy)"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateSource(null)
                setDuplicateName('')
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!duplicateName.trim() || duplicateMutation.isPending}
              onClick={() => duplicateSource && duplicateMutation.mutate({ sourceId: duplicateSource.id, newName: duplicateName.trim() })}
            >
              {duplicateMutation.isPending ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={!!productionToHardDelete}
        onOpenChange={(open) => !open && setProductionToHardDelete(null)}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl border-t bg-zinc-900 text-zinc-100"
        >
          <SheetHeader>
            <SheetTitle className="text-zinc-100">
              Delete production permanently?
            </SheetTitle>
            <p className="text-zinc-400 text-sm">
              {productionToHardDelete
                ? `"${productionToHardDelete.name}" and all its data (scenes, people, documents, etc.) will be removed and cannot be undone.`
                : ''}
            </p>
          </SheetHeader>
          <SheetFooter className="flex-row gap-3 justify-center sm:justify-center">
            <button
              type="button"
              onClick={() => productionToHardDelete && hardDeleteMutation.mutate(productionToHardDelete.id)}
              disabled={hardDeleteMutation.isPending}
              className="rounded-full border-2 border-red-500 bg-transparent px-6 py-2.5 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              Yes, Delete
            </button>
            <button
              type="button"
              onClick={() => setProductionToHardDelete(null)}
              disabled={hardDeleteMutation.isPending}
              className="rounded-full border-2 border-white bg-transparent px-6 py-2.5 text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConnectServerDialog
        open={publishActions.connectOpen}
        onOpenChange={publishActions.setConnectOpen}
        onConnected={() => {
          if (currentProduction) {
            void publishActions.beginPublish(currentProduction.id, currentProduction.name)
          }
        }}
      />
      {publishActions.preflight && (
        <PreflightPublishSheet
          open={publishActions.preflightOpen}
          onOpenChange={(v) => {
            publishActions.setPreflightOpen(v)
            if (!v) publishActions.setPreflight(null)
          }}
          productionId={publishActions.preflight.productionId}
          productionName={publishActions.preflight.productionName}
          connectionId={publishActions.preflight.connectionId}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['linked-projects-map'] })
          }}
        />
      )}

      <Sheet open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t bg-background">
          <SheetHeader>
            <SheetTitle>Unlink from server?</SheetTitle>
            <p className="text-muted-foreground text-sm">
              This device will stop syncing with the shared project on the server. The remote project remains available for your team.
            </p>
          </SheetHeader>
          <SheetFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" type="button" onClick={() => setUnlinkTarget(null)} disabled={unlinkBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              disabled={unlinkBusy}
              onClick={async () => {
                if (!unlinkTarget) return
                setUnlinkBusy(true)
                try {
                  const lp = await getLinkedProjectByProductionId(unlinkTarget.id)
                  if (lp) {
                    const conn = await getServerConnectionById(lp.connection_id)
                    const token = conn ? await getSetting(serverSessionTokenSettingKey(lp.connection_id)) : null
                    if (conn && token) {
                      await serverUnlinkProject(conn.base_url, token, lp.remote_project_id)
                    }
                    await deleteLinkedProject(unlinkTarget.id)
                  }
                  setUnlinkTarget(null)
                  await queryClient.invalidateQueries({ queryKey: ['linked-projects-map'] })
                  await queryClient.invalidateQueries({ queryKey: ['productions'] })
                  setActionToast({ type: 'success', message: 'Unlinked from server.' })
                  setTimeout(() => setActionToast(null), 4000)
                } catch (e) {
                  setActionToast({
                    type: 'error',
                    message: e instanceof Error ? e.message : 'Unlink failed',
                  })
                  setTimeout(() => setActionToast(null), 5000)
                } finally {
                  setUnlinkBusy(false)
                }
              }}
            >
              {unlinkBusy ? 'Unlinking…' : 'Unlink'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {import.meta.env.DEV && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Developer: Verify Production Delete</p>
          <p className="mt-1 text-muted-foreground">
            Duplicates the first production, soft-deletes it, then permanently deletes it, and reports success or the first failing step.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={verifyDeletePending || productions.length === 0}
              onClick={() => runVerifyProductionDelete()}
            >
              {verifyDeletePending ? 'Running…' : 'Run verify'}
            </Button>
            {verifyDeleteResult && (
              <span className={verifyDeleteResult.includes('success') ? 'text-mint-600 dark:text-mint-400' : 'text-red-600 dark:text-red-400'}>
                {verifyDeleteResult}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductionFormDialog({
  onSubmit,
  onCancel,
  isLoading,
  error,
  onDismissError,
}: {
  onSubmit: (data: NewProductionForm) => void
  onCancel: () => void
  isLoading: boolean
  error?: string | null
  onDismissError?: () => void
}) {
  const authSession = useAuthSession()
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
    enabled: canFetchSensitiveClientData(authSession.authSupported, authSession.isAuthenticated),
  })
  const form = useForm<NewProductionForm>({
    resolver: zodResolver(newProductionFormSchema),
    defaultValues: {
      name: '',
      notes: '',
      template: 'default',
      clientMode: CLIENT_MODE_NONE,
      clientId: '',
      newClientName: '',
      newClientEmail: '',
      newClientPhone: '',
      deliveryDate: '',
      isEpisodic: false,
      initialEpisodeName: '',
    },
  })
  const isEpisodic = form.watch('isEpisodic')

  return (
    <>
      <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6">
        <DialogTitle>New production</DialogTitle>
        <p className="text-muted-foreground text-sm leading-snug">
          Choose a template, then name your project. You can add a description below if you like.
        </p>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...form.register('name')} placeholder="e.g. My Feature" />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Project description</Label>
          <Textarea id="notes" {...form.register('notes')} rows={2} placeholder="Optional" className="resize-none" />
        </div>
        <ProductionClientAndDeliveryFields
          form={form as unknown as ProductionClientFormControl}
          clients={clients}
          clientsLoading={clientsLoading}
          idPrefix="new"
        />
        <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 space-y-3">
          <Controller
            name="isEpisodic"
            control={form.control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  className="mt-0.5"
                  id="is-episodic"
                />
                <div className="space-y-1 min-w-0">
                  <span className="text-sm font-medium text-foreground leading-snug">Episodic production</span>
                  <p className="text-muted-foreground text-xs leading-snug">
                    For series and multi-episode work. Scenes, schedule, and deliverables can be tied to episodes in later releases.
                  </p>
                </div>
              </label>
            )}
          />
          {isEpisodic && (
            <>
              <p className="text-amber-700 dark:text-amber-400 text-xs font-medium leading-snug border border-amber-500/35 rounded-md bg-amber-500/10 px-2.5 py-2">
                You cannot turn off episodic mode after the project is created. Be sure this is the right choice for this production.
              </p>
              <div className="space-y-2">
                <Label htmlFor="initial-episode">First episode name</Label>
                <Input
                  id="initial-episode"
                  {...form.register('initialEpisodeName')}
                  placeholder="e.g. Episode 1 or 101"
                />
                {form.formState.errors.initialEpisodeName && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.initialEpisodeName.message}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="space-y-2.5">
          <Label className="text-foreground">Project template</Label>
          <Controller
            name="template"
            control={form.control}
            render={({ field }) => (
              <div className="grid gap-2" role="radiogroup" aria-label="Project template">
                {VISIBLE_TEMPLATE_OPTIONS.map((opt) => {
                  const isSelected = field.value === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => field.onChange(opt.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          field.onChange(opt.value)
                        }
                      }}
                      className={`flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isSelected ? opt.selectedClass : opt.cardClass}`}
                    >
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg aria-hidden ${isSelected ? 'bg-primary/15 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                        <opt.Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5 pt-px">
                        <p className="font-medium text-foreground">{opt.label}</p>
                        <p className="text-muted-foreground text-sm leading-snug">{opt.description}</p>
                        <p className="text-muted-foreground/80 text-xs">Preview: {opt.preview}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-destructive text-sm flex items-start justify-between gap-2">
            <span>{error}</span>
            {onDismissError && (
              <Button type="button" variant="ghost" size="sm" className="shrink-0 h-auto py-1 text-destructive hover:bg-destructive/20" onClick={onDismissError}>
                Dismiss
              </Button>
            )}
          </div>
        )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditProductionForm({
  production,
  clients,
  onSubmit,
  onCancel,
  isLoading,
}: {
  production: Production
  clients: Client[]
  onSubmit: (data: EditProductionForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<EditProductionForm>({
    resolver: zodResolver(editProductionSchema),
    defaultValues: {
      name: production.name,
      notes: production.notes ?? '',
      ...defaultClientFieldsFromProduction(production),
    },
  })
  return (
    <>
      <DialogHeader className="shrink-0 px-6 pt-6">
        <DialogTitle>Edit production</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-destructive text-sm">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" {...form.register('notes')} rows={3} />
          </div>
          <ProductionClientAndDeliveryFields
            form={form as unknown as ProductionClientFormControl}
            clients={clients}
            clientsLoading={false}
            idPrefix="edit"
          />
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
