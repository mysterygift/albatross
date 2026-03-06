import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  listDeliverablesByProduction,
  createDeliverable,
  updateDeliverable,
  getTechnicalSpecByDeliverable,
  getTechnicalSpecsByDeliverableIds,
  upsertTechnicalSpec,
} from '@/lib/db/repositories/deliverable'
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
import type { Deliverable as DeliverableType, TechnicalSpec } from '@/lib/db/types'
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
import { Paperclip, Upload, ExternalLink, Trash2 } from 'lucide-react'

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

export function DeliverablesPage() {
  const { currentProductionId } = useCurrentProduction()
  const [open, setOpen] = useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [applyTemplateId, setApplyTemplateId] = useState<string>('')
  const [applyAnchorDate, setApplyAnchorDate] = useState('')
  const [editDeliverable, setEditDeliverable] = useState<DeliverableType | null>(null)
  const [specDeliverableId, setSpecDeliverableId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recipient, setRecipient] = useState('')
  const queryClient = useQueryClient()

  const { data: deliverableTemplates = [] } = useQuery({
    queryKey: ['deliverable-templates'],
    queryFn: () => listDeliverableTemplates(),
  })

  const { data: deliverables = [] } = useQuery({
    queryKey: ['deliverables', currentProductionId],
    queryFn: () => listDeliverablesByProduction(currentProductionId ?? ''),
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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
      setOpen(false)
      setName('')
      setDueDate('')
      setRecipient('')
    },
  })

  const applyTemplateMutation = useMutation({
    mutationFn: () =>
      applyDeliverableTemplateToProduction({
        productionId: currentProductionId!,
        templateId: applyTemplateId,
        anchorDate: applyAnchorDate.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliverables'] })
      queryClient.invalidateQueries({ queryKey: ['technical-specs-by-deliverables'] })
      setApplyTemplateOpen(false)
      setApplyTemplateId('')
      setApplyAnchorDate('')
    },
  })

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
          <Dialog open={applyTemplateOpen} onOpenChange={setApplyTemplateOpen}>
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyTemplateOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => applyTemplateMutation.mutate()}
                  disabled={!applyTemplateId || applyTemplateMutation.isPending}
                >
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
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
              <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground text-xs font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Recipient</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Due date</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Status</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Approval</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Audio</TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium">Subtitles</TableHead>
              <TableHead className="w-[88px] text-muted-foreground text-xs font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliverables.length === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={8} className="text-muted-foreground py-12 text-center text-sm">
                  No deliverables yet. Add one or apply a template to get started.
                </TableCell>
              </TableRow>
            ) : (
              deliverables.map((d) => {
                const spec = specByDeliverableId.get(d.id)
                return (
                  <TableRow key={d.id} className="border-border">
                    <TableCell className="max-w-[160px] truncate font-medium" title={d.name}>{cell(d.name)}</TableCell>
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
                    <TableCell className="w-[88px]">
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setEditDeliverable(d)} title="Edit deliverable">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setSpecDeliverableId(d.id)} title="Technical specs">
                          <Settings className="size-4" />
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
    </div>
  )
}

const DELIVERABLE_ENTITY_TYPE = 'deliverable'

function DeliverableEditSheet({
  deliverable,
  onClose,
  onSaved,
}: {
  deliverable: DeliverableType
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
  const [status, setStatus] = useState(() => {
    const s = deliverable.status
    if (s === 'pending') return 'not_started'
    if (s === 'done') return 'delivered'
    return s
  })
  const [approvalStatus, setApprovalStatus] = useState(deliverable.approval_status ?? 'pending')

  useEffect(() => {
    setName(deliverable.name)
    setDueDate(deliverable.due_date ?? '')
    setRecipient(deliverable.recipient ?? '')
    setDeliveryMethod(deliverable.delivery_method ?? '')
    setDeliveredBy(deliverable.delivered_by ?? '')
    setDeliveredAt(deliverable.delivered_at ?? '')
    setStatus(deliverable.status === 'pending' ? 'not_started' : deliverable.status === 'done' ? 'delivered' : deliverable.status)
    setApprovalStatus(deliverable.approval_status ?? 'pending')
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
    const url = await getFileUrl(filePath)
    await openInSystem(url)
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
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-1 py-4">
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
                            title="Open"
                          >
                            <ExternalLink className="size-3.5" />
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
          <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>Save</Button>
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
    setResolution(spec?.resolution ?? '')
    setCodec(spec?.codec ?? '')
    setBitrate(spec?.bitrate ?? '')
    setAudioMix(spec?.audio_mix ?? '')
    setLanguage(spec?.language ?? '')
    setSubtitles(spec?.subtitles ?? '')
    setGraphics(spec?.graphics ?? '')
    setNotes(spec?.notes ?? '')
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
