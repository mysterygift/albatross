# 16. Troubleshooting

Quick fixes for the problems people hit most. If yours isn't here, see [Report a problem](#report-a-problem).

## Installing and opening

### The operating system blocks Albatross

Release builds are not code-signed yet, so macOS and Windows warn you the first time. The steps for both are in the [README](../README.md#opening-an-unsigned-app).

### A feature I expect is missing

Script Supervisor and Overtime are hidden until you turn them on. See [Experimental features](15-experimental-features.md).

## Where is my data?

Everything lives in one folder on your computer:

| Platform | Folder |
|---|---|
| macOS | `~/Library/Application Support/Albatross/` |
| Windows | `%APPDATA%\Albatross\` |
| Linux | `~/.config/Albatross/` |

It holds the encrypted database (`albatross.db`), the small key files that sit beside it, and your attachments. Nothing is stored in the cloud.

> **Tip** To open it on macOS, choose **Go → Go to Folder...** in Finder and paste the path. On Windows, paste `%APPDATA%\Albatross` into the File Explorer address bar.

## Passwords and the recovery key

### I forgot my password

If you saved the recovery key from first-time setup:

1. On the sign-in screen, click **Forgot password?**.
2. Enter the **Recovery key**. Enter an **Admin username** to reset one admin, or leave it blank to reset all admins.
3. Enter and confirm a **New admin password** and click **Recover password**.

Without the recovery key there is no way back in: nobody, including the Albatross team, can reset the data. See [Settings and admin](14-settings-and-admin.md#recovery-key-backup-and-reset).

### Forgot password? doesn't appear

The link only shows when recovery information exists for this installation. If it is missing, ask another administrator to use **Settings → User management → Reset password** for you.

### I lost the recovery key but can still sign in

You are fine for now. Keep your password safe, and back up your productions as `.apf` files so you can rebuild if you are ever locked out.

### I can't sign in as another user

Ask an administrator to check the account in **Settings → User management**. A **disabled** account cannot sign in until an admin clicks **Enable**.

## Opening `.apf` files

Double-clicking an `.apf` file should open Albatross. If it doesn't:

- macOS: right-click the file, choose **Open With → Albatross**, and tick **Always Open With** if offered.
- Windows: right-click the file, choose **Open with → Choose another app**, pick Albatross and tick **Always use this app**.
- Any platform: open Albatross and use **Productions → Import project**, or **File → Import Project...**.

If an import fails, Albatross shows a message saying why. Try exporting the file again from the source machine.

## Blank window or app closes

1. Quit Albatross completely and open it again from your Applications folder or Start menu. Don't open a web address in a browser; Albatross is a desktop app.
2. If the window stays blank or the app closes on launch, reinstall the latest version from the Releases page. Reinstalling does not touch your data folder.
3. If it still fails, report it (see below) with your operating system and what you were doing.

## Slow performance

- Quit other heavy apps, and keep a few GB of free disk space.
- Restart Albatross after a long session.
- If a production has grown very large, export it as an `.apf` and archive productions you have finished (**Wrap production...** in the production switcher).
- Maps and travel times need an internet connection and a key. They are slow or empty without one. See **Settings → APIs & publishing**.

## Start fresh

> **Warning** This permanently deletes every production on the computer. Export what you need as `.apf` files first.

1. Quit Albatross.
2. Delete the data folder listed above.
3. Open Albatross. It starts at first-time setup.

To reset only the sample production, use **Settings → Demo & tutorial → Reset Demo Data**. This never touches your own productions.

## Report a problem

Email [aran@noholdsbarred.pictures](mailto:aran@noholdsbarred.pictures) or open an issue on [GitHub](https://github.com/mysterygift/albatross/issues). Include:

- your operating system and the Albatross version (the **Albatross** menu → **About** on macOS)
- what you did, what you expected and what happened
- a screenshot, with no passwords or recovery key in it
