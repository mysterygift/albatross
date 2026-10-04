# Script Supervisor (SS1–SS10)

Developer notes for the on-set Script Supervisor workflow: slates and takes logged against the
stripboard's shoot days, later lined onto the script as tramlines (the UK marked-up script).

## SS1 — data model (this stage)

Migration [`0086_script_supervisor_slates_takes.sql`](../src-tauri/migrations/0086_script_supervisor_slates_takes.sql)
adds two tables. Everything else is reused rather than duplicated:

| Reused | Why |
| --- | --- |
| `shoot_days` (stripboard) | A slate belongs to the day it was shot. `call_time`, `wrap_time` and `meal_times_json` already live here; only a first-shot time is still missing (SS5, Daily Progress Report). |
| `units` | A slate may record which unit shot it. |
| `scenes` | The scene the setup covers. |
| `shots` (shot list) | Optional link from a slate to the planned shot it realises. |

| Table | Notes |
| --- | --- |
| `slates` | One row per camera setup. `slate_prefix` + `slate_number` follow UK consecutive slating: '' main unit, `X` second unit, `Y` unsupervised. A partial unique index keeps live numbers unique per series; a soft-deleted number can be reused. |
| `takes` | One row per take. `status` is `pending`/`print`/`hold`/`ng`/`incomplete`; `ng_reason` only on NG takes (the repository clears it when a take moves off NG). Unique live `take_number` per slate. |

Repository: [`scriptSupervisor.ts`](../src/lib/db/repositories/scriptSupervisor.ts). Pure numbering and
label helpers: [`slateNumbering.ts`](../src/lib/script-supervisor/slateNumbering.ts). Query hooks:
[`features/script-supervisor/hooks.ts`](../src/features/script-supervisor/hooks.ts) (all mutations invalidate
`['script-supervisor']`).

## SS2 — slating system per production

Migration [`0087_script_supervisor_slating_system.sql`](../src-tauri/migrations/0087_script_supervisor_slating_system.sql):

- `production_script_supervisor_settings` (one row per production, absent = UK). Set in **Settings → Script
  supervisor → Slating** ([`ScriptSupervisorSettingsSection.tsx`](../src/features/settings/ScriptSupervisorSettingsSection.tsx)).
- `slates.slating_system` records the system each slate was created under, so labels never change later.
- **UK (default)**: consecutive numbers per series; unique per production + prefix.
- **US**: scene number + setup letter (23, 23A, 23B…, skipping I and O; doubling after Z). `slate_number`
  stores the setup ordinal within the scene (1 = scene alone, 2 = A…), unique per scene. Every US slate needs a scene.
- The setting **locks once any live slate exists** (`SLATING_SYSTEM_LOCKED_ERROR`), so a shoot never mixes systems.
- `getNextSlatePreview` returns the label the next "New slate" will get (UK `217`, US `23B`) for the UI.

## Rules

- **Local SQLite only**, like the SB1 script-section tables. Writes throw `SCRIPT_SUPERVISOR_REMOTE_ERROR`
  for productions whose effective data source is `remote_server`. Not in publish, import/export or postgres yet.
- **Transactions** follow [`DATABASE_LAYER.md`](DATABASE_LAYER.md) §4: `runInSerializedTransaction` + one
  `executeBatch` with outbox rows inside. Next slate/take numbers are read inside the serialized slot so two
  quick taps cannot pick the same number; the unique indexes are the backstop.
- **Soft delete**: deleting a slate soft-deletes its takes in the same batch. Hard delete of a production
  cascades to `slates` → `takes` (checked by `verifyCascades`).
- **Not duplicated** with a production: slates and takes are a record of what was shot, so
  `duplicateProduction` leaves them behind.

## Known gap before lining (SS6)

The script parser's `ScriptElement[]` (action, character, dialogue…) is **in-memory only**; `script_pages`
stores page text, not elements. Tramlines need stable element ids, so SS6 must first persist elements
(e.g. a `script_elements` table written by `generateScriptVersionFromScenes`) and carry them through
revision reconciliation.
