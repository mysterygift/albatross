# Client data encryption

## What is encrypted

When the instance has UAM1 auth (`users` / `sessions` tables), **client PII** is encrypted at rest:

| Column | Encrypted |
|--------|-----------|
| `clients.name` | Yes (`v1:` AES-256-GCM ciphertext in place) |
| `clients.email` | Yes (nullable) |
| `clients.phone` | Yes (nullable) |
| `clients.name_sort_key` | HMAC-SHA256 blind index for `ORDER BY` (not reversible to name without DEK) |
| `clients.id`, timestamps, `productions.client_id` | No (required for FKs and queries) |

Registry of sensitive tables: [`src/lib/security/sensitiveTables.ts`](../src/lib/security/sensitiveTables.ts).

## Key material

- **DEK (data encryption key):** 32 bytes, derived on login with Argon2id from the user password and a per-user `users.dek_salt` (separate from `password_hash`).
- **SQLCipher file key:** 64-char hex passphrase for `PRAGMA key`, derived with Argon2id from the same password and an **instance** salt in `albatross.db.meta.json` (salt is public; password is not). Implemented in [`dbFileEncryption.ts`](../src/lib/security/dbFileEncryption.ts).
- **Storage:** DEK and file passphrase exist only in process memory until logout.
- **Not stored:** DEK, password, or SQLCipher passphrase on disk.

## Full local database encryption (SQLite / Phase 3)

When `albatross.db.meta.json` is present, the entire `albatross.db` file is SQLCipher-encrypted. Offline copies are not readable in `sqlite3` without the instance password.

- Unlock: sign-in or first admin setup ([`dbUnlock.ts`](../src/lib/db/dbUnlock.ts)).
- Legacy plain DBs: first successful login after upgrade runs `sqlcipher_export` (backup: `albatross.db.pre-sqlcipher-backup`).
- Legacy installs without UAM1: DB stays plain until auth is enabled.

See [`SQLCIPHER_SPIKE.md`](SQLCIPHER_SPIKE.md) for native build notes.

## Access control (Phase 1 + 2)

- With UAM1 enabled, [`clients` repository](../src/lib/db/repositories/clients.ts) calls [`requireSensitiveDataAccess()`](../src/lib/security/sensitiveDataAccess.ts) before reads/writes that decrypt PII.
- **`clientExistsById(id)`** checks only the `id` column (no DEK required) — used by APF preflight and similar.
- Legacy plaintext rows are encrypted on first login via [`backfillClientEncryptionIfNeeded`](../src/lib/db/migrations/backfillClientEncryption.ts).

### Pre-login

`getDb()` throws `DatabaseLockedError` when the DB is encrypted and the pool is closed. Auth uses [`openPlainDbIfExists`](../src/lib/db/client.ts) only for legacy plain files (admin count, pre-migration login).

### Raw SQL audit

CI test [`clientsRawSqlAccess.test.ts`](../src/lib/security/clientsRawSqlAccess.test.ts) fails if `FROM clients` / `INTO clients` / `UPDATE clients` appear outside allowlisted paths.

## Session and key lifecycle

| Event | Session token | DEK / file key | SQLite pool |
|-------|---------------|----------------|-------------|
| Cold start (encrypted) | Cleared | Absent | Closed (locked) |
| Login / bootstrap | Set | Derived from password | Open with `PRAGMA key` |
| Logout | Cleared | Cleared | `closeDb()` |

React Query loads that return decrypted clients use `canFetchSensitiveClientData(authSupported, isAuthenticated)`.

**Password recovery:** There is no back door. Restore `albatross.db.pre-sqlcipher-backup` only if migration failed — it remains a plain SQLite file from before encryption.

## UI vs file encryption

| Layer | Protects |
|-------|----------|
| Auth gate (`AppLayout`) | App shell when not signed in |
| `requireSensitiveDataAccess` | Decrypted client fields in the app |
| Field encryption (`v1:`) | Client columns inside the DB |
| SQLCipher | Entire `albatross.db` file at rest |

## Verification

1. Sign in, create or edit a client.
2. Quit the app. With SQLCipher enabled, `sqlite3 albatross.db .tables` should fail or show garbage (not your tables).
3. Sign in again — Settings → Clients and production contact cards show correct plaintext.
4. With field encryption only (pre-migration): `clients.name` values start with `v1:` in an external tool that can still open the file.
5. Logout: client list queries disabled until sign-in; DB file remains encrypted.
6. Tests: `npm test -- src/lib/security` and `cargo test sqlcipher_self_test_runs` in `src-tauri`.

## Related

- Field crypto: [`clientFieldCrypto.ts`](../src/lib/security/clientFieldCrypto.ts), [`dataEncryptionContext.ts`](../src/lib/security/dataEncryptionContext.ts)
- File crypto: [`dbFileEncryption.ts`](../src/lib/security/dbFileEncryption.ts), [`dbUnlock.ts`](../src/lib/db/dbUnlock.ts), [`src-tauri/src/db_encryption.rs`](../src-tauri/src/db_encryption.rs)
- Migrations: `0069_client_field_encryption.sql` (SQLite), `0007_client_field_encryption.sql` (Postgres)
