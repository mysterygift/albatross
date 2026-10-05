# Experimental on-set features

Features aimed at the iPad as an on-set companion: capturing data during the shoot that feeds budget and
schedule decisions. They are **experimental**: hidden unless **Settings → Developer → Show experimental
features** is on.

| Feature | Route | Data |
| --- | --- | --- |
| Receipt Capture | `/budget/receipt-capture` | Existing `expenses`, `expense_receipts`, `documents`, `float_expense_links` |
| Overtime | `/people/overtime` | New: `production_crew_hours_settings`, `crew_day_hours`, `crew_hours_person_settings` (migration 0102). Unit times from `script_supervisor_day_logs` |
| Script Supervisor | `/schedule/script-supervisor` | See [script-supervisor.md](script-supervisor.md) |

The **Night Shoot** theme (Settings → Appearance) is a regular theme, not behind the flag.

## The experimental flag

- Setting `show_experimental` in the `settings` table, default `'false'`; hook `useShowExperimental()`.
- Nav entries carry `experimental: true` (`src/app/navigation.ts`). `visibleNavGroups(showExperimental)` filters the
  tree for the sidebar (`app-sidebar.tsx`) and the search palette (`buildGlobalSearchCommands`). When shown, entries
  carry a flask icon; each page shows an **Experimental** badge.
- Routes stay registered whatever the flag, so breadcrumbs and links into these pages keep working. Hiding a feature
  never deletes its data.
- The toggle is on the **Developer** settings page, which is listed in every build and whether or not developer mode
  is on (`ExperimentalFeaturesSettingsCard`). Dev diagnostics on that page still need developer mode and a dev build.
- To mark another feature experimental, add `experimental: true` to its nav entry; the settings card lists it
  automatically (`experimentalNavLabels`).

## Receipt Capture

`ReceiptCapturePage` → `saveCapturedReceipt` (`src/lib/db/receiptCaptureService.ts`).

- **Take photo** uses a file input with `capture="environment"`, which opens the rear camera on iPad/iPhone (desktop
  shows a file picker). **Choose photo or PDF** opens the library or Files. iOS needs `NSCameraUsageDescription`
  (in `src-tauri/Info.ios.plist` and the generated `gen/apple/app_iOS/Info.plist`); without it iOS terminates the app.
- Photos over 1.5 MB are scaled to 2400 px on the longest edge and re-encoded as JPEG before storage
  (`prepareReceiptPhoto.ts`); PDFs and anything the web view cannot decode are stored unchanged.
- Saved as a **purchase** expense (description, vendor, amount, optional VAT rate) with the photo as its receipt, in
  one transaction via `createExpenseWithFinance`. The receipt's date, total and number are stored on `expense_receipts`.
- **Paid from** a float: picking a float also picks the account of its budget line (editable). The float match is a
  second write after the expense; if it fails the expense is kept and the user is told to match it from Budget.
- Retry safety: one expense id per capture, reused on retry, so neither the expense nor the float match is duplicated.
- Not yet: reading the receipt's text on device (VisionKit needs a native Tauri plugin); the form is typed by hand.

## Overtime

Shown in the app as "Overtime": an estimate of what running over will cost, so the unit can make informed decisions on set. The database tables keep the original `crew_hours` names. `OvertimePage`; calculations in `src/lib/overtime/overtime.ts` (pure, tested), storage in
`src/lib/db/repositories/overtime.ts`. Local SQLite only, like Script Supervisor (`OVERTIME_REMOTE_ERROR`).

- **Who:** crew (not cast) booked on the shoot day (by `shoot_day_id` or a date range covering it), plus anyone with
  their own hours recorded for that day.
- **Unit times:** actual unit call / wrap are the Script Supervisor day log's `call_time` / `wrap_time` (shared with the
  Daily Progress Report). Until a wrap is logged, the planned wrap is used and the page says the figures are projected.
- **Exceptions:** `crew_day_hours` holds only people whose call or wrap differs from the unit's. Clearing both times
  removes the row and the person follows the unit again.
- **Overtime rule** (per production, `production_crew_hours_settings`; defaults in brackets): starts at the planned wrap
  or a standard day after each call [planned wrap; 11 h]; hourly rate = day rate ÷ divisor [10]; overtime hour =
  hourly × multiplier [1.5]; billed per started block of minutes [30; 0 = exact]; minimum rest [11 h].
- **Rates:** each person's shoot-day rate from labour line items in the working budget revision (`pickDayRates`:
  shoot day, then untyped, then prep day; overtime lines ignored). People without a rate are counted as unpriced, never
  costed at zero.
- **Buyouts:** `crew_hours_person_settings.overtime_exempt`; no overtime is costed for them.
- **Rest:** from each person's wrap to the next shoot day's call (their own if recorded, else the unit's actual,
  else planned call). Under the minimum is flagged.
- Wraps earlier than the call are after midnight, so night shoots need no date field.
- Not yet: cast (Equity) overtime, meal penalties, turning overtime into labour expenses, publish/import/export.
