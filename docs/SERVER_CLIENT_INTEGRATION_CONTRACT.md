# Albatross Server-Client Integration Contract

This document defines what the `albatross-server` team must implement so the desktop client (`albatross`) can safely interoperate in publish + linked-runtime collaboration mode.

It is written as a delivery checklist and behavioral contract, not as a high-level architecture pitch.

## Scope

This contract covers:
- Auth/session and project discovery APIs used by desktop connection flows.
- Publish job lifecycle (`create -> upload -> commit -> poll`) and error semantics.
- Linked-runtime read/write APIs for priority entities.
- Optimistic concurrency and conflict behavior expected by the desktop UX.
- Presence, offline/retry, and idempotency requirements.
- Compatibility tests and release gates required before client rollout.

This contract does not redefine local-only desktop behavior for unlinked projects.

## 1) Non-negotiable compatibility principles

- **Stable JSON contract**: no breaking response shape changes without versioning.
- **UUID identity preservation**: preserve IDs from publish payloads where possible; avoid hidden server-side remapping that breaks client references.
- **Deterministic errors**: client depends on reliable HTTP status mapping for UX state transitions.
- **Optimistic concurrency**: all linked writes must support `If-Match` style preconditions and return `409` conflicts consistently.
- **Retry safety**: publish commit and mutation retries must be safe (idempotent or deduplicated).
- **Role enforcement everywhere**: every project-scoped endpoint must enforce membership and role.

## 2) Auth, session, and discovery requirements

## 2.1 Required endpoints

- `POST /v1/auth/login`
- `GET /v1/me`
- `GET /v1/projects`
- `GET /v1/projects/:id` (recommended; required for richer open/join flow)

## 2.2 Login contract

`POST /v1/auth/login` must:
- Accept username + password.
- Return a bearer token in one of these keys (client currently tolerates all): `accessToken`, `token`, or `sessionToken`.
- Return `401` for invalid credentials.
- Return `403` for valid-but-disabled/forbidden users.

## 2.3 `GET /v1/me` contract

Must return a stable object with at least:
- server account identity (`id`, `username`/`email`, display name as available),
- role capabilities needed by UI gating (instance and/or project-level where applicable),
- workspace/org context if multi-tenant.

## 2.4 `GET /v1/projects` contract

Must return projects visible to current token, including:
- `id`
- `name`
- optional metadata used by desktop linking UI (`slug`, URL, membership role).

Response may be either:
- array payload, or
- object wrapper containing `projects`.

The server should keep this stable and documented. Prefer one canonical shape.

## 3) Publish pipeline contract

Desktop flow:
1. `POST /v1/publish/jobs`
2. `PUT /v1/publish/jobs/:id/package` (multipart)
3. `POST /v1/publish/jobs/:id/commit`
4. `GET /v1/publish/jobs/:id` poll until terminal state

## 3.1 `POST /v1/publish/jobs`

Server must:
- Create a durable job record.
- Validate caller can publish into target workspace/project namespace.
- Return `job.id` immediately.
- Accept and store optional idempotency metadata for later dedupe.

Minimum response:
- `id`
- optional upload hints (`uploadUrl`, size limits, supported format version).

## 3.2 `PUT /v1/publish/jobs/:id/package`

Server must:
- Accept multipart package upload.
- Validate content type and max size.
- Tie uploaded artifact to job atomically.
- Return deterministic 4xx/5xx errors (not opaque 200 with embedded failure).

If upload fails mid-stream, job remains resumable or clearly failed with reason.

## 3.3 `POST /v1/publish/jobs/:id/commit`

Server must:
- Be idempotent for repeated commit calls.
- Run validation + import transactionally.
- Set terminal status to `succeeded` or `failed`.
- Return link metadata needed by client on success:
  - remote project id
  - remote project URL (if available)
  - optional member list summary

If server supports long-running async commit, endpoint can return accepted/in-progress, but `GET /v1/publish/jobs/:id` must expose progress and final result deterministically.

## 3.4 `GET /v1/publish/jobs/:id`

Must expose:
- `status` (`created`/`uploading`/`validating`/`importing`/`succeeded`/`failed` etc.)
- stage/progress text suitable for UI
- error classification + message on failure
- resulting remote project identifiers on success

Desktop currently relies on polling and terminal-state detection, so terminal states must be explicit and never ambiguous.

## 3.5 Publish error mapping requirements

Use consistent status + machine-readable error kind:
- `400/422` validation/preflight failures
- `401/403` auth/permission failures
- `404` missing job or project
- `409` conflict/duplicate publish semantics
- `5xx` server/internal failures

Include a stable `code`/`kind` field in JSON errors. Free-form `message` is user-facing fallback only.

## 4) Linked-runtime API requirements

Priority entities (minimum):
- `productions`
- `scenes`
- `shots`
- `shoot_days`
- `budget_items`
- `expenses`

Recommended project-scoped resource shape:
- list: `GET /v1/projects/:id/<resource>`
- get one: `GET /v1/projects/:id/<resource>/:rowId`
- create: `POST /v1/projects/:id/<resource>`
- update: `PATCH /v1/projects/:id/<resource>/:rowId`
- delete: `DELETE /v1/projects/:id/<resource>/:rowId`

Server may return either bare object/array or `{ data: ... }`; desktop supports both in some routes, but server should standardize one shape and document it.

## 4.1 Concurrency contract (`If-Match`)

For mutable linked resources:
- Client sends `If-Match: <updated_at-or-version>`.
- Server validates precondition against current row version.
- On mismatch, return `409 Conflict` with latest version metadata (`updated_at`/version, optionally row snapshot).

No silent last-write-wins for linked edits.

## 4.2 Conflict payload recommendations

On `409`, include:
- stable `code` (for example `write_conflict`),
- authoritative `updated_at` or revision token,
- optional current server row fragment for richer resolution UX.

Desktop uses this to set `link_state='conflict'` and guide reload/discard behavior.

## 5) Link/unlink contract

Required behavior for unlink endpoint:
- `DELETE /v1/projects/:id/links/:client`
- Accept client-install identifier from desktop.
- Revoke that client registration without deleting project/team data.
- Return `404` only when truly absent; desktop may treat unlink 404 as already-unlinked.

## 6) Presence contract

Presence websocket:
- Endpoint: `/v1/presence?project=<id>&token=<bearer>`
- Token auth required.
- Return collaborator count and/or membership events.
- Keep payload schema stable and lightweight.

On auth failure/closure, use explicit close codes/messages so client can degrade gracefully.

## 7) Offline, retry, and idempotency requirements

Because desktop queues mutations offline:
- Server must tolerate retried POST/PATCH/DELETE requests without duplicate side effects when idempotency keys are provided.
- For publish commit and other expensive operations, enforce idempotency key semantics server-side.
- Return transient network/proxy errors as non-2xx so client keeps outbox entries queued.

Recommended:
- support `Idempotency-Key` header on mutating endpoints,
- persist key + result hash for bounded TTL.

## 8) Security requirements

- Never return or log secrets/tokens in response bodies, error traces, or audit payloads.
- Enforce project ACL checks in handler or middleware, not just in UI assumptions.
- Validate project membership for every project-scoped read and write.
- Audit log minimally: request id, actor id, project id, action, result, timestamp.

## 9) Observability and operability requirements

Must expose:
- health/readiness endpoints,
- structured logs,
- metrics for publish jobs, conflict rates, 4xx/5xx rates, latency percentiles.

Publish-specific observability:
- job create/upload/commit timings,
- import validation failure categories,
- asset ingest/storage failures,
- per-stage terminal reason codes.

## 10) Versioning and change management

- Any breaking contract changes require explicit API versioning (`/v2/...` or negotiated version header).
- Additive fields are allowed; field removals/renames are not.
- Server release notes must include client-impacting contract changes and migration instructions.

## 11) Compatibility test matrix (required before rollout)

Server team should provide automated integration tests for:
- login success/failure (`200`, `401`, `403`),
- project listing by role (admin/editor/viewer/none),
- publish happy path end-to-end (`create -> upload -> commit -> poll -> success`),
- publish failure path with machine-readable error kind,
- linked write conflict returns `409` with latest version token,
- ACL enforcement on all project-scoped endpoints (`403`),
- unlink behavior (`200/204` and idempotent `404` handling),
- presence connect/auth failure and reconnect behavior.

Desktop+server joint test:
- "client builds package -> server imports -> linked edits round-trip -> offline queue replay -> conflict handling".

## 12) Release gates for server readiness

Do not declare server ready for desktop linking until:
- publish and linked-runtime test matrix is green in CI,
- concurrency conflict behavior verified with parallel writers,
- idempotency behavior validated under retries/timeouts,
- ACL penetration checks complete,
- observability dashboards + alerts are live,
- rollback/backfill plan documented.

## 13) Open decisions to align early

Before final implementation, server and client teams should explicitly align on:
- canonical response envelope (`{ data }` vs bare payload),
- canonical error schema (`code`, `message`, `details`),
- authoritative version token (`updated_at` vs integer revision),
- idempotency key scope + TTL,
- presence event schema (count-only vs join/leave detail),
- project URL format returned post-publish.

---

If these requirements are met, `albatross-client` can safely support:
- connect + validate server destination,
- publish with resumable status UI,
- linked project runtime reads/writes,
- offline queuing + replay,
- deterministic conflict and presence UX.
