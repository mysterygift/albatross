/**
 * Invoice-context-driven equipment ingestion modal.
 * No invoice line items: user adds one or more candidate rows manually, then chooses
 * create new / link to existing / skip per row. Created/linked items get vendor_id and invoice_id.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import {
  createEquipmentFromInvoiceContext,
  linkExistingEquipmentToInvoice,
  type InvoiceEquipmentRowData,
} from '@/lib/db/equipmentInvoiceIngestionService'
import type { Equipment, EquipmentCategory, VendorInvoice } from '@/lib/db/types'
import { EQUIPMENT_CATEGORY_VALUES } from '@/lib/db/types'
import { Plus, Trash2 } from 'lucide-react'

type RowAction = 'create' | 'link' | 'skip'

type CandidateRow = {
  id: string
  name: string
  category: EquipmentCategory
  source_type: Equipment['source_type']
  department: string
  rental_start_date: string
  return_due_date: string
  serial_number: string
  notes: string
  replacement_value: string
  action: RowAction
  linkedEquipmentId: string
}

function defaultRow(): CandidateRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    category: 'other',
    source_type: 'rented',
    department: '',
    rental_start_date: '',
    return_due_date: '',
    serial_number: '',
    notes: '',
    replacement_value: '',
    action: 'create',
    linkedEquipmentId: '',
  }
}

export function IngestEquipmentFromInvoiceModal({
  open,
  onOpenChange,
  invoice,
  productionId,
  vendorName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: VendorInvoice
  productionId: string
  vendorName: string
}) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<CandidateRow[]>([defaultRow()])

  const { data: equipment = [] } = useQuery({
    queryKey: ['equipment', productionId],
    queryFn: () => listEquipmentByProduction(productionId),
    enabled: open && !!productionId,
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      const results: void[] = []
      for (const row of rows) {
        if (row.action === 'skip') continue
        if (row.action === 'create') {
          await createEquipmentFromInvoiceContext(
            productionId,
            invoice.vendor_id,
            invoice.id,
            rowToInvoiceRowData(row)
          )
        } else if (row.action === 'link' && row.linkedEquipmentId) {
          await linkExistingEquipmentToInvoice(
            row.linkedEquipmentId,
            invoice.vendor_id,
            invoice.id
          )
        }
      }
      return results
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onOpenChange(false)
      setRows([defaultRow()])
    },
  })

  const addRow = () => setRows((prev) => [...prev, defaultRow()])
  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
  const updateRow = (id: string, patch: Partial<CandidateRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )

  const canApply =
    rows.some(
      (r) =>
        r.action === 'create' && r.name.trim() !== ''
    ) ||
    rows.some((r) => r.action === 'link' && r.linkedEquipmentId !== '')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setRows([defaultRow()])
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle>Add equipment from invoice</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Invoice <span className="font-medium text-foreground">{invoice.invoice_number}</span>
          {vendorName && (
            <>
              {' · '}
              {vendorName}
            </>
          )}
          . Add rows below, then choose to create new equipment (with vendor/invoice link), link to existing equipment, or skip.
        </p>
        <div className="flex-1 overflow-auto min-h-0 border rounded-md border-border bg-muted/20 p-3 space-y-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded border border-border bg-card p-3 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Row</span>
                <div className="flex items-center gap-1">
                  <Select
                    value={row.action}
                    onValueChange={(v: RowAction) =>
                      updateRow(row.id, { action: v, linkedEquipmentId: v === 'link' ? row.linkedEquipmentId : '' })
                    }
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create">Create new</SelectItem>
                      <SelectItem value="link">Link existing</SelectItem>
                      <SelectItem value="skip">Skip</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => removeRow(row.id)}
                    aria-label="Remove row"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {row.action === 'link' && (
                <div>
                  <Label className="text-xs">Existing equipment</Label>
                  <Select
                    value={row.linkedEquipmentId || '_none'}
                    onValueChange={(v) =>
                      updateRow(row.id, { linkedEquipmentId: v === '_none' ? '' : v })
                    }
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Select —</SelectItem>
                      {equipment.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                          <span className="ml-2 text-muted-foreground font-mono text-xs">
                            {e.item_uuid.slice(0, 8)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {row.action === 'create' && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      className="mt-1 h-9"
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      placeholder="Item name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={row.category}
                      onValueChange={(v) => updateRow(row.id, { category: v as EquipmentCategory })}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EQUIPMENT_CATEGORY_VALUES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Select
                      value={row.source_type}
                      onValueChange={(v) =>
                        updateRow(row.id, { source_type: v as Equipment['source_type'] })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rented">Rented</SelectItem>
                        <SelectItem value="purchased">Purchased</SelectItem>
                        <SelectItem value="owned">Owned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Department</Label>
                    <Input
                      className="mt-1 h-9"
                      value={row.department}
                      onChange={(e) => updateRow(row.id, { department: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Rental start</Label>
                    <Input
                      type="date"
                      className="mt-1 h-9"
                      value={row.rental_start_date}
                      onChange={(e) => updateRow(row.id, { rental_start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Return due</Label>
                    <Input
                      type="date"
                      className="mt-1 h-9"
                      value={row.return_due_date}
                      onChange={(e) => updateRow(row.id, { return_due_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Serial number</Label>
                    <Input
                      className="mt-1 h-9"
                      value={row.serial_number}
                      onChange={(e) => updateRow(row.id, { serial_number: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Replacement value</Label>
                    <Input
                      type="number"
                      step={0.01}
                      min={0}
                      className="mt-1 h-9"
                      value={row.replacement_value}
                      onChange={(e) => updateRow(row.id, { replacement_value: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      className="mt-1 h-9"
                      value={row.notes}
                      onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 size-4" />
            Add row
          </Button>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!canApply || applyMutation.isPending}
            >
              {applyMutation.isPending ? 'Applying…' : 'Apply'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function rowToInvoiceRowData(row: CandidateRow): InvoiceEquipmentRowData {
  const rv = row.replacement_value?.trim()
  const replacement_value =
    rv === '' || rv == null ? null : (Number.isFinite(Number(rv)) ? Number(rv) : null)
  return {
    name: row.name,
    category: row.category,
    source_type: row.source_type,
    department: row.department?.trim() || null,
    rental_start_date: row.rental_start_date?.trim() || null,
    return_due_date: row.return_due_date?.trim() || null,
    serial_number: row.serial_number?.trim() || null,
    notes: row.notes?.trim() || null,
    replacement_value: replacement_value ?? null,
  }
}
