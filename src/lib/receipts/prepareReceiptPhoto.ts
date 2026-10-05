import { RECEIPT_MAX_EDGE_PX, scaledSize } from './receiptCapture'

export type PreparedReceiptFile = { bytes: Uint8Array; mimeType: string; name: string }

/** Photos at or under this size are stored as taken, even if larger than RECEIPT_MAX_EDGE_PX. */
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024
const JPEG_QUALITY = 0.85

/**
 * Reads a captured or chosen receipt file for storage. Large photos are scaled down to
 * RECEIPT_MAX_EDGE_PX on the longest edge and re-encoded as JPEG, which keeps small print legible
 * while saving space on the iPad. PDFs, small images and anything the browser cannot decode
 * are stored unchanged.
 */
export async function prepareReceiptFile(file: File): Promise<PreparedReceiptFile> {
  const original = async (): Promise<PreparedReceiptFile> => ({
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
  })

  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)
  if (!isImage || file.size <= KEEP_ORIGINAL_BYTES) return original()
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return original()

  try {
    const bitmap = await createImageBitmap(file)
    const target = scaledSize(bitmap.width, bitmap.height) ?? { width: bitmap.width, height: bitmap.height }
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return original()
    }
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return original()
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: 'image/jpeg',
      name: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg',
    }
  } catch {
    return original()
  }
}

export { RECEIPT_MAX_EDGE_PX }
