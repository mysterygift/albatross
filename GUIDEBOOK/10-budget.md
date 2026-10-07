# 10. Budget

Budget is where you plan costs against a chart of accounts, log what you actually spend, track vendors and purchase orders, manage petty cash floats, compare budget versions and produce the cost report. Open it from **Money → Budget**; vendors live under **Money → Vendors**.

Actuals always come from logged spend. A line item holds the estimate; spend you log against the same account makes up the **Actual** figure.

## The Budget page

![The Budget page with the account tree, summary cards and tabs](images/10-budget-overview.png)

- **Tabs:** **Budget** (the account tree), **Cost Report**, **Actualisation**, **Floats** and **Compare**. Albatross remembers the tab you last used.
- **Header buttons:** **Manage revisions**, **Manage Fringes and Contingency**, **Export CSV**, **Add line item**, **Log Spend**.
- **Revision selector** (top left of the header): the budget version you are viewing. See [Budget revisions](#budget-revisions).
- **Summary cards:** **Total estimated**, **Total actual** and **Variance** (estimated minus actual; shown red when overspent).
- **Account table:** columns **Code**, **Account / Description**, **Budget**, **Actual**, **Variance** and **% Spent**. Click an account's chevron to expand it. Header accounts show roll-up totals; only the lowest-level (postable) accounts take line items and spend.
- On the desktop app the menu bar shows a **Budget** menu on this page: **Log Spend...** (⌘⇧L / Ctrl+Shift+L), **Add Line Item...** (⌘⇧I / Ctrl+Shift+I), **Manage Revisions...**, **Export Budget CSV...** (⌘⇧S / Ctrl+Shift+S) and **Duplicate live as draft**.

## Set up your chart of accounts

Productions created from the **Default** template already have a chart of accounts. Productions created **Blank** have none. You manage accounts in **Settings → Budget accounts**, in the **Chart of accounts** card.

### Apply a template

1. Open **Settings → Budget accounts**.
2. In **Chart of accounts**, click **Apply template…**.
3. Choose **Standard** or **BBC**. BBC also adds employer's NI fringe rules per crew category.
4. Choose **How to apply**:
   - **Add missing accounts** adds the template's accounts and changes nothing you already have.
   - **Replace unused accounts** removes your accounts that are not in the template and have no line items or spend, renames matching accounts, then adds the rest. Accounts with posted amounts always stay.
5. Check the summary of accounts to add, remove and rename, then confirm. Line items and spend are never touched.

![The Apply a chart of accounts template dialog](images/10-apply-chart-template.png)

### Add or change an account

1. In **Settings → Budget accounts**, click **Add account**.
2. Enter a **Code** (for example `3111`) and **Name**. Optionally pick a **Parent** (only header accounts can be parents).
3. Tick **Postable (can receive line items and expenses)** for an account that takes money. Leave it unticked for a header that only rolls up its children.
4. Click **Add**.

Use the row buttons to rename an account (the code cannot change), **Archive** it (stops new posting; history is kept), or **Delete** it. Only accounts with no sub-accounts, line items or spend can be deleted.

> **Note:** The **Cost report groups** card on the same page lets you group accounts for the cost report. See [Cost report](#cost-report).

## Add line items

A line item is one planned cost inside a postable account.

1. On the **Budget** tab, expand an account and click the **+** (Add line item) in its row. Or click **Add line item** in the page header and pick the **Account**.
2. Enter a **Description** and an **Estimated cost**. The header version also has **Actual cost** and **Vendor** fields; actual figures on the page come from logged spend, not from this field.
3. Click **Add**.

New line items start as the **Allow** type. To change the type or details, expand the account, click the eye icon on the line item (**Examine line item**), then **Edit**. You can change the **Description**, **Vendor (optional)** and **Line item type** (Labour, Purchase, Rental, Allow or Deposit), each with its own planning fields.

To delete a line item, click the bin icon on its row. If spend or floats are attached, a dialog asks which other line item should take them over (**Move to line item**) before deleting.

> **Note:** If an older production still has untyped spend or line items, an **Update budget classifications** dialog offers **Convert to Allow**. **Not now** postpones it until your next visit to Budget.

## Fringes and contingency

Fringes and contingency are percentages added on top of the estimate for chosen accounts. They are shown separately and are not included in **Total actual**.

1. Click **Manage Fringes and Contingency**.
2. Choose the **Fringes** or **Contingency** tab and click **Add rule**.
3. Enter a **Name**, a **Rate (%)** (for example `18`) and tick the **Scope accounts**. Selecting a header account includes all its children.
4. Click **Save**. Untick a rule's checkbox to switch it off without deleting it.

With any rule active, the Budget tab shows a **Derived (budget overlays)** block with **Fringes (derived)**, **Contingency (derived)** and **Estimated + derived**.

## Log spend

**Log Spend** records money actually spent (or committed) against an account.

1. Click **Log Spend** (or press ⌘⇧L / Ctrl+Shift+L).
2. Pick an **Account** (postable accounts only).
3. Pick a **Transaction type**. A line under the field explains each one.
4. Optionally fill **PO & documents** (see below).
5. Fill the **Details** form.
6. Click **Save**, or **Save & Add Another** to keep the dialog open with the same account and type for the next entry.

![The Log Spend dialog with a Purchase spend half filled in](images/10-log-spend.png)

| Type | Use for | Key fields |
|---|---|---|
| **Labour** | Crew, cast or other people | **Person** (from People), **Labour role**, **Rate type** (Prep day, Shoot day, Overtime), **Booked days**, **Rate per day**, **Currency**, **Start date**, **End date**. Amount = rate x days. |
| **Purchase** | Goods, services, permits | **Purchase description**, **Amount**, **Purchase type** (Service or Physical / Goods), **Purchase category**, **Vendor**, **Location (permit)**. |
| **Rental** | Hired kit or packages | **Rental description**, **Rate type** (Daily, Weekly, Flat), **Rate amount**, **Start date** / **End date** or **Override days (optional)**, **Equipment description**, **Vendor**. The amount is calculated from rate and period. |
| **Allow** | Provisional amounts not yet known | **Allow description**, **Provisional amount**, **Status** (Open or Resolved). |
| **Deposit** | Refundable or non-refundable deposits | **Deposit description**, **Deposit amount**, **Refundable status**, **Vendor**, **Location**. |

Switching type after you have started a form asks **Change transaction type?**; the form is discarded only if you click **Continue**. Open Allows are counted on the cost report and in **Examine account** so you can see what is still provisional.

### PO & documents

This optional section sits under the type selector.

- **Purchase orders** (Purchase, Rental and Deposit only): search by PO number, description or vendor and tick one or more. Picking a PO fills in the vendor. With several POs, enter how much of the spend goes to each. Only issued and approved POs are listed by default; tick **Include draft, closed and cancelled** or **Search all vendors** to widen the list.
- **Proof:** **Receipt** (a file, with optional date, amount and reference; no vendor needed), **Invoice** (choose **Existing invoice** or **Upload new**), or **None**.
- Warnings appear when the spend is over a PO's balance, allocations do not add up, or the invoice amount differs. Warnings never stop you saving. Click **Increase PO to cover** to raise the PO value on the spot.

### Tax credits and VAT

If you turn on **Enable tax credits for this production** or **Track VAT on spend** in **Settings → Production**, the spend form gains **Tax credit qualifying spend** and **VAT & reclaim** fields (VAT rate, VAT paid and reclaimable amounts, reclaimed amount, date and reference). Summaries appear on the Budget and Cost Report tabs. VAT is informational and does not change account actuals.

## Review and edit spend

1. Expand an account row and click the eye icon (**Examine account**). A side panel lists the account's line items and expenses. Use **Filter by type** to narrow them.
2. Click **Examine** on an expense to open **Expense details**.
3. Click **Edit** to change the details, tax fields or **PO & documents**, then save. Use **Save PO & documents** for PO and proof changes. Click **View** to leave edit mode.
4. **Delete Expense** removes it from the budget and updates totals (and removes any matches).

Spend without an account appears in an expandable **Uncoded spend** row. Use its **Recode…** dropdown to assign an account.

Badges on expense rows show **No PO** and **No proof** as gentle reminders; they are never errors.

## Match spend to line items (Actualisation)

Actualisation lets you tie each expense to the line items it paid for, so you can see which estimates are fully covered.

1. Open the **Actualisation** tab. The **Reconciliation summary** counts line items (matched, partially matched, unmatched, overspent) and expenses (allocated, partially allocated, unallocated).
2. Filter with **Type**, **Line status** and **Expense status**; **Clear filters** resets them.
3. Select an expense on the right, then click **Match Spend**.
4. In the dialog, tick one or more candidate line items from the same account and enter an amount for each. The total cannot exceed the expense's unallocated amount; going over a line item's estimate only shows a warning.
5. Click **Save**. Existing allocations in the same dialog can be edited or removed.

Selecting a line item or expense shows **Linked expenses** or **Linked line items** below. Matching never changes the estimate or the expense amount.

## Vendors and purchase orders

Vendors are the companies you pay. Each has invoices and purchase orders (POs), and a spend history.

### Add a vendor

1. Go to **Money → Vendors** and click **New vendor**.
2. Enter **Company name** (required), **Primary contact** and **Email**, then click **Create**. Albatross opens the vendor.

Use the search box to filter the list; select a vendor for a preview with **Total spend**, then **View vendor detail**.

![A vendor's detail page showing invoices and purchase orders](images/10-vendor-detail.png)

### Raise a PO

1. On the vendor's page, in **Purchase Orders**, click **New PO**.
2. Enter **PO number**, **Description**, **Issue date**, **Due date**, **Amount (excl. tax)**, **Status** (Draft, Issued, Approved, Closed or Cancelled) and **Notes**. For a non-production currency, set the currency and exchange rate; the rate is locked on the PO.
3. Click **Create**.

The PO table shows what is committed to each PO from matched spend and what remains. To change a PO's value later, click **Edit PO**; a **Reason for the change** field appears when you alter the amount, and the history icon next to the amount lists every change.

### Record an invoice

1. In **Invoices**, click **New invoice**.
2. Enter **Invoice number**, dates, **Amount**, **Tax (manual)**, **Currency**, **Status** (Draft, Received, Approved, Paid or Overdue), and optionally the **Purchase order** it belongs to.
3. Click **Create**. An invoice with a due date also creates a reminder task in **Tasks**; marking it **Paid** completes the task.

Use the link icon on an invoice or PO to attach logged expenses to it. The **Add equipment from invoice** icon on an invoice creates or links equipment records from its lines.

### Share or remove a vendor

**Share across all projects** makes a vendor available in every production (invoices, POs and spend stay per production). **Remove** takes it out of this production, or of all of them for a shared vendor.

## Petty cash floats

A float is cash given to a crew member against a line item. Floats are tracked separately and do not change **Total actual**.

1. Open the **Floats** tab and click **Allocate float**.
2. Choose the **Budget line item** and **Crew member**, enter **Amount**, **Currency**, **Issued date** and optional **Notes**, then click **Save allocation**.
3. The overview shows **Total allocated**, **Total matched** and **Total remaining**, with status counts. Click **Unreconciled floats** to hide fully matched ones; **By department** groups the rest.
4. Click **Reconcile** on a float. In **Available expenses**, tick the expenses the cash paid for and enter a match amount each, then **Save**. Remove an earlier match under **Existing reconciliations**.

Matching more than the float amount is allowed; the float then shows as overspent. An expense can be matched to only one float.

![The Allocate float dialog](images/10-allocate-float.png)

## Budget revisions

Revisions are versions of the whole budget (line items, rules and spend allocations), so you can try a scenario without disturbing the working budget. One revision is **Live / Working budget**; the rest are **Draft**. The rest of Albatross (Dashboard, Wrap) uses the live revision.

### Create a revision

1. Open the **Revision** selector and choose **Create budget revision...** (or use **Budget → Duplicate live as draft** in the menu bar for a one-step copy named "<name> Draft").
2. Enter a **Revision name**.
3. Pick **Start from scratch** or **Copy from existing revision** (and choose the **Source revision**).
4. Click **Create revision**. The new revision is selected.

![The Create budget revision dialog](images/10-create-revision.png)

### Switch, approve, rename, delete

- Choose a revision in the selector to view and edit it.
- To make the selected revision the working budget, tick **Set as live budget** and confirm **Set as working budget**.
- **Manage revisions** lists every revision. Rename and click **Save name**, set **Approval** (Unapproved, Pending, Approved), or **Delete** a draft. The live revision cannot be deleted.

### Compare revisions

Open the **Compare** tab, pick a **Base revision** and a **Compare revision**. The table shows **Estimate**, **Actuals**, **Variance**, **Derived costs**, **Tax credits** and **Float exposure** for each, with the difference. At least two revisions are needed.

## Cost report

The **Cost Report** tab is a print-ready summary of the selected revision: header with production name and date, the three summary cards, the account table and totals.

1. Open the **Cost Report** tab.
2. Optionally switch **Chart of accounts** to **By groups** (shown once you have created groups in **Settings → Budget accounts → Cost report groups**).
3. Optionally click **Configure Subtotals**, then **Create production total**, to add named subtotals such as "Above the line" built from header accounts.
4. Click an account name to list its line items.
5. Choose a paper size, then click **Save as PDF**. Albatross saves the PDF where you choose and also files a copy under **Deliver → Documents** (see [Documents](12-documents-deliverables-music.md#documents)).

The bottom of the report shows **Subtotal before derived**, derived overlays, tax credits and VAT when enabled, **Total budget incl. derived**, **Total actual (expenses only)** and **Variance vs estimated**.

For a spreadsheet instead, click **Export CSV** on the Budget tab. It exports every line item with estimated, actual and variance, plus derived, tax-credit and VAT totals when present.

![The Cost Report tab](images/10-cost-report.png)

**Next:** [Call Sheets and Movement Orders](11-call-sheets-and-movement-orders.md)
