import { describe, expect, it } from 'vitest'

import { tauriSqlAndBindsForSqlJs } from '@/test/apf/sqlJsTauriAdapter'

describe('tauriSqlAndBindsForSqlJs', () => {
  it('duplicates bind values when the same $n appears multiple times (Tauri → sql.js)', () => {
    const { sql, binds } = tauriSqlAndBindsForSqlJs(
      'INSERT INTO t (a,b,c,d) VALUES ($1,$2,$3,$3)',
      ['x', 'y', 'z']
    )
    expect(sql).toBe('INSERT INTO t (a,b,c,d) VALUES (?,?,?,?)')
    expect(binds).toEqual(['x', 'y', 'z', 'z'])
  })
})
