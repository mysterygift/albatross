/** PK zip local file header / empty archive signature: starts with "PK" 0x50 0x4B. */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b])

/**
 * True if the buffer begins with ZIP magic bytes (local file header or empty archive).
 * Used so `.apf` and misnamed `.zip` are both recognized without relying on file extension.
 */
export function isLikelyZipPayload(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false
  return bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1]
}
