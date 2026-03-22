import type { EquipmentCategory } from '@/lib/db/types'
import { EQUIPMENT_CATEGORY_VALUES } from '@/lib/db/types'

/** Human-readable display labels for canonical equipment categories. Single source of truth for UI. */
const EQUIPMENT_CATEGORY_DISPLAY_LABELS: Record<EquipmentCategory, string> = {
  camera: 'Camera',
  lenses: 'Lenses',
  camera_support: 'Camera Support',
  camera_accessories: 'Camera Accessories',
  wireless_systems: 'Wireless Systems',
  lighting: 'Lighting',
  lighting_accessories: 'Lighting Accessories',
  power_distribution: 'Power Distribution',
  grip: 'Grip',
  sound: 'Sound',
  dit_video_village: 'DIT / Video Village',
  production_logistics: 'Production Logistics',
  storage_cases: 'Storage / Cases',
  consumables: 'Consumables',
  other: 'Other',
}

/**
 * Format equipment category for display. Uses canonical labels (e.g. DIT / Video Village).
 * For unknown values, falls back to generic underscore-to-title formatting.
 */
export function formatEquipmentCategoryLabel(category: string | null | undefined): string {
  if (category == null || category === '') return '—'
  const canonical = EQUIPMENT_CATEGORY_VALUES.includes(category as EquipmentCategory)
  if (canonical) return EQUIPMENT_CATEGORY_DISPLAY_LABELS[category as EquipmentCategory]
  return formatEquipmentLabel(category)
}

/**
 * Format enum-style equipment values for human-readable display.
 * Does not change stored values or database enums.
 * e.g. camera_accessory → Camera Accessory, rented → Rented
 * For category, prefer formatEquipmentCategoryLabel for canonical labels.
 */
export function formatEquipmentLabel(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
