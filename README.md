# Naukri Update

> Automatically keep your Naukri profile active from your own computer.

Naukri Update is an open-source desktop application that automates routine Naukri profile updates. It runs entirely on your computer — no cloud, no external servers, no accounts.

It can:
- Refresh your resume headline on a schedule
- Upload your resume PDF once a day
- Run in the background automatically
- Keep all your settings and data on your own machine

---

## Table of Contents

- [What is Naukri Update?](#what-is-naukri-update)
- [Features](#features)
- [How It Works](#how-it-works)
- [Download & Install](#download--install)
- [Guided Setup](#guided-setup)
- [Naukri Account & Credentials](#naukri-account--credentials)
- [Connect Chrome](#connect-chrome)
- [Choose Your Resume](#choose-your-resume)
- [Resume Upload Automation](#resume-upload-automation)
- [Resume Headline Automation](#resume-headline-automation)
- [Background Automation](#background-automation)
- [What Happens When the App is Closed?](#what-happens-when-the-app-is-closed)
- [What Happens When Chrome is Closed?](#what-happens-when-chrome-is-closed)
- [What Happens After a Restart?](#what-happens-after-a-restart)
- [What Happens When the Computer is Off?](#what-happens-when-the-computer-is-off)
- [Privacy & Security](#privacy--security)
- [Data Storage](#data-storage)
- [Troubleshooting](#troubleshooting)
- [Reset & Uninstall](#reset--uninstall)
- [Developer Setup](#developer-setup)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)
- [License](#license)

---

## What is Naukri Update?

Naukri Update is a desktop automation tool. After a one-time guided setup, it periodically performs two tasks on your Naukri profile:

1. **Headline Refresh** — Updates your resume headline text (by toggling a trailing period) to mark your profile as recently modified.
2. **Resume Upload** — Re-uploads your resume PDF once a day with today's date in the filename.

Both tasks run using a dedicated, isolated browser session on your computer. The application connects directly to Naukri.com — there is no backend server or third-party service involved.

> **Important:** Naukri Update cannot guarantee recruiter visibility, profile ranking, or more job interviews. Those outcomes depend on Naukri's own algorithms, which this application does not control.

---

## Features

- Resume headline auto-refresh (interval or fixed daily time)
- Optional active time window (e.g. only refresh between 9 AM and 6 PM)
- Daily resume PDF upload with automatic date-stamped filenames
- Dedicated, isolated Chrome browser profile (separate from your personal browser)
- In-app guided onboarding wizard
- Background automation using native OS scheduling (no manual cron/Task Scheduler setup)
- System tray integration with quick actions
- In-app diagnostic check to verify everything is working
- Real-time browser connection status in the dashboard
- Automatic log rotation (last 5 runs retained)
- Full data management from inside the app (clear credentials, remove resume, reset)

---

## How It Works

```
Your Computer
│
├── Naukri Update (Desktop App)
│    ├── GUI Dashboard
│    └── Configuration (stored in your OS app data folder)
│
├── Dedicated Chrome Profile  ← isolated from your personal browser
│    └── Naukri.com session (login cookies stored here)
│
└── OS Background Task (cron / LaunchAgent / Task Scheduler)
     └── Runs every 15 minutes → checks if a task is due → executes if so
```

When a task is due, the application:
1. Starts Chrome using the dedicated profile (if not already running)
2. Connects via CDP (Chrome DevTools Protocol) on `127.0.0.1:9222`
3. Navigates to your Naukri profile page
4. Performs the headline update or resume upload
5. Verifies the change was applied before completing
6. Closes the browser and exits

CDP (Chrome DevTools Protocol) is the standard browser automation interface built into Chrome. The application uses it to communicate with the dedicated Chrome session running locally on your machine.

---

## Download & Install

### Option A — Desktop Installer *(Recommended)*

Download the latest installer from the [Releases page](https://github.com/anwarbuilds1/naukri_update/releases/latest):

| Platform | File | How to install |
|:---|:---|:---|
| **Windows** | `NaukriUpdate-Setup.exe` | Run the installer |
| **macOS** | `NaukriUpdate.dmg` | Open DMG → drag to Applications |
| **Linux** | `NaukriUpdate.AppImage` | Make executable, then run |
| **Linux** | `naukri-update_*.deb` | `sudo dpkg -i naukri-update_*.deb` |

> **Note:** If the releases page shows no files yet, use Option B below. Installers are published when a new version tag is pushed.

Once installed, open the app. The in-app wizard guides you through the rest — no terminal required.

### Option B — Run From Source *(Developers & Advanced Users)*

See the [Developer Setup](#developer-setup) section at the bottom of this page.

---

## Guided Setup

When you open the app for the first time, an onboarding wizard walks you through setup:

| Step | What you do |
|:---|:---|
| **1. Welcome** | Read the overview and click Get Started |
| **2. Naukri Account** | Enter your Naukri profile URL |
| **3. Credentials & Privacy** | Enter your Naukri email and password; read where they are stored |
| **4. Connect Chrome** | Click Connect — a dedicated Chrome window opens for you to log in |
| **5. Choose Resume** | Select your resume PDF from your computer |
| **6. Resume Automation** | Choose whether to enable daily upload and set the time |
| **7. Headline Automation** | Choose whether to enable headline refresh and set the schedule |
| **8. Background Automation** | Toggle background scheduling on or off |
| **9. Check Setup** | Run the built-in diagnostic to verify everything is ready |
| **10. Dashboard** | You're done |

If you close the app mid-wizard, the wizard reopens at the same step next time.

---

## Naukri Account & Credentials

### What is requested?

- **Naukri profile URL** — the URL of your Naukri profile edit page (usually `https://www.naukri.com/mnjuser/profile`)
- **Naukri email address** — your Naukri login email
- **Naukri password** — your Naukri account password

### Why are credentials needed?

The application automates actions on Naukri.com using a browser session. If your session expires, the application needs your credentials to log in again automatically.

### How are credentials used?

When your session is valid, credentials are not sent anywhere — the app uses the existing browser cookies. Credentials are only used by the automation script to fill the Naukri login form when re-authentication is required.

### Where are credentials stored?

Credentials are stored in a plain-text configuration file (`.env`) inside your operating system's application data directory:

| OS | Location |
|:---|:---|
| Windows | `%APPDATA%\NaukriUpdate\.env` |
| macOS | `~/Library/Application Support/NaukriUpdate/.env` |
| Linux | `~/.config/NaukriUpdate/.env` |

On Linux and macOS, the file permissions are restricted to your user account only (`chmod 0600`), so other users on the same machine cannot read it.

> **Credentials are stored in plain text.** They are not encrypted. Anyone with physical or remote access to your user account on this computer can read the file.

### What network traffic is sent?

Credentials are sent **only** to `naukri.com` — by the browser session, in the same way a normal browser login works. They are never sent to any other server. The application has no backend.

---

## Connect Chrome

The application uses a **dedicated, isolated Chrome browser profile** to interact with Naukri. This is entirely separate from your personal Chrome profile — no personal bookmarks, history, or passwords are shared.

### What happens when you click Connect?

1. Chrome launches using the dedicated profile
2. The application checks if you are already logged in to Naukri
3. If logged in → status shows **Connected**
4. If not logged in → Chrome navigates to the Naukri login page and the app fills in your credentials

### OTP and CAPTCHA

If Naukri asks for an OTP (one-time password) or CAPTCHA during login:

- **The application does not bypass these.** It waits for you.
- Complete the OTP or CAPTCHA manually in the Chrome window that opened.
- Once you reach your profile page, the app detects the active session automatically.

### Reconnecting

If the Chrome session is closed or the connection is lost:
- Click **Reconnect Chrome** on the dashboard, or
- Right-click the system tray icon → **Reconnect Chrome**

---

## Choose Your Resume

### How to select a resume

During setup (or from the Settings tab later), click **Choose PDF** to select your resume file. The app opens a standard file picker — only PDF files are accepted.

### Validation

The application checks:
- The file is a PDF (checks the file header, not just the extension)
- The file is not empty
- The file is not still being written or modified

### Where is it stored?

When you select a resume, the app **copies** it to a managed folder in your app data directory:

| OS | Resume folder |
|:---|:---|
| Windows | `%APPDATA%\NaukriUpdate\resume\` |
| macOS | `~/Library/Application Support/NaukriUpdate/resume\` |
| Linux | `~/.config/NaukriUpdate/resume\` |

Your original file is not moved or modified.

### Single-resume rule

The resume folder must contain exactly one PDF file. If there are multiple PDFs, the automation cannot determine which is the authoritative one and will fail with an error.

### How to change your resume

Select a new PDF from Settings. The old resume will be replaced.

### How filenames are handled during upload

When uploading to Naukri, the app generates a date-stamped filename to avoid Naukri's duplicate-filename detection. The original local filename is never changed.

**Examples:**

| Your local file | Uploaded to Naukri as |
|:---|:---|
| `Ram_Resume.pdf` | `Ram_Resume_29-08-2026.pdf` |
| `anwar_cv.pdf` | `anwar_cv_29-08-2026.pdf` |
| `resume.pdf` | `resume_29-08-2026.pdf` |

If today's date is already in the filename, it is not added twice:

| Local file | Uploaded as |
|:---|:---|
| `Ram_Resume_28-08-2026.pdf` | `Ram_Resume_29-08-2026.pdf` *(old date replaced)* |

After a successful upload, any old dated copies in the resume folder are automatically cleaned up.

---

## Resume Upload Automation

When enabled, the app uploads your resume once per day at the time you configure.

**Safe upload flow:**
1. Locate the authoritative resume file
2. Validate the file (PDF header check, size stability check)
3. Check if today's resume is already uploaded — if so, skip
4. Create a temporary dated copy for upload
5. Set the file input on the Naukri page
6. Wait for the upload progress indicator
7. Wait for the Naukri success confirmation
8. Verify the uploaded filename matches the expected dated name
9. Clean up stale dated copies from the local resume folder

The automation will not save the profile if the upload did not complete successfully.

**Configure from:** Settings → Resume Update → toggle on/off and set the daily time.

---

## Resume Headline Automation

The headline automation updates your resume headline by adding or removing a trailing period. This marks your Naukri profile as recently modified.

### Why does this work?

Naukri records a "last updated" timestamp when your profile data changes. A headline that reads `"Senior Developer."` is technically different from `"Senior Developer"` — so toggling the period triggers the timestamp update without changing your visible headline in any meaningful way.

### Schedule options

| Mode | Description |
|:---|:---|
| **Interval** | Run every N hours and M minutes (e.g. every 6 hours) |
| **Fixed time** | Run once per day at a specific time (e.g. 8:30 AM) |

You can also set an **active time window** to restrict automation to specific hours (e.g. only between 9 AM and 6 PM). Supports midnight-crossing windows.

**Configure from:** Settings → Headline Refresh.

---

## Background Automation

Background automation lets the app perform tasks even when you are not using the computer — without the dashboard window being open.

### How it works

When you enable background automation, the app registers a recurring OS task:

| OS | Mechanism | Frequency |
|:---|:---|:---|
| Windows | Task Scheduler (`NaukriUpdateTask`) | Every 15 minutes |
| macOS | LaunchAgent (`com.naukri.update.plist`) | Every 15 minutes |
| Linux | crontab entry | Every 15 minutes |

Every 15 minutes, the OS task starts the application in headless mode (`--run-automation`). The app checks whether a task is actually due. If not, it exits immediately. If a task is due, it runs the automation and exits.

**You do not configure cron, Task Scheduler, or LaunchAgent manually.** The app does this when you save settings.

### Pause without disabling

You can pause automation temporarily from:
- The tray icon → **Pause Automation**
- The dashboard

Pausing does not remove the OS task — it just skips execution until you resume.

---

## What Happens When the App is Closed?

### If you close the window (click ✕)

The window is **hidden to the system tray** — not quit. The tray icon remains near your clock. Background automation continues running. Click the tray icon or right-click it to show the dashboard again.

### If you select Quit

Right-click the tray icon → **Quit Application** fully exits the desktop app. However, if background automation is enabled, the OS-level task (cron / LaunchAgent / Task Scheduler) will still trigger the headless automation runner every 15 minutes independently of whether the dashboard is open.

---

## What Happens When Chrome is Closed?

The application polls Chrome's CDP endpoint (`http://127.0.0.1:9222`) every few seconds. When Chrome is closed:

1. The health check detects the lost connection
2. The dashboard status changes to **Disconnected**
3. Background automation tasks automatically restart Chrome when the next task is due

To reconnect manually: click **Reconnect Chrome** on the dashboard or use the tray menu.

---

## What Happens After a Restart?

When you log back in after a restart:
- The Electron app auto-launches as a hidden background process (configured during setup via `app.setLoginItemSettings`)
- The OS background task resumes triggering every 15 minutes
- The dashboard is available via the tray icon

---

## What Happens When the Computer is Off?

Naukri Update runs on your computer. When the computer is powered off, no automation runs. There is no cloud component.

**Missed schedules:** If a scheduled task was due while the computer was off, the scheduler checks on the next trigger whether the task has been run recently enough. Tasks that were missed will be caught on the next check when the computer is back on and the OS task fires.

---

## Privacy & Security

### Data flow

```
Your Computer
└── Naukri Update
    └── Dedicated Chrome Browser
        └── naukri.com  (HTTPS, direct)
```

No other services, servers, or endpoints are contacted.

### What information leaves your computer?

| Data | Destination | When |
|:---|:---|:---|
| Naukri email & password | `naukri.com` only | Only when re-authentication is needed |
| Resume PDF | `naukri.com` only | At the scheduled upload time |
| Headline text update | `naukri.com` only | At the scheduled refresh time |

### What is NOT collected or sent?

- No telemetry
- No analytics
- No crash reporting
- No usage data
- No update checks to external servers

### Credential storage

Plain text in a local `.env` file. On Linux/macOS, the file is restricted to your user (`chmod 0600`). On Windows, it is a standard user-owned file.

### Browser isolation

The dedicated Chrome profile is stored separately from your personal Chrome data. Your personal browsing history, passwords, and cookies are not accessible to the automation.

### Renderer isolation

The Electron renderer (UI) runs with `nodeIntegration: false` and `contextIsolation: true`. The UI can only communicate with the main process through a defined set of IPC channels — it cannot access the filesystem or Node.js APIs directly.

---

## Data Storage

All application data is stored in the OS application data directory:

| OS | Base path |
|:---|:---|
| Windows | `%APPDATA%\NaukriUpdate\` |
| macOS | `~/Library/Application Support/NaukriUpdate/` |
| Linux | `~/.config/NaukriUpdate/` |

| What | Path (relative to base) | Description |
|:---|:---|:---|
| Configuration | `.env` | All settings and credentials |
| Resume | `resume/` | Your managed resume PDF |
| Browser profile | `.naukri-chrome-profile/` | Chrome session, cookies, cache |
| Logs | `naukri-refresh.log` | Automation run log |
| Logs | `naukri-hourly-refresh.log` | Headline refresh log |
| Scheduler state | `.naukri-refresh-state.json` | Last run timestamps |

**Log rotation:** Logs are automatically trimmed to keep the last 5 runs.

**Open the data folder:** Settings → Privacy & Data Management → Open App Folder.

---

## Troubleshooting

| Problem | What it means | What to do |
|:---|:---|:---|
| **Chrome won't connect** | The application cannot reach the dedicated Chrome session | Click **Reconnect Chrome** on the dashboard. If Chrome is stuck, close all Chrome windows and try again. |
| **Naukri asks for OTP** | Naukri requires verification before logging in | Complete the OTP manually in the Chrome window that opened. The app will detect the session automatically. |
| **Naukri shows CAPTCHA** | Naukri flagged the login attempt | Complete the CAPTCHA manually in the Chrome window. The application does not bypass CAPTCHAs. |
| **Resume upload failed** | The upload did not complete or could not be verified | Check that the resume is a valid PDF. Re-select it from Settings → Resume. Then try a manual upload. |
| **Headline update failed** | The profile page did not respond as expected | Check your internet connection. Try running a manual refresh from the dashboard. |
| **Background automation not running** | The OS task is not registered or was removed | Settings → Background Automation → toggle off and back on → Save Settings. |
| **Connection shows Disconnected** | Chrome closed or CDP is unavailable | Click **Reconnect Chrome** or use the tray menu. |
| **Chrome SingletonLock error** | Chrome crashed and left a lock file | The application cleans this automatically. If it persists, delete `SingletonLock` from the `.naukri-chrome-profile/` directory. |
| **Multiple resume files found** | More than one PDF is in the resume folder | Keep only one PDF in the resume folder, or re-select your resume from Settings to let the app manage it. |

**View logs:** Dashboard → Logs tab, or open the app data folder directly.

---

## Reset & Uninstall

### Clear credentials only

Settings → Privacy & Data Management → **Clear Credentials**

Removes the stored email and password. You will be asked to re-enter them.

### Remove resume

Settings → Privacy & Data Management → **Remove Resume File**

Deletes the PDF copy stored in the managed resume folder. Does not affect your original file.

### Reset browser session

Settings → Privacy & Data Management → **Reset Browser Profile**

Deletes the dedicated Chrome profile directory. Your Naukri session will be lost and you will need to log in again.

### Full application reset

Settings → Privacy & Data Management → **Reset Application**

Deletes all of the following:
- Configuration file (`.env`)
- Credentials
- Resume files
- Browser profile
- Execution logs
- Scheduler state
- OS background task registration

The app returns to first-run state and shows the onboarding wizard.

### Uninstall

**Windows:** Control Panel → Programs → Uninstall `NaukriUpdate`

**macOS:** Drag `NaukriUpdate.app` from Applications to Trash

**Linux AppImage:** Delete the `.AppImage` file

**Linux deb:** `sudo apt remove naukri-update`

> Uninstalling the application does **not** automatically delete your app data folder. To remove all data, perform a Full Application Reset from inside the app before uninstalling, or manually delete the base path shown in [Data Storage](#data-storage).

---

## Developer Setup

> **For normal users:** Use the desktop installer. This section is for developers and contributors only.

### Requirements

| Requirement | Version | Notes |
|:---|:---|:---|
| Node.js | ≥ 20 | The automation core (`naukri-profile-refresh.js`) enforces this at runtime |
| npm | any recent | Bundled with Node.js |
| Google Chrome | stable | Required for browser automation |
| Git | any | For cloning |

### One-Command Setup

```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

`npm run setup` (`scripts/setup.js`) performs:
1. Detects OS, Node.js version (exits with a clear message if < 18), Chrome
2. Runs `npm install` if `node_modules` is missing or Electron is not installed
3. Creates app data subdirectories (`resume/`, `logs/`, `temp/`)
4. Migrates any existing `.env` from the repo root to the AppData directory via `ConfigService.migrate()`
5. Launches the Electron desktop app (detached, so the terminal can be closed)

### Developer Commands

| Command | Description |
|:---|:---|
| `npm run setup` | One-command bootstrap + launch |
| `npm start` | Launch the desktop app directly (requires prior `npm install`) |
| `npm run refresh` | Run the automation script once from the CLI |
| `npm run pack` | Build unpacked app directory (for local testing) |
| `npm run dist` | Build production installer binaries |

### Publishing a Release

Releases are built automatically by GitHub Actions when a version tag is pushed:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The workflow (`.github/workflows/release.yml`) builds Windows, macOS, and Linux installers in parallel and publishes them to GitHub Releases.

---

## Architecture

```
naukri_update/
│
├── main.js                   # Electron main process
│    ├── IPC handlers         # All renderer ↔ main communication
│    ├── Tray                 # System tray icon and menu
│    ├── Chrome manager       # Launch, poll, and connect Chrome via CDP
│    ├── OS scheduler setup   # Cron / LaunchAgent / Task Scheduler
│    └── Headless runner      # --run-automation entry point
│
├── preload.js                # Context bridge (contextIsolation: true)
│
├── renderer/
│    ├── index.html           # UI structure and onboarding wizard
│    └── app.js               # UI logic, state management, event handlers
│
├── config-service.js         # Central config: load, save, validate, migrate, diagnostics
│
├── config.js                 # Thin wrapper: exports parsed values for automation
│
├── naukri-profile-refresh.js # Playwright automation core
│    ├── Headline update      # Toggle trailing period, verify change
│    └── Resume upload        # Find file, validate, generate filename, upload, verify
│
└── scripts/
     ├── setup.js             # One-command bootstrap
     └── scheduler.js         # CLI helper: check if task is due, update state, rotate logs
```

### Key design decisions

- **ConfigService** is the single source of truth for configuration. It handles migration, validation, defaults, and file permissions.
- **Renderer isolation:** `contextIsolation: true`, `nodeIntegration: false`. The UI has no direct Node.js or filesystem access.
- **Headless mode:** The application can run without a GUI via `--run-automation`. This is how the OS background task works.
- **Chrome connection:** CDP polling on `127.0.0.1:9222`. The connection is local-only (remote debugging address is explicitly bound to localhost).
- **Resume safety:** File stability is checked (size + mtime at two points in time) before upload to prevent partial-file uploads.

---

## Testing

A formal automated test suite has not yet been implemented. Manual testing areas include:

- Credentials save/load/clear
- Resume selection, validation, and copy
- Filename generation (date stamping, de-duplication)
- Resume upload completion and verification
- Headline toggle and verification
- Chrome connection, disconnect, reconnect
- OS scheduler registration and removal
- Configuration migration from repo root
- Diagnostic check results

Contributions that add automated tests are welcome.

---

## Contributing

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/naukri_update.git`
3. Set up the project: `npm run setup`
4. Create a branch: `git checkout -b feature/your-feature`
5. Make your changes
6. Test manually against a real Naukri account or a mock page
7. Commit and push your branch
8. Open a Pull Request against `main`

Please keep PRs focused. Document any new IPC channels in `preload.js` and `main.js`. Do not introduce telemetry, analytics, or any external network calls beyond `naukri.com`.

---

## Disclaimer

This is an independent automation project. It is **not affiliated with, authorized by, maintained by, sponsored by, or endorsed by Naukri.com or Info Edge (India) Ltd.**

Users are responsible for complying with Naukri's Terms of Service and any applicable laws. The authors accept no liability for account suspension, data loss, or any other consequences arising from use of this software.

---

## License

ISC — see [LICENSE](LICENSE) for details.
