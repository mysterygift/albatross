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
- **Instance key (ENC5):** Random 32-byte SQLCipher `PRAGMA key` material (64-char hex), generated once per install. **Not stored in plaintext.** Unlocked by unwrapping a per-user credential wrapper or recovery escrow.
- **Legacy SQLCipher file key (pre-ENC5 migration):** 64-char hex derived with Argon2id from admin password + instance `kdf_salt` in `albatross.db.meta.json` v1. Retained only until first successful login migrates to instance key mode.
- **Storage:** DEK and SQLCipher key exist only in process memory until logout.
- **Not stored in plaintext:** DEK, instance key, password, or SQLCipher passphrase on disk.

### Sidecar files (app config directory)

| File | Purpose |
|------|---------|
| `albatross.db.meta.json` | v1: legacy `kdf_salt`; v2: `key_mode: instance_key` (+ optional `legacy_kdf_salt` after migration) |
| `albatross.instance-key.wrappers.json` | Per-user AES-GCM wraps of the instance key (username lookup before DB unlock) |
| `albatross.recovery.meta.json` | Recovery key verifier + escrowed SQLCipher key material (+ DEK escrow in v3) |

**Per-user wrapper sidecar entry (ENC6):** `user_id`, `username` (lowercase), `version`, `wrap_salt`, `wrapped_instance_key` (`wrap1:` AES-GCM), `created_at`, `rotated_at` (set on password re-wrap), `revoked_at` (set on disable — blocks unlock without rekeying the database). Unlock reads the sidecar only; matching columns on `users` (`instance_key_wrap_*`) mirror metadata inside the encrypted DB for admin visibility.

**Multi-user key wrapping flow:**

1. **Create user** — admin generates a new password-derived wrap of the shared instance key; sidecar entry + DB mirror columns are written.
2. **Unlock** — each user unwraps their own sidecar entry with their password (same underlying instance key).
3. **Disable** — `revoked_at` is set on the sidecar entry; unlock fails without rekeying the database file.
4. **Delete** — sidecar entry is removed; the user can no longer unlock.
5. **Admin password reset (ENC7)** — updates password hash and re-wraps the user's instance-key wrapper; does not change the instance key or SQLCipher file key.

Implemented in [`instanceKey.ts`](../src/lib/security/instanceKey.ts), [`dbFileEncryption.ts`](../src/lib/security/dbFileEncryption.ts), [`instanceKeyMigration.ts`](../src/lib/security/instanceKeyMigration.ts), [`adminUserManagementService.ts`](../src/lib/auth/adminUserManagementService.ts).

### When SQLCipher is rekeyed

| Event | SQLCipher rekey? | Notes |
|-------|------------------|-------|
| Fresh install / instance-key mode **Forgot password?** recovery | No | Instance key unchanged; only wrappers and password hashes update |
| ENC7 admin reset | No | Re-wraps per-user instance-key wrapper only |
| ENC5 login migration (meta v1 → instance key) | Yes | Legacy password-derived key → random instance key |
| Legacy v1 **Forgot password?** (before instance-key migration) | Yes | Password-derived file key rotates with new admin password |
| Future instance key rotation | Yes | Not implemented in this release |

### What escrow restores

| Recovery sidecar version | Database unlock | Client PII after password loss |
|--------------------------|-----------------|--------------------------------|
| v1 (verifier only) | No | No |
| v2 (`wrapped_file_passphrase`) | Yes (via recovery key) | No — upgrade to v3 on next login adds DEK escrow |
| v3 (`wrapped_dek` present) | Yes | Yes — escorted DEK bytes re-derive field encryption under the new password at recovery |

### Recovery key responsibilities (ENC8)

_See also [Recovery key (ENC2 / ENC3 / ENC4)](#recovery-key-enc2--enc3--enc4) below for sidecar format details._

## Full local database encryption (SQLite / Phase 3)

When `albatross.db.meta.json` is present, the entire `albatross.db` file is SQLCipher-encrypted. Offline copies are not readable in `sqlite3` without the instance key.

- Unlock: sign-in unwraps the user’s instance-key wrapper (v2 meta) or legacy password-derived key (v1 meta, until login migration). First admin setup generates a random instance key.
- **ENC5 login migration:** After legacy unlock + successful password verification, Albatross re-keys the DB to a random instance key, writes the user wrapper sidecar, updates recovery escrow, and commits meta v2 (backup: `albatross.db.pre-instance-key-backup`).
- Legacy plain DBs: first encryption runs `sqlcipher_export` (backup: `albatross.db.pre-sqlcipher-backup`).
- Legacy installs without UAM1: DB stays plain until auth is enabled.

See [`SQLCIPHER_SPIKE.md`](SQLCIPHER_SPIKE.md) for native build notes.

## Access control (Phase 1 + 2)

- With UAM1 enabled, [`clients` repository](../src/lib/db/repositories/clients.ts) calls [`requireSensitiveDataAccess()`](../src/lib/security/sensitiveDataAccess.ts) before reads/writes that decrypt PII.
- **`clientExistsById(id)`** checks only the `id` column (no DEK required) — used by APF preflight and similar.
- Legacy plaintext rows are encrypted on first login via [`backfillClientEncryptionIfNeeded`](../src/lib/db/migrations/backfillClientEncryption.ts).

### Pre-login

`getDb()` throws `DatabaseLockedError` when the DB is encrypted and the pool is closed. Auth uses [`openPlainDbIfExists`](../src/lib/db/client.ts) only for legacy plain files (admin count, pre-migration login).

### Raw SQL and key-material audits

CI tests fail when sensitive paths drift:

- [`clientsRawSqlAccess.test.ts`](../src/lib/security/clientsRawSqlAccess.test.ts) — raw `clients` SQL outside allowlisted repositories
- [`keyMaterialStorageAudit.test.ts`](../src/lib/security/keyMaterialStorageAudit.test.ts) — plaintext recovery key, instance key, DEK, SQLCipher passphrase, and passwords must not be persisted or logged

## Session and key lifecycle

| Event | Session token | DEK / instance key | SQLite pool |
|-------|---------------|-------------------|-------------|
| Cold start (encrypted) | Cleared | Absent | Closed (locked) |
| Login / bootstrap | Set | Unwrapped instance key (or legacy derive until migration) | Open with `PRAGMA key` |
| Logout | Cleared | Cleared | `closeDb()` |

React Query loads that return decrypted clients use `canFetchSensitiveClientData(authSupported, isAuthenticated)`.

### Recovery key (ENC2 / ENC3 / ENC4) {#recovery-key-enc2--enc3--enc4}

During **initial admin setup**, Albatross generates a recovery key and shows it **once**. You must save it outside the app (for example a password manager or a secure physical copy). Albatross does **not** store the plaintext recovery key on disk, in settings, or in audit logs.

**Recovery key responsibilities:**

- Store the recovery key outside Albatross before finishing setup — it is not shown again.
- Albatross persists only an Argon2 verifier and recovery-key-wrapped escrow blobs.
- Use it for **Forgot password?** when v2/v3 recovery meta exists.
- Service-level admin reset Path B2 can authorize via recovery escrow (not in the default User Management UI).

**Escrow target (ENC4):** The recovery sidecar escrows the **DEK** (32-byte client PII key), not a separate IMK. Today's DEK is password-derived; escrowing the derived key bytes enables PII recovery after password reset. A future IMK phase may replace `wrapped_dek` with `wrapped_imk` and per-user KEK wrapping when multi-user key management ships — without changing the sidecar wrap pattern.

**What Albatross stores** (in `albatross.recovery.meta.json`, next to `albatross.db.meta.json` in the app config directory):

- **version 3 (ENC4):** Argon2 verifier, recovery-key-wrapped SQLCipher key material (`wrapped_file_passphrase`), plus recovery-key-wrapped DEK. On ENC5 fresh installs, `wrapped_file_passphrase` holds the **instance key** directly. After ENC5 migration from legacy installs, a chained escrow (`wrapped_instance_key_escrow`) is added; recovery unwraps legacy passphrase first, then instance key.
- **version 2 (ENC2):** Verifier plus wrapped file passphrase only — client PII is not recoverable after password reset until login upgrades the sidecar to v3.
- **version 1 (legacy):** Verifier only — **Forgot password?** recovery is unavailable until the instance is re-provisioned.

**DEK escrow wrap modes (v3):**

| `dek_wrap_mode` | When written | Unwrap at recovery |
|-----------------|--------------|-------------------|
| `recovery` | Initial admin setup | Directly from recovery key |
| `file_passphrase` | Login migration for legacy v2 installs | Via unwrapped SQLCipher passphrase |

After a successful password recovery, both the file passphrase and DEK escrow are re-wrapped under the recovery key (`dek_wrap_mode: recovery`).

**Never persisted in plaintext:** DEK, IMK, password, SQLCipher passphrase, or recovery key.

**If you lose access**

| Situation | Can you recover local data? |
|-----------|----------------------------|
| Lost password, have recovery key | Yes — use **Forgot password?** (v2/v3 meta) |
| Have password, lost recovery key | Yes — sign in normally; generate a new recovery escrow on next login when applicable |
| Lost both password and recovery key | **No** — data is unrecoverable on that machine |
| Lost recovery key only (before v3 DEK escrow) | Sign in works; password recovery without the key is impossible until re-provisioned |

- **Albatross cannot recover** encrypted local data for you. There is no cloud reset, support unlock, or off-device escrow in this release.

**Forgot password?** (when v2/v3 recovery meta exists): verifies the recovery key, unwraps escrowed key material, opens the database with the instance key (ENC5 — **no SQLCipher rekey** on v2 meta), resets admin password hashes, re-wraps the user instance-key wrapper, re-encrypts client PII under the new password-derived DEK when v3 DEK escrow is present, refreshes recovery sidecar wraps, revokes sessions, and closes the database until sign-in. Legacy v1 meta installs still re-key SQLCipher from password-derived material until login migration runs.

**Login migration (ENC4):** Existing v2 installs silently upgrade to v3 on next successful login by adding `wrapped_dek` using a file-passphrase wrap chain (no recovery key re-entry required). This does not weaken field encryption.

Implementation: [`passwordRecoveryService.ts`](../src/lib/security/passwordRecoveryService.ts), [`recoveryKey.ts`](../src/lib/security/recoveryKey.ts), [`dekEscrowMigration.ts`](../src/lib/security/dekEscrowMigration.ts).

### Admin password reset (ENC7)

User Management **Reset password** (logged-in instance admin) updates the target user's password hash, revokes their sessions, and — on instance-key installs — re-wraps their per-user instance-key wrapper. It does **not** rekey SQLCipher or change the shared instance key.

Valid wrapper paths: target current password (optional field in UI), signed-in admin with unlocked database (default), or recovery-key authorization (service-level only). Hash-only reset without a valid wrapper path is rejected so the user can still unlock the database after reset.

| | **Forgot password?** recovery | **Admin reset (ENC7)** |
|--|------------------------------|------------------------|
| Auth required | No (recovery key) | Yes (logged-in admin) |
| SQLCipher rekey | No on instance-key installs | No |
| Client PII re-encrypt | Yes when v3 DEK escrow exists | No (password hash + wrapper only) |
| Recovery sidecar refresh | Yes | No |
| Session scope | Revokes all sessions | Revokes target user's sessions |

This is separate from **Forgot password?** recovery, which is unauthenticated, may re-encrypt client PII when v3 DEK escrow exists, and refreshes recovery sidecar wraps.

Implementation: [`adminPasswordResetPaths.ts`](../src/lib/security/adminPasswordResetPaths.ts), [`adminUserManagementService.ts`](../src/lib/auth/adminUserManagementService.ts).

**Known limitation:** If SQLCipher rekey succeeds but a later step (for example updating admin password hashes) fails, the database file may already use the new file key while admin rows are inconsistent. Avoid interrupting recovery; a future phase may add stronger transactional guarantees.

Restore `albatross.db.pre-sqlcipher-backup` only if plain→SQLCipher migration failed. Restore `albatross.db.pre-instance-key-backup` only if instance-key migration failed after backup was taken.

## UI vs file encryption

| Layer | Protects |
|-------|----------|
| Auth gate (`AppLayout`) | App shell when not signed in |
| `requireSensitiveDataAccess` | Decrypted client fields in the app |
| Field encryption (`v1:`) | Client columns inside the DB |
| SQLCipher | Entire `albatross.db` file at rest |

## Verification (ENC8 checklist)

Automated tests and manual checks for the completed encryption hardening sequence:

| # | Requirement | Tests / checks |
|---|-------------|----------------|
| 1 | Recovery key shown once; only verifier stored | [`InitialAdminSetupWizard.test.tsx`](../src/features/auth/InitialAdminSetupWizard.test.tsx), [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts), [`keyMaterialStorageAudit.test.ts`](../src/lib/security/keyMaterialStorageAudit.test.ts) |
| 2 | Forgot-password recovery requires recovery key | [`passwordRecoveryService.test.ts`](../src/lib/security/passwordRecoveryService.test.ts), [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts) |
| 3 | Recovery restores client PII when v3 escrow exists | [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts) |
| 4 | SQLCipher instance key independent of user passwords | [`instanceKeyMultiUser.test.ts`](../src/lib/security/instanceKeyMultiUser.test.ts), [`encryptionMigrationRegression.test.ts`](../src/lib/db/migrations/encryptionMigrationRegression.test.ts) |
| 5 | Multiple users unlock with own wrappers | [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts) |
| 6 | Admin reset re-wraps keys correctly | [`adminUserManagementService.test.ts`](../src/lib/auth/adminUserManagementService.test.ts), [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts) |
| 7 | SQLCipher rekey only when instance key changes | [When SQLCipher is rekeyed](#when-sqlcipher-is-rekeyed), [`encryptionLifecycle.test.ts`](../src/test/encryption/encryptionLifecycle.test.ts) |
| 8 | Plaintext secrets not persisted or logged | [`keyMaterialStorageAudit.test.ts`](../src/lib/security/keyMaterialStorageAudit.test.ts), [`auditLog.test.ts`](../src/lib/security/auditLog.test.ts) |
| 9 | Legacy migrations safe | [`encryptionMigrationRegression.test.ts`](../src/lib/db/migrations/encryptionMigrationRegression.test.ts), [`postgresEncryptionMigration.test.ts`](../src/test/postgres/postgresEncryptionMigration.test.ts) |
| 10 | Critical flows documented and covered | This checklist + sections above |

**Manual smoke test**

1. Sign in, create or edit a client.
2. Quit the app. With SQLCipher enabled, `sqlite3 albatross.db .tables` should fail or show garbage (not your tables).
3. Sign in again — Settings → Clients and production contact cards show correct plaintext.
4. Logout: client list queries disabled until sign-in; DB file remains encrypted.

**Test commands**

```bash
npm test -- src/test/encryption src/lib/security/keyMaterialStorageAudit src/lib/db/migrations/encryptionMigrationRegression
cargo test db_encryption:: --manifest-path src-tauri/Cargo.toml
```

## Related

- Field crypto: [`clientFieldCrypto.ts`](../src/lib/security/clientFieldCrypto.ts), [`dataEncryptionContext.ts`](../src/lib/security/dataEncryptionContext.ts)
- File crypto: [`dbFileEncryption.ts`](../src/lib/security/dbFileEncryption.ts), [`instanceKey.ts`](../src/lib/security/instanceKey.ts), [`dbUnlock.ts`](../src/lib/db/dbUnlock.ts), [`loginOrchestration.ts`](../src/lib/auth/loginOrchestration.ts), [`src-tauri/src/db_encryption.rs`](../src-tauri/src/db_encryption.rs)
- Migrations: `0069_client_field_encryption.sql` (SQLite), `0007_client_field_encryption.sql` (Postgres); `0073_user_instance_key_wrapper.sql` (SQLite), `0010_user_instance_key_wrapper.sql` (Postgres)
