import { describe, expect, it } from 'vitest'

import {
  generateInstanceKeyHex,
  unwrapInstanceKeyForUser,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'

describe('instanceKey multi-user', () => {
  it('two users unwrap the same instance key with different passwords', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const adminWrap = await wrapInstanceKeyForUser('admin-pass-12', instanceKeyHex, {
      userId: 'admin-1',
      username: 'admin',
    })
    const userWrap = await wrapInstanceKeyForUser('user-pass-1234', instanceKeyHex, {
      userId: 'user-2',
      username: 'editor',
    })

    expect(await unwrapInstanceKeyForUser('admin-pass-12', adminWrap)).toBe(instanceKeyHex)
    expect(await unwrapInstanceKeyForUser('user-pass-1234', userWrap)).toBe(instanceKeyHex)
    expect(adminWrap.wrapped_instance_key).not.toBe(userWrap.wrapped_instance_key)
  })

  it('wrong password cannot unwrap another user wrapper', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('correct-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'alice',
    })
    await expect(unwrapInstanceKeyForUser('wrong-pass', wrapper)).rejects.toThrow()
  })
})
