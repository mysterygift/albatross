# Security

How Albatross authenticates users, encrypts data at rest and controls access to productions, and what none of that protects against.

The README disclaimer applies: Albatross was built with heavy AI assistance, has not had an independent security audit, and its encryption is defence in depth, not a guarantee.

## Code map

| Area | Location |
|---|---|
| Sign-in, sessions, password hashing | `src/lib/auth/` (`authService.ts`, `passwordHash.ts`, `sessionToken.ts`, `useAuthSession.ts`, `loginOrchestration.ts`) |
| Setup wizard, sign-in, recovery UI | `src/features/auth/` (`setup/`, `AuthGateScreen.tsx`, `ForgotPasswordRecoveryCard.tsx`) |
| File key, wrappers, recovery key | `src/lib/security/` (`dbFileEncryption.ts`, `instanceKey.ts`, `recoveryKey.ts`, `passwordRecoveryService.ts`, `dekEscrowMigration.ts`, `instanceKeyMigration.ts`) |
| Field encryption | `src/lib/security/` (`dataEncryptionContext.ts`, `clientFieldCrypto.ts`, `sensitiveEntityFieldCrypto.ts`, `sensitiveTables.ts`, `sensitiveDataAccess.ts`) |
| Unlock flow | `src/lib/db/dbUnlock.ts`, `src/lib/db/client.ts` |
| Native SQLCipher | `src-tauri/src/db_encryption.rs`, `src-tauri/src/sqlite_load.rs`, `src-tauri/src/sqlite_paths.rs` |
| Access control | `src/lib/access/` (`projectAccess.ts`, `projectAccessService.ts`, `projectDomainService.ts`) |
| Admin user management | `src/lib/auth/adminUserManagementService.ts`, `src/lib/security/adminPasswordResetPaths.ts`, `src/features/admin/` |
| Audit log, rate limits | `src/lib/security/auditLog.ts`, `src/lib/security/rateLimiter.ts` |
| Tests | `src/test/encryption/` (lifecycle harness), `src/lib/security/*.test.ts` (`clientsRawSqlAccess.test.ts` fails on raw `clients` SQL outside allowlisted repositories), `encryptionMigrationRegression.test.ts` |

## What is encrypted where

| Data | Where | Protection | Key |
|---|---|---|---|
| Entire `albatross.db` (every table, indexes, settings) | App config directory | SQLCipher | Random instance key |
| `clients`: `name`, `email`, `phone` | Inside the database | AES-256-GCM, `v1:` prefix | DEK |
| `people`: `name`, `email`, `phone`, `department`, `notes`, `cast_number`, `agent_name`, `agent_email`, `agent_phone`, `role_name` | Inside the database | AES-256-GCM, `v1:` prefix | DEK |
| `locations`: `name`, `address`, `what3words`, `parking_info`, `availability_constraints`, `notes`, `contact_name`, `contact_email`, `contact_phone` | Inside the database | AES-256-GCM, `v1:` prefix | DEK |
| `vendors`: `company_name`, `primary_contact_full_name`, `primary_contact_email` | Inside the database | AES-256-GCM, `v1:` prefix | DEK |
| Sort columns (`name_sort_key`, `company_name_sort_key`) | Inside the database | HMAC-SHA256 blind index (see below) | DEK |
| Passwords | `users.password_hash` | Argon2id hash | Per-hash salt |
| Session tokens | `sessions.token_hash` | SHA-256 of a random 32-byte token | None |
| Instance key, per user | `albatross.instance-key.wrappers.json` | AES-256-GCM wrap (`wrap1:`) | Argon2id(password, `wrap_salt`) |
| Instance key and DEK escrow | `albatross.recovery.meta.json` | AES-256-GCM wrap (`wrap1:`) | Argon2id(recovery key, salt) |
| Document and attachment files | `attachments/<productionId>/` in app data | Not encrypted | None |
| `.apf` exports | Wherever the user saves them | Not encrypted, PII in plaintext | None |
| Plaintext key material (instance key, DEK, passwords, recovery key) | Nowhere on disk | Memory only; `keyMaterialStorageAudit.test.ts` fails if it is persisted or logged | None |

Field encryption is layered under SQLCipher. The registry is `SENSITIVE_TABLES` in `src/lib/security/sensitiveTables.ts`; a column listed there must be read and written through its repository, which calls `requireSensitiveDataAccess()` first.

## Local authentication

- **Tables:** `users` (`username` lowercased, `password_hash`, `role`, `disabled_at`, `dek_salt`, `instance_key_wrap_*` mirror columns) and `sessions` (`token_hash`, `expires_at`, `revoked_at`).
- **Password hashing:** Argon2id via `hash-wasm` (2 iterations, 19,456 KiB, parallelism 1, random 16-byte salt). Minimum password length is 8; usernames are at most 128 characters.
- **Sessions:** a random 32-byte token, stored hashed. The default lifetime is 30 days. The raw token is kept in `settings.auth_session_token` and cleared on every app start, so each launch needs a fresh sign-in (the database is locked anyway).
- **Login:** unknown and disabled users run a dummy hash verify so timing does not reveal which usernames exist. All failures return `Invalid credentials`.
- **Rate limits:** in-memory sliding windows in `rateLimiter.ts`: login 5 per minute, recovery 5 per minute, bootstrap 3 per 5 minutes, admin mutations 30 per minute, project-access mutations 40 per minute. They reset on restart.
- **Auth is local to the machine.** Server sign-in is separate; see [collaboration.md](collaboration.md#two-sign-ins).

### First-run setup wizard

`src/features/auth/setup/` runs the steps `welcome → detect → admin → recovery → committing → done`.

1. **Detect** (`installDetection.ts`) classifies the install (fresh, complete, legacy plain, legacy password-derived, half-finished setup or inconsistent) and routes to setup, sign-in or repair.
2. `runSetupEncryption` generates the instance key, converts any plain database with `sqlcipher_export`, writes `albatross.db.meta.json` (v2) and opens the file in memory. The admin password is never the file key.
3. **Admin** collects username and password (`credentialPolicy.ts`).
4. **Recovery** generates the recovery key and shows it once. The user must confirm they saved it.
5. `runSetupCommit` creates the admin's wrapper, derives the DEK, writes the recovery sidecar, encrypts any legacy plaintext rows, then signs in. On failure the database is closed and the user retries from the start.

### Sign-in

`performFullLoginSequence` (`loginOrchestration.ts`):

1. `unlockLocalDatabaseWithPassword` finds the user's wrapper in the sidecar, unwraps the instance key with their password and opens the pool with `PRAGMA key`. An unknown, revoked or wrong-password user gets the single message `Unable to unlock local database`.
2. `login` verifies the password hash against the now readable `users` table and creates a session.
3. `migrateToInstanceKeyModeIfNeeded` upgrades legacy installs (see below).
4. `establishDataEncryptionKey` derives the DEK and holds it in memory.
5. `ensureDekEscrowOnLogin` upgrades the recovery sidecar to v3 if needed, then the backfills encrypt any plaintext client, person, location and vendor rows.

Logout (`clearPersistedAuthSession`) revokes the session, clears the DEK and file key and closes the pool.

## File encryption (SQLCipher)

- The desktop app links SQLCipher through `libsqlite3-sys` with `bundled-sqlcipher-vendored-openssl` (`src-tauri/Cargo.toml`). `tauri-plugin-sql`/`sqlx` and `rusqlite` share that one build.
- **Instance key:** 32 random bytes as 64 hex characters, generated once per install. It is passed to `PRAGMA key` as a passphrase, so SQLCipher's own KDF still applies. It is never stored in plaintext.
- **Locked state:** the app does not open the database at launch. While `albatross.db.meta.json` exists and no key is loaded, `getDb()` throws `DatabaseLockedError`.
- **Keyed load:** `tauri-plugin-sql` migrates on load without a key, so `load_sqlite_with_passphrase` in `sqlite_load.rs` connects, applies `PRAGMA key`, verifies with a read, runs the migrations and registers the pool.
- **Native commands** (`db_encryption.rs`, registered in `lib.rs`): `get_local_db_status`, `probe_sqlcipher_passphrase`, `migrate_plain_db_to_sqlcipher` (backs up to `albatross.db.pre-sqlcipher-backup`, runs `sqlcipher_export` to `albatross.db.new`, replaces the file), `rekey_sqlcipher_database` (`PRAGMA rekey`, then checks the old key fails), the `*_instance_key_backup` and `*_pre_sqlcipher_backup` backup/restore commands, and `sqlcipher_self_test`.

### Key and sidecar files

All three sit next to `albatross.db` in the app config directory (`app_config_dir`). They are not secret on their own, but the database is unreadable without them.

| File | Contents |
|---|---|
| `albatross.db.meta.json` | v2: `key_mode: "instance_key"` (plus `legacy_kdf_salt`, `migrated_at` after an upgrade). v1 (legacy): `kdf_salt` only. Its presence is what marks the database as encrypted. |
| `albatross.instance-key.wrappers.json` | One entry per user: `user_id`, lowercase `username`, `wrap_salt`, `wrapped_instance_key`, `created_at`, `rotated_at`, `revoked_at`. Read before the database opens, which is how the username is matched to a wrapper. |
| `albatross.recovery.meta.json` | Recovery key verifier and escrow (versions below). |

Wrapper lifecycle (`adminUserManagementService.ts`, `instanceKey.ts`):

| Event | Wrapper |
|---|---|
| Create user | New wrap of the shared instance key, written to the sidecar and mirrored in `users.instance_key_wrap_*` |
| Disable / enable | `revoked_at` set / cleared; no rekey |
| Delete | Entry removed |
| Admin password reset | Entry re-wrapped under the new password |

### What losing a file or secret means

| Lost | Result |
|---|---|
| Password, recovery key kept | Recoverable with **Forgot password?** |
| Recovery key, password kept | Sign in works. **Forgot password?** is no longer possible, and the UI has no way to issue a new recovery key. |
| Password and recovery key | Unrecoverable. There is no cloud reset, support unlock or off-device escrow. |
| `albatross.instance-key.wrappers.json` | No user can unlock the database. Only a recovery-key reset can restore access, and only if the recovery sidecar survives. |
| `albatross.recovery.meta.json` | Normal sign-in works; **Forgot password?** is unavailable. |
| `albatross.db.meta.json` | The app no longer treats the database as encrypted and cannot open it. Restore the file from a backup of the config directory. |

Back up the config directory (database, sidecars, `attachments/`) together; a database copy without its sidecars is useless.

### Rekeying

SQLCipher is rekeyed only when the instance key itself changes.

| Event | Rekey |
|---|---|
| Fresh install, **Forgot password?**, admin password reset | No. Only wrappers and password hashes change. |
| First sign-in after upgrading a legacy (meta v1) install | Yes: password-derived key to random instance key, with a `pre-instance-key-backup` first |
| **Forgot password?** on a legacy (meta v1) install | Yes, to a key derived from the new password |

Instance key rotation is not implemented. Restore `albatross.db.pre-sqlcipher-backup` only if the plain-to-encrypted conversion failed, and `albatross.db.pre-instance-key-backup` only if the legacy upgrade failed after the backup was taken.

## Field-level encryption

- **DEK:** 32 bytes derived at sign-in with Argon2id (same parameters) from the user's password and their `users.dek_salt`. It is held in `dataEncryptionContext.ts` memory until logout.
- **Format:** `v1:` + base64(12-byte IV ‖ AES-256-GCM ciphertext). `null` and empty strings stay `null`. A value without the prefix is read as legacy plaintext until the backfill encrypts it.
- **Blind index:** `name_sort_key` / `company_name_sort_key` is the base64 HMAC-SHA256 of the lowercased, trimmed name under the DEK. Ciphertext cannot be sorted, so this column gives the database a stable value to `ORDER BY` without exposing names. It orders by HMAC value, not alphabetically.
- **Enabled when** the `users` table exists (`isClientEncryptionEnabled`). Without the DEK, `requireSensitiveDataAccess()` throws `EncryptionKeyUnavailableError`; React Query hooks gate on `canFetchSensitiveClientData(authSupported, isAuthenticated)`.
- **Backfills** (`src/lib/db/migrations/`): `backfillClientEncryption.ts` and `backfillSensitiveEntityEncryption.ts` run on every sign-in. `reencryptClientFields.ts` re-keys all four tables when recovery changes the DEK.
- Exports and publish decrypt people, locations and vendors; `.apf` import re-encrypts them. See [import-export.md](import-export.md#security-notes).
- Migrations: `0069_client_field_encryption.sql` (adds `users.dek_salt`, `clients.name_sort_key`), `0073_user_instance_key_wrapper.sql`. Postgres equivalents are `0007_` and `0010_` in `postgres/migrations/`.

## Recovery key and Forgot password

The recovery key is 32 random bytes, shown as eight groups of eight hex characters. It is shown once at setup and never stored. `albatross.recovery.meta.json` holds:

| Version | Holds | Recovers |
|---|---|---|
| 1 | Argon2 verifier | Nothing (recovery unavailable) |
| 2 | Verifier, `wrapped_file_passphrase` (the instance key; on upgraded installs a chained `wrapped_instance_key_escrow`) | Database access, not field data |
| 3 | v2 plus `wrapped_dek` and `dek_wrap_mode` | Database access and field data |

`dek_wrap_mode` is `recovery` (wrapped directly under the recovery key; written at setup and after any recovery) or `file_passphrase` (wrapped under the file key; written when a v2 install upgrades silently at sign-in).

**Forgot password?** (`passwordRecoveryService.ts`, on the sign-in screen when recovery metadata exists):

1. Rate limit, then verify the recovery key. Failures and missing metadata take the same time and return `Recovery failed`.
2. Unwrap the instance key (and the escrowed DEK on v3) and open the database.
3. Set the new password hash on the admin (all active admins when none is named), replace the target admin's wrapper, and revoke every session.
4. On v3, re-encrypt all protected fields from the escrowed DEK to one derived from the new password, then refresh the escrow.
5. Close the database; the user signs in again.

Only the recovered admin gets a matching DEK back. See Known limitations.

## Admin password reset

**Settings → User Management** (`/settings/users`, instance admins only) lists, creates, disables, enables, deletes and resets users and changes roles. It is distinct from **Forgot password?**: it needs a signed-in admin, does not re-encrypt field data and revokes only the target's sessions.

`resetUserPasswordAsAdmin` must produce a valid wrapper before it changes the hash, by one of these paths (recorded as `wrapperResetPath` in the audit log):

| Path | When |
|---|---|
| `old_password` | The admin supplies the target's current password; the old wrapper is re-wrapped |
| `admin_unlock` | The default: the admin's unlocked session supplies the instance key for a replacement wrapper |
| `recovery_escrow` | A recovery key authorises it (service level only; not in the UI) |

With none of these the reset is rejected before anything is written. A reset for a disabled target is rejected.

Safety rules: only active admins may call these functions; the final active admin cannot be disabled, deleted or demoted; admins cannot disable, delete or demote themselves; disabling, deleting, a role change or a reset revokes the target's sessions. New passwords must be at least 8 characters.

## Access control

Instance role (`users.role`, `user | admin`) is global. Project access (`project_memberships`) is per production:

| Level | Can |
|---|---|
| `viewer` | See the production in lists, read its data |
| `editor` | Viewer plus change production data, duplicate it |
| `administrator` | Editor plus manage members, archive, delete |

Instance admins have administrator rights on every production without a membership. Disabled users have none.

- **Memberships:** `project_memberships` (SQLite `0066`, Postgres `0004`) has at most one active row per `(production_id, user_id)` (`revoked_at IS NULL`); revocation is soft. The last project administrator cannot be removed or demoted.
- **Service boundary:** `projectAccessService.ts` provides `requireProjectViewAccess`, `requireProjectEditAccess`, `requireProjectAdminAccess`. They throw `ProjectAuthorizationError` (`401 UNAUTHENTICATED`, `403 FORBIDDEN`). `projectAccessService.ts` and `projectDomainService.ts` expose `*ForActor` resolvers that check access, then call the repository. Pages call the `ForActor` variants when auth is active; repositories do not check access themselves.
- **Visibility:** `listVisibleProjectsForActor` returns every production to admins and only membership productions to everyone else.
- **Lifecycle:** `createProjectForActor` inserts the creator as `administrator` in the same batch as the production, but the Productions page does not call it and `importProductionFromApf` creates no membership. Productions created or imported in the app therefore have no members and are visible only to instance admins until one grants access.
- **UI:** **Settings → Project Access** (`/settings/project-access`) manages members of the current production; it needs production administrator or instance admin. Admin-side grants live in `adminUserManagementService.ts` (`grantUserProjectAccessAsAdmin` and friends).
- The same service code runs against the optional server's Postgres database. Server sign-in and project listing are in [collaboration.md](collaboration.md).

### Audit log

`appendAuditLog` writes to `audit_logs` (actor, target, production, action, sanitised metadata, IP, user agent). Metadata is deny-by-default: each known action in `AUDIT_METADATA_POLICY` whitelists a few validated scalar fields; usernames, contact data, hashes, keys and tokens are never recorded, and unknown actions keep no metadata. Covered: `auth.*` (setup, login, recovery, escrow), `admin.*` (user create, disable, enable, delete, role change, password reset, denied admin calls, project-access grants) and `project_access.*`.

The table exists only in Postgres (`postgres/migrations/0005_uam6_audit_logs.sql`). Writes are best-effort and errors are swallowed, so a local desktop install records no audit trail.

## Legacy installs
Older installs derived the file key from the admin password and `kdf_salt` (meta v1). On the next sign-in, `migrateToInstanceKeyModeIfNeeded` unlocks with that key, verifies the password, takes the backup, rekeys to a random instance key, writes the user's wrapper, updates the recovery escrow and rewrites the meta as v2. The v1 code paths in `dbFileEncryption.ts`, `dbUnlock.ts` and `passwordRecoveryService.ts` exist only for this.

## Building SQLCipher
- `libsqlite3-sys` (0.30) and `rusqlite` (0.32) both enable `bundled-sqlcipher-vendored-openssl`. `openssl-src` compiles OpenSSL during `cargo build`, so a C toolchain and Perl must be on the PATH. macOS needs nothing extra; Windows needs the Visual Studio C++ build tools and a Perl such as Strawberry Perl, and the first build is slow.
- Native checks: `cargo test db_encryption:: --manifest-path src-tauri/Cargo.toml`. JS checks: `npm test -- src/test/encryption src/lib/security src/lib/db/migrations/encryptionMigrationRegression`.

## What is and is not protected

Protected: the database file and its sidecars against someone who copies them off a powered-off machine without the password; field data against anyone who opens the database with a key but without a user's password.

Not protected:
- Anything while the app is signed in. Keys and decrypted data live in process memory, and a signed-in user sees whatever their access allows.
- Attachments and `.apf` files, which are plaintext.
- Metadata outside the encrypted columns (production names, dates, budgets, scripts and so on are protected only by SQLCipher).
- A compromised machine, keylogger or malicious build.
- Weak passwords: the only policy is a minimum length of 8.

## Known limitations

- **Per-user DEK.** Each user derives their own DEK from their own `dek_salt`, and recovery escrows only the recovering admin's DEK. Protected columns written by one user are not decryptable with another user's DEK, so multi-user local installs do not share people, location, vendor or client fields reliably. Confirm before relying on more than one local user.
- If a recovery rekey succeeds but a later step fails, the file key and database rows can disagree. Do not interrupt **Forgot password?** on a legacy install.
- Rate limits are per process and reset on restart. There is no local audit trail.
