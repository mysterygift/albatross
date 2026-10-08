# Release Forms

Contributor and location releases signed on screen (finger, Apple Pencil or mouse), exported as PDF and filed in Documents → Releases. UI: **People → Release Forms** (`/release-forms`, signing page at `/release-forms/new/:formType` with `formType` `contributor | location`).

## Code map
| Area | Location |
|---|---|
| Pages/UI | `src/features/release-forms/` (`page.tsx` list, `ReleaseFormSignPage.tsx`, `NewReleaseDialog.tsx`, `CompanyNamePrompt.tsx`, `EditTermsDialog.tsx`, `useReleaseFormSettings.ts`, `exportReleasePdf.ts`) |
| Signature pad | `src/components/signature-pad.tsx`, pure logic in `src/components/signaturePadModel.ts` |
| Logic | `src/lib/releaseForms/` (`defaultTerms.ts`, `terms.ts`, `settings.ts`, `signReleaseForm.ts`) |
| PDF | `src/lib/pdf/releaseForm.ts` (`pdf-lib`, `PdfLayout`) |
| Storage | `settings` key/value table (terms), `documents` (signed PDFs); no tables of its own |
| Tests | `src/lib/releaseForms/terms.test.ts`, `src/components/signaturePadModel.test.ts`, `src/lib/pdf/releaseForm.test.ts`, `src/features/release-forms/*.test.tsx` |

## Data model
- **Terms** are app-wide settings, not per production: `release_forms_company_name`, `release_forms_contributor_terms`, `release_forms_guardian_terms`, `release_forms_location_terms`. An empty or missing terms value means the standard text in `defaultTerms.ts`; saving text identical to the standard stores `''` so it keeps tracking the standard. The `settings` table is per device (not in `.apf` or publish), so each computer or iPad has its own terms.
- **Production company is required.** `saveReleaseFormSettings` and `signReleaseForm` throw without it. Until it is set, **New Release** and the signing page show `CompanyNamePrompt` instead of the forms, and **Edit terms** cannot save with it empty.
- **Tokens** (`RELEASE_TOKENS`): `{{production_company}}` (the setting), `{{production_name}}` (current production's name), `{{location_address}}` and `{{shoot_dates}}` (location form fields). Blank values render as `________`; unknown tokens are left as typed. Paragraphs are separated by blank lines (`termsParagraphs`).
- **Signed releases** are `documents` rows with `entity_type` `signed_contributor_release` or `signed_location_release`, `entity_id` null, file `attachments/<productionId>/<documentId>-<form>-release-<name>-<yyyy-mm-dd-hhmm>.pdf`. They travel with `.apf` export, duplicate production and publish like any document. Signer details exist only inside the PDF.

## How it works
- **Terms snapshot**: `ReleaseFormSigner` copies the settings into state when it mounts, so a terms edit saved elsewhere never changes a form being signed. The PDF is rendered once on **Sign** and never regenerated, so signed agreements keep their terms.
- **Sign** is enabled once the signature pad has ink and the print name is set; also required are the location address (location form), the guardian signature and name (contributor marked under 18), and the producer name and signature if either is started (location form). On Sign, `signedAt = new Date()` is stamped (`formatSignedAt`, en-GB with time zone), the pads export PNGs, `signReleaseForm` renders the PDF and calls `persistProductionDocument`, then `saveReleaseCopy` calls `saveFileWithDialog`. On the iOS branches that function writes to the exports folder and opens the share sheet.
- **PDF**: masthead (title, company, production, signing time), details grid (filled fields only), terms, "Accepted and agreed" signature block(s) with the signature image over a rule, guardian consent section if present, footer with the ISO timestamp. Metadata: title, subject (production), author (company), creation date = signing time.
- **iOS**: the list shows one **Share** button per release (`openInSystem` opens the share sheet on iOS) instead of Open plus Save or share, and a failed open shows a toast because there is nothing to reveal in. Both pages opt in to `data-touch-targets` (`src/styles/platform-mobile.css`) for 40pt controls on touch screens.
- **Delete**: signed releases are deletable from the list page and Documents (`DELETABLE_ENTITY_TYPES` in `catalog.ts`), behind a confirm dialog.

### Signature pad
- Pointer Events only, so one path covers mouse, touch and Apple Pencil. `setPointerCapture`, one active `pointerId` at a time, `getCoalescedEvents()` for full Pencil sample rate, rAF-batched redraws.
- Points are stored normalised to 0–1 of the pad, so a resize or iPad rotation redraws without loss. The canvas backing store follows `devicePixelRatio` via `ResizeObserver`.
- Pencil (`pointerType === 'pen'`) varies width with `pressure`; mouse and touch draw at a constant width scaled to the pad width.
- Palm rejection: after a pen pointer has been seen, touch pointers are ignored; a pen landing while a touch stroke is in progress removes that stroke.
- `touch-action: none`, no text selection or callout, and non-passive `touchstart`/`touchmove` `preventDefault` on the canvas keep the page from scrolling or zooming while signing.
- `toPng(scale = 3)` re-renders the strokes, trimmed to the ink bounds, onto an offscreen canvas with a transparent background.

## Connections
- **Documents**: category `releases` (formerly `people-locations`, which redirects) holds signed releases, uploaded `contributor_form` / `location_release` / `permit` files and its manual uploads (`manual_upload_people_locations`, kept for existing rows). See [documents.md](documents.md).
- No link to `people.contributor_form_status` or to location records; signer details are free text.

## Gotchas
- Inputs use `autoComplete="off"` so the device owner's saved details are not offered on someone else's release.
- jsdom has no canvas, so page tests mock `SignaturePad`; drawing logic is covered through `signaturePadModel.ts`.
- Pencil pressure and palm rejection cannot be exercised in the iOS simulator; check them on a real iPad.
