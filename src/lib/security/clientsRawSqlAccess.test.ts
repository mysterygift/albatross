import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(process.cwd(), 'src')

const ALLOWED_PATH_SUFFIXES = [
  'lib/db/repositories/clients.ts',
  'lib/db/migrations/backfillClientEncryption.ts',
]

function isAllowedFile(relPath: string): boolean {
  if (ALLOWED_PATH_SUFFIXES.some((s) => relPath.endsWith(s))) return true
  if (relPath.endsWith('.test.ts')) return true
  return false
}

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walkTsFiles(full, acc)
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      acc.push(full)
    }
  }
  return acc
}

describe('clients table raw SQL access', () => {
  it('only references FROM clients / INTO clients / UPDATE clients in allowed modules', () => {
    const violations: string[] = []
    const pattern = /\b(FROM|INTO|UPDATE)\s+clients\b/i

    for (const file of walkTsFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
      if (isAllowedFile(rel)) continue
      const content = readFileSync(file, 'utf8')
      if (pattern.test(content)) {
        violations.push(rel)
      }
    }

    expect(violations).toEqual([])
  })
})
