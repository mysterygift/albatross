# SQLCipher — full local DB encryption (Phase 3)

## Status

**Implemented.** The desktop app builds `tauri-plugin-sql` / `sqlx` against SQLCipher (`libsqlite3-sys` + `bundled-sqlcipher-vendored-openssl`). See [`DATA_ENCRYPTION.md`](DATA_ENCRYPTION.md) for operator verification.

## Architecture

| Layer | Key | Material |
|-------|-----|----------|
| **File (SQLCipher)** | 64-char hex `PRAGMA key` | Argon2id(password, `instance_kdf_salt`) — salt in plaintext sidecar `albatross.db.meta.json` |
| **Fields (Phase 1)** | DEK | Argon2id(password, `users.dek_salt`) — unchanged |

The file key cannot be derived from the DEK alone (DEK salt lives inside the encrypted DB). Password + instance salt unlock the file first; then DEK is derived after `users` is readable.

## Lifecycle

1. **No preload** — [`tauri.conf.json`](../src-tauri/tauri.conf.json) does not open the DB at launch.
2. **Locked** — When `albatross.db.meta.json` exists and the pool is closed, `getDb()` throws `DatabaseLockedError`.
3. **Sign-in** — [`unlockLocalDatabaseWithPassword`](../src/lib/db/dbUnlock.ts) migrates plain → encrypted if needed, then [`openDbWithFileKey`](../src/lib/db/client.ts).
4. **Logout** — `clearDataEncryptionKey()`, `clearDbFileKey()`, `closeDb()`.

## Migration (existing installs)

Rust command `migrate_plain_db_to_sqlcipher`:

1. Backup `albatross.db` → `albatross.db.pre-sqlcipher-backup`
2. `sqlcipher_export` to `albatross.db.new`, atomic replace
3. Sidecar written from TypeScript after success

Triggered on first login after upgrade when the file still has a plain SQLite header.

## Native build

[`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml):

- `libsqlite3-sys` with `bundled-sqlcipher-vendored-openssl` (unifies sqlx + rusqlite)
- `rusqlite` for migration / self-test ([`db_encryption.rs`](../src-tauri/src/db_encryption.rs))

**CI / platforms:** macOS builds in dev; Windows may need OpenSSL toolchain (vcpkg) for the same feature. Run `cargo test sqlcipher_self_test_runs` in `src-tauri`.

## Commands (Tauri invoke)

| Command | Purpose |
|---------|---------|
| `get_local_db_status` | File exists, plain header, meta exists |
| `probe_sqlcipher_passphrase` | Test key against encrypted file |
| `migrate_plain_db_to_sqlcipher` | One-time export |
| `sqlcipher_self_test` | Dev/CI SQLCipher sanity check |

## Multi-user note

One SQLCipher passphrase per instance (from the signing-in user's password + instance salt). Additional `users` rows are app-level auth inside the unlocked file.

## Phase 1 interaction

Keep column encryption after SQLCipher ships (defense in depth, Postgres parity). Revisit simplifying to file-only encryption after one release cycle.
