import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, FileDown, MoreHorizontal, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { RequireProduction } from '@/components/require-production'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DuplicateRamsDialog } from '@/features/risk-assessments/DuplicateRamsDialog'
import { NewRamsDialog } from '@/features/risk-assessments/NewRamsDialog'
import { RamsStatusBadge } from '@/features/risk-assessments/RamsStatusBadge'
import { RiskFactorPill } from '@/features/risk-assessments/RiskFactorPill'
import { UnitChip } from '@/features/risk-assessments/UnitChip'
import { exportRamsPdfWithSaveDialog } from '@/features/risk-assessments/exportRamsPdf'
import { RAMS_QUERY_KEY, ramsListKey } from '@/features/risk-assessments/ramsForm'
import { useCurrentProduction } from '@/features/productions/context'
import {
  deleteRiskAssessment,
  listRiskAssessmentsByProduction,
  type RiskAssessmentSummary,
} from '@/lib/db/repositories/risk-assessments'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import type { Unit } from '@/lib/db/types'
import { documentsQueryKey } from '@/lib/documents/persistDocument'
import { sortUnitsForDisplay } from '@/lib/schedule/unitKey'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'draft' | 'approved'

/** Stable empty defaults: a fresh `[]` each render makes react-table (and the memos) re-run forever. */
const NO_ROWS: RiskAssessmentSummary[] = []
const NO_UNITS: Unit[] = []

function SortHeader({
  label,
  column,
}: {
  label: string
  column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void }
}) {
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <button
      type="button"
      className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      <Icon className={cn('size-3.5', !sorted && 'opacity-50')} aria-hidden="true" />
    </button>
  )
}

function dayLabel(r: RiskAssessmentSummary): string {
  return r.day_number != null ? `Day ${r.day_number} · ${r.shoot_date}` : r.shoot_date
}

export function RiskAssessmentsPage() {
  const { currentProductionId } = useCurrentProduction()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: false }])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [duplicateTarget, setDuplicateTarget] = useState<RiskAssessmentSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RiskAssessmentSummary | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const { data: rows = NO_ROWS, isLoading } = useQuery({
    queryKey: ramsListKey(currentProductionId),
    queryFn: () => listRiskAssessmentsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const { data: units = NO_UNITS } = useQuery({
    queryKey: ['units', currentProductionId],
    queryFn: () => listUnitsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units])

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === 'all' || r.status === statusFilter) &&
          (unitFilter === 'all' || r.units.some((u) => u.unit_id === unitFilter))
      ),
    [rows, statusFilter, unitFilter]
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRiskAssessment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RAMS_QUERY_KEY] })
      if (currentProductionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
      toast.success('Risk assessment deleted')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete risk assessment'),
  })

  const exportPdf = async (r: RiskAssessmentSummary) => {
    setExportingId(r.id)
    try {
      await exportRamsPdfWithSaveDialog(r.id)
      toast.success('Risk assessment PDF saved to Documents')
      void queryClient.invalidateQueries({ queryKey: [RAMS_QUERY_KEY] })
      if (currentProductionId) void queryClient.invalidateQueries({ queryKey: documentsQueryKey(currentProductionId) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export PDF')
    } finally {
      setExportingId(null)
    }
  }

  const columns = useMemo<ColumnDef<RiskAssessmentSummary>[]>(
    () => [
      {
        id: 'date',
        accessorFn: (r) => `${r.shoot_date}|${r.created_at}`,
        header: ({ column }) => <SortHeader label="Date" column={column} />,
        cell: ({ row }) => (
          <Link to={`/risk-assessments/${row.original.id}`} className="font-medium hover:underline">
            {dayLabel(row.original)}
          </Link>
        ),
      },
      {
        id: 'location',
        accessorFn: (r) => r.location_name.trim() || undefined,
        sortUndefined: 'last',
        header: ({ column }) => <SortHeader label="Location" column={column} />,
        cell: ({ row }) =>
          row.original.location_name.trim() || <span className="text-muted-foreground">No location</span>,
        sortingFn: (a, b, id) => String(a.getValue(id)).localeCompare(String(b.getValue(id)), undefined, { sensitivity: 'base' }),
      },
      {
        id: 'units',
        header: 'Units',
        enableSorting: false,
        cell: ({ row }) => {
          const names = sortUnitsForDisplay(
            row.original.units.map((u) => ({ name: unitName.get(u.unit_id) ?? 'Unit' }))
          ).map((u) => u.name)
          return (
            <div className="flex flex-wrap gap-1">
              {names.length === 0 ? <span className="text-muted-foreground">—</span> : names.map((n) => <UnitChip key={n} name={n} />)}
            </div>
          )
        },
      },
      {
        id: 'hazards',
        header: 'Hazards',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.hazard_count}</span>,
      },
      {
        id: 'residual',
        header: 'Highest residual risk',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.max_residual_factor == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <RiskFactorPill factor={row.original.max_residual_factor} />
          ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <RamsStatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${dayLabel(r)}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => navigate(`/risk-assessments/${r.id}`)}>
                  <Pencil className="size-4" /> Open
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDuplicateTarget(r)}>
                  <Copy className="size-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem disabled={exportingId === r.id} onSelect={() => void exportPdf(r)}>
                  <FileDown className="size-4" /> Export PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(r)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitName, exportingId, navigate]
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (!currentProductionId) return <RequireProduction title="Risk Assessments">{null}</RequireProduction>

  const hasRows = rows.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Assessments"
        description="Risk assessments and method statements (RAMS) for each shoot day."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New risk assessment
          </Button>
        }
      />

      {hasRows ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="w-44" aria-label="Filter by unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2" aria-label="Loading risk assessments">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !hasRows ? (
        <EmptyState
          icon={ShieldAlert}
          title="No risk assessments yet"
          description="Create a risk assessment for a shoot day, sign it off, and export it as a PDF."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New risk assessment
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching risk assessments" description="Try changing the status or unit filter." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      aria-sort={
                        h.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : h.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewRamsDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        productionId={currentProductionId}
        onCreated={(id) => navigate(`/risk-assessments/${id}`)}
      />
      <DuplicateRamsDialog
        open={!!duplicateTarget}
        onOpenChange={(open) => !open && setDuplicateTarget(null)}
        productionId={currentProductionId}
        riskAssessmentId={duplicateTarget?.id ?? null}
        sourceShootDayId={duplicateTarget?.shoot_day_id ?? null}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete risk assessment?"
        description="This permanently deletes the risk assessment, its hazards and its exported PDF. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.id)
        }}
      />
    </div>
  )
}
