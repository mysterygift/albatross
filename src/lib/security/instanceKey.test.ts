import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearUserInstanceKeyRevocation,
  generateInstanceKeyHex,
  isInstanceKeyWrapperActive,
  readInstanceKeyWrappersMeta,
  removeUserInstanceKeyWrapper,
  revokeUserInstanceKeyWrapper,
  rewrapInstanceKeyForUser,
  unwrapInstanceKeyForUser,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'

const sidecarStore = vi.hoisted(() => ({
  content: JSON.stringify({
    version: 1,
    wrappers: [
      {
        user_id: 'u1',
        username: 'alice',
        wrap_salt: 'aa'.repeat(16),
        wrapped_instance_key: 'wrap1:x',
        version: 1,
        created_at: '2020-01-01T00:00:00.000Z',
        rotated_at: null,
        revoked_at: null,
      },
    ],
  }),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => true),
  readTextFile: vi.fn(async () => sidecarStore.content),
  writeTextFile: vi.fn(async (_path: string, body: string) => {
    sidecarStore.content = body
  }),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/tmp'),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

describe('instanceKey', () => {
  it('generateInstanceKeyHex returns 64-char hex', () => {
    const key = generateInstanceKeyHex()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(generateInstanceKeyHex()).not.toBe(key)
  })

  it('wrapInstanceKeyForUser and unwrapInstanceKeyForUser round-trip', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('secret-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'Admin',
    })
    const unwrapped = await unwrapInstanceKeyForUser('secret-pass', wrapper)
    expect(unwrapped).toBe(instanceKeyHex)
  })

  it('wrong password fails unwrap safely', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('secret-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'admin',
    })
    await expect(unwrapInstanceKeyForUser('wrong-pass', wrapper)).rejects.toThrow()
  })

  it('corrupted wrapped blob fails safely', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('secret-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'admin',
    })
    await expect(
      unwrapInstanceKeyForUser('secret-pass', {
        ...wrapper,
        wrapped_instance_key: 'wrap1:not-valid',
      })
    ).rejects.toThrow()
  })

  it('wrapInstanceKeyForUser sets created_at and null rotated_at', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('secret-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'admin',
    })
    expect(wrapper.created_at).toBeTruthy()
    expect(wrapper.rotated_at).toBeNull()
    expect(wrapper.revoked_at).toBeNull()
    expect(isInstanceKeyWrapperActive(wrapper)).toBe(true)
  })

  it('rewrapInstanceKeyForUser preserves created_at and sets rotated_at', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('old-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'admin',
    })
    const createdAt = wrapper.created_at
    const rewrapped = await rewrapInstanceKeyForUser(
      'old-pass',
      'new-pass',
      wrapper,
      instanceKeyHex
    )
    expect(rewrapped.created_at).toBe(createdAt)
    expect(rewrapped.rotated_at).toBeTruthy()
  })

  it('rewrapInstanceKeyForUser updates wrapper without changing instance key', async () => {
    const instanceKeyHex = generateInstanceKeyHex()
    const wrapper = await wrapInstanceKeyForUser('old-pass', instanceKeyHex, {
      userId: 'user-1',
      username: 'admin',
    })
    const rewrapped = await rewrapInstanceKeyForUser(
      'old-pass',
      'new-pass',
      wrapper,
      instanceKeyHex
    )
    expect(await unwrapInstanceKeyForUser('new-pass', rewrapped)).toBe(instanceKeyHex)
    await expect(unwrapInstanceKeyForUser('old-pass', rewrapped)).rejects.toThrow()
  })
})

describe('instanceKey sidecar lifecycle', () => {
  beforeEach(() => {
    sidecarStore.content = JSON.stringify({
      version: 1,
      wrappers: [
        {
          user_id: 'u1',
          username: 'alice',
          wrap_salt: 'aa'.repeat(16),
          wrapped_instance_key: 'wrap1:x',
          version: 1,
          created_at: '2020-01-01T00:00:00.000Z',
          rotated_at: null,
          revoked_at: null,
        },
      ],
    })
  })

  it('revoke, clear revocation, and remove wrapper', async () => {
    await revokeUserInstanceKeyWrapper('u1', '2026-01-01T00:00:00.000Z')
    let meta = await readInstanceKeyWrappersMeta()
    expect(meta?.wrappers[0]?.revoked_at).toBe('2026-01-01T00:00:00.000Z')
    expect(isInstanceKeyWrapperActive(meta!.wrappers[0]!)).toBe(false)

    await clearUserInstanceKeyRevocation('u1')
    meta = await readInstanceKeyWrappersMeta()
    expect(meta?.wrappers[0]?.revoked_at).toBeNull()

    await removeUserInstanceKeyWrapper({ userId: 'u1' })
    meta = await readInstanceKeyWrappersMeta()
    expect(meta?.wrappers).toHaveLength(0)
  })
})
