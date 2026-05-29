# Admin User Management (UAM3)

Instance admins can manage users at the server/database level.

## What admins can do

- list all users
- create users with role `user` or `admin`
- disable and re-enable users
- reset user passwords
- change instance roles

## Security behavior

- passwords are never stored in plaintext
- password hashes are created server-side
- password hashes are never shown in UI
- password reset revokes active sessions for the target user
- disabling a user revokes active sessions for the target user
- role changes revoke active sessions for the target user
- disabled users cannot authenticate with existing session tokens
- admin password reset is blocked for disabled target users
- on encrypted local installs (instance key mode), admin password reset also re-wraps the target user's instance-key wrapper — it is not a hash-only change
- admin password reset does **not** rekey SQLCipher or rotate the instance key
- reset is blocked when no valid wrapper path exists (see below)

### Admin password reset paths (ENC7)

On instance-key encrypted installs, `resetUserPasswordAsAdmin` must establish a valid new wrapper before updating the password hash:

| Path | When | Behavior |
|------|------|----------|
| **A — current password** | Admin supplies the target user's current password | Unwrap existing wrapper, re-wrap with new password (`rewrapInstanceKeyForUser`) |
| **B1 — admin unlock** | Signed-in admin with database unlocked (default in User Management) | Use in-memory instance key, create replacement wrapper (`replaceUserInstanceKeyWrapper`) |
| **B2 — recovery escrow** | Recovery key verifies (service/tests; not exposed in User Management UI) | Unwrap instance key from recovery sidecar, create replacement wrapper |
| **C — forbidden** | None of the above | Reset rejected before hash or sidecar mutation |

Postgres / non-encrypted installs skip wrapper handling (hash + session revoke only).

Audit metadata for password reset includes `wrapperResetPath` (`old_password`, `admin_unlock`, or `recovery_escrow`) when wrapping applies. Implementation: [`adminPasswordResetPaths.ts`](../src/lib/security/adminPasswordResetPaths.ts), [`adminUserManagementService.ts`](../src/lib/auth/adminUserManagementService.ts).

For full instance recovery (including admin self-reset with DEK re-encryption when v3 escrow exists), use **Forgot password?** on the sign-in screen — not User Management.

## Audit logging

- security-sensitive admin actions are append-only logged in `audit_logs`
- covered actions include:
  - user creation
  - user disable/enable
  - password reset
  - role change
  - failed admin authorization attempts
- audit metadata is sanitized and never stores plaintext passwords, password hashes, secrets, or session tokens

## Rate limiting

- login and bootstrap flows are rate limited
- sensitive admin mutations are rate limited (create user, disable/enable user, reset password, role changes)
- rate limit errors use a stable safe message for UI display
- rate-limit windows and thresholds are configurable in code paths for deterministic tests

## Role semantics

- instance role `user`: standard authenticated user
- instance role `admin`: instance-wide administrative privileges

## Instance role vs project access level

- instance roles (`user` / `admin`) are global to the server/database
- project access levels (`viewer` / `editor` / `administrator`) are per-project memberships
- project access assignment UI is out of scope for UAM3 and handled in UAM4

## Safety rules

- non-admin users cannot access user-management actions
- final active instance admin cannot be disabled or demoted
- current admin cannot disable or demote their own account
