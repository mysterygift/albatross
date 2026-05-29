import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { argon2Verify, argon2id } from 'hash-wasm'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { encryptAesGcmBlob, decryptAesGcmBlob } from '@/lib/security/aesGcmBlob'
import { appendAuditLog } from '@/lib/security/auditLog'

export const RECOVERY_META_FILENAME = 'albatross.recovery.meta.json'

export type RecoveryKeyMetaV1 = {
  version: 1
  verifier: string
  created_at: string
}

export type RecoveryKeyMetaV2 = {
  version: 2
  verifier: string
  created_at: string
  wrap_salt: string
  wrapped_file_passphrase: string
  /** Present after instance-key migration: instance key wrapped with legacy SQLCipher passphrase. */
  instance_key_wrap_salt?: string
  wrapped_instance_key_escrow?: string
}

export type DekEscrowWrapMode = 'recovery' | 'file_passphrase'

export type RecoveryKeyMetaV3 = {
  version: 3
  verifier: string
  created_at: string
  wrap_salt: string
  wrapped_file_passphrase: string
  instance_key_wrap_salt?: string
  wrapped_instance_key_escrow?: string
  dek_wrap_salt: string
  wrapped_dek: string
  dek_wrap_mode: DekEscrowWrapMode
}

export type RecoveryKeyMeta = RecoveryKeyMetaV1 | RecoveryKeyMetaV2 | RecoveryKeyMetaV3

/** Sidecar with SQLCipher file-passphrase escrow (v2 or v3). */
export type RecoveryKeyMetaWithFileWrap = RecoveryKeyMetaV2 | RecoveryKeyMetaV3

/** OWASP-aligned interactive profile (matches passwordHash.ts). */
const ARGON2_PARAMS = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
} as const

const RECOVERY_KEY_GROUP_LENGTH = 8
const RECOVERY_KEY_GROUP_COUNT = 8
const DEK_HEX_LENGTH = 64

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

function formatRecoveryKeyHex(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes).toUpperCase()
  const groups: string[] = []
  for (let i = 0; i < RECOVERY_KEY_GROUP_COUNT; i++) {
    const start = i * RECOVERY_KEY_GROUP_LENGTH
    groups.push(hex.slice(start, start + RECOVERY_KEY_GROUP_LENGTH))
  }
  return groups.join('-')
}

function assertDekHex(dekHex: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(dekHex)) {
    throw new Error('Invalid DEK material')
  }
}

export async function getRecoveryMetaPath(): Promise<string> {
  const dir = await appConfigDir()
  return join(dir, RECOVERY_META_FILENAME)
}

export function normalizeRecoveryKey(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function generateRecoveryKey(): string {
  const bytes = new Uint8Array((RECOVERY_KEY_GROUP_LENGTH * RECOVERY_KEY_GROUP_COUNT) / 2)
  crypto.getRandomValues(bytes)
  return formatRecoveryKeyHex(bytes)
}

export function generateRecoveryWrapSaltHex(): string {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return bytesToHex(salt)
}

export async function deriveRecoveryWrapKey(
  plainRecoveryKey: string,
  wrapSaltHex: string
): Promise<Uint8Array> {
  const normalized = normalizeRecoveryKey(plainRecoveryKey)
  if (!normalized) throw new Error('Recovery key is required')
  const raw = await argon2id({
    password: normalized,
    salt: hexToBytes(wrapSaltHex),
    ...ARGON2_PARAMS,
    outputType: 'binary',
  })
  return new Uint8Array(raw)
}

export async function deriveFilePassphraseWrapKey(
  sqlCipherPassphraseHex: string,
  wrapSaltHex: string
): Promise<Uint8Array> {
  if (!/^[0-9a-fA-F]{64}$/.test(sqlCipherPassphraseHex)) {
    throw new Error('Invalid SQLCipher passphrase material')
  }
  const raw = await argon2id({
    password: sqlCipherPassphraseHex,
    salt: hexToBytes(wrapSaltHex),
    ...ARGON2_PARAMS,
    outputType: 'binary',
  })
  return new Uint8Array(raw)
}

export async function hashRecoveryKey(plainKey: string): Promise<string> {
  const normalized = normalizeRecoveryKey(plainKey)
  if (!normalized) throw new Error('Recovery key is required')
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return argon2id({
    password: normalized,
    salt,
    ...ARGON2_PARAMS,
    outputType: 'encoded',
  })
}

export async function verifyRecoveryKey(plainKey: string, meta: RecoveryKeyMeta): Promise<boolean> {
  const normalized = normalizeRecoveryKey(plainKey)
  if (!normalized) return false
  return argon2Verify({
    password: normalized,
    hash: meta.verifier,
  })
}

export function isRecoveryKeyMetaV2(meta: RecoveryKeyMeta): meta is RecoveryKeyMetaV2 {
  return meta.version === 2
}

export function isRecoveryKeyMetaV3(meta: RecoveryKeyMeta): meta is RecoveryKeyMetaV3 {
  return meta.version === 3
}

export function recoveryMetaSupportsPasswordRecovery(
  meta: RecoveryKeyMeta
): meta is RecoveryKeyMetaWithFileWrap {
  if (meta.version !== 2 && meta.version !== 3) return false
  return (
    typeof meta.wrap_salt === 'string' &&
    meta.wrap_salt.trim() !== '' &&
    typeof meta.wrapped_file_passphrase === 'string' &&
    meta.wrapped_file_passphrase.trim() !== ''
  )
}

export function recoveryMetaSupportsClientPiiRecovery(
  meta: RecoveryKeyMeta
): meta is RecoveryKeyMetaV3 {
  return (
    meta.version === 3 &&
    typeof meta.dek_wrap_salt === 'string' &&
    meta.dek_wrap_salt.trim() !== '' &&
    typeof meta.wrapped_dek === 'string' &&
    meta.wrapped_dek.trim() !== '' &&
    (meta.dek_wrap_mode === 'recovery' || meta.dek_wrap_mode === 'file_passphrase')
  )
}

export async function wrapSqlCipherPassphrase(
  plainRecoveryKey: string,
  sqlCipherPassphraseHex: string
): Promise<{ wrap_salt: string; wrapped_file_passphrase: string }> {
  const wrap_salt = generateRecoveryWrapSaltHex()
  const wrapKey = await deriveRecoveryWrapKey(plainRecoveryKey, wrap_salt)
  const wrapped_file_passphrase = await encryptAesGcmBlob(sqlCipherPassphraseHex, wrapKey)
  return { wrap_salt, wrapped_file_passphrase }
}

export async function unwrapSqlCipherPassphrase(
  plainRecoveryKey: string,
  meta: RecoveryKeyMetaWithFileWrap
): Promise<string> {
  const wrapKey = await deriveRecoveryWrapKey(plainRecoveryKey, meta.wrap_salt)
  return decryptAesGcmBlob(meta.wrapped_file_passphrase, wrapKey)
}

export function recoveryMetaHasInstanceKeyEscrow(
  meta: RecoveryKeyMetaWithFileWrap
): boolean {
  return (
    typeof meta.instance_key_wrap_salt === 'string' &&
    meta.instance_key_wrap_salt.trim() !== '' &&
    typeof meta.wrapped_instance_key_escrow === 'string' &&
    meta.wrapped_instance_key_escrow.trim() !== ''
  )
}

async function unwrapInstanceKeyEscrowWithLegacyPassphrase(
  legacyPassphraseHex: string,
  meta: RecoveryKeyMetaWithFileWrap
): Promise<string> {
  if (!recoveryMetaHasInstanceKeyEscrow(meta)) {
    throw new Error('Instance key escrow is missing')
  }
  const wrapKey = await deriveFilePassphraseWrapKey(
    legacyPassphraseHex,
    meta.instance_key_wrap_salt!
  )
  return decryptAesGcmBlob(meta.wrapped_instance_key_escrow!, wrapKey)
}

/** Resolve SQLCipher key from recovery escrow (direct instance key or legacy chain). */
export async function unwrapInstanceKeyFromRecoveryEscrow(
  plainRecoveryKey: string,
  meta: RecoveryKeyMetaWithFileWrap,
  options?: { expectInstanceKeyMode?: boolean }
): Promise<string> {
  const primary = await unwrapSqlCipherPassphrase(plainRecoveryKey, meta)
  if (recoveryMetaHasInstanceKeyEscrow(meta)) {
    return unwrapInstanceKeyEscrowWithLegacyPassphrase(primary, meta)
  }
  if (options?.expectInstanceKeyMode && !/^[0-9a-fA-F]{64}$/.test(primary)) {
    throw new Error('Invalid instance key material')
  }
  return primary
}

/** After instance-key migration: chain-wrap instance key with legacy passphrase (recovery key unchanged). */
export async function updateRecoveryEscrowInstanceKey(args: {
  recoveryMeta: RecoveryKeyMetaWithFileWrap
  legacyPassphraseHex: string
  instanceKeyHex: string
}): Promise<void> {
  const { dek_wrap_salt, wrapped_dek } = await wrapDekWithFilePassphrase(
    args.legacyPassphraseHex,
    args.instanceKeyHex
  )
  const updated = {
    ...args.recoveryMeta,
    instance_key_wrap_salt: dek_wrap_salt,
    wrapped_instance_key_escrow: wrapped_dek,
  }
  await writeRecoveryKeyMeta(updated)
}

export async function wrapDekWithRecoveryKey(
  plainRecoveryKey: string,
  dekHex: string
): Promise<{ dek_wrap_salt: string; wrapped_dek: string }> {
  assertDekHex(dekHex)
  const dek_wrap_salt = generateRecoveryWrapSaltHex()
  const wrapKey = await deriveRecoveryWrapKey(plainRecoveryKey, dek_wrap_salt)
  const wrapped_dek = await encryptAesGcmBlob(dekHex, wrapKey)
  return { dek_wrap_salt, wrapped_dek }
}

export async function unwrapDekWithRecoveryKey(
  plainRecoveryKey: string,
  meta: RecoveryKeyMetaV3
): Promise<string> {
  const wrapKey = await deriveRecoveryWrapKey(plainRecoveryKey, meta.dek_wrap_salt)
  const dekHex = await decryptAesGcmBlob(meta.wrapped_dek, wrapKey)
  assertDekHex(dekHex)
  return dekHex
}

export async function wrapDekWithFilePassphrase(
  sqlCipherPassphraseHex: string,
  dekHex: string
): Promise<{ dek_wrap_salt: string; wrapped_dek: string }> {
  assertDekHex(dekHex)
  const dek_wrap_salt = generateRecoveryWrapSaltHex()
  const wrapKey = await deriveFilePassphraseWrapKey(sqlCipherPassphraseHex, dek_wrap_salt)
  const wrapped_dek = await encryptAesGcmBlob(dekHex, wrapKey)
  return { dek_wrap_salt, wrapped_dek }
}

export async function unwrapDekWithFilePassphrase(
  sqlCipherPassphraseHex: string,
  meta: RecoveryKeyMetaV3
): Promise<string> {
  const wrapKey = await deriveFilePassphraseWrapKey(sqlCipherPassphraseHex, meta.dek_wrap_salt)
  const dekHex = await decryptAesGcmBlob(meta.wrapped_dek, wrapKey)
  assertDekHex(dekHex)
  return dekHex
}

export async function unwrapEscrowedDek(
  plainRecoveryKey: string,
  sqlCipherPassphraseHex: string,
  meta: RecoveryKeyMetaV3
): Promise<string> {
  if (meta.dek_wrap_mode === 'recovery') {
    return unwrapDekWithRecoveryKey(plainRecoveryKey, meta)
  }
  return unwrapDekWithFilePassphrase(sqlCipherPassphraseHex, meta)
}

function parseFileWrapFields(parsed: RecoveryKeyMetaWithFileWrap): void {
  if (typeof parsed.wrap_salt !== 'string' || !parsed.wrap_salt.trim()) {
    throw new Error('Invalid recovery key metadata')
  }
  if (
    typeof parsed.wrapped_file_passphrase !== 'string' ||
    !parsed.wrapped_file_passphrase.trim()
  ) {
    throw new Error('Invalid recovery key metadata')
  }
}

function parseDekEscrowFields(parsed: RecoveryKeyMetaV3): void {
  if (typeof parsed.dek_wrap_salt !== 'string' || !parsed.dek_wrap_salt.trim()) {
    throw new Error('Invalid recovery key metadata')
  }
  if (typeof parsed.wrapped_dek !== 'string' || !parsed.wrapped_dek.trim()) {
    throw new Error('Invalid recovery key metadata')
  }
  if (parsed.dek_wrap_mode !== 'recovery' && parsed.dek_wrap_mode !== 'file_passphrase') {
    throw new Error('Invalid recovery key metadata')
  }
}

function parseRecoveryKeyMeta(raw: unknown): RecoveryKeyMeta {
  const parsed = raw as RecoveryKeyMeta
  if (parsed?.version !== 1 && parsed?.version !== 2 && parsed?.version !== 3) {
    throw new Error('Invalid recovery key metadata version')
  }
  if (typeof parsed.verifier !== 'string' || !parsed.verifier.trim()) {
    throw new Error('Invalid recovery key metadata')
  }
  if (typeof parsed.created_at !== 'string' || !parsed.created_at.trim()) {
    throw new Error('Invalid recovery key metadata')
  }
  if (parsed.version === 2 || parsed.version === 3) {
    parseFileWrapFields(parsed)
  }
  if (parsed.version === 3) {
    parseDekEscrowFields(parsed)
  }
  return parsed
}

export async function readRecoveryKeyMeta(): Promise<RecoveryKeyMeta | null> {
  const path = await getRecoveryMetaPath()
  if (!(await exists(path))) return null
  const raw = await readTextFile(path)
  return parseRecoveryKeyMeta(JSON.parse(raw))
}

export async function writeRecoveryKeyMeta(meta: RecoveryKeyMeta): Promise<void> {
  const path = await getRecoveryMetaPath()
  await writeTextFile(path, JSON.stringify(meta, null, 2))
}

export async function recoveryKeyMetaExists(): Promise<boolean> {
  const path = await getRecoveryMetaPath()
  return exists(path)
}

/** True when sidecar exists and supports forgot-password (v2/v3 with wrapped file passphrase). */
export async function recoveryPasswordResetAvailable(): Promise<boolean> {
  const meta = await readRecoveryKeyMeta()
  return meta != null && recoveryMetaSupportsPasswordRecovery(meta)
}

export async function persistRecoveryKeyMaterial(args: {
  db: DatabaseAdapter
  actorUserId: string
  plainRecoveryKey: string
  verifier: string
  sqlCipherPassphraseHex: string
  dekHex: string
}): Promise<void> {
  if (await recoveryKeyMetaExists()) {
    throw new Error('Recovery key already registered')
  }
  assertDekHex(args.dekHex)
  const { wrap_salt, wrapped_file_passphrase } = await wrapSqlCipherPassphrase(
    args.plainRecoveryKey,
    args.sqlCipherPassphraseHex
  )
  const { dek_wrap_salt, wrapped_dek } = await wrapDekWithRecoveryKey(
    args.plainRecoveryKey,
    args.dekHex
  )
  await writeRecoveryKeyMeta({
    version: 3,
    verifier: args.verifier,
    created_at: new Date().toISOString(),
    wrap_salt,
    wrapped_file_passphrase,
    dek_wrap_salt,
    wrapped_dek,
    dek_wrap_mode: 'recovery',
  })
  await appendAuditLog(args.db, {
    actorUserId: args.actorUserId,
    targetUserId: args.actorUserId,
    action: 'auth.recovery_key_registered',
    metadata: { version: 3 },
  })
}

export async function upgradeRecoveryMetaWithDekEscrow(args: {
  db: DatabaseAdapter
  actorUserId: string
  sqlCipherPassphraseHex: string
  dekHex: string
  dek_wrap_mode: 'file_passphrase'
}): Promise<void> {
  const meta = await readRecoveryKeyMeta()
  if (!meta || !recoveryMetaSupportsPasswordRecovery(meta)) {
    throw new Error('Recovery metadata does not support DEK escrow upgrade')
  }
  if (recoveryMetaSupportsClientPiiRecovery(meta)) {
    return
  }
  assertDekHex(args.dekHex)
  const { dek_wrap_salt, wrapped_dek } = await wrapDekWithFilePassphrase(
    args.sqlCipherPassphraseHex,
    args.dekHex
  )
  const upgraded: RecoveryKeyMetaV3 = {
    version: 3,
    verifier: meta.verifier,
    created_at: meta.created_at,
    wrap_salt: meta.wrap_salt,
    wrapped_file_passphrase: meta.wrapped_file_passphrase,
    dek_wrap_salt,
    wrapped_dek,
    dek_wrap_mode: args.dek_wrap_mode,
  }
  await writeRecoveryKeyMeta(upgraded)
  await appendAuditLog(args.db, {
    actorUserId: args.actorUserId,
    targetUserId: args.actorUserId,
    action: 'auth.dek_escrow_upgraded',
    metadata: { version: 3, dek_wrap_mode: args.dek_wrap_mode },
  })
}

export async function refreshRecoveryEscrowAfterRecovery(args: {
  db: DatabaseAdapter
  actorUserId: string
  plainRecoveryKey: string
  newSqlCipherPassphraseHex: string
  newDekHex: string
}): Promise<void> {
  const meta = await readRecoveryKeyMeta()
  if (!meta || !recoveryMetaSupportsPasswordRecovery(meta)) {
    throw new Error('Recovery metadata is missing')
  }
  assertDekHex(args.newDekHex)
  const { wrap_salt, wrapped_file_passphrase } = await wrapSqlCipherPassphrase(
    args.plainRecoveryKey,
    args.newSqlCipherPassphraseHex
  )
  const { dek_wrap_salt, wrapped_dek } = await wrapDekWithRecoveryKey(
    args.plainRecoveryKey,
    args.newDekHex
  )
  await writeRecoveryKeyMeta({
    version: 3,
    verifier: meta.verifier,
    created_at: meta.created_at,
    wrap_salt,
    wrapped_file_passphrase,
    dek_wrap_salt,
    wrapped_dek,
    dek_wrap_mode: 'recovery',
  })
  await appendAuditLog(args.db, {
    actorUserId: args.actorUserId,
    targetUserId: args.actorUserId,
    action: 'auth.recovery_escrow_refreshed',
    metadata: { version: 3 },
  })
}

/** @deprecated Use persistRecoveryKeyMaterial */
export async function persistRecoveryKeyVerifier(args: {
  db: DatabaseAdapter
  actorUserId: string
  verifier: string
}): Promise<void> {
  throw new Error('Recovery registration requires SQLCipher passphrase wrapping')
}
