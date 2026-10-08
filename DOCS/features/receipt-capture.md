# Receipt Capture

Experimental quick entry for petty-cash spend: photograph a receipt, fill in a short form and save a purchase expense with the photo as its receipt. At `/budget/receipt-capture` (**Money → Budget → Receipt Capture**). Hidden unless "Show experimental features" is on; see [settings.md](settings.md). Built for the iPad and iPhone, but it also runs on desktop with a file picker instead of the camera.

## Code map

| Area | Location |
|---|---|
| Page | [`src/features/budget/receipt-capture/ReceiptCapturePage.tsx`](../../src/features/budget/receipt-capture/ReceiptCapturePage.tsx): photo card, spend form, "Spend dated today" list |
| Pure logic | [`src/lib/receipts/receiptCapture.ts`](../../src/lib/receipts/receiptCapture.ts): draft type, `parseAmount`, `parseVatRate`, `validateReceiptCapture`, `buildFloatOptions`, `receiptFileName`, `scaledSize` |
| Photo preparation | [`src/lib/receipts/prepareReceiptPhoto.ts`](../../src/lib/receipts/prepareReceiptPhoto.ts): `prepareReceiptFile` |
| Save | [`src/lib/db/receiptCaptureService.ts`](../../src/lib/db/receiptCaptureService.ts): `saveCapturedReceipt` |
| Route and nav | `src/app/router.tsx`, `src/app/navigation.ts` (sub-item of Budget, `experimental: true`) |
| Camera permission | `src-tauri/Info.ios.plist` (`NSCameraUsageDescription`) |
| Tests | `src/lib/receipts/receiptCapture.test.ts`, `src/lib/db/receiptCaptureService.test.ts` |

## Data model

No tables of its own. A save writes what **Log spend** writes ([budget.md](budget.md), [vendors.md](vendors.md)):

| Table | Row |
|---|---|
| `expenses` | `transaction_type = 'purchase'`, the chosen postable account, amount, date, `vendor_id` (optional), `vat_rate_percent` (VAT-tracking productions only) |
| `expense_transaction_details` | Purchase details: `purchase_description`, vendor, notes, amount |
| `documents` + `expense_receipts` | The photo as an `expense_receipt` document, with receipt date, amount and the optional receipt number as `reference` |
| `float_expense_links` | Only when **Paid from** names a float: one link for the whole amount |

## How it works

- **Capture.** **Take photo** opens a hidden `<input type="file" accept="image/*" capture="environment">`, which opens the rear camera on iOS; desktop browsers ignore `capture` and show a file picker. **Choose photo or PDF** accepts an image or a PDF. Only the first file is used. The preview is an image, or the file name for a PDF. **Retake** and **Remove** replace or drop it.
- **Form.** **Total**, **Date on receipt** (today), **What was bought**, **Paid from**, **Budget line**, **Vendor**, **Receipt number**, **VAT rate (%)** (only when VAT tracking is on for the production; it starts at the production's default rate until edited) and **Notes**. Budget lines are the postable accounts. Choosing a float also selects the float's budget line, which can still be changed; the option shows what is left on the float, and a warning appears if the spend overspends it. The page reads floats and line items for the working budget revision ([budget.md](budget.md)).
- **Validation.** `validateReceiptCapture` returns the first problem: total above zero (`parseAmount` accepts a leading currency symbol and thousands commas), a date, a description, a budget line, a VAT rate from 0 to 100, and a photo. It shows under the form.
- **Photo.** `prepareReceiptFile` stores a PDF, an image up to 1.5 MB and anything the webview cannot decode unchanged. A larger image is scaled to 2400 px on its longest edge and re-encoded as JPEG at 0.85, unless that is not smaller. The stored name is `receipt-<date>-<vendor-slug>.<ext>` (`receiptFileName`).
- **Save.** `saveCapturedReceipt` calls `createExpenseWithFinance`, so the expense, its details, the receipt document and the file commit in one transaction. The expense id is generated once per capture and kept until the form is cleared or saved, so a retry reuses it and creates nothing twice (`alreadyCreated`).
- **Float match.** A second write after the expense is saved (`createFloatExpenseLinks`, skipped if the link exists). If it fails the expense and receipt stay, and a toast says "Spend saved, but not matched to the float" with the reason.
- **After saving** the form and photo reset, the expense queries are invalidated and a toast shows the saved amount. **Spend dated today** lists up to eight expenses with today's date, each marked **Receipt** or **No receipt** (`listReceiptStatusByExpenseIds`).

## Connections

- Budget: the expense appears in Budget, Actualisation and cost reports like any purchase; the receipt counts as proof for **No proof** flags and float receipt coverage ([vendors.md](vendors.md)). To change it later, use the expense detail panel; this page only creates.
- Floats: matching uses the same links as **Reconcile** ([budget.md](budget.md)).
- `.apf` export/import and duplicate production handle the rows through the tables above ([import-export.md](../import-export.md)).
- On iOS the camera needs `NSCameraUsageDescription`; the same string covers continuity photos in [script-supervisor.md](script-supervisor.md).

## Gotchas

- The amount is stored in the production currency; there is no currency picker or conversion.
- Only purchases are created; labour, rental, deposit and allow spend go through **Log spend**.
- A float whose line item has no account leaves **Budget line** unchanged when chosen.
- One file per capture; the page has no multi-page receipts.
