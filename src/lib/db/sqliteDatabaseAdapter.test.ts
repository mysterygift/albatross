import { describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@tauri-apps/plugin-sql'

import { SQLiteDatabaseAdapter } from '@/lib/db/sqliteDatabaseAdapter'

type RawDbStub = {
  execute: (query: string, bindValues?: unknown[]) => Promise<QueryResult>
  select: (query: string, bindValues?: unknown[]) => Promise<unknown>
  close: (dbName?: string) => Promise<boolean>
}

function createRawDbStub(): RawDbStub {
  return {
    execute: vi.fn(async () => ({ rowsAffected: 1, lastInsertId: 1 })),
    select: vi.fn(async () => []),
    close: vi.fn(async () => true),
  }
}

describe('SQLiteDatabaseAdapter', () => {
  it('exposes the expected compatibility methods', () => {
    const adapter = new SQLiteDatabaseAdapter(createRawDbStub() as never)
    expect(typeof adapter.execute).toBe('function')
    expect(typeof adapter.select).toBe('function')
    expect(typeof adapter.executeBatch).toBe('function')
    expect(typeof adapter.executeTransaction).toBe('function')
    expect(typeof adapter.runInSerializedTransaction).toBe('function')
  })

  it('uses one compatibility batch for transactions when no database URL is available', async () => {
    const raw = createRawDbStub()
    const adapter = new SQLiteDatabaseAdapter(raw as never)
    await adapter.executeTransaction([
      { sql: 'UPDATE t SET name = $1 WHERE id = $2', bindValues: ['Name', 'id-1'] },
    ])
    expect(raw.execute).toHaveBeenCalledTimes(1)
    expect(raw.execute).toHaveBeenCalledWith(
      ['BEGIN', 'UPDATE t SET name = $1 WHERE id = $2', 'COMMIT'].join(';\n'),
      ['Name', 'id-1'],
    )
  })

  it('execute delegates to the wrapped sqlite client', async () => {
    const raw = createRawDbStub()
    const adapter = new SQLiteDatabaseAdapter(raw as never)
    await adapter.execute('UPDATE settings SET value = $1 WHERE key = $2', ['v', 'k'])
    expect(raw.execute).toHaveBeenCalledWith('UPDATE settings SET value = $1 WHERE key = $2', ['v', 'k'])
  })

  it('select delegates to the wrapped sqlite client', async () => {
    const raw = createRawDbStub()
    const selectSpy = vi.spyOn(raw, 'select').mockResolvedValue([{ id: 'row-1' }])
    const adapter = new SQLiteDatabaseAdapter(raw as never)
    const rows = await adapter.select<{ id: string }[]>('SELECT id FROM t WHERE id = $1', ['row-1'])
    expect(rows).toEqual([{ id: 'row-1' }])
    expect(selectSpy).toHaveBeenCalledWith('SELECT id FROM t WHERE id = $1', ['row-1'])
  })

  it('executeBatch preserves placeholder renumbering and single execute call behavior', async () => {
    const raw = createRawDbStub()
    const adapter = new SQLiteDatabaseAdapter(raw as never)
    await adapter.executeBatch([
      { sql: 'BEGIN', bindValues: [] },
      { sql: 'INSERT INTO t (id, name) VALUES ($1, $2)', bindValues: ['id-1', 'Name 1'] },
      { sql: 'INSERT INTO t (id, name) VALUES ($1, $2)', bindValues: ['id-2', 'Name 2'] },
      { sql: 'COMMIT', bindValues: [] },
    ])
    expect(raw.execute).toHaveBeenCalledTimes(1)
    expect(raw.execute).toHaveBeenCalledWith(
      ['BEGIN', 'INSERT INTO t (id, name) VALUES ($1, $2)', 'INSERT INTO t (id, name) VALUES ($3, $4)', 'COMMIT'].join(
        ';\n'
      ),
      ['id-1', 'Name 1', 'id-2', 'Name 2']
    )
  })

  it('runInSerializedTransaction keeps nested callbacks re-entrant', async () => {
    const adapter = new SQLiteDatabaseAdapter(createRawDbStub() as never)
    const order: number[] = []
    await adapter.runInSerializedTransaction(async () => {
      order.push(1)
      await adapter.runInSerializedTransaction(async () => {
        order.push(2)
      })
      order.push(3)
    })
    expect(order).toEqual([1, 2, 3])
  })
})
