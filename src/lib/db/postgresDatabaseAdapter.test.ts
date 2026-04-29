import { describe, expect, it, vi } from 'vitest'

import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'

type ClientStub = {
  query: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

function createAdapter(client: ClientStub) {
  const pool = {
    connect: vi.fn(async () => client),
  }
  return new PostgresDatabaseAdapter(pool as never, 'test_schema')
}

describe('PostgresDatabaseAdapter', () => {
  it('exposes compatibility methods', () => {
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    }
    const adapter = createAdapter(client)
    expect(adapter.dialect).toBe('postgres')
    expect(typeof adapter.execute).toBe('function')
    expect(typeof adapter.select).toBe('function')
    expect(typeof adapter.executeBatch).toBe('function')
    expect(typeof adapter.runInSerializedTransaction).toBe('function')
  })

  it('executeBatch commits on success and ignores explicit transaction wrappers', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }))
    const client = { query, release: vi.fn() }
    const adapter = createAdapter(client)
    await adapter.executeBatch([
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      { sql: 'INSERT INTO settings (key, value) VALUES ($1, $2)', bindValues: ['k', 'v'] },
      { sql: 'COMMIT', bindValues: [] },
    ])
    expect(query).toHaveBeenCalledWith('BEGIN')
    expect(query).toHaveBeenCalledWith('INSERT INTO settings (key, value) VALUES ($1, $2)', ['k', 'v'])
    expect(query).toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('executeBatch rolls back on statement failures', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set search_path
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockRejectedValueOnce(new Error('boom')) // failing statement
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ROLLBACK
    const client = { query, release: vi.fn() }
    const adapter = createAdapter(client)
    await expect(
      adapter.executeBatch([{ sql: 'UPDATE settings SET value = $1 WHERE key = $2', bindValues: ['a', 'b'] }])
    ).rejects.toThrow('boom')
    expect(query).toHaveBeenCalledWith('ROLLBACK')
  })
})
