# Send Day Pack

Experimental: send everyone called to one shoot day + unit their own copy of the day's paperwork, watermarked with their name, as an email draft. **Send Day Pack** (`/day-pack`, under Deliver). Hidden unless "Show experimental features" is on; see [settings.md](settings.md). Local productions only: a remote-server production shows a notice instead.

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/day-pack/`](../../src/features/day-pack): `DayPackPage.tsx` (pickers, state, actions), `day-pack-cards.tsx` (documents, recipients, email cards) |
| Logic | [`src/lib/day-pack/`](../../src/lib/day-pack): `loadDayPackSources.ts`, `loadDayPackRecipients.ts`, `buildDayPackFiles.ts`, `emailTemplate.ts`, `composeMail.ts` |
| Reused | `loadScheduleExportSources` and the shooting schedule, shot list and storyboard builders ([schedule.md](schedule.md)); `renderShootDaySidesPdf` (`sidesExportService.ts`); `renderRiskAssessmentPdf` (`exportRiskAssessmentPdf.ts`); `getCallSheetCastRequirements`, `getCallSheetCrewRequirements`, `buildDayRecipients` (`src/lib/call-sheets/`); `applyRecipientNameWatermarkToPDF` |
| Native email | [`src-tauri/src/mail_compose.rs`](../../src-tauri/src/mail_compose.rs): `compose_mail_draft` (macOS; `objc2-app-kit` for Apple Mail, `osascript` for Outlook). `src-tauri/Info.plist` (`NSAppleEventsUsageDescription`) and `src-tauri/Entitlements.plist` (`com.apple.security.automation.apple-events`, for the hardened runtime) let it drive Outlook |
| Queries | `getLatestScheduleChangeForDayUnit` (`repositories/schedule-changes.ts`) |
| Tests | `src/lib/day-pack/*.test.ts` (`dayPack.integration.test.ts` runs on sql.js) |

No tables of its own. The custom subject and body are settings `day_pack_email_subject:<productionId>` and `day_pack_email_body:<productionId>`.

## How it works

**Documents** (`loadDayPackSources`). One entry per type with a status: `ready`, `stale` (saved before the latest change to the day + unit; still sendable), `generated`, `missing` (fix it on another page) or `empty`. Nothing renders until **Prepare packs**.

| Document | Source |
|---|---|
| Call sheet | Latest saved PDF: `call_sheets.generated_document_id` for the day + unit |
| Movement order | Latest `movement_order` document for the day whose file name is `getMovementOrderPdfFileName(date, unit)` |
| Script sides | Latest `shoot_day_sides_exports` row for the unit (an export with no unit counts on a one-unit day). Otherwise default sides for every section on the unit (`loadSidesBuilderSource` with the unit, `defaultSidesFilters`, nothing deselected), status `generated`; a blocking coverage issue makes it `missing` |
| Risk assessments | Every RAMS whose units include this one, rendered fresh, one PDF each. A draft adds a "Not signed off" warning (`getRamsSignOffStatus`) |
| Shooting schedule, shot list, storyboard | Generated for this day + unit; shots in strip order (`shotIdsInStripOrder`). `empty` when there are no shooting strips, shots or panels |

"Latest change" is the newest `updated_at` across the unit's strips, the shoot day, the shoot-day unit and the bookings that call people to the unit, deleted rows included.

**Recipients** (`loadDayPackRecipients`). The same people as the unit's call sheet: cast required by the unit's shots (or scenes) and booked on the day, plus crew booked to this unit or to the whole day (`bookings.shoot_day_unit_id`; see [people.md](people.md)). `bookedFor: 'all'` marks whole-day crew, which the page points out on multi-unit days. People without an email cannot be ticked.

**Files** (`buildDayPackFiles`). Each ticked document renders once; then for every ticked person each one is watermarked (`applyRecipientNameWatermarkToPDF`) and written to `AppData/day-packs/<productionId>/<date>-<unit>/<person>/<doc>-<date>-<unit>-<person>.pdf` (same-name people get an id suffix). The `<date>-<unit>` folder is deleted first. Nothing goes into Documents. File I/O is injectable for tests.

**Email** (`emailTemplate.ts`, `composeMail.ts`). Placeholders `{firstName} {name} {production} {date} {day} {unit}`; unknown ones are left as typed. `openMailDraft` invokes `compose_mail_draft` with the absolute file paths. The command refuses attachments outside `<app data>/day-packs`, then picks a route from the app that handles `mailto:` (`NSWorkspace.URLForApplicationToOpenURL`):

| Default mail app | Route |
|---|---|
| Apple Mail (`com.apple.mail`) | "Compose Email" `NSSharingService` on the main thread: recipients, subject, body (an `NSString` item) and files (file `NSURL`s). It has no CC field, so CC'd agents are added as recipients. No Mail account (`canPerformWithItems` false) falls back |
| Microsoft Outlook (`com.microsoft.outlook`) | `osascript` runs `OUTLOOK_SCRIPT` (`make new outgoing message`, to/cc recipients, `plain text content`, attachments, `open`). Values go in as `argv`, never into the script text. The first run triggers the macOS Automation prompt; a refusal (`-1743`) falls back with a message pointing to System Settings → Privacy & Security → Automation |
| Anything else, or not macOS | Falls back |

The share service cannot be used for every app: for apps other than Mail it passes on only the recipients and subject. A fallback is an error `unsupported` or `unsupported: <reason>`; the front end then opens a `mailto:` draft (RFC 6068, CRLF line breaks) with the body and reveals the person's folder, because `mailto:` cannot attach files. **Open all drafts** stops after the first fallback that has a reason, since it would fail the same way for everyone. Nothing is ever sent by the app.

**Page.** Shoot day (defaults to the next one after today) and unit (rank order) are URL params `day` and `unit`. Changing the ticked documents or people discards a prepared pack. **Open all drafts** asks first above 10 drafts and opens them one by one. Missing and stale documents link to Call Sheets / Movement Orders (which read `?day=&unit=`), the Calendar (Sides Builder) or Risk Assessments.

## Gotchas

- Personalised PDFs are plaintext files in app data ([security.md](../security.md)); they are replaced on the next Prepare for that day + unit but otherwise stay until the app data is cleared.
- The movement order is matched by file name, so renaming a unit after saving one makes it `missing` until it is saved again.
- `compose_mail_draft` runs on the main thread (`run_on_main_thread`) and waits up to 20 s for it.
