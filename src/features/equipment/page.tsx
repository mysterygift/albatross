import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useHighlightParam } from '@/features/search/useHighlightParam'
import {
  listEquipmentByProduction,
} from '@/lib/db/repositories/equipment'
import { listVendors } from '@/lib/db/repositories/vendors'
import { listVendorInvoicesByProduction } from '@/lib/db/repositories/vendorInvoices'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import {
  createEquipmentWithReminderTask,
  updateEquipmentWithReminderTask,
  archiveEquipmentWithReminderTask,
  bulkUpdateEquipmentWithReminderTasks,
} from '@/lib/db/equipmentReturnReminderService'
import {
  listEquipmentListsByProduction,
  getEquipmentListById,
  createEquipmentList,
  updateEquipmentList,
  deleteEquipmentList,
  listEquipmentListItems,
  addEquipmentItemToList,
  updateEquipmentListItem,
  removeEquipmentItemFromList,
  addEquipmentItemsToList,
  getMaxSortOrderForList,
  reorderEquipmentListItems,
} from '@/lib/db/repositories/equipmentLists'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Search, Bell, ArrowLeft, Package, CheckSquare, ChevronUp, ChevronDown, FileDown, Upload, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getOverStockListItems, isListQuantityOverRegistry } from '@/lib/equipment/listQuantity'
import {
  ImportEquipmentRegistryCsvDialog,
  loadRegistryCsvFromPicker,
} from '@/features/equipment/ImportEquipmentRegistryCsvDialog'
import type { ColumnMapping } from '@/lib/equipment/csv'
import type { Equipment, EquipmentCategory, EquipmentStatus, EquipmentList } from '@/lib/db/types'
import {
  EQUIPMENT_CATEGORY_VALUES,
  EQUIPMENT_STATUS_VALUES,
} from '@/lib/db/types'
import type { Vendor } from '@/lib/db/types'
import { VendorPicker } from '@/components/vendors/VendorPicker'
import { cn } from '@/lib/utils'
import {
  formatEquipmentLabel,
  formatEquipmentCategoryLabel,
  shortItemUuid,
} from '@/features/equipment/formatEquipmentLabel'
import {
  EquipmentCategorySelect,
  EquipmentDepartmentSelect,
  EquipmentSourceSelect,
  EquipmentStatusSelect,
} from '@/features/equipment/EquipmentFieldSelects'
import { BulkEditEquipmentDialog } from '@/features/equipment/BulkEditEquipmentDialog'
import { AddFromRegistryDialog } from '@/features/equipment/AddFromRegistryDialog'
import { filterEquipmentRegistry } from '@/lib/equipment/registryFilter'
import type { RegistryPickerAddition } from '@/lib/equipment/registryPicker'
import type { UpdateEquipmentPatch } from '@/lib/db/repositories/equipment'
import { generateEquipmentListPdf } from '@/lib/pdf/equipmentListPdf'
import { DEFAULT_PAPER_SIZE, PAPER_SIZES, isPaperSize, type PaperSize } from '@/lib/pdf/layoutKit'
import { saveFileWithDialog } from '@/lib/files'
import { persistProductionDocument, documentsQueryKey } from '@/lib/documents/persistDocument'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import {
  exportEquipmentListToCsv,
  parseEquipmentListCsv,
  matchParsedRowsToRegistry,
  csvRowToCreateEquipmentData,
  type EquipmentListCsvRow,
  type MatchResult,
} from '@/lib/equipment/csv'
import {
  getEffectiveCrewHierarchyOrDefault,
  getResolvedCrewDepartmentNames,
  getDefaultCrewHierarchyConfig,
} from '@/lib/people/crewHierarchyResolver'

const equipmentSchema = z.object({
  name: z.string().min(1),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  source_type: z.enum(['owned', 'purchased', 'rented']),
  category: z.enum(EQUIPMENT_CATEGORY_VALUES as unknown as [EquipmentCategory, ...EquipmentCategory[]]),
  status: z.enum(EQUIPMENT_STATUS_VALUES as unknown as [EquipmentStatus, ...EquipmentStatus[]]),
  department: z.string().optional(),
  serial_number: z.string().optional(),
  rental_start_date: z.string().optional(),
  return_due_date: z.string().optional(),
  returned_at: z.string().optional(),
  replacement_value: z.coerce.number().optional(),
  notes: z.string().optional(),
  vendor_id: z.string().nullable().optional(),
  vendor: z.string().optional(),
})
type EquipmentForm = z.infer<typeof equipmentSchema>

function getVendorDisplay(equipment: Equipment, vendors: Vendor[]): string {
  if (equipment.vendor_id) {
    const v = vendors.find((x) => x.id === equipment.vendor_id)
    return v?.company_name ?? '—'
  }
  return equipment.vendor?.trim() || '—'
}

function formatRentalWindow(e: Equipment): string {
  if (e.returned_at) return `Returned ${e.returned_at}`
  if (e.rental_start_date && e.return_due_date)
    return `${e.rental_start_date} → ${e.return_due_date}`
  if (e.return_due_date) return `Due ${e.return_due_date}`
  if (e.rental_start_date) return `From ${e.rental_start_date}`
  return '—'
}

function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const variant =
    status === 'returned'
      ? 'secondary'
      : status === 'lost'
        ? 'destructive'
        : status === 'damaged'
          ? 'destructive'
          : status === 'active'
            ? 'default'
            : 'outline'
  const colorClass =
    status === 'damaged'
      ? 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40'
      : status === 'planned'
        ? 'text-muted-foreground border-muted-foreground/30'
        : ''
  return (
    <Badge variant={variant} className={cn('font-normal text-xs', colorClass)}>
      {formatEquipmentLabel(status)}
    </Badge>
  )
}

type EquipmentTab = 'registry' | 'lists'

export function EquipmentPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<EquipmentTab>('registry')
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const highlightedId = useHighlightParam()
  const queryClient = useQueryClient()


  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterDepartment, setFilterDepartment] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [searchText, setSearchText] = useState('')
  const [registryCsvImportOpen, setRegistryCsvImportOpen] = useState(false)
  const [registryCsvRaw, setRegistryCsvRaw] = useState<{ headers: string[]; rows: string[][] } | null>(
    null
  )
  const [registryCsvMapping, setRegistryCsvMapping] = useState<ColumnMapping>({})
  const [registryCsvParseErrors, setRegistryCsvParseErrors] = useState<string[]>([])
  const [registryCsvImportBusy, setRegistryCsvImportBusy] = useState(false)

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', currentProductionId],
    queryFn: () => listEquipmentByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  // Spotlight Search deep-link: ensure the registry (where items live) is shown.
  useEffect(() => {
    if (highlightedId) setTab('registry')
  }, [highlightedId])

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', currentProductionId],
    queryFn: () => listVendors(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['vendorInvoices', currentProductionId],
    queryFn: () => listVendorInvoicesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })
  const invoiceById = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv])), [invoices])

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', currentProductionId],
    queryFn: () => listTasksByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })
  const hierarchy = hierarchyData ?? getDefaultCrewHierarchyConfig()
  const crewDepartmentOptions = useMemo(
    () => getResolvedCrewDepartmentNames(hierarchy),
    [hierarchy]
  )

  const equipmentIdsWithReminder = useMemo(
    () => new Set((tasks || []).map((t) => t.equipment_id).filter(Boolean) as string[]),
    [tasks]
  )

  const filteredEquipment = useMemo(
    () =>
      filterEquipmentRegistry(equipment, {
        search: searchText,
        category: filterCategory,
        source: filterSource,
        department: filterDepartment,
        status: filterStatus,
      }),
    [equipment, filterCategory, filterSource, filterDepartment, filterStatus, searchText]
  )

  // Bulk edit selection. Deleted items drop out because selectedItems is derived from the registry.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditError, setBulkEditError] = useState<string | null>(null)
  const selectedItems = useMemo(
    () => equipment.filter((e) => selectedIds.has(e.id)),
    [equipment, selectedIds]
  )
  const hiddenSelectedCount = useMemo(() => {
    const visible = new Set(filteredEquipment.map((e) => e.id))
    return selectedItems.filter((e) => !visible.has(e.id)).length
  }, [filteredEquipment, selectedItems])
  const allFilteredSelected =
    filteredEquipment.length > 0 && filteredEquipment.every((e) => selectedIds.has(e.id))
  const someFilteredSelected = filteredEquipment.some((e) => selectedIds.has(e.id))
  const toggleSelected = useCallback((id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const toggleAllFiltered = useCallback(
    (on: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const e of filteredEquipment) {
          if (on) next.add(e.id)
          else next.delete(e.id)
        }
        return next
      })
    },
    [filteredEquipment]
  )

  const startRegistryCsvImport = async () => {
    if (registryCsvImportBusy) return
    setRegistryCsvImportBusy(true)
    try {
      const result = await loadRegistryCsvFromPicker()
      if (!result.ok) {
        if (result.errors.length > 0) {
          setRegistryCsvParseErrors(result.errors)
          setRegistryCsvRaw(null)
          setRegistryCsvImportOpen(true)
        }
        return
      }
      setRegistryCsvParseErrors([])
      setRegistryCsvRaw(result.raw)
      setRegistryCsvMapping(result.suggestedMapping)
      setRegistryCsvImportOpen(true)
    } finally {
      setRegistryCsvImportBusy(false)
    }
  }

  const createMutation = useMutation({
    mutationFn: (d: EquipmentForm) =>
      createEquipmentWithReminderTask({
        production_id: currentProductionId!,
        name: d.name,
        quantity: d.quantity ?? 1,
        source_type: d.source_type,
        category: d.category,
        status: d.status,
        department: d.department?.trim() || null,
        serial_number: d.serial_number?.trim() || null,
        rental_start_date: d.rental_start_date?.trim() || null,
        return_due_date: d.return_due_date?.trim() || null,
        returned_at: d.returned_at?.trim() || null,
        replacement_value: d.replacement_value ?? null,
        notes: d.notes?.trim() || null,
        vendor_id: d.vendor_id ?? null,
        vendor: d.vendor_id ? null : (d.vendor?.trim() || null),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data, current }: { id: string; data: EquipmentForm; current: Equipment }) =>
      updateEquipmentWithReminderTask(
        id,
        {
          name: data.name,
          quantity: data.quantity ?? 1,
          source_type: data.source_type,
          category: data.category,
          status: data.status,
          department: data.department?.trim() || null,
          serial_number: data.serial_number?.trim() || null,
          rental_start_date: data.rental_start_date?.trim() || null,
          return_due_date: data.return_due_date?.trim() || null,
          returned_at: data.returned_at?.trim() || null,
          replacement_value: data.replacement_value ?? null,
          notes: data.notes?.trim() || null,
          vendor_id: data.vendor_id ?? null,
          vendor: data.vendor_id != null ? null : (data.vendor?.trim() || null),
        },
        current
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: archiveEquipmentWithReminderTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: async (patch: UpdateEquipmentPatch) => {
      const result = await bulkUpdateEquipmentWithReminderTasks(selectedItems, patch)
      if (result.failed.length > 0) {
        const names = result.failed.map((f) => f.equipment.name).join(', ')
        throw new Error(
          `Updated ${result.updated.length} of ${selectedItems.length} items. Could not update: ${names}`
        )
      }
      return result
    },
    onMutate: () => setBulkEditError(null),
    onSuccess: () => setBulkEditOpen(false),
    onError: (err) => setBulkEditError(err instanceof Error ? err.message : String(err)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const handleDeleteEquipment = useCallback(
    async (item: Equipment) => {
      const ok = await confirm({
        title: `Delete "${item.name}"?`,
        description: 'This item will be removed from the registry, along with its return reminder task if it has one.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      deleteMutation.mutate(item.id)
    },
    [confirm, deleteMutation]
  )

  const columns: ColumnDef<Equipment>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            data-touch-hit
            checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
            onCheckedChange={(v) => toggleAllFiltered(v === true)}
            disabled={filteredEquipment.length === 0}
            aria-label="Select all shown items"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            data-touch-hit
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={(v) => toggleSelected(row.original.id, v === true)}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        meta: { className: 'w-8' },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row, getValue }) => (
          <span className="flex items-center gap-1.5">
            {equipmentIdsWithReminder.has(row.original.id) && (
              <span title="Return reminder task linked"><Bell className="size-3.5 text-muted-foreground shrink-0" /></span>
            )}
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ getValue }) => (getValue() as number) ?? 1,
        meta: { className: 'text-right tabular-nums' },
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ getValue }) => formatEquipmentCategoryLabel((getValue() as string) ?? ''),
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ getValue }) => (getValue() as string)?.trim() || '—',
      },
      {
        accessorKey: 'source_type',
        header: 'Source',
        cell: ({ getValue }) => formatEquipmentLabel((getValue() as string) ?? ''),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <EquipmentStatusBadge status={row.original.status} />,
      },
      {
        id: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => {
          const vendorText = getVendorDisplay(row.original, vendors)
          const inv = row.original.invoice_id ? invoiceById.get(row.original.invoice_id) : null
          if (inv) {
            return (
              <span className="flex flex-col gap-0.5">
                <span>{vendorText}</span>
                <span className="text-xs text-muted-foreground">(Invoice {inv.invoice_number})</span>
              </span>
            )
          }
          return vendorText
        },
      },
      {
        id: 'rental_window',
        header: 'Rental Window',
        cell: ({ row }) => formatRentalWindow(row.original),
      },
      {
        accessorKey: 'replacement_value',
        header: 'Replacement Value',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v != null ? v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
        },
        meta: { className: 'text-right tabular-nums' },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingId(row.original.id)}
              aria-label="Edit"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleDeleteEquipment(row.original)}
              aria-label="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [
      vendors,
      invoiceById,
      equipmentIdsWithReminder,
      handleDeleteEquipment,
      selectedIds,
      toggleSelected,
      toggleAllFiltered,
      allFilteredSelected,
      someFilteredSelected,
      filteredEquipment.length,
    ]
  )

  const table = useReactTable({
    data: filteredEquipment,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const departments = crewDepartmentOptions

  if (!currentProductionId) {
    return (
      <RequireProduction title="Equipment">{null}</RequireProduction>
    )
  }

  return (
    <div className="space-y-4 relative">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as EquipmentTab)
          if (v === 'registry') setSelectedListId(null)
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader title="Equipment" />
          <TabsList>
            <TabsTrigger value="registry">Registry</TabsTrigger>
            <TabsTrigger value="lists">Equipment Lists</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="registry" className="mt-4 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex justify-end gap-2 sm:flex-1 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => void startRegistryCsvImport()}
                disabled={registryCsvImportBusy}
              >
                <Upload className="mr-2 size-4" />
                {registryCsvImportBusy ? 'Opening…' : 'Import CSV'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 size-4" />
                    Add Equipment
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <EquipmentForm
                  productionId={currentProductionId}
                  departmentOptions={crewDepartmentOptions}
                  defaultValues={{ name: '', quantity: 1, source_type: 'rented', category: 'other', status: 'planned' }}
                  onSubmit={createMutation.mutate}
                  onCancel={() => setOpen(false)}
                  isLoading={createMutation.isPending}
                />
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative flex-1 min-w-[140px] max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, UUID, serial…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterCategory || '__all__'} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {EQUIPMENT_CATEGORY_VALUES.map((c) => (
              <SelectItem key={c} value={c}>{formatEquipmentCategoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSource || '__all__'} onValueChange={(v) => setFilterSource(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            <SelectItem value="owned">{formatEquipmentLabel('owned')}</SelectItem>
            <SelectItem value="purchased">{formatEquipmentLabel('purchased')}</SelectItem>
            <SelectItem value="rented">{formatEquipmentLabel('rented')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDepartment || '__all__'} onValueChange={(v) => setFilterDepartment(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus || '__all__'} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {EQUIPMENT_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>{formatEquipmentLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedItems.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2"
          role="region"
          aria-label="Selected equipment"
          data-touch-targets
        >
          <span className="text-sm font-medium">
            {selectedItems.length} selected
            {hiddenSelectedCount > 0 && (
              <span className="font-normal text-muted-foreground"> ({hiddenSelectedCount} hidden by filters)</span>
            )}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setBulkEditError(null)
              if (selectedItems.length === 1) setEditingId(selectedItems[0]!.id)
              else setBulkEditOpen(true)
            }}
          >
            <Pencil className="mr-2 size-4" />
            Edit selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={cn((h.column.columnDef.meta as { className?: string })?.className)}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                  {equipment.length === 0 ? (
                    <>
                      <p className="mb-3">Add equipment to your production registry.</p>
                      <Button data-tutorial="equipment-add" onClick={() => setOpen(true)}>
                        <Plus className="mr-2 size-4" />
                        Add Equipment
                      </Button>
                    </>
                  ) : (
                    'No equipment matches the current filters.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isHighlighted = row.original.id === highlightedId
                return (
                  <TableRow
                    key={row.id}
                    data-equipment-id={row.original.id}
                    ref={(el) => {
                      if (el && isHighlighted) el.scrollIntoView({ block: 'center' })
                    }}
                    data-state={selectedIds.has(row.original.id) ? 'selected' : undefined}
                    className={isHighlighted ? 'bg-accent/60 transition-colors' : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn((cell.column.columnDef.meta as { className?: string })?.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

          <ImportEquipmentRegistryCsvDialog
            productionId={currentProductionId}
            existingEquipment={equipment}
            open={registryCsvImportOpen}
            onOpenChange={setRegistryCsvImportOpen}
            rawParse={registryCsvRaw}
            initialMapping={registryCsvMapping}
            parseErrors={registryCsvParseErrors}
          />

          {editingId && (
            <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <EquipmentForm
                  productionId={currentProductionId}
                  departmentOptions={crewDepartmentOptions}
                  defaultValues={equipment.find((e) => e.id === editingId)!}
                  onSubmit={(d) => {
                    const current = equipment.find((e) => e.id === editingId)
                    if (current) updateMutation.mutate({ id: editingId!, data: d, current })
                  }}
                  onCancel={() => setEditingId(null)}
                  isLoading={updateMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          )}

          <BulkEditEquipmentDialog
            open={bulkEditOpen}
            onOpenChange={(o) => {
              if (!bulkUpdateMutation.isPending) setBulkEditOpen(o)
            }}
            items={selectedItems}
            productionId={currentProductionId}
            departmentOptions={crewDepartmentOptions}
            onApply={(patch) => bulkUpdateMutation.mutate(patch)}
            isSaving={bulkUpdateMutation.isPending}
            errorMessage={bulkEditError}
          />
        </TabsContent>

        <TabsContent value="lists" className="mt-4">
          {selectedListId ? (
            <EquipmentListDetail
              listId={selectedListId}
              productionId={currentProductionId}
              productionName={currentProduction?.name ?? ''}
              equipment={equipment}
              departmentOptions={crewDepartmentOptions}
              onBack={() => setSelectedListId(null)}
            />
          ) : (
            <EquipmentListsIndex
              productionId={currentProductionId}
              departmentOptions={crewDepartmentOptions}
              onSelectList={setSelectedListId}
            />
          )}
        </TabsContent>
      </Tabs>
      {confirmDialog}
    </div>
  )
}

function EquipmentForm({
  productionId,
  departmentOptions,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: {
  productionId: string
  departmentOptions: string[]
  defaultValues: Partial<Equipment>
  onSubmit: (d: EquipmentForm) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<EquipmentForm>({
    resolver: zodResolver(equipmentSchema) as never,
    defaultValues: {
      name: defaultValues.name ?? '',
      quantity: defaultValues.quantity ?? 1,
      source_type: defaultValues.source_type ?? 'rented',
      category: defaultValues.category ?? 'other',
      status: defaultValues.status ?? 'planned',
      department: defaultValues.department ?? '',
      serial_number: defaultValues.serial_number ?? '',
      rental_start_date: defaultValues.rental_start_date ?? '',
      return_due_date: defaultValues.return_due_date ?? '',
      returned_at: defaultValues.returned_at ?? '',
      replacement_value: defaultValues.replacement_value ?? undefined,
      notes: defaultValues.notes ?? '',
      vendor_id: defaultValues.vendor_id ?? null,
      vendor: defaultValues.vendor ?? '',
    },
  })

  const handleSubmit = form.handleSubmit((d) => {
    onSubmit({
      ...d,
      vendor_id: d.vendor_id ?? null,
      vendor: d.vendor_id ? undefined : d.vendor,
    })
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{defaultValues.id ? 'Edit equipment' : 'Add equipment'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} />
        </div>
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            min={1}
            step={1}
            {...form.register('quantity')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Category</Label>
            <EquipmentCategorySelect
              value={form.watch('category')}
              onValueChange={(v) => form.setValue('category', v)}
            />
          </div>
          <div>
            <Label>Source</Label>
            <EquipmentSourceSelect
              value={form.watch('source_type')}
              onValueChange={(v) => form.setValue('source_type', v)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Department</Label>
            <EquipmentDepartmentSelect
              value={form.watch('department') ?? ''}
              onValueChange={(v) => form.setValue('department', v)}
              departmentOptions={departmentOptions}
            />
          </div>
          <div>
            <Label>Status</Label>
            <EquipmentStatusSelect
              value={form.watch('status')}
              onValueChange={(v) => form.setValue('status', v)}
            />
          </div>
        </div>
        <div>
          <Label>Vendor</Label>
          <VendorPicker
            productionId={productionId}
            value={form.watch('vendor_id') ?? null}
            onChange={(id) => form.setValue('vendor_id', id)}
            placeholder="Select vendor (optional)"
          />
          {!form.watch('vendor_id') && (
            <Input
              className="mt-2"
              placeholder="Or enter legacy vendor name"
              {...form.register('vendor')}
            />
          )}
        </div>
        <div>
          <Label>Serial number</Label>
          <Input {...form.register('serial_number')} placeholder="Optional" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Rental start</Label>
            <Input type="date" {...form.register('rental_start_date')} />
          </div>
          <div>
            <Label>Return due</Label>
            <Input type="date" {...form.register('return_due_date')} />
          </div>
          <div>
            <Label>Returned at</Label>
            <Input type="date" {...form.register('returned_at')} />
          </div>
        </div>
        <div>
          <Label>Replacement value (insurance)</Label>
          <Input type="number" step={0.01} min={0} {...form.register('replacement_value')} placeholder="Optional" />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} placeholder="Optional" />
        </div>
        <DialogFooter>
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

function EquipmentListsIndex({
  productionId,
  departmentOptions,
  onSelectList,
}: {
  productionId: string
  departmentOptions: string[]
  onSelectList: (listId: string) => void
}) {
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: lists = [] } = useQuery({
    queryKey: ['equipmentLists', productionId],
    queryFn: () => listEquipmentListsByProduction(productionId),
    enabled: !!productionId,
  })
  const { data: shootDays = [] } = useQuery({
    queryKey: ['shootDays', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
    enabled: !!productionId,
  })
  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', productionId],
    queryFn: () => listEquipmentByProduction(productionId),
    enabled: !!productionId && createOpen,
  })
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string
      shoot_day_id?: string | null
      department?: string | null
      notes?: string | null
      addFromDepartment?: boolean
    }) => {
      const list = await createEquipmentList({
        production_id: productionId,
        name: data.name,
        shoot_day_id: data.shoot_day_id ?? null,
        department: data.department ?? null,
        notes: data.notes ?? null,
      })
      if (data.addFromDepartment && data.department?.trim()) {
        const dept = data.department.trim()
        const toAdd = equipment.filter((e) => (e.department ?? '').trim() === dept)
        let order = await getMaxSortOrderForList(list.id)
        for (const e of toAdd) {
          await addEquipmentItemToList({
            equipment_list_id: list.id,
            equipment_id: e.id,
            sort_order: order,
          })
          order += 1
        }
      }
      return list
    },
    onSuccess: (list, variables) => {
      queryClient.invalidateQueries({ queryKey: ['equipmentLists'] })
      queryClient.invalidateQueries({ queryKey: ['equipmentListItems', list.id] })
      setCreateOpen(false)
      if (variables.addFromDepartment) {
        onSelectList(list.id)
      }
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteEquipmentList,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipmentLists'] }),
  })
  const shootDayById = useMemo(() => new Map(shootDays.map((d) => [d.id, d])), [shootDays])
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex justify-end sm:flex-1 sm:justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                New Equipment List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateListForm
                departmentOptions={departmentOptions}
                shootDays={shootDays}
                equipment={equipment}
                onSubmit={createMutation.mutate}
                onCancel={() => setCreateOpen(false)}
                isLoading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Shoot day</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lists.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  <p className="mb-3">No equipment lists yet.</p>
                  <p className="text-sm mb-4">Create a list for a shoot day or department kit.</p>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 size-4" />
                    New Equipment List
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              lists.map((list) => (
                <TableRow
                  key={list.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectList(list.id)}
                >
                  <TableCell className="font-medium">{list.name}</TableCell>
                  <TableCell>{list.shoot_day_id ? shootDayById.get(list.shoot_day_id)?.shoot_date ?? '—' : '—'}</TableCell>
                  <TableCell>{list.department ?? '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">{list.notes ?? '—'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Delete list"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete "${list.name}"?`,
                          description: 'The list will be deleted. Equipment in the registry is not affected.',
                          confirmLabel: 'Delete',
                          destructive: true,
                        })
                        if (ok) deleteMutation.mutate(list.id)
                      }}
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
      {confirmDialog}
    </div>
  )
}

function CreateListForm({
  departmentOptions,
  shootDays,
  equipment,
  onSubmit,
  onCancel,
  isLoading,
}: {
  departmentOptions: string[]
  shootDays: { id: string; shoot_date: string }[]
  equipment: Equipment[]
  onSubmit: (d: {
    name: string
    shoot_day_id?: string | null
    department?: string | null
    notes?: string | null
    addFromDepartment?: boolean
  }) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<{ name: string; shoot_day_id: string; department: string; notes: string; addFromDepartment: boolean }>({
    defaultValues: { name: '', shoot_day_id: '__none__', department: '', notes: '', addFromDepartment: false },
  })
  const watchedDept = form.watch('department')?.trim() ?? ''
  const deptCount = watchedDept ? equipment.filter((e) => (e.department ?? '').trim() === watchedDept).length : 0
  return (
    <>
      <DialogHeader>
        <DialogTitle>New equipment list</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={form.handleSubmit((d) =>
          onSubmit({
            name: d.name.trim(),
            shoot_day_id: d.shoot_day_id?.trim() === '__none__' || !d.shoot_day_id?.trim() ? null : d.shoot_day_id.trim(),
            department: d.department?.trim() || null,
            notes: d.notes?.trim() || null,
            addFromDepartment: d.addFromDepartment && !!d.department?.trim(),
          })
        )}
        className="space-y-4"
      >
        <div>
          <Label>Name</Label>
          <Input {...form.register('name')} placeholder="e.g. Main Unit Camera Package" />
        </div>
        <div>
          <Label>Shoot day (optional)</Label>
          <Select
            value={form.watch('shoot_day_id') || '__none__'}
            onValueChange={(v) => form.setValue('shoot_day_id', v)}
          >
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {shootDays.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.shoot_date}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Department (optional)</Label>
          <Select
            value={form.watch('department')?.trim() || '__none__'}
            onValueChange={(v) => form.setValue('department', v === '__none__' ? '' : v)}
          >
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {deptCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <input
              type="checkbox"
              id="addFromDepartment"
              className="h-4 w-4 rounded border-input"
              {...form.register('addFromDepartment')}
            />
            <Label htmlFor="addFromDepartment" className="cursor-pointer font-normal text-sm">
              Generate from department — add all {deptCount} item{deptCount !== 1 ? 's' : ''} with this department to the list
            </Label>
          </div>
        )}
        <div>
          <Label>Notes (optional)</Label>
          <Input {...form.register('notes')} placeholder="Optional" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>Create</Button>
        </DialogFooter>
      </form>
    </>
  )
}

function CreateEquipmentFromCsvRowDialog({
  row,
  productionId,
  departmentOptions,
  onCreated,
  onCancel,
}: {
  row: EquipmentListCsvRow
  productionId: string
  departmentOptions: string[]
  onCreated: (eq: Equipment) => void
  onCancel: () => void
}) {
  const data = csvRowToCreateEquipmentData(row, productionId)
  const form = useForm({
    defaultValues: {
      name: data.name,
      category: data.category,
      source_type: data.source_type,
      status: data.status,
      department: data.department ?? '',
      vendor: data.vendor ?? '',
      rental_start_date: data.rental_start_date ?? '',
      return_due_date: data.return_due_date ?? '',
      serial_number: data.serial_number ?? '',
      notes: data.notes ?? '',
      replacement_value: data.replacement_value ?? '',
    },
  })
  const createMutation = useMutation({
    mutationFn: async () => {
      const v = form.getValues()
      return createEquipmentWithReminderTask({
        production_id: productionId,
        name: v.name.trim() || 'Unnamed item',
        category: v.category,
        source_type: v.source_type,
        status: v.status,
        department: v.department?.trim() || null,
        vendor: v.vendor?.trim() || null,
        rental_start_date: v.rental_start_date?.trim() || null,
        return_due_date: v.return_due_date?.trim() || null,
        serial_number: v.serial_number?.trim() || null,
        notes: v.notes?.trim() || null,
        replacement_value: (() => {
          const rv = v.replacement_value
          if (rv === '' || rv == null) return null
          const n = Number(rv)
          return Number.isFinite(n) ? n : null
        })(),
      })
    },
    onSuccess: (eq) => {
      onCreated(eq)
    },
  })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new equipment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(() => createMutation.mutate())}
          className="space-y-4"
        >
          <div>
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="Item name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Category</Label>
              <Select
                value={form.watch('category')}
                onValueChange={(v) => form.setValue('category', v as EquipmentCategory)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>{formatEquipmentCategoryLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select
                value={form.watch('source_type')}
                onValueChange={(v) => form.setValue('source_type', v as Equipment['source_type'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">{formatEquipmentLabel('owned')}</SelectItem>
                  <SelectItem value="purchased">{formatEquipmentLabel('purchased')}</SelectItem>
                  <SelectItem value="rented">{formatEquipmentLabel('rented')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Department</Label>
              <Select
                value={form.watch('department')?.trim() || '__none__'}
                onValueChange={(v) => form.setValue('department', v === '__none__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {departmentOptions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as EquipmentStatus)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{formatEquipmentLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Vendor</Label>
            <Input {...form.register('vendor')} placeholder="Optional" />
          </div>
          <div>
            <Label>Serial number</Label>
            <Input {...form.register('serial_number')} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Rental start</Label>
              <Input type="date" {...form.register('rental_start_date')} />
            </div>
            <div>
              <Label>Return due</Label>
              <Input type="date" {...form.register('return_due_date')} />
            </div>
          </div>
          <div>
            <Label>Replacement value</Label>
            <Input type="number" step={0.01} min={0} {...form.register('replacement_value')} placeholder="Optional" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input {...form.register('notes')} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create equipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EquipmentListDetail({
  listId,
  productionId,
  productionName,
  equipment,
  departmentOptions,
  onBack,
}: {
  listId: string
  productionId: string
  productionName: string
  equipment: Equipment[]
  departmentOptions: string[]
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editingList, setEditingList] = useState(false)
  const [paperSize, setPaperSize] = useState<PaperSize>(DEFAULT_PAPER_SIZE)
  const { data: list } = useQuery({
    queryKey: ['equipmentList', listId],
    queryFn: () => getEquipmentListById(listId),
    enabled: !!listId,
  })
  const { data: items = [] } = useQuery({
    queryKey: ['equipmentListItems', listId],
    queryFn: () => listEquipmentListItems(listId),
    enabled: !!listId,
  })
  const { data: shootDays = [] } = useQuery({
    queryKey: ['shootDays', productionId],
    queryFn: () => listShootDaysByProduction(productionId),
    enabled: !!productionId,
  })
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const overStockItems = useMemo(
    () => getOverStockListItems(items, equipmentById),
    [items, equipmentById]
  )
  const itemIdsOnList = useMemo(() => new Set(items.map((i) => i.equipment_id)), [items])

  const updateListMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateEquipmentList>[1]) => updateEquipmentList(listId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipmentList', listId] })
      setEditingList(false)
    },
  })
  const addItemsMutation = useMutation({
    mutationFn: (additions: RegistryPickerAddition[]) => addEquipmentItemsToList(listId, additions),
    onSuccess: () => setAddOpen(false),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['equipmentListItems', listId] }),
  })
  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Parameters<typeof updateEquipmentListItem>[1] }) =>
      updateEquipmentListItem(itemId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipmentListItems', listId] }),
  })
  const removeItemMutation = useMutation({
    mutationFn: removeEquipmentItemFromList,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipmentListItems', listId] }),
  })
  const reorderMutation = useMutation({
    mutationFn: (itemIdsInOrder: string[]) => reorderEquipmentListItems(listId, itemIdsInOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipmentListItems', listId] }),
  })
  const shootDayById = useMemo(() => new Map(shootDays.map((d) => [d.id, d])), [shootDays])

  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      if (!list) return
      const equipmentById = new Map(equipment.map((e) => [e.id, e]))
      const shootDay = list.shoot_day_id ? shootDayById.get(list.shoot_day_id) : undefined
      const pdfBytes = await generateEquipmentListPdf({
        productionName,
        list,
        listItems: items,
        equipmentById,
        shootDay: shootDay
          ? {
              shootDate: shootDay.shoot_date,
              dayNumber: shootDay.day_number,
              totalShootDays: shootDays.length > 0 ? shootDays.length : null,
            }
          : null,
        paperSize,
      })
      const fileName = `equipment-checklist-${list.name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.pdf`
      const bytes = new Uint8Array(pdfBytes)
      await persistProductionDocument({
        productionId,
        fileName,
        bytes,
        mimeType: 'application/pdf',
        entityType: DOCUMENT_ENTITY_TYPES.equipmentChecklistPdf,
        entityId: list.id,
      })
      await saveFileWithDialog(
        {
          defaultPath: fileName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Export a copy of equipment checklist PDF',
        },
        bytes
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
    },
  })

  const exportCsvMutation = useMutation({
    mutationFn: async () => {
      if (!list) return
      const equipmentById = new Map(equipment.map((e) => [e.id, e]))
      const csv = exportEquipmentListToCsv(items, equipmentById)
      const fileName = `equipment-list-${list.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase().slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`
      await persistProductionDocument({
        productionId,
        fileName,
        bytes: csv,
        mimeType: 'text/csv',
        entityType: DOCUMENT_ENTITY_TYPES.equipmentListCsv,
        entityId: list.id,
        isText: true,
      })
      await saveFileWithDialog(
        {
          defaultPath: fileName,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
          title: 'Export a copy of equipment list CSV',
        },
        csv,
        true
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey(productionId) })
    },
  })

  const [importReview, setImportReview] = useState<MatchResult | null>(null)
  const [importParseErrors, setImportParseErrors] = useState<string[]>([])
  const [createdFromImport, setCreatedFromImport] = useState<Map<number, Equipment>>(new Map())
  const [newRowCreateIndex, setNewRowCreateIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showImportErrorDialog, setShowImportErrorDialog] = useState(false)

  const handleImportCsvFile = async (file: File) => {
    const text = await file.text()
    const { rows, errors } = parseEquipmentListCsv(text)
    if (errors.length > 0) {
      setImportParseErrors(errors)
      setImportReview(null)
      setShowImportErrorDialog(true)
      return
    }
    if (rows.length === 0) {
      setImportParseErrors(['No data rows found.'])
      setImportReview(null)
      setShowImportErrorDialog(true)
      return
    }
    setImportParseErrors([])
    const result = matchParsedRowsToRegistry(rows, equipment)
    setImportReview(result)
    setCreatedFromImport(new Map())
  }

  const addToListMutation = useMutation({
    mutationFn: async () => {
      if (!importReview) return
      const toAdd: Array<{ equipment: Equipment; quantity: number }> = [
        ...importReview.matched.map((m) => ({
          equipment: m.equipment,
          quantity: m.row.quantity ?? 1,
        })),
        ...importReview.new.flatMap((row, i) => {
          const eq = createdFromImport.get(i)
          return eq ? [{ equipment: eq, quantity: row.quantity ?? 1 }] : []
        }),
      ]
      let sortOrder = await getMaxSortOrderForList(listId)
      const alreadyOnList = new Set(items.map((i) => i.equipment_id))
      for (const { equipment: eq, quantity } of toAdd) {
        if (alreadyOnList.has(eq.id)) continue
        await addEquipmentItemToList({
          equipment_list_id: listId,
          equipment_id: eq.id,
          sort_order: sortOrder,
          quantity,
        })
        sortOrder += 1
        alreadyOnList.add(eq.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipmentListItems', listId] })
      queryClient.invalidateQueries({ queryKey: ['equipment', productionId] })
      setImportReview(null)
      setCreatedFromImport(new Map())
      setNewRowCreateIndex(null)
    },
  })

  const moveItem = (itemId: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((i) => i.id === itemId)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === items.length - 1) return
    const newOrder = [...items.map((i) => i.id)]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    ;[newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]]
    reorderMutation.mutate(newOrder)
  }

  if (!list) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to lists">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {editingList ? (
            <EditListForm
              list={list}
              departmentOptions={departmentOptions}
              shootDays={shootDays}
              onSave={(patch) => updateListMutation.mutate(patch)}
              onCancel={() => setEditingList(false)}
              isLoading={updateListMutation.isPending}
            />
          ) : (
            <div>
              <h2 className="text-lg font-semibold truncate">{list.name}</h2>
              <p className="text-sm text-muted-foreground">
                {list.shoot_day_id ? `Shoot day: ${shootDayById.get(list.shoot_day_id)?.shoot_date ?? '—'}` : ''}
                {list.department ? ` · ${list.department}` : ''}
              </p>
              {list.notes && <p className="text-sm text-muted-foreground mt-1">{list.notes}</p>}
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEditingList(true)}>
                <Pencil className="mr-1 size-3" /> Edit list
              </Button>
            </div>
          )}
        </div>
      </div>

      {overStockItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Insufficient stock in registry</AlertTitle>
          <AlertDescription>
            {overStockItems.length} item(s) request more units than available:{' '}
            {overStockItems.map(({ equipment }) => equipment.name).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleImportCsvFile(file)
            e.target.value = ''
          }
        }}
      />
      <div className="flex gap-2">
        <Select
          value={paperSize}
          onValueChange={(value) => {
            if (isPaperSize(value)) setPaperSize(value)
          }}
        >
          <SelectTrigger size="sm" className="w-[110px]" aria-label="PDF paper size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
              <SelectItem key={size} value={size}>
                {PAPER_SIZES[size].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportPdfMutation.mutate()}
          disabled={exportPdfMutation.isPending}
        >
          <FileDown className="mr-2 size-4" />
          {exportPdfMutation.isPending ? 'Exporting…' : 'Export PDF'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsvMutation.mutate()}
          disabled={exportCsvMutation.isPending}
        >
          <FileDown className="mr-2 size-4" />
          {exportCsvMutation.isPending ? 'Exporting…' : 'Export CSV'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus className="mr-2 size-4" />
          Import CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            addItemsMutation.reset()
            setAddOpen(true)
          }}
        >
          <Plus className="mr-2 size-4" />
          Add from registry
        </Button>
        <AddFromRegistryDialog
          open={addOpen}
          onOpenChange={(o) => {
            if (!addItemsMutation.isPending) setAddOpen(o)
          }}
          listName={list.name}
          equipment={equipment}
          onListIds={itemIdsOnList}
          departmentOptions={departmentOptions}
          onAdd={(additions) => addItemsMutation.mutate(additions)}
          isAdding={addItemsMutation.isPending}
          errorMessage={
            addItemsMutation.error
              ? `Could not add items: ${addItemsMutation.error instanceof Error ? addItemsMutation.error.message : String(addItemsMutation.error)}`
              : null
          }
        />

        <Dialog open={showImportErrorDialog} onOpenChange={setShowImportErrorDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import failed</DialogTitle>
            </DialogHeader>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {importParseErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => setShowImportErrorDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={importReview !== null}
          onOpenChange={(open) => {
            if (!open) {
              setImportReview(null)
              setCreatedFromImport(new Map())
              setNewRowCreateIndex(null)
            }
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import CSV — review</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4 min-h-0">
              {importReview && (
                <>
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Matched existing equipment ({importReview.matched.length}) — will be added to list
                    </h3>
                    {importReview.matched.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None.</p>
                    ) : (
                      <ul className="text-sm space-y-1 border rounded-md p-2 bg-muted/30 max-h-32 overflow-auto">
                        {importReview.matched.map((m, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>{m.equipment.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{shortItemUuid(m.equipment.item_uuid)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      New / unknown ({importReview.new.length}) — create as equipment to add
                    </h3>
                    <p className="text-xs text-muted-foreground mb-2">
                      These rows have no matching item_uuid in the registry. Create them as new equipment to add to this list.
                    </p>
                    {importReview.new.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None.</p>
                    ) : (
                      <ul className="space-y-2 border rounded-md p-2 bg-muted/30 max-h-40 overflow-auto">
                        {importReview.new.map((row, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{row.name ?? 'Unnamed'}</span>
                            {createdFromImport.has(i) ? (
                              <Badge variant="secondary" className="shrink-0">Created</Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setNewRowCreateIndex(i)}
                              >
                                Create
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setImportReview(null); setCreatedFromImport(new Map()); setNewRowCreateIndex(null) }}>
                Cancel
              </Button>
              <Button
                onClick={() => addToListMutation.mutate()}
                disabled={
                  !importReview ||
                  addToListMutation.isPending ||
                  (importReview.matched.length === 0 && importReview.new.every((_, i) => !createdFromImport.has(i)))
                }
              >
                {addToListMutation.isPending ? 'Adding…' : 'Add to list'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {importReview && newRowCreateIndex !== null && (
          <CreateEquipmentFromCsvRowDialog
            row={importReview.new[newRowCreateIndex]!}
            productionId={productionId}
            departmentOptions={departmentOptions}
            onCreated={(eq) => {
              setCreatedFromImport((prev) => new Map(prev).set(newRowCreateIndex, eq))
              setNewRowCreateIndex(null)
              queryClient.invalidateQueries({ queryKey: ['equipment', productionId] })
            }}
            onCancel={() => setNewRowCreateIndex(null)}
          />
        )}
      </div>

      <div className="rounded-md border overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>UUID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead className="w-20 text-center">Qty</TableHead>
              <TableHead className="text-center w-28">OUT</TableHead>
              <TableHead className="text-center w-28">IN</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No items on this list. Use <strong>Add from registry</strong> to pick equipment.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => {
                const eq = equipmentById.get(item.equipment_id)
                const checked = item.checked_out && item.checked_back_in
                const overStock = isListQuantityOverRegistry(item.quantity, eq?.quantity)
                return (
                  <TableRow
                    key={item.id}
                    className={cn(
                      (item.checked_out || item.checked_back_in) && 'bg-muted/30',
                      checked && 'bg-muted/50'
                    )}
                  >
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Move up"
                          disabled={index === 0 || reorderMutation.isPending}
                          onClick={() => moveItem(item.id, 'up')}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Move down"
                          disabled={index === items.length - 1 || reorderMutation.isPending}
                          onClick={() => moveItem(item.id, 'down')}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{eq?.name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{eq ? shortItemUuid(eq.item_uuid) : '—'}</TableCell>
                    <TableCell>{eq ? formatEquipmentCategoryLabel(eq.category) : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{eq?.serial_number ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          key={`${item.id}-${item.quantity}`}
                          defaultValue={item.quantity}
                          aria-invalid={overStock || undefined}
                          className={cn(
                            'w-16 h-8 text-center',
                            overStock && 'text-destructive border-destructive'
                          )}
                          onBlur={(e) => {
                            const parsed = parseInt(e.target.value, 10)
                            if (Number.isInteger(parsed) && parsed >= 1 && parsed !== item.quantity) {
                              updateItemMutation.mutate({ itemId: item.id, patch: { quantity: parsed } })
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                        />
                        {eq && eq.quantity > 1 && (
                          <span className="text-[10px] text-muted-foreground leading-none">
                            {eq.quantity} in registry
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={item.checked_out ? 'default' : 'outline'}
                        size="icon"
                        className="h-10 w-10"
                        aria-label={item.checked_out ? 'Mark not out' : 'Mark out'}
                        onClick={() => updateItemMutation.mutate({ itemId: item.id, patch: { checked_out: item.checked_out ? 0 : 1 } })}
                      >
                        {item.checked_out ? <CheckSquare className="size-5" /> : <Package className="size-5" />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={item.checked_back_in ? 'default' : 'outline'}
                        size="icon"
                        className="h-10 w-10"
                        aria-label={item.checked_back_in ? 'Mark not back in' : 'Mark back in'}
                        onClick={() => updateItemMutation.mutate({ itemId: item.id, patch: { checked_back_in: item.checked_back_in ? 0 : 1 } })}
                      >
                        {item.checked_back_in ? <CheckSquare className="size-5" /> : <Package className="size-5" />}
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-muted-foreground text-sm">{item.notes ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
                          aria-label="Remove from list"
                          onClick={() => removeItemMutation.mutate(item.id)}
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
    </div>
  )
}

function EditListForm({
  list,
  departmentOptions,
  shootDays,
  onSave,
  onCancel,
  isLoading,
}: {
  list: EquipmentList
  departmentOptions: string[]
  shootDays: { id: string; shoot_date: string }[]
  onSave: (patch: Parameters<typeof updateEquipmentList>[1]) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<{ name: string; shoot_day_id: string; department: string; notes: string }>({
    defaultValues: {
      name: list.name,
      shoot_day_id: list.shoot_day_id ?? '__none__',
      department: list.department ?? '',
      notes: list.notes ?? '',
    },
  })
  return (
    <form
      onSubmit={form.handleSubmit((d) =>
        onSave({
          name: d.name.trim(),
          shoot_day_id: d.shoot_day_id?.trim() === '__none__' || !d.shoot_day_id?.trim() ? null : d.shoot_day_id.trim(),
          department: d.department?.trim() || null,
          notes: d.notes?.trim() || null,
        })
      )}
      className="space-y-2"
    >
      <Input {...form.register('name')} placeholder="List name" className="h-9" />
      <div className="flex gap-2 flex-wrap">
        <Select
          value={form.watch('shoot_day_id') || '__none__'}
          onValueChange={(v) => form.setValue('shoot_day_id', v)}
        >
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Shoot day" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {shootDays.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.shoot_date}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={form.watch('department')?.trim() || '__none__'}
          onValueChange={(v) => form.setValue('department', v === '__none__' ? '' : v)}
        >
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input {...form.register('notes')} placeholder="Notes" className="h-9" />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isLoading}>Save</Button>
      </div>
    </form>
  )
}
