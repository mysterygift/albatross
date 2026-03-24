import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { deliverablesTutorialSteps } from '@/features/tutorial/sections/deliverablesTutorial'
import {
  listDeliverablesByProduction,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  getTechnicalSpecByDeliverable,
  getTechnicalSpecsByDeliverableIds,
  upsertTechnicalSpec,
} from '@/lib/db/repositories/deliverable'
import {
  listEpisodesByProduction,
  listEpisodesForProductionManagement,
  getEpisodeByIdForProductionIncludeArchived,
} from '@/lib/db/repositories/episodes'
import {
  listDeliverableTemplates,
  applyDeliverableTemplateToProduction,
} from '@/lib/db/repositories/deliverableTemplates'
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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Settings, LayoutTemplate } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Deliverable as DeliverableType, Episode, TechnicalSpec } from '@/lib/db/types'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listDocumentsByEntity, createDocument, deleteDocument } from '@/lib/db/repositories/document'
import { pickAndSaveAttachment, getFileUrl, openInSystem } from '@/lib/files'
import { Paperclip, Upload, ExternalLink, Trash2, Loader2 } from 'lucide-react'

const EMPTY = '—'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'qc', label: 'QC' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
]

const APPROVAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function cell(value: string | null | undefined): string {
  const v = value?.trim()
  return v ? v : EMPTY
}

function statusLabel(status: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === status)
  if (found) return found.label
  if (status === 'pending') return 'Pending'
  if (status === 'done') return 'Done'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function deliverableScopeTableText(
  d: DeliverableType,
  isEpisodicProd: boolean,
  meta: Map<string, { name: string; archived: boolean }>
): { text: string; archived: boolean } | null {
  if (!isEpisodicProd) return null
  if (d.episode_id == null || d.episode_id.trim() === '') {
    return { text: 'Project-wide', archived: false }
  }
  const m = meta.get(d.episode_id)
  if (!m) return { text: 'Unknown episode', archived: false }
  return { text: m.name, archived: m.archived }
}

type ScopeMode = 'project_wide' | 'episode'

export function DeliverablesPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const isEpisodic = Boolean(currentProduction?.is_episodic)
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const [open, setOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [applyTemplateId, setApplyTemplateId] = useState<string>('')
  const [applyAnchorDate, setApplyAnchorDate] = useState('')
  const [editDeliverable, setEditDeliverable] = useState<DeliverableType | null>(null)
  const [specDeliverableId, setSpecDeliverableId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recipient, setRecipient] = useState('')
  const [createScopeMode, setCreateScopeMode] = useState<ScopeMode>('project_wide')
  const [createEpisodeId, setCreateEpisodeId] = useState('')
  const [applyTemplateScopeMode, setApplyTemplateScopeMode] = useState<ScopeMode>('project_wide')
  const [applyTemplateEpisodeId, setApplyTemplateEpisodeId] = useState('')
  const [listFilter, setListFilter] = useState<string>('all')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isEpisodic) {
      setListFilter('all')
    }
  }, [isEpisodic])

  useEffect(() => {
    setListFilter('all')
  }, [currentProductionId])

  useEffect(() => {
    if (progress?.currentSection === 'deliverables') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

  const { data: deliverableTemplates = [] } = useQuery({
    queryKey: ['deliverable-templates'],
    queryFn: () => listDeliverableTemplates(),
  })

  const { data: activeEpisodes = [] } = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: () => listEpisodesByProduction(currentProductionId!),
    enabled: !!currentProductionId && isEpisodic,
  })

  const { data: episodesForLabels = [] } = useQuery({
    queryKey: ['episodes-management', currentProductionId],
    queryFn: () => listEpisodesForProductionManagement(currentProductionId!),
    enabled: !!currentProductionId && isEpisodic,
  })

  const episodeMetaById = useMemo(() => {
    const m = new Map<string, { name: string; archived: boolean }>()
    for (const e of episodesForLabels) {
      m.set(e.id, { name: e.name, archived: e.deleted_at != null })
    }
    return m
  }, [episodesForLabels])

  const listOptions = useMemo(() => {
    if (!isEpisodic) return undefined
    if (listFilter === 'all') return { filter: 'all' as const }
    if (listFilter === 'project_wide') return { filter: 'project_wide' as const }
    if (listFilter.startsWith('episode:')) {
      return { filter: 'episode' as const, episodeId: listFilter.slice('episode:'.length) }
    }
    return { filter: 'all' as const }
  }, [isEpisodic, listFilter])

  const { data: deliverables = [] } = useQuery({
    queryKey: ['deliverables', currentProductionId, listOptions],
    queryFn: () => listDeliverablesByProduction(currentProductionId ?? '', listOptions),
    enabled: !!currentProductionId,
  })

  const deliverableIds = useMemo(() => deliverables.map((d) => d.id), [deliverables])
  const { data: specs = [] } = useQuery({
    queryKey: ['technical-specs-by-deliverables', deliverableIds],
    queryFn: () => getTechnicalSpecsByDeliverableIds(deliverableIds),
    enabled: deliverableIds.length > 0,
  })
  const specByDeliverableId = useMemo(() => {
    const m = new Map<string, TechnicalSpec>()
    for (const s of specs) m.set(s.deliverable_id, s)
    return m
  }, [specs])

  const createMutation = useMutation({
    mutationFn: () =>
      createDeliverable({
        production_id: currentProductionId!,
        name,
        due_date: dueDate || null,
        recipient: recipient.trim() || null,
        episode_id:
          isEpisodic && createScopeMode === 'episode' ? createEpisodeId.trim() || null : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
      setOpen(false)
      setName('')
      setDueDate('')
      setRecipient('')
      setCreateScopeMode('project_wide')
      setCreateEpisodeId('')
    },
  })

  const applyTemplateMutation = useMutation({
    mutationFn: () =>
      applyDeliverableTemplateToProduction({
        productionId: currentProductionId!,
        templateId: applyTemplateId,
        anchorDate: applyAnchorDate.trim() || null,
        episodeId:
          isEpisodic && applyTemplateScopeMode === 'episode'
            ? applyTemplateEpisodeId.trim() || null
            : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
      setApplyTemplateOpen(false)
      setApplyTemplateId('')
      setApplyAnchorDate('')
      setApplyTemplateScopeMode('project_wide')
      setApplyTemplateEpisodeId('')
    },
  })

  const deleteDeliverableMutation = useMutation({
    mutationFn: (deliverableId: string) => deleteDeliverable(deliverableId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
    },
  })

  useEffect(() => {
    const onAddDeliverable = () => setOpen(true)
    const onApplyTemplate = () => setApplyTemplateOpen(true)
    window.addEventListener('albatross-menu-deliverables-add-deliverable', onAddDeliverable)
    window.addEventListener('albatross-menu-deliverables-apply-template', onApplyTemplate)
    return () => {
      window.removeEventListener('albatross-menu-deliverables-add-deliverable', onAddDeliverable)
      window.removeEventListener('albatross-menu-deliverables-apply-template', onApplyTemplate)
    }
  }, [])

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Deliverables</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Deliverables</h1>
        <div className="flex items-center gap-2">
          <Dialog
            open={applyTemplateOpen}
            onOpenChange={(o) => {
              setApplyTemplateOpen(o)
              if (!o) {
                setApplyTemplateScopeMode('project_wide')
                setApplyTemplateEpisodeId('')
              }
            }}
          >
            <Button variant="outline" onClick={() => setApplyTemplateOpen(true)}>
              <LayoutTemplate className="mr-2 size-4" />Apply template
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply deliverable template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={applyTemplateId} onValueChange={setApplyTemplateId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {deliverableTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Anchor date (optional)</Label>
                  <Input
                    type="date"
                    value={applyAnchorDate}
                    onChange={(e) => setApplyAnchorDate(e.target.value)}
                    placeholder="Due dates = anchor + offset"
                  />
                  <p className="text-muted-foreground text-xs">
                    If set, each deliverable due date is anchor date + its offset (days). Leave empty for no due dates.
                  </p>
                </div>
                {isEpisodic && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/15 p-3">
                    <div className="space-y-1.5">
                      <Label>Scope</Label>
                      <Select
                        value={applyTemplateScopeMode}
                        onValueChange={(v) => {
                          setApplyTemplateScopeMode(v as ScopeMode)
                          if (v === 'project_wide') setApplyTemplateEpisodeId('')
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="project_wide">Project-wide</SelectItem>
                          <SelectItem value="episode">Specific episode</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {applyTemplateScopeMode === 'episode' && (
                      <div className="space-y-1.5">
                        <Label>Episode</Label>
                        <Select value={applyTemplateEpisodeId} onValueChange={setApplyTemplateEpisodeId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose episode" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeEpisodes.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyTemplateOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => applyTemplateMutation.mutate()}
                  disabled={
                    !applyTemplateId ||
                    applyTemplateMutation.isPending ||
                    (isEpisodic &&
                      applyTemplateScopeMode === 'episode' &&
                      applyTemplateEpisodeId.trim() === '')
                  }
                >
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o)
              if (!o) {
                setName('')
                setDueDate('')
                setRecipient('')
                setCreateScopeMode('project_wide')
                setCreateEpisodeId('')
              }
            }}
          >
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 size-4" />Add deliverable</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New deliverable</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Picture Master" />
              </div>
              {isEpisodic && (
                <div className="space-y-3 rounded-md border border-border bg-muted/15 p-3">
                  <div className="space-y-1.5">
                    <Label>Scope</Label>
                    <Select
                      value={createScopeMode}
                      onValueChange={(v) => {
                        setCreateScopeMode(v as ScopeMode)
                        if (v === 'project_wide') setCreateEpisodeId('')
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project_wide">Project-wide</SelectItem>
                        <SelectItem value="episode">Specific episode</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {createScopeMode === 'episode' && (
                    <div className="space-y-1.5">
                      <Label>Episode</Label>
                      <Select value={createEpisodeId} onValueChange={setCreateEpisodeId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose episode" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeEpisodes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Recipient (optional)</Label>
                <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who this is sent to" />
              </div>
              <div>
                <Label>Due date (optional)</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={
                  !name.trim() ||
                  createMutation.isPending ||
                  (isEpisodic &&
                    createScopeMode === 'episode' &&
                    createEpisodeId.trim() === '')
                }
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      {isEpisodic && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-muted-foreground shrink-0 text-xs font-medium uppercase tracking-wide">
            Show
          </Label>
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="w-[min(100%,280px)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All deliverables</SelectItem>
              <SelectItem value="project_wide">Project-wide</SelectItem>
              {activeEpisodes.map((e) => (
                <SelectItem key={e.id} value={`episode:${e.id}`}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground text-xs font-medium">Name</TableHead>
              {isEpisodic && (
                <TableHead className="text-muted-foreground text-xs font-medium max-w-[120px]">
                  Scope
                </TableHead>
              )}
              <TableHead className="text-muted-foreground text-xs font-medium">Recipient</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Due date</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Status</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Approval</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Audio</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Subtitles</TableHead>
              <TableHead className="w-[120px] text-muted-foreground text-xs font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliverables.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell
                  colSpan={isEpisodic ? 9 : 8}
                  className="text-muted-foreground py-12 text-center text-sm"
                >
                  No deliverables yet. Add one or apply a template to get started.
                </TableCell>
              </TableRow>
            ) : (
              deliverables.map((d) => {
                const spec = specByDeliverableId.get(d.id)
                const scopeDisp = deliverableScopeTableText(d, isEpisodic, episodeMetaById)
                return (
                  <TableRow key={d.id} className="border-border">
                    <TableCell className="max-w-[160px] truncate font-medium" title={d.name}>{cell(d.name)}</TableCell>
                    {isEpisodic && (
                      <TableCell className="max-w-[120px] text-sm">
                        {scopeDisp ? (
                          <span
                            className={cn(
                              'inline-flex max-w-full flex-col gap-0.5',
                              scopeDisp.archived && 'text-muted-foreground'
                            )}
                            title={scopeDisp.text}
                          >
                            <span className="truncate font-medium">{scopeDisp.text}</span>
                            {scopeDisp.archived && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Archived
                              </span>
                            )}
                          </span>
                        ) : (
                          EMPTY
                        )}
                      </TableCell>
                    )}
                    <TableCell className="max-w-[120px] truncate text-sm text-muted-foreground" title={d.recipient ?? undefined}>{cell(d.recipient)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{cell(d.due_date)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                        {statusLabel(d.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.approval_status ? (
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                            d.approval_status === 'approved' && 'bg-green-600/15 text-green-700 dark:text-green-400',
                            d.approval_status === 'rejected' && 'bg-red-600/15 text-red-700 dark:text-red-400',
                            d.approval_status === 'pending' && 'bg-muted text-muted-foreground'
                          )}
                        >
                          {APPROVAL_OPTIONS.find((o) => o.value === d.approval_status)?.label ?? d.approval_status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-sm text-muted-foreground" title={spec?.audio_mix ?? undefined}>{cell(spec?.audio_mix)}</TableCell>
                    <TableCell className="max-w-[100px] truncate text-sm text-muted-foreground" title={spec?.subtitles ?? undefined}>{cell(spec?.subtitles)}</TableCell>
                    <TableCell className="w-[120px]">
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setEditDeliverable(d)} title="Edit deliverable">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setSpecDeliverableId(d.id)} title="Technical specs">
                          <Settings className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => deleteDeliverableMutation.mutate(d.id)}
                          disabled={deleteDeliverableMutation.isPending}
                          title="Delete deliverable"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {editDeliverable && (
        <DeliverableEditSheet
          deliverable={editDeliverable}
          isEpisodic={isEpisodic}
          activeEpisodes={activeEpisodes}
          onClose={() => setEditDeliverable(null)}
          onSaved={() => setEditDeliverable(null)}
        />
      )}
      {specDeliverableId && (
        <TechnicalSpecsPanel
          deliverableId={specDeliverableId}
          onClose={() => setSpecDeliverableId(null)}
        />
      )}
      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'deliverables' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                deliverables:
                  prev.sections.deliverables === 'not_started'
                    ? 'in_progress'
                    : prev.sections.deliverables,
              },
            }))
          }
        }}
        sectionId="deliverables"
        sectionTitle="Deliverables"
        steps={deliverablesTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'deliverables' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              deliverables: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}

const DELIVERABLE_ENTITY_TYPE = 'deliverable'

function DeliverableEditSheet({
  deliverable,
  isEpisodic,
  activeEpisodes,
  onClose,
  onSaved,
}: {
  deliverable: DeliverableType
  isEpisodic: boolean
  activeEpisodes: Episode[]
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(deliverable.name)
  const [dueDate, setDueDate] = useState(deliverable.due_date ?? '')
  const [recipient, setRecipient] = useState(deliverable.recipient ?? '')
  const [deliveryMethod, setDeliveryMethod] = useState(deliverable.delivery_method ?? '')
  const [deliveredBy, setDeliveredBy] = useState(deliverable.delivered_by ?? '')
  const [deliveredAt, setDeliveredAt] = useState(deliverable.delivered_at ?? '')
  const [scopeMode, setScopeMode] = useState<ScopeMode>(() =>
    deliverable.episode_id != null && deliverable.episode_id.trim() !== '' ? 'episode' : 'project_wide'
  )
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(() =>
    deliverable.episode_id?.trim() ?? ''
  )
  const [status, setStatus] = useState(() => {
    const s = deliverable.status
    if (s === 'pending') return 'not_started'
    if (s === 'done') return 'delivered'
    return s
  })
  const [approvalStatus, setApprovalStatus] = useState(deliverable.approval_status ?? 'pending')
  const [openingFilePath, setOpeningFilePath] = useState<string | null>(null)
  const [openAttachmentError, setOpenAttachmentError] = useState<string | null>(null)

  const { data: linkedEpisode } = useQuery({
    queryKey: ['episode-include-archived', deliverable.production_id, deliverable.episode_id],
    queryFn: () =>
      deliverable.episode_id
        ? getEpisodeByIdForProductionIncludeArchived(deliverable.production_id, deliverable.episode_id)
        : Promise.resolve(null),
    enabled: isEpisodic && Boolean(deliverable.episode_id?.trim()),
  })

  const episodeSelectOptions = useMemo(() => {
    const byId = new Map<string, Episode>()
    for (const e of activeEpisodes) byId.set(e.id, e)
    if (linkedEpisode && !byId.has(linkedEpisode.id)) {
      byId.set(linkedEpisode.id, linkedEpisode)
    }
    return Array.from(byId.values()).sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
    )
  }, [activeEpisodes, linkedEpisode])

  useEffect(() => {
    setName(deliverable.name)
    setDueDate(deliverable.due_date ?? '')
    setRecipient(deliverable.recipient ?? '')
    setDeliveryMethod(deliverable.delivery_method ?? '')
    setDeliveredBy(deliverable.delivered_by ?? '')
    setDeliveredAt(deliverable.delivered_at ?? '')
    setStatus(deliverable.status === 'pending' ? 'not_started' : deliverable.status === 'done' ? 'delivered' : deliverable.status)
    setApprovalStatus(deliverable.approval_status ?? 'pending')
    const hasEp = deliverable.episode_id != null && deliverable.episode_id.trim() !== ''
    setScopeMode(hasEp ? 'episode' : 'project_wide')
    setSelectedEpisodeId(deliverable.episode_id?.trim() ?? '')
  }, [deliverable])

  const { data: attachments = [] } = useQuery({
    queryKey: ['documents', DELIVERABLE_ENTITY_TYPE, deliverable.id],
    queryFn: () => listDocumentsByEntity(DELIVERABLE_ENTITY_TYPE, deliverable.id),
    enabled: !!deliverable.id,
  })

  const attachMutation = useMutation({
    mutationFn: async () => {
      const result = await pickAndSaveAttachment()
      if (!result) return null
      return createDocument({
        production_id: deliverable.production_id,
        entity_type: DELIVERABLE_ENTITY_TYPE,
        entity_id: deliverable.id,
        file_name: result.fileName,
        file_path: result.relativePath,
        mime_type: null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', DELIVERABLE_ENTITY_TYPE, deliverable.id] })
    },
  })

  const removeAttachmentMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', DELIVERABLE_ENTITY_TYPE, deliverable.id] })
    },
  })

  const handleOpenAttachment = async (filePath: string) => {
    setOpenAttachmentError(null)
    setOpeningFilePath(filePath)
    try {
      const url = await getFileUrl(filePath)
      await openInSystem(url)
    } catch (err) {
      setOpenAttachmentError(err instanceof Error ? err.message : 'Failed to open attachment')
    } finally {
      setOpeningFilePath(null)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateDeliverable(deliverable.id, {
        name: name.trim(),
        due_date: dueDate.trim() || null,
        recipient: recipient.trim() || null,
        delivery_method: deliveryMethod.trim() || null,
        delivered_by: deliveredBy.trim() || null,
        delivered_at: deliveredAt.trim() || null,
        status,
        approval_status: approvalStatus,
        ...(isEpisodic
          ? {
              episode_id:
                scopeMode === 'project_wide' ? null : selectedEpisodeId.trim() || null,
            }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
      onSaved()
    },
  })

  const sectionHeading = 'text-muted-foreground text-xs font-medium uppercase tracking-wide'

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border pb-4">
          <SheetTitle className="text-lg">Edit deliverable</SheetTitle>
          {isEpisodic && (
            <p className="text-muted-foreground pt-1 text-sm font-normal">
              Scope:{' '}
              {scopeMode === 'project_wide'
                ? 'Project-wide'
                : episodeSelectOptions.find((e) => e.id === selectedEpisodeId)?.name.trim() ||
                  (selectedEpisodeId ? 'Episode' : '—')}
              {scopeMode === 'episode' &&
                episodeSelectOptions.find((e) => e.id === selectedEpisodeId)?.deleted_at != null && (
                  <span className="text-muted-foreground"> (archived episode)</span>
                )}
            </p>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-6">
            {/* Basics */}
            <div className="space-y-3">
              <p className={sectionHeading}>Basics</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deliverable name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                {isEpisodic && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/15 p-3">
                    <div className="space-y-1.5">
                      <Label>Scope</Label>
                      <Select
                        value={scopeMode}
                        onValueChange={(v) => {
                          setScopeMode(v as ScopeMode)
                          if (v === 'project_wide') setSelectedEpisodeId('')
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="project_wide">Project-wide</SelectItem>
                          <SelectItem value="episode">Specific episode</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {scopeMode === 'episode' && (
                      <div className="space-y-1.5">
                        <Label>Episode</Label>
                        <Select value={selectedEpisodeId} onValueChange={setSelectedEpisodeId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose episode" />
                          </SelectTrigger>
                          <SelectContent>
                            {episodeSelectOptions.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                                {e.deleted_at ? ' (archived)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Recipient & delivery */}
            <div className="space-y-3">
              <p className={sectionHeading}>Recipient & delivery</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Recipient</Label>
                  <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Who this is sent to" />
                </div>
                <div className="space-y-1.5">
                  <Label>Delivery method</Label>
                  <Input value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="e.g. Aspera, S3, Hard drive" />
                </div>
                <div className="space-y-1.5">
                  <Label>Delivered by</Label>
                  <Input value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} placeholder="Person or team" />
                </div>
                <div className="space-y-1.5">
                  <Label>Delivered at</Label>
                  <Input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-3">
              <p className={sectionHeading}>Status</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Approval</Label>
                  <Select value={approvalStatus} onValueChange={setApprovalStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Approval" />
                    </SelectTrigger>
                    <SelectContent>
                      {APPROVAL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-3">
              <p className={sectionHeading}>Attachments</p>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => attachMutation.mutate()}
                  disabled={attachMutation.isPending}
                >
                  <Upload className="size-4 shrink-0" />
                  Attach file
                </Button>
                {openAttachmentError && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-destructive text-sm flex items-center justify-between gap-2">
                    <span>{openAttachmentError}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-auto py-0.5 text-destructive hover:bg-destructive/20"
                      onClick={() => setOpenAttachmentError(null)}
                    >
                      Dismiss
                    </Button>
                  </p>
                )}
                {attachments.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">No attachments yet.</p>
                ) : (
                  <ul className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
                    {attachments.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm group hover:bg-muted/40"
                      >
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate flex-1" title={doc.file_name}>
                          {doc.file_name}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0"
                            onClick={() => handleOpenAttachment(doc.file_path)}
                            disabled={openingFilePath !== null}
                            title={openingFilePath === doc.file_path ? 'Opening…' : 'Open'}
                          >
                            {openingFilePath === doc.file_path ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <ExternalLink className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAttachmentMutation.mutate(doc.id)}
                            disabled={removeAttachmentMutation.isPending}
                            title="Remove"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
        <SheetFooter className="shrink-0 gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={
              !name.trim() ||
              saveMutation.isPending ||
              (isEpisodic && scopeMode === 'episode' && selectedEpisodeId.trim() === '')
            }
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function TechnicalSpecsPanel({ deliverableId, onClose }: { deliverableId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: spec } = useQuery({
    queryKey: ['technical-spec', deliverableId],
    queryFn: () => getTechnicalSpecByDeliverable(deliverableId),
    enabled: !!deliverableId,
  })
  const [resolution, setResolution] = useState('')
  const [codec, setCodec] = useState('')
  const [bitrate, setBitrate] = useState('')
  const [audioMix, setAudioMix] = useState('')
  const [language, setLanguage] = useState('')
  const [subtitles, setSubtitles] = useState('')
  const [graphics, setGraphics] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    queueMicrotask(() => {
      setResolution(spec?.resolution ?? '')
      setCodec(spec?.codec ?? '')
      setBitrate(spec?.bitrate ?? '')
      setAudioMix(spec?.audio_mix ?? '')
      setLanguage(spec?.language ?? '')
      setSubtitles(spec?.subtitles ?? '')
      setGraphics(spec?.graphics ?? '')
      setNotes(spec?.notes ?? '')
    })
  }, [spec])

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertTechnicalSpec(deliverableId, {
        resolution: resolution.trim() || null,
        codec: codec.trim() || null,
        bitrate: bitrate.trim() || null,
        audio_mix: audioMix.trim() || null,
        language: language.trim() || null,
        subtitles: subtitles.trim() || null,
        graphics: graphics.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technical-spec', deliverableId] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
    },
  })

  const sectionHeading = 'text-muted-foreground text-xs font-medium uppercase tracking-wide'

  return (
    <Dialog open={!!deliverableId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Technical specs</DialogTitle></DialogHeader>
        <div className="space-y-6">
          {/* Video */}
          <div className="space-y-3">
            <p className={sectionHeading}>Video</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Resolution</Label>
                <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. 1920×1080" />
              </div>
              <div className="space-y-1.5">
                <Label>Codec</Label>
                <Input value={codec} onChange={(e) => setCodec(e.target.value)} placeholder="e.g. ProRes 422 HQ" />
              </div>
              <div className="space-y-1.5">
                <Label>Bitrate</Label>
                <Input value={bitrate} onChange={(e) => setBitrate(e.target.value)} placeholder="e.g. 50 Mbps" />
              </div>
            </div>
          </div>

          {/* Audio & Language */}
          <div className="space-y-3">
            <p className={sectionHeading}>Audio & Language</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Audio mix</Label>
                <Input value={audioMix} onChange={(e) => setAudioMix(e.target.value)} placeholder="e.g. Stereo, 5.1" />
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. English" />
              </div>
            </div>
          </div>

          {/* Subtitles & Graphics */}
          <div className="space-y-3">
            <p className={sectionHeading}>Subtitles & Graphics</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Subtitles</Label>
                <Input value={subtitles} onChange={(e) => setSubtitles(e.target.value)} placeholder="e.g. SDH, CC" />
              </div>
              <div className="space-y-1.5">
                <Label>Graphics</Label>
                <Input value={graphics} onChange={(e) => setGraphics(e.target.value)} placeholder="e.g. Textless" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <p className={sectionHeading}>Notes</p>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Additional spec notes" className="resize-none" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
