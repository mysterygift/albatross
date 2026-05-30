Written 30th May '26.

The short answer: **local encryption/auth and server auth are almost entirely separate systems.** `albatross-server` does not need SQLCipher, recovery keys, or instance-key sidecars — but it **does** need a clear picture of how the desktop now gates access, what gets published, and where user accounts diverge.

## 1. Two auth systems for local and server use respectively.

| | **Local (desktop / SQLite)** | **Server (`albatross-server`)** |
|--|------------------------------|----------------------------------|
| Purpose | Unlock local DB + access client PII | Collaborative linked projects |
| Login UI | `AuthGateScreen` | `ConnectServerDialog` |
| Credentials | Local `users` in encrypted SQLite | Server `users` in PostgreSQL |
| Password hash | Argon2id ([`passwordHash.ts`](src/lib/auth/passwordHash.ts)) | scrypt `salt:key` ([`password.ts`](albatross-server/src/lib/password.ts)) |
| Session | Local session token in `settings` + `sessions` table | JWT `accessToken` + `refreshToken` |
| Encryption | SQLCipher file + DEK field crypto + sidecars | None today (plain JSONB in Postgres) |

**Implication for server:** Creating a local admin does **not** create a server user. Same username/password on both sides are unrelated unless you provision both manually. Server docs like [`USER_CREATION.md`](albatross-server/docs/USER_CREATION.md) remain the source of truth for server accounts.

**Implication for server:**
- No `albatross.recovery.meta.json`
- No `albatross.instance-key.wrappers.json`
- No forgot-password recovery flow on the server
- No admin reset “wrapper paths” (A/B1/B2)

---

## 2. Local sign-in is now a prerequisite for everything

After ENC, the app shell is gated until the user unlocks the local database:

```29:30:src/app/layout.tsx
  const showAuthGate =
    authSession.authSupported && (!authSession.isAuthenticated || authSession.dbLocked)
```

Flow today:

1. **Cold start** → SQLCipher DB locked → `AuthGateScreen` (sign in or initial setup + recovery key).
2. **Unlock** → `unlockLocalDatabaseWithPassword` → login orchestration (`loginOrchestration.ts`) → DEK established.
3. **Only then** can the user reach server connect, publish, linked runtime, etc.

Server team should assume: **every server API call from desktop happens only after local unlock**, with decrypted data available in-process. Server never receives instance keys, DEK, or recovery material.

---

## 3. What changed locally (ENC summary server team should read)

Point them at [`docs/DATA_ENCRYPTION.md`](docs/DATA_ENCRYPTION.md). The parts that affect *integration thinking* (not server implementation):

- **Instance key (ENC5):** Random SQLCipher key, independent of user passwords; per-user password wraps in a sidecar.
- **Recovery key (ENC2–4):** Shown once at setup; escrow restores DB unlock + client PII after password loss; **local only**, no cloud/support reset.
- **Multi-user (ENC6–7):** Multiple local users share one instance key via separate wrappers; disable/delete/revoke affects **local unlock only**.
- **Admin reset vs forgot password:** Admin reset re-wraps instance key, does **not** rekey SQLCipher; forgot-password recovery refreshes escrow and may re-encrypt client PII (v3).

**Server does not need to implement any of this** unless you explicitly decide server-side encryption is a future phase.

---

## 4. Publish & linked runtime: plaintext on the wire, plaintext on server

Desktop publish loads production data via raw SQL / export paths **after** local unlock ([`loadPublishProductionData.ts`](src/lib/publish/loadPublishProductionData.ts)). Client PII is decrypted in the app before packaging.

`albatross-server` stores imported data in **`runtime_*` tables and `project_entities.payload_json`** — no `clients` table, no `dek_salt`, no field encryption ([`0001_foundation.sql`](albatross-server/src/db/migrations/0001_foundation.sql), [`runtime/repository.ts`](albatross-server/src/modules/runtime/repository.ts)).

**What server needs to know:**

- Publish packages may contain **plaintext PII** that was encrypted only on disk locally.
- Server PostgreSQL becomes the **trust boundary** for linked project data; ops/threat model should treat it accordingly (TLS in transit, DB access control, backups).
- Do **not** expect `v1:` ciphertext blobs or sidecar files in publish payloads.

Albatross’s own Postgres migrations (`0007_client_field_encryption`, `0010_user_instance_key_wrapper`) are for **desktop Postgres adapter / tests**, not `albatross-server`’s schema.

---

## 5. Server auth contract gaps vs current desktop client

Server already implements the contract in [`docs/API.md`](albatross-server/docs/API.md) and [`SERVER_CLIENT_INTEGRATION_CONTRACT.md`](docs/SERVER_CLIENT_INTEGRATION_CONTRACT.md). Desktop integration is thinner in a few places:

| Contract expectation | Server status | Desktop status |
|---------------------|---------------|----------------|
| `POST /v1/auth/login` → `accessToken` | Implemented | Used ([`serverLogin`](src/lib/server/serverClient.ts)) |
| `POST /v1/auth/refresh` | Implemented | **Not wired** — desktop stores access token only, no refresh on 401 |
| `POST /v1/auth/logout` | Implemented | Not clearly used from UI |
| JWT 15m expiry | Server issues 15m tokens | Long-lived access token stored until reconnect |
| Disabled user → 403 | Implemented | Mapped in [`serverErrors.ts`](src/lib/server/serverErrors.ts) |

**Practical impact:** Server should keep refresh working and documented; desktop will eventually need refresh (or longer-lived tokens) — but that’s a **client** gap, not something server breaks because of ENC.

---

## 6. What albatross-server should still align on (non-encryption)

These are unchanged by ENC but matter for “current functionality”:

1. **Integration contract** ([`SERVER_CLIENT_INTEGRATION_CONTRACT.md`](docs/SERVER_CLIENT_INTEGRATION_CONTRACT.md)) — publish pipeline, `If-Match`/`409`, idempotency, ACL, presence.
2. **Runtime REST** — resource-specific routes (`/v1/projects/:id/scenes`, etc.); legacy `/entities` deprecated on server.
3. **Joint test matrix** — server has [`client_server_flow.test.ts`](albatross-server/test/joint/client_server_flow.test.ts); keep it green against desktop publish shape.
4. **Security hygiene** — audit log redaction, no secrets in logs (server already has Pino redaction per CHANGELOG).
5. **User provisioning** — separate server admin bootstrap (`DEFAULT_ADMIN_*` env) vs desktop initial admin wizard.

---

## 7. Recommended doc additions for albatross-server

Worth adding to server docs (conceptually — I’m in Ask mode so not editing):

1. **“Local vs server security boundary”** — one page stating server never sees SQLCipher keys, recovery keys, or DEK; linked data is plaintext at server after publish.
2. **“Account model”** — local users ≠ server users; password hash algorithms differ; no SSO between them today.
3. **“Desktop prerequisites”** — client must be locally unlocked; cold start blocks all server UX.
4. **“Data at rest on server”** — JSONB runtime rows are not encrypted; ops/backup implications.
5. **Optional future work** — if you ever want parity: server-side field encryption, unified identity, or encrypted publish payloads (none of this exists now).

---

## 8. What you do *not* need to port to albatross-server

- SQLCipher / `db_encryption.rs` unlock flows  
- Recovery key escrow / forgot-password recovery  
- Instance-key wrapper sidecars  
- ENC7 admin reset wrapper paths  
- Local migration regression (plain→SQLCipher, v1→instance key)  
- `keyMaterialStorageAudit` static walks (server codebase is separate; apply similar *principles* to JWT/logging)

---

## Bottom line

Server work stays focused on JWT auth, publish/import, linked runtime, ACL, presence, and idempotency — while understanding that:

1. Desktop users always unlock locally first.  
2. Server accounts and local accounts are independent.  
3. Published/linked data arrives and is stored **decrypted** on the server.  
4. Desktop still needs refresh-token wiring; server should keep that endpoint stable.
