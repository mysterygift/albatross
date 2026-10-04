import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, FormProvider, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  DndContext,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { usePlatformDragSensors } from '@/lib/dnd/usePlatformDragSensors'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, CheckCircle2, Copy, FileDown, Save } from 'lucide-react'
import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { DuplicateRamsDialog } from '@/features/risk-assessments/DuplicateRamsDialog'
import { FirstAidersEditor } from '@/features/risk-assessments/FirstAidersEditor'
import { HazardCard } from '@/features/risk-assessments/HazardCard'
import { HazardPicker } from '@/features/risk-assessments/HazardPicker'
import { RamsStatusBadge } from '@/features/risk-assessments/RamsStatusBadge'
import { UnitChip } from '@/features/risk-assessments/UnitChip'
import { exportRamsPdfWithSaveDialog } from '@/features/risk-assessments/exportRamsPdf'
import {
  RAMS_QUERY_KEY,
  hazardFromForm,
  hazardTemplatesKey,
  hazardToForm,
  ramsDetailKey,
  ramsFormSchema,
  toFormValues,
  toSaveInput,
  type HazardFormValues,
  type RamsFormValues,
} from '@/features/risk-assessments/ramsForm'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { deleteHazardTemplate, listHazardTemplatesByProduction, upsertHazardTemplate } from '@/lib/db/repositories/hazard-templates'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listCrew } from '@/lib/db/repositories/person'
import {
  approveRiskAssessment,
  getRiskAssessment,
  saveRiskAssessment,
  type RiskAssessmentFull,
} from '@/lib/db/repositories/risk-assessments'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import { formatShootDayLabel } from '@/lib/risk-assessments/exportRiskAssessmentPdf'

const NONE = '__none__'

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function RiskAssessmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { currentProductionId } = useCurrentProduction()
  if (!currentProductionId) return <RequireProduction title="Risk Assessment">{null}</RequireProduction>
  return <RiskAssessmentEditor key={id} id={id!} productionId={currentProductionId} />
}

function RiskAssessmentEditor({ id, productionId }: { id: string; productionId: string }) {
  const { data: ra, isLoading } = useQuery({
    queryKey: ramsDetailKey(id),
    queryFn: () => getRiskAssessment(id),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!ra || ra.production_id !== productionId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Risk Assessment" />
        <EmptyState
          title="Risk assessment not found"
          description="It may have been deleted."
          action={
            <Button asChild>
              <Link to="/risk-assessments">Back to risk assessments</Link>
            </Button>
          }
        />
      </div>
    )
  }
  return <RamsEditorForm id={id} productionId={productionId} ra={ra} />
}

function RamsEditorForm({ id, productionId, ra }: { id: string; productionId: string; ra: RiskAssessmentFull }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authSession = useAuthSession()

  const { data: days = [] } = useQuery({
    queryKey: ['shoot-days', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
  })
  const { data: units = [] } = useQuery({
    queryKey: ['units', productionId],
    queryFn: () => listUnitsByProduction(productionId),
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', productionId],
    queryFn: () => listLocationsByProduction(productionId),
  })
  const { data: crew = [] } = useQuery({
    queryKey: ['crew', productionId],
    queryFn: () => listCrew(productionId),
  })
  const { data: templates = [] } = useQuery({
    queryKey: hazardTemplatesKey(productionId),
    queryFn: () => listHazardTemplatesByProduction(productionId),
  })

  const form = useForm<RamsFormValues>({
    resolver: zodResolver(ramsFormSchema),
    defaultValues: toFormValues(ra),
  })
  const { control, register, handleSubmit, reset, setValue, watch, formState } = form
  const { isDirty, errors } = formState

  // Reset the form only when a newer version of the record arrives, never on a background refetch
  // of the same version (that would discard unsaved edits).
  const loadedVersion = useRef<string>(`${ra.id}:${ra.updated_at}`)
  useEffect(() => {
    const version = `${ra.id}:${ra.updated_at}`
    if (loadedVersion.current === version || form.formState.isDirty) return
    loadedVersion.current = version
    reset(toFormValues(ra))
  }, [ra, reset, form])

  const { fields, append, remove, move } = useFieldArray({ control, name: 'hazards', keyName: 'fieldKey' })

  const shootDayId = watch('shoot_day_id')
  const unitIds = watch('shoot_day_unit_ids') ?? []
  const responsibleName = watch('responsible_person_name') ?? ''
  const locationId = watch('location_id')

  const { data: dayUnits = [] } = useQuery({
    queryKey: ['shoot-day-units', shootDayId],
    queryFn: () => listShootDayUnitsByShootDay(shootDayId),
    enabled: !!shootDayId,
  })
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units])

  // Moving to another shoot day: default to every unit working that day.
  useEffect(() => {
    if (!shootDayId || dayUnits.length === 0 || dayUnits[0]!.shoot_day_id !== shootDayId) return
    const valid = new Set(dayUnits.map((u) => u.id))
    const current = form.getValues('shoot_day_unit_ids') ?? []
    if (current.length === 0 || current.some((u) => !valid.has(u))) {
      setValue('shoot_day_unit_ids', dayUnits.map((u) => u.id), { shouldDirty: true })
    }
  }, [dayUnits, shootDayId, form, setValue])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [RAMS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
  }

  const saveMutation = useMutation({
    mutationFn: (values: RamsFormValues) => saveRiskAssessment(toSaveInput(values, { id, production_id: productionId })),
    onSuccess: (saved, _values) => {
      loadedVersion.current = `${saved.id}:${saved.updated_at}`
      reset(toFormValues(saved))
      queryClient.setQueryData(ramsDetailKey(id), saved)
      invalidate()
      toast.success(
        ra?.status === 'approved' && saved.status === 'draft'
          ? 'Saved. Editing an approved risk assessment reverted it to draft.'
          : 'Risk assessment saved'
      )
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save risk assessment'),
  })

  const [approveOpen, setApproveOpen] = useState(false)
  const [approverName, setApproverName] = useState('')
  const approveMutation = useMutation({
    mutationFn: (name: string) => approveRiskAssessment(id, name),
    onSuccess: (saved) => {
      loadedVersion.current = `${saved.id}:${saved.updated_at}`
      reset(toFormValues(saved))
      queryClient.setQueryData(ramsDetailKey(id), saved)
      invalidate()
      setApproveOpen(false)
      toast.success('Risk assessment approved')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not approve risk assessment'),
  })

  const [exporting, setExporting] = useState(false)
  const exportPdf = async () => {
    setExporting(true)
    try {
      await exportRamsPdfWithSaveDialog(id)
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ramsDetailKey(id) })
      toast.success('Risk assessment PDF saved to Documents')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export PDF')
    } finally {
      setExporting(false)
    }
  }

  const [duplicateOpen, setDuplicateOpen] = useState(false)

  const saveTemplate = async (hazard: HazardFormValues) => {
    if (!hazard.name.trim()) {
      toast.error('Name the hazard before saving it as a template')
      return
    }
    try {
      await upsertHazardTemplate(productionId, hazardFromForm(hazard))
      void queryClient.invalidateQueries({ queryKey: hazardTemplatesKey(productionId) })
      toast.success(`Saved “${hazard.name.trim()}” as a template`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save template')
    }
  }
  const removeTemplate = async (templateId: string, name: string) => {
    try {
      await deleteHazardTemplate(templateId)
      void queryClient.invalidateQueries({ queryKey: hazardTemplatesKey(productionId) })
      toast.success(`Deleted template “${name}”`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete template')
    }
  }

  const sensors = useSensors(
    ...usePlatformDragSensors(6),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = fields.findIndex((f) => f.fieldKey === e.active.id)
    const to = fields.findIndex((f) => f.fieldKey === e.over!.id)
    if (from >= 0 && to >= 0) move(from, to)
  }

  // Warn before navigating away from unsaved edits.
  const proceedingRef = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname)

  const approveBlockedReason = isDirty
    ? 'Save your changes before approving'
    : fields.length === 0
      ? 'Add at least one hazard before approving'
      : !responsibleName.trim()
        ? 'Set a responsible person before approving'
        : null

  const onSubmit = handleSubmit(
    (values) => saveMutation.mutate(values),
    () => toast.error('Fix the highlighted fields before saving (open collapsed hazards to check their names)')
  )

  const day = days.find((d) => d.id === ra.shoot_day_id)
  const approved = ra.status === 'approved'

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <PageHeader
          title="Risk Assessment"
          description={day ? formatShootDayLabel(day) : undefined}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/risk-assessments">
                <ArrowLeft className="size-4" /> All risk assessments
              </Link>
            </Button>
          }
        />

        <div className="bg-background/95 sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b px-1 py-2 backdrop-blur">
          <RamsStatusBadge status={ra.status} />
          {approved ? (
            <span className="text-muted-foreground text-xs">
              by {ra.approved_by} · {formatDateTime(ra.approved_at)}
            </span>
          ) : null}
          {isDirty ? (
            <span role="status" className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Unsaved changes{approved ? ' — saving will revert this to draft' : ''}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={!isDirty || saveMutation.isPending}>
              <Save className="size-4" /> Save
            </Button>
            {!approved ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!approveBlockedReason}
                title={approveBlockedReason ?? undefined}
                onClick={() => {
                  setApproverName(authSession.currentUser?.username ?? '')
                  setApproveOpen(true)
                }}
              >
                <CheckCircle2 className="size-4" /> Approve
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isDirty || exporting}
              title={isDirty ? 'Save your changes before exporting' : undefined}
              onClick={() => void exportPdf()}
            >
              <FileDown className="size-4" /> Export PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isDirty}
              title={isDirty ? 'Save your changes before duplicating' : undefined}
              onClick={() => setDuplicateOpen(true)}
            >
              <Copy className="size-4" /> Duplicate
            </Button>
          </div>
        </div>
        {!approved && approveBlockedReason && !isDirty ? (
          <p className="text-muted-foreground -mt-4 text-xs">{approveBlockedReason}.</p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rams-day">Shoot day</Label>
              <Controller
                control={control}
                name="shoot_day_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => {
                      if (v === field.value) return
                      field.onChange(v)
                      setValue('shoot_day_unit_ids', [], { shouldDirty: true })
                    }}
                  >
                    <SelectTrigger id="rams-day" className="w-full">
                      <SelectValue placeholder="Choose a shoot day" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {formatShootDayLabel(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Units covered</legend>
              <div className="flex flex-wrap gap-4">
                {dayUnits.map((sdu) => (
                  <div key={sdu.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`rams-unit-${sdu.id}`}
                      checked={unitIds.includes(sdu.id)}
                      onCheckedChange={(v) =>
                        setValue(
                          'shoot_day_unit_ids',
                          v === true ? [...unitIds, sdu.id] : unitIds.filter((x) => x !== sdu.id),
                          { shouldDirty: true, shouldValidate: true }
                        )
                      }
                    />
                    <Label htmlFor={`rams-unit-${sdu.id}`} className="font-normal">
                      <UnitChip name={unitName.get(sdu.unit_id) ?? 'Unit'} />
                    </Label>
                  </div>
                ))}
              </div>
              {errors.shoot_day_unit_ids ? (
                <p className="text-destructive text-xs">{errors.shoot_day_unit_ids.message}</p>
              ) : null}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="rams-location-pick">Location</Label>
              <Select
                value={locationId ?? NONE}
                onValueChange={(v) => {
                  if (v === NONE) {
                    setValue('location_id', null, { shouldDirty: true })
                    return
                  }
                  const loc = locations.find((l) => l.id === v)
                  setValue('location_id', v, { shouldDirty: true })
                  if (loc) setValue('location_name', loc.name, { shouldDirty: true })
                }}
              >
                <SelectTrigger id="rams-location-pick" className="w-full">
                  <SelectValue placeholder="Pick a production location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Custom / none</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Location name"
                placeholder="Location name"
                {...register('location_name', {
                  onChange: (e) => {
                    const loc = locations.find((l) => l.id === form.getValues('location_id'))
                    if (loc && loc.name !== e.target.value) setValue('location_id', null, { shouldDirty: true })
                  },
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rams-person-pick">Responsible person</Label>
              <Select
                value={watch('responsible_person_id') ?? NONE}
                onValueChange={(v) => {
                  if (v === NONE) {
                    setValue('responsible_person_id', null, { shouldDirty: true })
                    return
                  }
                  const person = crew.find((p) => p.id === v)
                  setValue('responsible_person_id', v, { shouldDirty: true })
                  if (person) setValue('responsible_person_name', person.name, { shouldDirty: true })
                }}
              >
                <SelectTrigger id="rams-person-pick" className="w-full">
                  <SelectValue placeholder="Pick from crew" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Custom / none</SelectItem>
                  {crew.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Responsible person name"
                placeholder="Responsible person name"
                {...register('responsible_person_name', {
                  onChange: (e) => {
                    const person = crew.find((p) => p.id === form.getValues('responsible_person_id'))
                    if (person && person.name !== e.target.value) setValue('responsible_person_id', null, { shouldDirty: true })
                  },
                })}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rams-activities">Activities</Label>
              <Textarea id="rams-activities" rows={3} placeholder="What is being filmed / done at this location" {...register('activities')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Safety contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">First aiders</h3>
              <FirstAidersEditor crew={crew} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Nearest hospital</legend>
                <Input aria-label="Hospital name" placeholder="Name" {...register('hospital_name')} />
                <Input aria-label="Hospital address" placeholder="Address" {...register('hospital_address')} />
                <Input aria-label="Hospital phone" placeholder="Phone" {...register('hospital_phone')} />
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Nearest police station</legend>
                <Input aria-label="Police station name" placeholder="Name" {...register('police_name')} />
                <Input aria-label="Police station address" placeholder="Address" {...register('police_address')} />
                <Input aria-label="Police station phone" placeholder="Phone" {...register('police_phone')} />
              </fieldset>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3" aria-labelledby="rams-hazards-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="rams-hazards-heading" className="text-base font-semibold">
              Hazards
            </h2>
            <HazardPicker
              templates={templates}
              onPick={(h) => append(hazardToForm(h), { shouldFocus: false })}
              onDeleteTemplate={(t) => void removeTemplate(t.id, t.name)}
            />
          </div>
          {fields.length === 0 ? (
            <EmptyState
              title="No hazards yet"
              description="Add a blank hazard, a built-in one, or one saved in this project."
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={fields.map((f) => f.fieldKey)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <HazardCard
                      key={field.fieldKey}
                      index={index}
                      sortId={field.fieldKey}
                      defaultOpen={fields.length <= 3}
                      onRemove={() => remove(index)}
                      onSaveAsTemplate={(h) => void saveTemplate(h)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </form>

      <Dialog open={approveOpen} onOpenChange={(open) => (approveMutation.isPending ? undefined : setApproveOpen(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve risk assessment</DialogTitle>
            <DialogDescription>
              Record who is signing this off. Any later edit reverts it to draft and it must be approved again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rams-approver">Approved by</Label>
            <Input id="rams-approver" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={approveMutation.isPending} onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!approverName.trim() || approveMutation.isPending}
              onClick={() => approveMutation.mutate(approverName)}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateRamsDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        productionId={productionId}
        riskAssessmentId={id}
        sourceShootDayId={ra.shoot_day_id}
        onDuplicated={(ids) => navigate(ids.length === 1 ? `/risk-assessments/${ids[0]}` : '/risk-assessments')}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked' && !proceedingRef.current) blocker.reset()
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes to this risk assessment. Leaving now will lose them."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          if (blocker.state === 'blocked') {
            proceedingRef.current = true
            blocker.proceed()
          }
        }}
      />
    </FormProvider>
  )
}
