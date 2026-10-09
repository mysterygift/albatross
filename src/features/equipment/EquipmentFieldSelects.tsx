import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Equipment, EquipmentCategory, EquipmentStatus } from '@/lib/db/types'
import { EQUIPMENT_CATEGORY_VALUES, EQUIPMENT_STATUS_VALUES } from '@/lib/db/types'
import { formatEquipmentLabel, formatEquipmentCategoryLabel } from '@/features/equipment/formatEquipmentLabel'

/**
 * Selects shared by the single-item and bulk equipment editors.
 * `mixed` shows a "Mixed" placeholder instead of a value (bulk edit, values differ across items).
 */
type FieldSelectProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  mixed?: boolean
  id?: string
}

export function EquipmentCategorySelect({ value, onValueChange, mixed, id }: FieldSelectProps<EquipmentCategory>) {
  return (
    <Select value={mixed ? '' : value} onValueChange={(v) => onValueChange(v as EquipmentCategory)}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Mixed" /></SelectTrigger>
      <SelectContent>
        {EQUIPMENT_CATEGORY_VALUES.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {formatEquipmentCategoryLabel(cat)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function EquipmentSourceSelect({ value, onValueChange, mixed, id }: FieldSelectProps<Equipment['source_type']>) {
  return (
    <Select value={mixed ? '' : value} onValueChange={(v) => onValueChange(v as Equipment['source_type'])}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Mixed" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="owned">{formatEquipmentLabel('owned')}</SelectItem>
        <SelectItem value="purchased">{formatEquipmentLabel('purchased')}</SelectItem>
        <SelectItem value="rented">{formatEquipmentLabel('rented')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function EquipmentStatusSelect({ value, onValueChange, mixed, id }: FieldSelectProps<EquipmentStatus>) {
  return (
    <Select value={mixed ? '' : value} onValueChange={(v) => onValueChange(v as EquipmentStatus)}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Mixed" /></SelectTrigger>
      <SelectContent>
        {EQUIPMENT_STATUS_VALUES.map((s) => (
          <SelectItem key={s} value={s}>{formatEquipmentLabel(s)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Department picker; '' means none. Keeps an off-hierarchy current value selectable. */
export function EquipmentDepartmentSelect({
  value,
  onValueChange,
  mixed,
  id,
  departmentOptions,
}: FieldSelectProps<string> & { departmentOptions: string[] }) {
  const current = value.trim()
  const options = useMemo(() => {
    const opts = [...departmentOptions]
    if (current && !opts.includes(current)) opts.unshift(current)
    return opts
  }, [departmentOptions, current])
  return (
    <Select
      value={mixed ? '' : current || '__none__'}
      onValueChange={(v) => onValueChange(v === '__none__' ? '' : v)}
    >
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={mixed ? 'Mixed' : 'Optional'} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {options.map((d) => (
          <SelectItem key={d} value={d}>{d}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
