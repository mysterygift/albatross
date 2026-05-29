import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { argon2id } from 'hash-wasm'

import { encryptAesGcmBlob, decryptAesGcmBlob } from '@/lib/security/aesGcmBlob'
import { FILE_KEY_ARGON2_PARAMS } from '@/lib/security/dbFileEncryption'

export const INSTANCE_KEY_WRAPPERS_FILENAME = 'albatross.instance-key.wrappers.json'

export type InstanceKeyWrapperEntry = {
  user_id: string
  username: string
  wrap_salt: string
  wrapped_instance_key: string
  version: 1
  created_at: string
  rotated_at: string | null
  revoked_at: string | null
}

export type InstanceKeyWrappersMeta = {
  version: 1
  wrappers: InstanceKeyWrapperEntry[]
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function normalizeUsernameForWrapper(username: string): string {
  return username.trim().toLowerCase()
}

export function isInstanceKeyWrapperActive(wrapper: InstanceKeyWrapperEntry): boolean {
  return wrapper.revoked_at == null || wrapper.revoked_at === ''
}

export function generateInstanceKeyHex(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function generateUserWrapSaltHex(): string {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

export async function deriveUserWrapKey(
  password: string,
  wrapSaltHex: string
): Promise<Uint8Array> {
  if (!password) throw new Error('Password is required')
  const raw = await argon2id({
    password,
    salt: hexToBytes(wrapSaltHex),
    ...FILE_KEY_ARGON2_PARAMS,
    outputType: 'binary',
  })
  return new Uint8Array(raw)
}

export async function wrapInstanceKeyForUser(
  password: string,
  instanceKeyHex: string,
  args: { userId: string; username: string },
  options?: { createdAt?: string; rotatedAt?: string | null }
): Promise<InstanceKeyWrapperEntry> {
  const wrap_salt = generateUserWrapSaltHex()
  const wrapKey = await deriveUserWrapKey(password, wrap_salt)
  const wrapped_instance_key = await encryptAesGcmBlob(instanceKeyHex, wrapKey)
  return {
    user_id: args.userId,
    username: normalizeUsernameForWrapper(args.username),
    wrap_salt,
    wrapped_instance_key,
    version: 1,
    created_at: options?.createdAt ?? new Date().toISOString(),
    rotated_at: options?.rotatedAt ?? null,
    revoked_at: null,
  }
}

export async function unwrapInstanceKeyForUser(
  password: string,
  wrapper: Pick<InstanceKeyWrapperEntry, 'wrap_salt' | 'wrapped_instance_key'>
): Promise<string> {
  const wrapKey = await deriveUserWrapKey(password, wrapper.wrap_salt)
  return decryptAesGcmBlob(wrapper.wrapped_instance_key, wrapKey)
}

export async function rewrapInstanceKeyForUser(
  oldPassword: string,
  newPassword: string,
  wrapper: InstanceKeyWrapperEntry,
  instanceKeyHex: string
): Promise<InstanceKeyWrapperEntry> {
  const current = await unwrapInstanceKeyForUser(oldPassword, wrapper)
  if (current !== instanceKeyHex) {
    throw new Error('Instance key mismatch')
  }
  const next = await wrapInstanceKeyForUser(newPassword, instanceKeyHex, {
    userId: wrapper.user_id,
    username: wrapper.username,
  })
  return {
    ...next,
    created_at: wrapper.created_at,
    rotated_at: new Date().toISOString(),
  }
}

/** Admin password reset: new wrap without knowing the old password. */
export async function replaceUserInstanceKeyWrapper(
  newPassword: string,
  instanceKeyHex: string,
  args: { userId: string; username: string },
  prior?: InstanceKeyWrapperEntry | null
): Promise<InstanceKeyWrapperEntry> {
  const next = await wrapInstanceKeyForUser(newPassword, instanceKeyHex, args)
  if (prior?.created_at) {
    return {
      ...next,
      created_at: prior.created_at,
      rotated_at: new Date().toISOString(),
    }
  }
  return next
}

function normalizeWrapperEntry(entry: InstanceKeyWrapperEntry): InstanceKeyWrapperEntry {
  return {
    ...entry,
    username: normalizeUsernameForWrapper(entry.username),
    created_at:
      typeof entry.created_at === 'string' && entry.created_at.trim()
        ? entry.created_at
        : new Date(0).toISOString(),
    rotated_at:
      typeof entry.rotated_at === 'string' && entry.rotated_at.trim() ? entry.rotated_at : null,
    revoked_at:
      typeof entry.revoked_at === 'string' && entry.revoked_at.trim() ? entry.revoked_at : null,
  }
}

function parseInstanceKeyWrappersMeta(raw: unknown): InstanceKeyWrappersMeta {
  const parsed = raw as InstanceKeyWrappersMeta
  if (parsed?.version !== 1 || !Array.isArray(parsed.wrappers)) {
    throw new Error('Invalid instance key wrappers metadata')
  }
  const wrappers = parsed.wrappers.map((entry) => {
    if (entry.version !== 1) throw new Error('Invalid instance key wrapper entry')
    if (typeof entry.user_id !== 'string' || !entry.user_id.trim()) {
      throw new Error('Invalid instance key wrapper entry')
    }
    if (typeof entry.username !== 'string' || !entry.username.trim()) {
      throw new Error('Invalid instance key wrapper entry')
    }
    if (typeof entry.wrap_salt !== 'string' || !entry.wrap_salt.trim()) {
      throw new Error('Invalid instance key wrapper entry')
    }
    if (typeof entry.wrapped_instance_key !== 'string' || !entry.wrapped_instance_key.trim()) {
      throw new Error('Invalid instance key wrapper entry')
    }
    return normalizeWrapperEntry(entry as InstanceKeyWrapperEntry)
  })
  return { version: 1, wrappers }
}

export async function getInstanceKeyWrappersPath(): Promise<string> {
  const dir = await appConfigDir()
  return join(dir, INSTANCE_KEY_WRAPPERS_FILENAME)
}

export async function readInstanceKeyWrappersMeta(): Promise<InstanceKeyWrappersMeta | null> {
  const path = await getInstanceKeyWrappersPath()
  if (!(await exists(path))) return null
  const raw = await readTextFile(path)
  return parseInstanceKeyWrappersMeta(JSON.parse(raw))
}

export async function writeInstanceKeyWrappersMeta(meta: InstanceKeyWrappersMeta): Promise<void> {
  const path = await getInstanceKeyWrappersPath()
  await writeTextFile(path, JSON.stringify(meta, null, 2))
}

export function findWrapperForUsername(
  meta: InstanceKeyWrappersMeta,
  username: string
): InstanceKeyWrapperEntry | null {
  const normalized = normalizeUsernameForWrapper(username)
  return meta.wrappers.find((w) => w.username === normalized) ?? null
}

export function findWrapperForUserId(
  meta: InstanceKeyWrappersMeta,
  userId: string
): InstanceKeyWrapperEntry | null {
  return meta.wrappers.find((w) => w.user_id === userId) ?? null
}

export async function upsertUserInstanceKeyWrapper(
  entry: InstanceKeyWrapperEntry
): Promise<void> {
  const existing = (await readInstanceKeyWrappersMeta()) ?? { version: 1 as const, wrappers: [] }
  const normalized = normalizeWrapperEntry(entry)
  const next = existing.wrappers.filter(
    (w) => w.username !== normalized.username && w.user_id !== normalized.user_id
  )
  next.push(normalized)
  await writeInstanceKeyWrappersMeta({ version: 1, wrappers: next })
}

export async function revokeUserInstanceKeyWrapper(
  userId: string,
  revokedAt: string
): Promise<void> {
  const existing = await readInstanceKeyWrappersMeta()
  if (!existing) return
  const idx = existing.wrappers.findIndex((w) => w.user_id === userId)
  if (idx < 0) return
  const updated = [...existing.wrappers]
  updated[idx] = { ...updated[idx]!, revoked_at: revokedAt }
  await writeInstanceKeyWrappersMeta({ version: 1, wrappers: updated })
}

export async function clearUserInstanceKeyRevocation(userId: string): Promise<void> {
  const existing = await readInstanceKeyWrappersMeta()
  if (!existing) return
  const idx = existing.wrappers.findIndex((w) => w.user_id === userId)
  if (idx < 0) return
  const entry = existing.wrappers[idx]!
  if (!entry.wrapped_instance_key?.trim()) return
  const updated = [...existing.wrappers]
  updated[idx] = { ...entry, revoked_at: null }
  await writeInstanceKeyWrappersMeta({ version: 1, wrappers: updated })
}

export async function removeUserInstanceKeyWrapper(args: {
  userId?: string
  username?: string
}): Promise<void> {
  const existing = await readInstanceKeyWrappersMeta()
  if (!existing) return
  const normalized = args.username ? normalizeUsernameForWrapper(args.username) : null
  const next = existing.wrappers.filter((w) => {
    if (args.userId && w.user_id === args.userId) return false
    if (normalized && w.username === normalized) return false
    return true
  })
  if (next.length === existing.wrappers.length) return
  await writeInstanceKeyWrappersMeta({ version: 1, wrappers: next })
}
