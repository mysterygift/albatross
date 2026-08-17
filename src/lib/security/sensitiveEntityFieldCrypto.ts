import {
  computeClientNameSortKey,
  decryptClientField,
  encryptClientField,
  isEncryptedClientField,
} from './clientFieldCrypto'
import { getDataEncryptionKey } from './dataEncryptionContext'

type Row = Record<string, unknown>

export const PERSON_PROTECTED_FIELDS = [
  'name',
  'email',
  'phone',
  'department',
  'notes',
  'cast_number',
  'agent_name',
  'agent_email',
  'agent_phone',
  'role_name',
] as const

export const LOCATION_PROTECTED_FIELDS = [
  'name',
  'address',
  'what3words',
  'parking_info',
  'availability_constraints',
  'notes',
] as const

export const VENDOR_PROTECTED_FIELDS = [
  'company_name',
  'primary_contact_full_name',
  'primary_contact_email',
] as const

async function transformFields(
  row: Row,
  fields: readonly string[],
  transform: (value: string | null, dek: Uint8Array) => Promise<string | null>,
  dek = getDataEncryptionKey()
): Promise<Row> {
  const result = { ...row }
  await Promise.all(fields.map(async (field) => {
    const value = row[field] == null ? null : String(row[field])
    result[field] = await transform(value, dek)
  }))
  return result
}

export async function encryptProtectedFields(
  row: Row,
  fields: readonly string[],
  sortField: string
): Promise<Row> {
  const dek = getDataEncryptionKey()
  const result = await transformFields(row, fields, encryptClientField, dek)
  const sortValue = row[sortField] == null ? '' : String(row[sortField])
  result[sortField === 'company_name' ? 'company_name_sort_key' : 'name_sort_key'] =
    await computeClientNameSortKey(sortValue, dek)
  return result
}

export function rowNeedsProtectedFieldEncryption(row: Row, identityField: string): boolean {
  const value = row[identityField]
  return typeof value === 'string' && value.length > 0 && !isEncryptedClientField(value)
}

export async function decryptProtectedFields(row: Row, fields: readonly string[]): Promise<Row> {
  return transformFields(row, fields, decryptClientField)
}

export async function encryptPersonFields(row: Row): Promise<Row> {
  return encryptProtectedFields(row, PERSON_PROTECTED_FIELDS, 'name')
}

export async function decryptPersonFields(row: Row): Promise<Row> {
  return decryptProtectedFields(row, PERSON_PROTECTED_FIELDS)
}

export async function encryptLocationFields(row: Row): Promise<Row> {
  return encryptProtectedFields(row, LOCATION_PROTECTED_FIELDS, 'name')
}

export async function decryptLocationFields(row: Row): Promise<Row> {
  return decryptProtectedFields(row, LOCATION_PROTECTED_FIELDS)
}

export async function encryptVendorFields(row: Row): Promise<Row> {
  return encryptProtectedFields(row, VENDOR_PROTECTED_FIELDS, 'company_name')
}

export async function decryptVendorFields(row: Row): Promise<Row> {
  return decryptProtectedFields(row, VENDOR_PROTECTED_FIELDS)
}
