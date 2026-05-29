import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  now: vi.fn(() => '2026-01-01T00:00:00.000Z'),
  runInSerializedTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
}))

vi.mock('@/lib/db/client', () => clientMocks)

import {
  decryptClientField,
  encryptClientField,
} from '@/lib/security/clientFieldCrypto'
import { reencryptAllClientFields } from '@/lib/db/migrations/reencryptClientFields'

describe('reencryptClientFields', () => {
  const fromDek = new Uint8Array(32).map((_, i) => i)
  const toDek = new Uint8Array(32).map((_, i) => 255 - i)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-encrypts client rows from one DEK to another', async () => {
    const nameEnc = await encryptClientField('Acme Corp', fromDek)
    const emailEnc = await encryptClientField('a@acme.test', fromDek)
    const db = {
      dialect: 'sqlite' as const,
      select: vi.fn(async () => [
        { id: 'client-1', name: nameEnc, email: emailEnc, phone: null },
      ]),
      execute: vi.fn(async () => undefined),
    }
    const batchDb = { ...db, execute: vi.fn(async () => undefined) }
    clientMocks.getDb.mockResolvedValue(batchDb)

    const updated = await reencryptAllClientFields(db, { fromDek, toDek })
    expect(updated).toBe(1)
    expect(batchDb.execute).toHaveBeenCalledTimes(1)
    const args = batchDb.execute.mock.calls[0]?.[1] as unknown[]
    const newName = String(args[0])
    const newEmail = String(args[1])
    expect(await decryptClientField(newName, toDek)).toBe('Acme Corp')
    expect(await decryptClientField(newEmail, toDek)).toBe('a@acme.test')
  })

  it('returns zero when no encrypted rows exist', async () => {
    const db = {
      dialect: 'sqlite' as const,
      select: vi.fn(async () => []),
      execute: vi.fn(async () => undefined),
    }
    const updated = await reencryptAllClientFields(db, { fromDek, toDek })
    expect(updated).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
})
