# 14. Settings and admin

Settings holds the app-wide options (currency, appearance, map keys), the per-production configuration (chart of accounts, crew structure, tax), and the tools for managing users. It is also where you keep your data safe: sign-in, the recovery key and backups.

## Open Settings

Click **Settings** at the bottom of the sidebar. A list on the left groups the sections.

![Settings page with the section list on the left and the Production section open](images/14-settings-overview.png)

| Group | Section | What it holds |
|---|---|---|
| Production | **Production** | Display currency, episodic mode, tax credits and VAT, clients |
| | **Budget accounts** | Cost report groups, chart of accounts |
| | **Script supervisor** | Slating system (see [Experimental features](15-experimental-features.md)) |
| Appearance | **Appearance** | Theme |
| Team & Access | **Crew structure** | Departments, roles and heads of department |
| | **User management** | Create and manage users (instance admins) |
| | **Project access** | Who can see and edit the current production |
| Integrations | **APIs & publishing** | Travel-time key, map tiles, server connection |
| Advanced | **Demo & tutorial** | Reopen the tutorial, demo production |
| | **Developer** | Experimental features switch |

Sections that apply to one production (Budget accounts, Crew structure, Script supervisor) act on the current production. Pick it in the production switcher first.

## Production

- **Display currency**: the currency used to show money across the app. The default is GBP. Each production keeps its figures in its own base currency; the display setting only changes how they are shown.
- **Episodic production**: for a series. **Enable episodic mode...** asks for a **First episode name** and creates a default shooting bloc called Block A. It cannot be turned off afterwards. Once on, the same card lists **Episodes** and **Shooting blocs**. Managing both is covered in [Productions](03-productions.md).
- **Tax credits**: switch on **Enable tax credits for this production**, then add schemes with a name, cap and minimum qualifying percentage. Spend is tagged against a scheme in Budget. Scheme details are kept if you turn the option off.
- **VAT**: switch on **Track VAT on spend**, set the **Default VAT rate (%)** and, if needed, a reclaim percentage per expense type. VAT is shown separately and does not change account totals.
- **Clients**: one list of client contacts shared by every production (name, email, phone). Editing a client changes it everywhere it is used.

## Budget accounts

![Chart of accounts tree with the Add account and Apply template buttons](images/14-chart-of-accounts.png)

**Chart of accounts** is the account tree your budget is built on.

1. Click **Add account**.
2. Enter a **Code** and **Name**. Optionally choose a **Parent**. Only header accounts can be parents.
3. Tick **Postable** if line items and expenses can be posted to it. Leave it off for a header.
4. Click **Add**.

On each row you can change the account colour, rename it, archive it (stops new posting; history stays) or delete it. Delete is only offered for accounts with no sub-accounts, line items or expenses, so archive anything that has been used.

**Apply template...** loads a ready-made chart. Choose a **Template** and **How to apply**:

- **Add missing accounts** adds the template's accounts next to yours and changes nothing else.
- **Replace unused accounts** removes your accounts that are not in the template and have no postings, renames matching accounts and adds the rest. Accounts with amounts always stay.

**Cost report groups** collect accounts into headings for reports, such as Above the line. Click **Add group**, enter a **Name** and optional **Code**, and tick the **Accounts** to include. Groups only affect reports and exports, never totals. See [Budget](10-budget.md) for the reports.

## Appearance

Open **Appearance** and click a theme tile: Albatross Mint, Bold, Yuzu, Sunset, Signal, Ledger, Clay or Night Shoot. Layout and workflows are identical in every theme. Night Shoot is dimmed and red-shifted for dark sets.

![Appearance section showing the theme tiles](images/14-appearance-themes.png)

## Crew structure

**Crew structure** defines this production's departments and roles. It supplies the department and role choices in Crew Manager, picks out each head of department (HOD), and sets how crew are grouped and ordered on call sheets. A new production starts with a standard film structure.

![Crew structure editor with the department list and one department's roles](images/14-crew-structure.png)

Open **Settings → Crew structure**. Departments are listed on the left; the selected department's roles are on the right.

1. Click **Add department**, or select an existing one.
2. Type its name in **Department name**. The trash button (**Delete department**) removes it, with its roles and task labels, after you confirm.
3. Under **Roles**, type a role in the **New role** box and click **Add**. Separate several roles with commas to add them at once.
4. Drag the grip handle on a role to reorder. Top to bottom is call sheet order.
5. Click **Set as HOD** on one role to make it the head of department (it then shows **HOD**). Click it again to unset. A department has one HOD.
6. Optionally add **Task labels**. They are only needed when the Tasks page uses a different department name from the crew department (for example Electrical for Lighting).
7. Click **Save changes**. **Discard** drops your edits. The bar at the bottom shows **Unsaved changes**, **All changes saved** or "N issues to fix" (for example a blank or duplicate name, marked with an icon on the department).

**Reset to default** replaces the whole structure with the built-in one and overwrites your custom departments, so use it only if you want to start over.

> **Tip** Settle the structure before you enter crew in [Crew Manager](07-people.md).

## Integrations

Open **APIs & publishing**.

- **OpenRouteService API key**: paste a personal key and click **Save key** to get route-based travel times. **Clear key** removes it. Keys are free from openrouteservice.org.
- **Map tiles**: the background maps on Movement Orders. Paste a **Tile URL template** and **API key** and click **Save**. The default uses MapTiler Cloud; **Get free key** opens its sign-up page and **Reset URL to default** restores the standard URL.
- **Local collaboration (Pilot)**: tick **Enable local collaboration on this device**, then **Add server connection...** and enter a **Display name**, **Server URL**, **Username** and **Password**, then choose a workspace. This needs a separate Albatross server running on your network; the desktop app never starts one. It is a pilot and not required for normal use.

> **Note** Albatross works fully offline. The travel-time and map features are the only ones that call outside services, and only once you add a key.

## Users and sign-in

When you first launch Albatross, setup creates an administrator account and you sign in with it each time you open the app. Every other person who uses this installation gets their own account. See [Getting started](01-getting-started.md) for first-time setup.

To sign out, choose **File → Log Out** in the menu bar.

### Create and manage users

Only an instance administrator sees these screens.

1. Open **Settings → User management** and click **Open User Management**.
2. Click **Create user**.
3. Enter a **Username**, a **Temporary password** and an **Instance role**: **user** or **admin**. Click **Create user** in the dialog.

![User Management table with the row actions](images/14-user-management.png)

Each row has these buttons:

| Button | Does |
|---|---|
| **Project visibility** | Lists the productions this user can open and lets you add, change or remove access |
| **Change role** | Switches the user between **user** and **admin** |
| **Reset password** | Sets a new temporary password and signs the user out everywhere |
| **Disable** / **Enable** | A disabled user cannot sign in until re-enabled |
| **Delete** | Removes the account permanently. Shown only for disabled users other than yourself |

The last active administrator cannot be disabled or demoted, and you cannot disable or demote yourself.

> **Note** Reset password only works while you are signed in as an admin with the database unlocked, or if you enter the user's current password in the optional field. If neither applies, use the recovery key (see below).

### Control access to a production

A user's instance role (user or admin) applies to the whole installation. Their access level is set per production:

| Level | Can |
|---|---|
| **viewer** | Open and read the production |
| **editor** | Everything a viewer can, plus change data |
| **administrator** | Everything an editor can, plus manage who has access |

Instance administrators can do all of this on every production. Ordinary users only see productions they have been given access to.

1. Select the production in the switcher.
2. Open **Settings → Project access** and click **Open Project Access**.
3. Under **Add project member**, choose a **User** and an **Access level**, then click **Add member**.
4. To change a level, use the dropdown on the member's row. To remove someone, click **Revoke** on their row and confirm.

The last administrator of a production cannot be removed, and disabled users cannot be added.

## Recovery key, backup and reset

Your data is encrypted on this computer. There is no cloud account and no support reset, so two things are down to you.

### Keep the recovery key

At the end of first-time setup Albatross shows a **recovery key** once. Store it outside Albatross, for example in a password manager.

| You have | Result |
|---|---|
| Password | Sign in normally |
| Recovery key, no password | Recover access: on the sign-in screen click **Forgot password?**, enter the **Recovery key**, an optional **Admin username** (blank resets all admins) and a **New admin password**, then **Recover password** |
| Neither | The data cannot be recovered |

### Back up

Albatross has no automatic backup. Do both of these regularly:

1. Export each production as an `.apf` file with **File → Export Project...** (see [Productions](03-productions.md)).
2. With Albatross closed, copy the whole data folder to external storage. See [Troubleshooting](16-troubleshooting.md) for where it is. Copy the entire folder, not just one file, or the copy cannot be opened.

### Demo production and tutorial

**Settings → Demo & tutorial** has **Open Tutorial Home** and **Reset tutorial progress** for the guided tour. **Create Demo Production**, **Reset Demo Data** and **Open Demo Production** manage the sample production. Reset only touches the demo, never your own productions.

**Next:** [Experimental features](15-experimental-features.md)
