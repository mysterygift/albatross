import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PurchaseOrderStatusBadge } from '@/features/budget/vendors/PurchaseOrderStatusBadge'
import { formatPoAmount, formatPoDerivedAmount } from '@/lib/budget/vendors/poCurrency'
import { filterPoPickerRows, type PoPickerRow } from '@/lib/budget/vendors/poPicker'
import { cn } from '@/lib/utils'

export type PurchaseOrderComboboxProps = {
  rows: PoPickerRow[]
  selectedIds: readonly string[]
  /** Toggle a PO in / out of the selection. */
  onToggle: (row: PoPickerRow) => void
  /** Vendor currently on the expense; scopes the list unless "search all vendors" is ticked. */
  vendorId: string | null
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  /** The vendor cannot change (editing an existing expense): never offer "Search all vendors". */
  vendorLocked?: boolean
  disabled?: boolean
  id?: string
}

/** Multi-select PO search: number, description or vendor name. Stays open while picking. */
export function PurchaseOrderCombobox({
  rows,
  selectedIds,
  onToggle,
  vendorId,
  productionCurrency,
  format,
  vendorLocked = false,
  disabled,
  id,
}: PurchaseOrderComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [searchAllVendors, setSearchAllVendors] = useState(false)

  const visible = useMemo(
    () => filterPoPickerRows(rows, {
        query,
        vendorId,
        searchAllVendors: searchAllVendors && !vendorLocked,
        includeInactive,
        selectedIds,
      }),
    [rows, query, vendorId, searchAllVendors, vendorLocked, includeInactive, selectedIds]
  )
  const selected = new Set(selectedIds)
  const scoped = vendorId != null && (vendorLocked || !searchAllVendors)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate text-muted-foreground">
            {selectedIds.length > 0
              ? 'Add another purchase order'
              : 'Search by PO number, description or vendor'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search PO number, description or vendor…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {scoped ? 'No purchase orders for this vendor.' : 'No purchase orders found.'}
            </CommandEmpty>
            <CommandGroup>
              {visible.map((row) => {
                const isSelected = selected.has(row.id)
                return (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => onToggle(row)}
                    className="items-start gap-2"
                  >
                    <Check
                      className={cn('mt-0.5 size-4', isSelected ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{row.poNumber}</span>
                        <PurchaseOrderStatusBadge status={row.status} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.vendorName}
                        {row.description ? ` · ${row.description}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      {row.amount != null && row.poAmount != null ? (
                        <>
                          <p>{formatPoAmount(row, row.poAmount, { productionCurrency, format })}</p>
                          <p
                            className={cn(
                              'text-muted-foreground',
                              row.remaining != null && row.remaining < 0 && 'text-destructive'
                            )}
                          >
                            {row.remaining != null
                              ? `${formatPoDerivedAmount(row, row.remaining, { productionCurrency, format })} left`
                              : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">No value</p>
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex flex-col gap-1.5 border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="po-combobox-inactive"
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(v === true)}
            />
            <Label htmlFor="po-combobox-inactive" className="text-xs font-normal">
              Include draft, closed and cancelled
            </Label>
          </div>
          {vendorId != null && !vendorLocked && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="po-combobox-all-vendors"
                checked={searchAllVendors}
                onCheckedChange={(v) => setSearchAllVendors(v === true)}
              />
              <Label htmlFor="po-combobox-all-vendors" className="text-xs font-normal">
                Search all vendors
              </Label>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
