# Project Access Control (UAM2)

This document defines instance roles, project access levels, and membership lifecycle for PostgreSQL-backed access control.

## Instance roles

- `user`
  - normal authenticated user
  - can only access projects they are actively assigned to
- `admin`
  - instance administrator
  - can view and manage project access across all projects

## Project access levels

- `viewer`
  - can see project in list
  - can open/read project data
  - cannot mutate project data
  - cannot manage project membership
- `editor`
  - includes `viewer`
  - can mutate normal project data
  - cannot manage project membership
- `administrator`
  - includes `editor`
  - can manage project membership for that project
  - can perform project-level administrative operations

## Permission matrix

- project list visibility: `viewer+` membership, or instance `admin`
- read/open project: `viewer+` membership, or instance `admin`
- write/mutate project: `editor+` membership, or instance `admin`
- manage project membership: project `administrator` or instance `admin`

## Enforcement architecture (UAM5)

- canonical access-check helpers live in `src/lib/access/projectAccessService.ts`:
  - `requireProjectAccess(db, actor, productionId, level)`
  - `requireProjectViewAccess(db, actor, productionId)`
  - `requireProjectEditAccess(db, actor, productionId)`
  - `requireProjectAdminAccess(db, actor, productionId)`
- helpers read from `project_memberships`, apply instance-admin override, and reject disabled users
- authorization failures throw `ProjectAuthorizationError` with:
  - `401 UNAUTHENTICATED` when no actor is present
  - `403 FORBIDDEN` when actor lacks required project access
- service layer is the required enforcement boundary for project-scoped operations
- repositories are data-access/invariant layers and must be called through permission-checked services

## Membership model

- table: `project_memberships`
- one active membership per `(production_id, user_id)` pair (`revoked_at IS NULL`)
- access level constrained to `viewer | editor | administrator`
- memberships are soft-revoked with `revoked_at`

## Project Access Management UI (UAM4)

- location: `Settings -> Project Access` for the currently selected project
- visible to authenticated users only when auth support is enabled
- management actions (add/update/revoke) are enforced server-side and require:
  - instance `admin`, or
  - project access level `administrator` for that project
- viewers/editors/non-members cannot manage membership

### Admin actions

- list current project members
- add user to project with level:
  - `viewer`
  - `editor`
  - `administrator`
- change an existing member access level
- revoke project access (soft revoke via `revoked_at`)

### Audit logging and abuse protection

- membership mutations write append-only audit events in `audit_logs`:
  - `project_access.member_added`
  - `project_access.member_access_changed`
  - `project_access.member_revoked`
- metadata is sanitized and excludes secrets/passwords/hashes/session tokens
- project-access membership mutations are rate limited to prevent rapid abuse

### Safety rules

- final project administrator cannot be removed/demoted
- disabled users are displayed clearly in member lists
- disabled users are excluded from new project assignments
- if current user loses project admin access, management UI exits cleanly on permission refresh

## Service-boundary rules

- project-scoped reads require at least `viewer`
- project-scoped mutations require at least `editor`
- project-scoped admin/destructive actions require `administrator` (or instance `admin`)
- production visibility in UI must use actor-filtered project queries when auth is enabled

## Lifecycle rules

- project creator must be assigned as project `administrator` in the creation transaction
- project importer must be assigned as project `administrator` in the import transaction
- disabled users cannot use memberships for visibility or access
- final project administrator cannot be removed from a project
