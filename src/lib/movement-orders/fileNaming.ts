function sanitizeFilePart(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getMovementOrderPdfFileName(
  shootDate: string,
  unitName: string
): string {
  const shootDatePart = sanitizeFilePart(shootDate || 'unknown-date') || 'unknown-date'
  const unitPart = sanitizeFilePart(unitName || 'unit') || 'unit'
  return `movement-order-${shootDatePart}-${unitPart}.pdf`
}
