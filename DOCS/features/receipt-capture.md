# Receipt Capture

Experimental phone-first form at `/budget/receipt-capture` (**Money → Budget → Receipt Capture**): photograph a receipt and save it as a purchase expense with the photo attached as its receipt, optionally matched to a petty cash float. Hidden unless "Show experimental features" is on; see [settings.md](settings.md). It adds no tables; the spend and receipt use the Budget and Vendors model ([budget.md](budget.md), [vendors.md](vendors.md)).

## Code map

| Area | Location |
|---|---|
| Page/UI | [`src/features/budget/receipt-capture/ReceiptCapturePage.tsx`](../../src/features/budget/receipt-capture/ReceiptCapturePage.tsx) (route in `src/app/router.tsx`, nav entry in `src/app/navigation.ts`, `experimental: true`) |
| Pure logic | [`src/lib/receipts/receiptCapture.ts`](../../src/lib/receipts/receiptCapture.ts): `parseAmount`, `parseVatRate`, `validateReceiptCapture`, `buildFloatOptions`, `receiptFileName`, `scaledSize` |
| Photo preparation | [`src/lib/receipts/prepareReceiptPhoto.ts`](../../src/lib/receipts/prepareReceiptPhoto.ts): `prepareReceiptFile` |
| Save | [`src/lib/db/receiptCaptureService.ts`](../../src/lib/db/receiptCaptureService.ts): `saveCapturedReceipt` |
| Dashboard shortcut | `PhoneQuickActions` (**Log a receipt**, phone only) in `src/features/dashboard/` |
| Tests | `src/lib/receipts/receiptCapture.test.ts`, `src/lib/db/receiptCaptureService.test.ts` |

## Data model

No new tables. A save writes through `createExpenseWithFinance` ([vendors.md](vendors.md)):

| Row | Value |
|---|---|
| `expenses` | `transaction_type = 'purchase'`, the chosen budget line (`account_id`), date, optional VAT rate, description and notes in the purchase details, optional `vendor_id` |
| `documents` + `expense_receipts` | The photo or PDF as an `expense_receipt` document; `expense_receipts` holds the receipt date, amount and the optional **Receipt number** as `reference` |
| `float_expense_links` | Only when **Paid from** names a float: one link for the full expense amount in the working budget revision |

## How it works

- **Capture.** **Take photo** opens a file input with `capture="environment"` (the rear camera on iPhone; desktop shows a file picker). **Choose photo or PDF** accepts images and PDFs. **Retake** and **Remove** change the photo. `NSCameraUsageDescription` in `src-tauri/Info.ios.plist` is what lets iOS open the camera.
- **Form.** **Total (<currency>)**, **Date on receipt** (today by default), **What was bought**, **Paid from**, **Budget line**, **Vendor**, **Receipt number**, **VAT rate (%)** and **Notes**. VAT appears only when VAT tracking is on for the production and starts at its default rate. Choosing a float selects the float's budget line; the form shows what is left on the float, or how much the spend overruns it.
- **Validation.** `validateReceiptCapture` returns the first problem: total above zero, a date, a description, a budget line, a VAT rate between 0 and 100, and a photo. `parseAmount` accepts a leading currency symbol and thousands commas.
- **Photo.** Images over 1.5 MB are scaled to at most 2400 px on the long edge and re-encoded as JPEG at 0.85 quality; PDFs, smaller images and anything the browser cannot decode are stored unchanged. The stored name is `receipt-<date>-<vendor-slug>.<ext>`.
- **Save.** One transaction writes the expense, the receipt file row and the receipt metadata. The float match is a second write; if it fails the expense is kept and a warning toast says to match it from the float in Budget. Success shows "Saved <amount> with its receipt" and clears the form.
- **Retry safety.** `expenseId` is generated once per capture and reused on retry; `createExpenseWithFinance` returns the existing expense when the id exists, so a double tap or a retry after an uncertain save creates nothing twice.
- **Today's list.** **Spend dated today** shows up to eight expenses dated today with a **Receipt** or **No receipt** flag.

## Connections

- Appears under **Budget** in the experimental nav group, on the Dashboard quick actions, and in search "Go to" commands when experimental features are on.
- The spend shows in Budget, Actualisation and Floats like any other purchase; the receipt appears with the expense and under its vendor ([vendors.md](vendors.md)).
- Invalidates `expenses`, `floats`, `float-expense-links-by-production`, `budget-item-expense-links` and the expense finance queries after a save.

## Gotchas

- Only purchases are captured; rentals, deposits and allowances need **Log spend**.
- The file picker accepts images and PDFs only. A photo the web view cannot decode is stored unchanged, whatever its size.
