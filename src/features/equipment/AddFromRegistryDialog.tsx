import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Equipment } from '@/lib/db/types'
import { EQUIPMENT_CATEGORY_VALUES } from '@/lib/db/types'
import { isListQuantityOverRegistry } from '@/lib/equipment/listQuantity'
import { filterEquipmentRegistry } from '@/lib/equipment/registryFilter'
import {
  buildRegistryPickerAdditions,
  normalisePickerQuantity,
  type RegistryPickerAddition,
} from '@/lib/equipment/registryPicker'
import {
  formatEquipmentLabel,
  formatEquipmentCategoryLabel,
  shortItemUuid,
} from '@/features/equipment/formatEquipmentLabel'
import { isMobilePlatform } from '@/lib/platform'
import { usePhoneWidth } from '@/hooks/use-is-phone'
import { cn } from '@/lib/utils'

/**
 * Search/filter the whole registry, tick several items, set a quantity for each, and add them
 * to an equipment list in one go. Ticks survive filter changes so a kit can be built up across
 * several searches.
 */
export function AddFromRegistryDialog({
  open,
  onOpenChange,
  listName,
  equipment,
  onListIds,
  departmentOptions,
  onAdd,
  isAdding,
  errorMessage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  listName: string
  equipment: Equipment[]
  onListIds: ReadonlySet<string>
  departmentOptions: string[]
  onAdd: (additions: RegistryPickerAddition[]) => void
  isAdding: boolean
  errorMessage?: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-4xl" data-touch-targets>
        {open && (
          <AddFromRegistryPicker
            listName={listName}
            equipment={equipment}
            onListIds={onListIds}
            departmentOptions={departmentOptions}
            onAdd={onAdd}
            onCancel={() => onOpenChange(false)}
            isAdding={isAdding}
            errorMessage={errorMessage}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddFromRegistryPicker({
  listName,
  equipment,
  onListIds,
  departmentOptions,
  onAdd,
  onCancel,
  isAdding,
  errorMessage,
}: {
  listName: string
  equipment: Equipment[]
  onListIds: ReadonlySet<string>
  departmentOptions: string[]
  onAdd: (additions: RegistryPickerAddition[]) => void
  onCancel: () => void
  isAdding: boolean
  errorMessage?: string | null
}) {
  // On a phone the table drops to three columns; category, department and stock go under the name.
  const phone = usePhoneWidth()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [department, setDepartment] = useState('')
  const [source, setSource] = useState('')
  const [hideOnList, setHideOnList] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  /** Raw quantity text per item; kept when an item is unticked so re-ticking restores it. */
  const [quantities, setQuantities] = useState<Map<string, string>>(() => new Map())

  const visible = useMemo(() => {
    const filtered = filterEquipmentRegistry(equipment, { search, category, department, source })
    return hideOnList ? filtered.filter((e) => !onListIds.has(e.id)) : filtered
  }, [equipment, search, category, department, source, hideOnList, onListIds])
  const visibleAvailable = useMemo(() => visible.filter((e) => !onListIds.has(e.id)), [visible, onListIds])

  const selectedQuantities = useMemo(() => {
    const m = new Map<string, number>()
    for (const id of selected) m.set(id, normalisePickerQuantity(quantities.get(id)))
    return m
  }, [selected, quantities])
  const additions = useMemo(
    () => buildRegistryPickerAdditions(equipment, selectedQuantities, onListIds),
    [equipment, selectedQuantities, onListIds]
  )
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const totalUnits = additions.reduce((sum, a) => sum + a.quantity, 0)
  const overStockCount = additions.filter((a) =>
    isListQuantityOverRegistry(a.quantity, equipmentById.get(a.equipment_id)?.quantity)
  ).length
  const visibleIds = useMemo(() => new Set(visible.map((e) => e.id)), [visible])
  const hiddenSelectedCount = additions.filter((a) => !visibleIds.has(a.equipment_id)).length

  const allVisibleSelected = visibleAvailable.length > 0 && visibleAvailable.every((e) => selected.has(e.id))
  const someVisibleSelected = visibleAvailable.some((e) => selected.has(e.id))

  const setTicked = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const toggleAllVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const e of visibleAvailable) {
        if (on) next.add(e.id)
        else next.delete(e.id)
      }
      return next
    })

  const filtersActive = !!(search.trim() || category || department || source)

  return (
    <>
      <DialogHeader>
        <DialogTitle className={cn(phone && 'pr-8')}>
          {phone ? 'Add to' : 'Add equipment to'} &ldquo;{listName}&rdquo;
        </DialogTitle>
        {/* On a phone the list needs the room; screen readers still get the description. */}
        <DialogDescription className={cn(phone && 'sr-only')}>
          Search the registry, tick the items you need and set how many of each. Ticked items stay ticked
          when you change the search.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className={cn('relative flex-1 min-w-[180px]', phone && 'basis-full')}>
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={!isMobilePlatform()}
            placeholder="Search name, UUID, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            aria-label="Search registry"
          />
        </div>
        <Select value={category || '__all__'} onValueChange={(v) => setCategory(v === '__all__' ? '' : v)}>
          <SelectTrigger className={cn('h-9', phone ? 'grow basis-[9rem]' : 'w-[140px]')} aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {EQUIPMENT_CATEGORY_VALUES.map((c) => (
              <SelectItem key={c} value={c}>{formatEquipmentCategoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={department || '__all__'} onValueChange={(v) => setDepartment(v === '__all__' ? '' : v)}>
          <SelectTrigger className={cn('h-9', phone ? 'grow basis-[9rem]' : 'w-[160px]')} aria-label="Filter by department">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All departments</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source || '__all__'} onValueChange={(v) => setSource(v === '__all__' ? '' : v)}>
          <SelectTrigger className={cn('h-9', phone ? 'grow basis-[9rem]' : 'w-[120px]')} aria-label="Filter by source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            <SelectItem value="owned">{formatEquipmentLabel('owned')}</SelectItem>
            <SelectItem value="purchased">{formatEquipmentLabel('purchased')}</SelectItem>
            <SelectItem value="rented">{formatEquipmentLabel('rented')}</SelectItem>
          </SelectContent>
        </Select>
        <div className={cn('flex items-center gap-2', phone && 'basis-full')}>
          <Checkbox
            id="picker-hide-on-list"
            checked={hideOnList}
            onCheckedChange={(v) => setHideOnList(v === true)}
          />
          <Label htmlFor="picker-hide-on-list" className="font-normal text-sm cursor-pointer">
            Hide items already on list
          </Label>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                  onCheckedChange={(v) => toggleAllVisible(v === true)}
                  disabled={visibleAvailable.length === 0}
                  aria-label="Select all shown items"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              {!phone && (
                <>
                  <TableHead>Category</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>UUID</TableHead>
                  <TableHead className="text-right">In registry</TableHead>
                </>
              )}
              <TableHead className={cn('text-center', phone ? 'w-20' : 'w-28')}>{phone ? 'Qty' : 'Qty to add'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={phone ? 3 : 7} className="text-center text-muted-foreground py-8 whitespace-normal">
                  {equipment.length === 0
                    ? 'The registry is empty. Add equipment on the Registry tab first.'
                    : filtersActive
                      ? 'No registry items match the current search and filters.'
                      : 'Every registry item is already on this list.'}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((e) => {
                const onList = onListIds.has(e.id)
                const ticked = selected.has(e.id)
                const qtyText = quantities.get(e.id) ?? '1'
                const overStock = ticked && isListQuantityOverRegistry(normalisePickerQuantity(qtyText), e.quantity)
                return (
                  <TableRow
                    key={e.id}
                    data-state={ticked ? 'selected' : undefined}
                    aria-disabled={onList || undefined}
                    data-slot="registry-picker-row"
                    className={cn(onList ? 'text-muted-foreground' : 'cursor-pointer')}
                    onClick={() => {
                      if (!onList) setTicked(e.id, !ticked)
                    }}
                  >
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox
                        checked={ticked}
                        disabled={onList}
                        onCheckedChange={(v) => setTicked(e.id, v === true)}
                        aria-label={`Select ${e.name}`}
                      />
                    </TableCell>
                    <TableCell className={cn('font-medium', phone && 'whitespace-normal')}>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {e.name}
                        {onList && <Badge variant="outline" className="font-normal text-xs">On list</Badge>}
                      </span>
                      {phone && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {[formatEquipmentCategoryLabel(e.category), e.department?.trim(), `${e.quantity ?? 1} in registry`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </TableCell>
                    {!phone && (
                      <>
                        <TableCell>{formatEquipmentCategoryLabel(e.category)}</TableCell>
                        <TableCell>{e.department?.trim() || '—'}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{shortItemUuid(e.item_uuid)}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.quantity ?? 1}</TableCell>
                      </>
                    )}
                    <TableCell className="text-center" onClick={(ev) => ev.stopPropagation()}>
                      {onList ? (
                        '—'
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={qtyText}
                            aria-label={`Quantity of ${e.name}`}
                            aria-invalid={overStock || undefined}
                            className={cn('w-16 h-8 text-center', overStock && 'text-destructive border-destructive')}
                            onChange={(ev) => {
                              const text = ev.target.value
                              setQuantities((prev) => new Map(prev).set(e.id, text))
                              setTicked(e.id, true)
                            }}
                          />
                          {overStock && (
                            <span className="text-[10px] text-destructive leading-none">
                              {phone ? `Only ${e.quantity}` : `Only ${e.quantity} in registry`}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <DialogFooter className={cn('sm:items-center', phone && 'flex-row flex-wrap')}>
        <p className={cn('text-sm text-muted-foreground sm:mr-auto', phone && 'basis-full')} aria-live="polite">
          {additions.length === 0
            ? 'No items selected'
            : `${additions.length} selected · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`}
          {hiddenSelectedCount > 0 && ` (${hiddenSelectedCount} hidden by filters)`}
          {overStockCount > 0 && (
            <span className="text-destructive">
              {' '}· {overStockCount} over registry stock
            </span>
          )}
        </p>
        {additions.length > 0 && (
          <Button type="button" variant="ghost" className={cn(phone && 'flex-1')} onClick={() => setSelected(new Set())}>
            {phone ? 'Clear' : 'Clear selection'}
          </Button>
        )}
        <Button type="button" variant="outline" className={cn(phone && 'flex-1')} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className={cn(phone && 'flex-1')}
          onClick={() => onAdd(additions)}
          disabled={additions.length === 0 || isAdding}
        >
          {isAdding
            ? 'Adding…'
            : additions.length === 0
              ? 'Add items'
              : `Add ${additions.length} item${additions.length === 1 ? '' : 's'}`}
        </Button>
      </DialogFooter>
    </>
  )
}
