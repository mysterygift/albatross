# 1. Getting started

Install Albatross, run the one-time setup, and find your way into a first production. Setup takes a few minutes and creates the encrypted workspace that holds all your data on this computer.

## Install

- **macOS:** open the `.dmg`, drag **Albatross** into **Applications**, then launch it.
- **Windows:** run the installer and launch **Albatross** from the Start menu.

Albatross opens as a native desktop window. It works offline and needs no cloud account.

> **Note** If macOS or Windows blocks the app because it is unsigned, see the troubleshooting section of the project [README](../README.md).

## First-run setup

The first launch shows the setup wizard. It runs once per computer.

1. Read the **Welcome to Albatross** screen and select **Begin setup**.
2. Wait while Albatross shows **Preparing database…** and **Securing database…**. This step is automatic.
3. On **Set up admin account**, enter a **Username**, a **Password** and **Confirm password**. The password needs at least 8 characters, and the two entries must match. Usernames are not case-sensitive. Select **Create admin account**.
4. On **Save your recovery key**, copy the key and store it outside Albatross, for example in a password manager. Tick **I have saved this recovery key**, then select **Continue**.
5. Wait for **Securing your workspace…** to finish its three steps (encrypting the database, creating administrator access, preparing recovery protection).
6. On the final **Welcome to Albatross** screen, select **Enter Workspace**.

![Setup wizard: Welcome screen](images/01-setup-welcome.png)
![Setup wizard: Set up admin account](images/01-setup-admin.png)
![Setup wizard: Save your recovery key](images/01-setup-recovery-key.png)

> **Important** The recovery key is shown once and is never shown again. If you forget your password and have lost the key, your data cannot be recovered. There is no cloud or support reset.

If setup is interrupted, relaunch Albatross and it resumes from the last step. If it reports **Setup can't continue automatically**, select **Try again**. If that does not clear it, see [Troubleshooting](16-troubleshooting.md).

## Sign in

On every later launch Albatross asks you to sign in with your username and password before it unlocks the database.

1. Enter your **Username** and **Password**.
2. Select **Sign in**.

![Sign in screen](images/01-sign-in.png)

To lock the app, choose **File → Log Out** in the menu bar. More people can be given accounts later; see [Settings and admin](14-settings-and-admin.md).

### Forgot your password

If you saved your recovery key, the sign-in screen shows a **Forgot password?** link.

1. Select **Forgot password?**.
2. Paste your **Recovery key**.
3. Optionally enter the **Admin username** to reset one admin. Leave it blank to reset all admins.
4. Enter and confirm a **New admin password**, then select **Recover password**.
5. Select **Back to sign in** and sign in with the new password.

## The first-launch tutorial

The first time you enter the workspace, a **Welcome to Albatross** dialog offers a guided tour.

- **Start Tutorial** creates a production called **Tutorial project** and walks you through Albatross one step at a time. It highlights what to click and checks your work.
- **Skip for now** closes the dialog. You can start the tutorial later.

The Tutorial project is an ordinary production. Keep working in it, rename it, or delete it from **Productions**.

![Tutorial welcome dialog](images/01-tutorial-welcome.png)

### Following a step

Each step appears in a card with an instruction. The target on the page is outlined.

| Control | What it does |
|---|---|
| **Next** | Moves on once the step is done. It is disabled until you complete the action. |
| **Back** | Returns to the previous step. |
| **Skip step** | Appears on optional steps, or after a pause if you are stuck. |
| **Pause** | Hides the card and keeps your place. Pressing Esc does the same. |
| **Finish section** | Appears on the last step of a section. |

The tutorial covers twelve sections: Dashboard, Schedule, Budget, Crew Management, Cast Management, Equipment, Locations, Call Sheets, Movement Orders, Tasks, Deliverables and Music & Archive.

### Pause, resume or restart

The graduation-cap button in the top bar opens the **Tutorial** menu.

| Item | What it does |
|---|---|
| **Start tutorial** / **Continue tutorial** | Starts from the first unfinished section and continues through the rest. |
| **Resume tutorial** / **Pause tutorial** | Resumes or pauses the current run. |
| **Tutorial for** *(this page)* | Runs only the section for the page you are on. |
| **Skip this section** | Marks the current section complete. |
| **Restart this section** | Runs the current section again from the start. |
| **Restart tutorial** | Resets all progress and starts again. |
| **Choose a section…** | Opens a list showing each section as **Not started**, **In progress** or **Complete**. |
| **Skip tutorial** | Ends the tutorial. |

![Tutorial menu in the top bar](images/01-tutorial-menu.png)

You can also reach the section list from **Settings → Demo & tutorial → Open Tutorial Home**, and reset progress there with **Reset tutorial progress**.

## Sample productions

For a fully populated example, load the sample productions.

1. Go to **Settings → Demo & tutorial**.
2. Under **Demo projects**, select **Create Demo Production**.

This creates two productions and switches to the first:

- **Mint Heist**, a feature-length film.
- **Demo: North Shore**, an episodic series with several episodes and shooting blocs.

A banner reads **You're viewing the Demo production - changes here are sample data** while the demo is open, and a **Demo** badge appears next to its name in the production switcher. **Open Demo Production** switches back to it. **Reset Demo Data** deletes both sample productions, including any changes you made, and recreates them. It never touches your own productions.

## Where your data lives

Everything is stored on this computer, in an encrypted database plus an `attachments` folder:

| Platform | Folder |
|---|---|
| macOS | `~/Library/Application Support/Albatross/` |
| Windows | `%APPDATA%\Albatross\` |

To copy a single production, export it as an `.apf` file; see [Productions](03-productions.md). Backup and recovery are covered in [Settings and admin](14-settings-and-admin.md) and [Troubleshooting](16-troubleshooting.md).

**Next:** [Finding your way](02-finding-your-way.md)
