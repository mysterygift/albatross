import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(process.cwd(), 'src')

const RECOVERY_META_ALLOWLIST_SUFFIXES = [
  'lib/security/recoveryKey.ts',
  'lib/security/recoveryKey.test.ts',
  'lib/security/keyMaterialStorageAudit.test.ts',
  'test/encryption/encryptionTestHarness.ts',
]

const INSTANCE_KEY_WRAPPERS_ALLOWLIST_SUFFIXES = [
  'lib/security/instanceKey.ts',
  'lib/security/instanceKey.test.ts',
  'lib/security/keyMaterialStorageAudit.test.ts',
  'test/encryption/encryptionTestHarness.ts',
]

const RECOVERY_AUDIT_ACTIONS = [
  'auth.recovery_key_registered',
  'auth.password_recovered',
  'auth.dek_escrow_upgraded',
  'auth.recovery_escrow_refreshed',
] as const

const CONSOLE_SCAN_DIRS = ['features/auth/', 'lib/security/', 'lib/auth/'] as const

function isTestFile(relPath: string): boolean {
  return relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')
}

function isAllowlisted(relPath: string, suffixes: string[]): boolean {
  if (isTestFile(relPath)) return true
  return suffixes.some((s) => relPath.endsWith(s))
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

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

function scanPersistenceViolations(args: {
  identifierPattern: RegExp
  allowlistSuffixes?: string[]
  excludeSuffixes?: string[]
}): string[] {
  const violations: string[] = []
  for (const file of walkTsFiles(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
    if (isTestFile(rel)) continue
    if (args.allowlistSuffixes && isAllowlisted(rel, args.allowlistSuffixes)) continue
    if (args.excludeSuffixes?.some((s) => rel.endsWith(s))) continue
    const content = readFileSync(file, 'utf8')
    if (!args.identifierPattern.test(content)) continue
    const hasRiskyPersistence =
      /writeTextFile\s*\(/.test(content) || /setSetting\s*\(/.test(content)
    if (hasRiskyPersistence) violations.push(rel)
  }
  return violations
}

describe('key material storage audit (ENC8)', () => {
  describe('recovery key', () => {
    it('only references albatross.recovery.meta.json outside tests in recoveryKey.ts', () => {
      const violations: string[] = []
      const pattern = /albatross\.recovery\.meta\.json|RECOVERY_META_FILENAME/

      for (const file of walkTsFiles(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
        if (isAllowlisted(rel, RECOVERY_META_ALLOWLIST_SUFFIXES)) continue
        const content = readFileSync(file, 'utf8')
        if (pattern.test(content)) violations.push(rel)
      }

      expect(violations).toEqual([])
    })

    it('does not persist plainRecoveryKey via writeTextFile or setSetting', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /plainRecoveryKey/,
          excludeSuffixes: ['lib/security/recoveryKey.ts'],
        })
      ).toEqual([])
    })

    it('recovery audit actions do not embed recovery key strings in metadata literals', () => {
      const violations: string[] = []
      const recoveryKeyLiteralPattern =
        /[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}/

      for (const file of walkTsFiles(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
        if (isTestFile(rel)) continue
        const content = readFileSync(file, 'utf8')
        if (!RECOVERY_AUDIT_ACTIONS.some((action) => content.includes(action))) continue

        const stripped = stripCommentsAndStrings(content)
        for (const action of RECOVERY_AUDIT_ACTIONS) {
          const actionIndex = stripped.indexOf(action)
          if (actionIndex < 0) continue
          const window = stripped.slice(actionIndex, actionIndex + 600)
          if (recoveryKeyLiteralPattern.test(window)) {
            violations.push(`${rel} (${action})`)
          }
          if (/\bmetadata\s*:\s*\{[^}]*\brecoveryKey\b/.test(window)) {
            violations.push(`${rel} (${action} metadata.recoveryKey)`)
          }
        }
      }

      expect(violations).toEqual([])
    })
  })

  describe('instance key', () => {
    it('only references albatross.instance-key.wrappers.json outside tests in instanceKey.ts', () => {
      const violations: string[] = []
      const pattern =
        /albatross\.instance-key\.wrappers\.json|INSTANCE_KEY_WRAPPERS_FILENAME/

      for (const file of walkTsFiles(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
        if (isAllowlisted(rel, INSTANCE_KEY_WRAPPERS_ALLOWLIST_SUFFIXES)) continue
        const content = readFileSync(file, 'utf8')
        if (pattern.test(content)) violations.push(rel)
      }

      expect(violations).toEqual([])
    })

    it('does not persist instanceKeyHex via writeTextFile or setSetting', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /\binstanceKeyHex\b/,
          allowlistSuffixes: [
            'lib/security/instanceKey.ts',
            'lib/security/recoveryKey.ts',
            'lib/db/dbUnlock.ts',
            'lib/security/instanceKeyMigration.ts',
            'lib/security/adminPasswordResetPaths.ts',
            'lib/auth/adminUserManagementService.ts',
            'features/auth/InitialAdminSetupWizard.tsx',
          ],
        })
      ).toEqual([])
    })
  })

  describe('DEK', () => {
    it('does not persist dekHex via writeTextFile or setSetting outside recovery escrow modules', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /\bdekHex\b/,
          allowlistSuffixes: [
            'lib/security/dataEncryptionContext.ts',
            'lib/security/recoveryKey.ts',
            'lib/security/dekEscrowMigration.ts',
            'features/auth/InitialAdminSetupWizard.tsx',
          ],
        })
      ).toEqual([])
    })

    it('does not persist exportDataEncryptionKeyHex results via writeTextFile or setSetting outside allowlist', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /exportDataEncryptionKeyHex\s*\(/,
          allowlistSuffixes: [
            'lib/security/recoveryKey.ts',
            'lib/security/dekEscrowMigration.ts',
            'features/auth/InitialAdminSetupWizard.tsx',
          ],
        })
      ).toEqual([])
    })
  })

  describe('SQLCipher passphrase', () => {
    it('does not persist sqlCipherPassphraseHex via writeTextFile outside file-crypto modules', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /\bsqlCipherPassphraseHex\b/,
          allowlistSuffixes: [
            'lib/security/recoveryKey.ts',
            'lib/security/dekEscrowMigration.ts',
            'features/auth/InitialAdminSetupWizard.tsx',
          ],
        })
      ).toEqual([])
    })

    it('does not persist getActiveSqlCipherKeyHex via writeTextFile or setSetting', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /getActiveSqlCipherKeyHex\s*\(/,
          allowlistSuffixes: [
            'lib/security/adminPasswordResetPaths.ts',
            'lib/auth/adminUserManagementService.ts',
          ],
        })
      ).toEqual([])
    })
  })

  describe('passwords', () => {
    it('does not persist plainPassword via writeTextFile or setSetting outside password hash module', () => {
      expect(
        scanPersistenceViolations({
          identifierPattern: /\bplainPassword\b/,
          allowlistSuffixes: ['lib/auth/passwordHash.ts'],
        })
      ).toEqual([])
    })
  })

  describe('console logging', () => {
    it('does not log recovery key material via console in auth/security code', () => {
      const violations: string[] = []
      const consolePattern = /console\.(log|warn|error|debug|info)\s*\(/
      const recoveryIdentifierPattern = /\b(recoveryKey|plainRecoveryKey)\b/

      for (const file of walkTsFiles(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
        if (isTestFile(rel)) continue
        if (!CONSOLE_SCAN_DIRS.some((dir) => rel.startsWith(dir))) continue
        const content = readFileSync(file, 'utf8')
        if (!consolePattern.test(content) || !recoveryIdentifierPattern.test(content)) continue
        for (const line of content.split('\n')) {
          if (consolePattern.test(line) && recoveryIdentifierPattern.test(line)) {
            violations.push(`${rel}: ${line.trim()}`)
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('does not log instance key or DEK material via console in auth/security code', () => {
      const violations: string[] = []
      const consolePattern = /console\.(log|warn|error|debug|info)\s*\(/
      const secretPattern = /\b(instanceKeyHex|dekHex|sqlCipherPassphraseHex|getActiveSqlCipherKeyHex)\b/

      for (const file of walkTsFiles(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, '/')
        if (isTestFile(rel)) continue
        if (!CONSOLE_SCAN_DIRS.some((dir) => rel.startsWith(dir))) continue
        const content = readFileSync(file, 'utf8')
        if (!consolePattern.test(content) || !secretPattern.test(content)) continue
        for (const line of content.split('\n')) {
          if (consolePattern.test(line) && secretPattern.test(line)) {
            violations.push(`${rel}: ${line.trim()}`)
          }
        }
      }

      expect(violations).toEqual([])
    })
  })
})
