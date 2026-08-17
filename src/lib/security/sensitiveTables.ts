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
  people: {
    encryptedColumns: ['name', 'email', 'phone', 'department', 'notes', 'cast_number', 'agent_name', 'agent_email', 'agent_phone', 'role_name'] as const,
    sortKeyColumn: 'name_sort_key',
    repositoryModule: '@/lib/db/repositories/person',
  },
  locations: {
    encryptedColumns: ['name', 'address', 'what3words', 'parking_info', 'availability_constraints', 'notes'] as const,
    sortKeyColumn: 'name_sort_key',
    repositoryModule: '@/lib/db/repositories/location',
  },
  vendors: {
    encryptedColumns: ['company_name', 'primary_contact_full_name', 'primary_contact_email'] as const,
    sortKeyColumn: 'company_name_sort_key',
    repositoryModule: '@/lib/db/repositories/vendors',
  },
} as const

export type SensitiveTableId = keyof typeof SENSITIVE_TABLES
