import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import type { InstanceKeyWrapperEntry } from '@/lib/security/instanceKey'

export async function writeUserInstanceKeyMirror(
  db: DatabaseAdapter,
  userId: string,
  entry: InstanceKeyWrapperEntry
): Promise<void> {
  await db.execute(
    `UPDATE users
     SET instance_key_wrap_version = $1,
         instance_key_wrap_salt = $2,
         instance_key_wrapped = $3,
         instance_key_wrap_created_at = $4,
         instance_key_wrap_rotated_at = $5
     WHERE id = $6`,
    [
      entry.version,
      entry.wrap_salt,
      entry.wrapped_instance_key,
      entry.created_at,
      entry.rotated_at,
      userId,
    ]
  )
}

export async function clearUserInstanceKeyMirror(db: DatabaseAdapter, userId: string): Promise<void> {
  await db.execute(
    `UPDATE users
     SET instance_key_wrap_version = NULL,
         instance_key_wrap_salt = NULL,
         instance_key_wrapped = NULL,
         instance_key_wrap_created_at = NULL,
         instance_key_wrap_rotated_at = NULL
     WHERE id = $1`,
    [userId]
  )
}
