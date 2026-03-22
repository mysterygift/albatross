import { vi } from 'vitest'

export async function sequentialExecuteBatchOnDb(
  db: { execute: (sql: string, b?: unknown[]) => Promise<void> },
  statements: Array<{ sql: string; bindValues: unknown[] }>
): Promise<void> {
  for (const s of statements) {
    await db.execute(s.sql, s.bindValues)
  }
}

/** Bound in `vi.mock('@/lib/db/client')` so tests can `mockImplementation` / reset. */
export const apfE2eExecuteBatchMock = vi.fn(sequentialExecuteBatchOnDb)
