import { describe, expect, it } from 'vitest'

import { runInSerializedTransaction } from '@/lib/db/client'

describe('runInSerializedTransaction', () => {
  it('allows nested calls without deadlocking (inner runs before outer completes)', async () => {
    const order: number[] = []
    await runInSerializedTransaction(async () => {
      order.push(1)
      await runInSerializedTransaction(async () => {
        order.push(2)
      })
      order.push(3)
    })
    expect(order).toEqual([1, 2, 3])
  })

  it('propagates rejection from nested callback', async () => {
    await expect(
      runInSerializedTransaction(async () => {
        await runInSerializedTransaction(async () => {
          throw new Error('inner fail')
        })
      })
    ).rejects.toThrow('inner fail')
  })
})
