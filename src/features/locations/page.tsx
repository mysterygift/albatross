import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useHighlightParam } from '@/features/search/useHighlightParam'
import { useCurrency } from '@/hooks/useCurrency'
import {
  listLocationsByProduction,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/lib/db/repositories/location'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Location } from '@/lib/db/types'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import type { PickedFileBytes } from '@/lib/documents/pickAndPersistProductionDocument'
import {
  LocationDocumentsSection,
  persistPendingLocationDocuments,
} from './LocationDocumentsSection'

const feeSchema = z
  .union([z.coerce.number(), z.literal('')])
  .transform((v) => (v === '' ? undefined : Number(v)))
  .pipe(
    z
      .number()
      .min(0, { message: 'Must be 0 or greater' })
      .optional()
  )

const emailRefine = (v: string | undefined) =>
  !v || v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const locationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  booked_status: z.enum(['unbooked', 'hold', 'booked', 'wrap']),
  address: z.string().trim().min(1, 'Address is required'),
  what3words: z.string().optional(),
  parking_info: z.string().optional(),
  availability_constraints: z.string().optional(),
  location_fee: feeSchema,
  notes: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().optional().refine(emailRefine, { message: 'Invalid email' }),
  contact_phone: z.string().optional(),
})

type LocationForm = z.infer<typeof locationSchema>

type PendingLocationFiles = { permits: PickedFileBytes[]; releases: PickedFileBytes[] }

function trimOrNull(s: string | undefined): string | null {
  const t = s?.trim()
  return t ? t : null
}

/** Trim the contact fields and store blanks as null. */
function normalizeContact(d: LocationForm) {
  return {
    ...d,
    contact_name: trimOrNull(d.contact_name),
    contact_email: trimOrNull(d.contact_email),
    contact_phone: trimOrNull(d.contact_phone),
  }
}

export function LocationsPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { format } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const highlightedId = useHighlightParam()
  const queryClient = useQueryClient()


  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createMutation = useMutation({
    mutationFn: async ({ data, pending }: { data: LocationForm; pending: PendingLocationFiles }) => {
      const location = await createLocation({
        production_id: currentProductionId!,
        ...normalizeContact(data),
      })
      // The location now exists, so a failed upload must not fail (and re-run) the create.
      try {
        await persistPendingLocationDocuments(
          currentProductionId!,
          location.id,
          DOCUMENT_ENTITY_TYPES.permit,
          pending.permits
        )
        await persistPendingLocationDocuments(
          currentProductionId!,
          location.id,
          DOCUMENT_ENTITY_TYPES.locationRelease,
          pending.releases
        )
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'Upload failed'
      }
    },
    onSuccess: (uploadError) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId!) })
      setNotice(
        uploadError
          ? `Location saved, but some files could not be uploaded (${uploadError}). Edit the location to add them again.`
          : null
      )
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LocationForm }) =>
      updateLocation(id, normalizeContact(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditingId(null)
    },
    onError: () => {
      setUpdateError('Failed to save location.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId ?? '') })
    },
  })

  async function handleDeleteLocation(loc: Location) {
    const ok = await confirm({
      title: `Delete "${loc.name}"?`,
      description: 'The location and its permits and release forms will be deleted. Scenes using it will be left without a location.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteMutation.mutate(loc.id)
  }

  const columns: ColumnDef<Location>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'booked_status', header: 'Status' },
    { accessorKey: 'address', header: 'Address', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    {
      accessorKey: 'location_fee',
      header: 'Location Fee',
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return v != null ? format(v, productionCurrency).formatted : '—'
      },
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => {
        const { contact_name, contact_email, contact_phone } = row.original
        if (!contact_name && !contact_email && !contact_phone) return '—'
        return (
          <div className="space-y-0.5">
            {contact_name && <div>{contact_name}</div>}
            {(contact_email || contact_phone) && (
              <div className="text-xs text-muted-foreground">
                {[contact_email, contact_phone].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setUpdateError(null); setEditingId(row.original.id) }}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete location"
            aria-label="Delete location"
            onClick={() => void handleDeleteLocation(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: locations,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    const onAddLocation = () => setOpen(true)
    window.addEventListener('albatross-menu-locations-add-location', onAddLocation)
    return () => {
      window.removeEventListener('albatross-menu-locations-add-location', onAddLocation)
    }
  }, [])

  if (!currentProductionId) {
    return (
      <RequireProduction title="Locations">{null}</RequireProduction>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Locations"
        actions={
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-tutorial="locations-add"><Plus className="mr-2 size-4" />Add location</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <LocationForm
                  productionId={currentProductionId}
                  defaultValues={{ name: '', booked_status: 'unbooked' }}
                  onSubmit={(data, pending) => createMutation.mutate({ data, pending })}
                  onCancel={() => setOpen(false)}
                  isLoading={createMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </>
        }
      />
      {notice && (
        <p className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{notice}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </p>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const isHighlighted = row.original.id === highlightedId
              return (
                <TableRow
                  key={row.id}
                  data-location-id={row.original.id}
                  ref={(el) => {
                    if (el && isHighlighted) el.scrollIntoView({ block: 'center' })
                  }}
                  className={isHighlighted ? 'bg-accent/60 transition-colors' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {editingId && (
        <Dialog open={!!editingId} onOpenChange={() => { setUpdateError(null); setEditingId(null) }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            {updateError && (
              <p className="text-sm text-destructive">{updateError}</p>
            )}
            <LocationForm
              productionId={currentProductionId}
              defaultValues={locations.find((l) => l.id === editingId)!}
              onSubmit={(d) => updateMutation.mutate({ id: editingId, data: d })}
              onCancel={() => setEditingId(null)}
              isLoading={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
      {confirmDialog}
    </div>
  )
}

function LocationForm({
  productionId,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  productionId: string
  defaultValues: Partial<Location>
  onSubmit: (d: LocationForm, pending: PendingLocationFiles) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<LocationForm>({
    resolver: zodResolver(locationSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      booked_status: defaultValues.booked_status ?? 'unbooked',
      address: defaultValues.address ?? '',
      what3words: defaultValues.what3words ?? '',
      parking_info: defaultValues.parking_info ?? '',
      availability_constraints: defaultValues.availability_constraints ?? '',
      location_fee: defaultValues.location_fee ?? undefined,
      notes: defaultValues.notes ?? '',
      contact_name: defaultValues.contact_name ?? '',
      contact_email: defaultValues.contact_email ?? '',
      contact_phone: defaultValues.contact_phone ?? '',
    },
  })
  const [pending, setPending] = useState<PendingLocationFiles>({ permits: [], releases: [] })
  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit location' : 'Add location'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit((d) => onSubmit(d, pending))} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name<span className="text-destructive">*</span></Label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Booked status</Label>
          <Select
            value={form.watch('booked_status')}
            onValueChange={(v) => form.setValue('booked_status', v as LocationForm['booked_status'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unbooked">Unbooked</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="wrap">Wrap</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Address<span className="text-destructive">*</span></Label>
          <Input {...form.register('address')} />
          {form.formState.errors.address && (
            <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
            <Label>what3words</Label>
            <Input {...form.register('what3words')} />
        </div>
        <div className="space-y-1.5">
          <Label>Parking information</Label>
          <Textarea {...form.register('parking_info')} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label>Availability constraints</Label>
          <Input {...form.register('availability_constraints')} />
        </div>
        <div className="space-y-1.5">
          <Label>Location fee</Label>
          <Input type="number" step={0.01} min={0} {...form.register('location_fee')} />
          <p className="text-sm text-muted-foreground">Fee must be 0 or greater.</p>
        </div>
        <div className="space-y-3">
          <Label>Location contact</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Name</Label>
              <Input {...form.register('contact_name')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Phone</Label>
              <Input type="tel" {...form.register('contact_phone')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Email</Label>
            <Input type="email" {...form.register('contact_email')} />
            {form.formState.errors.contact_email && (
              <p className="text-sm text-destructive">{form.formState.errors.contact_email.message}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea {...form.register('notes')} rows={2} />
        </div>
        <LocationDocumentsSection
          productionId={productionId}
          locationId={defaultValues.id ?? null}
          entityType={DOCUMENT_ENTITY_TYPES.permit}
          label="Permits"
          pendingFiles={pending.permits}
          onPendingFilesChange={(permits) => setPending((p) => ({ ...p, permits }))}
        />
        <LocationDocumentsSection
          productionId={productionId}
          locationId={defaultValues.id ?? null}
          entityType={DOCUMENT_ENTITY_TYPES.locationRelease}
          label="Location release forms"
          pendingFiles={pending.releases}
          onPendingFilesChange={(releases) => setPending((p) => ({ ...p, releases }))}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>Save</Button>
        </DialogFooter>
      </form>
    </>
  )
}
