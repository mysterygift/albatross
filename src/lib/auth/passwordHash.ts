import { argon2Verify, argon2id } from 'hash-wasm'

/** OWASP-aligned interactive profile (matches former @node-rs/argon2 settings). */
const ARGON2_PARAMS = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
} as const

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return argon2id({
    password: plainPassword,
    salt,
    ...ARGON2_PARAMS,
    outputType: 'encoded',
  })
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return argon2Verify({
    password: plainPassword,
    hash: passwordHash,
  })
}
