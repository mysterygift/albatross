/**
 * Format enum-style equipment values for human-readable display.
 * Does not change stored values or database enums.
 * e.g. camera_accessory → Camera Accessory, rented → Rented
 */
export function formatEquipmentLabel(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
