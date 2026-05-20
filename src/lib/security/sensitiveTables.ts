/**
 * Registry of tables/columns with application-layer encryption (Phase 1+).
 * Phase 3 SQLCipher protects the whole SQLite file; this registry remains useful for Postgres and audits.
 */
export const SENSITIVE_TABLES = {
  clients: {
    encryptedColumns: ['name', 'email', 'phone'] as const,
    sortKeyColumn: 'name_sort_key',
    repositoryModule: '@/lib/db/repositories/clients',
  },
  // Future: people.phone, vendors.primary_contact_email, etc.
} as const

export type SensitiveTableId = keyof typeof SENSITIVE_TABLES
