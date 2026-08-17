import type { SyncCursor } from '@/lib/server/syncV2/types'

const CURSOR_PATTERN = /^([^:]+):(0|[1-9]\d*)$/

export function encodeSyncCursor(cursor: SyncCursor): string {
  if (!cursor.epoch || cursor.epoch.includes(':')) {
    throw new Error('Sync cursor epoch must be non-empty and cannot contain a colon.')
  }
  if (!Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0) {
    throw new Error('Sync cursor sequence must be a non-negative safe integer.')
  }
  return `${cursor.epoch}:${cursor.sequence}`
}

export function decodeSyncCursor(value: string): SyncCursor {
  const match = CURSOR_PATTERN.exec(value)
  if (!match) throw new Error('Invalid sync cursor. Expected <epoch>:<sequence>.')

  const sequence = Number(match[2])
  if (!Number.isSafeInteger(sequence)) {
    throw new Error('Sync cursor sequence exceeds the safe integer range.')
  }
  return { epoch: match[1], sequence }
}

export function sameSyncEpoch(left: SyncCursor, right: SyncCursor): boolean {
  return left.epoch === right.epoch
}
