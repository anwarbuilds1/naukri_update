# I downloaded Naukri Update. What do I do now?

This guide is written for complete beginners. If you know how to download a file, open your Downloads folder, and click buttons, you can set up and run Naukri Update.

---

## Select your operating system to get started:

- 👉 [**Linux Guide (AppImage & .deb)**](#complete-installation-guide--linux)
- 👉 [**Windows Guide (.exe Installer)**](#complete-installation-guide--windows)
- 👉 [**macOS Guide (.dmg File)**](#complete-installation-guide--macos)

---

# Complete Installation Guide — Linux

Choose the installation option that matches the file you downloaded:

- **Option A:** `NaukriUpdate-1.0.0.AppImage` *(Single file, no installation required)*
- **Option B:** `naukri-update_1.0.0_amd64.deb` *(Recommended for Ubuntu, Debian, Mint, and Pop!_OS)*

---

## Option A: Using the AppImage File (`NaukriUpdate-1.0.0.AppImage`)

> **What is an AppImage?**  
> An AppImage is a complete Linux application packed into a single standalone file. You do not need to run an installer — the file itself is the program.

### Step 1 — Find the downloaded file
1. Open your file manager (e.g., Files, Nautilus, Dolphin, or Thunar).
2. Click on your **Downloads** folder in the sidebar.
3. Locate the file: `NaukriUpdate-1.0.0.AppImage`.

### Step 2 — Make the file executable
By default, Linux prevents downloaded files from running until you explicitly give them permission.

**GUI Method (Recommended):**
1. Right-click `NaukriUpdate-1.0.0.AppImage` and select **Properties**.
2. Go to the **Permissions** tab or section.
3. Look for a checkbox or toggle option. Depending on your Linux desktop environment, it will be labeled as one of the following:
   - **"Allow executing file as program"** *(Ubuntu / GNOME)*
   - **"Is executable"** *(KDE Plasma)*
   - **"Execute: Allow executing file as program"** *(XFCE)*
   - **"Make executable"** *(Cinnamon)*
4. Turn this setting **ON** (check the box or toggle the switch).
5. Close the Properties window.

### Step 3 — Open Naukri Update
1. Double-click `NaukriUpdate-1.0.0.AppImage`.
2. If your file manager asks *"Do you want to run 'NaukriUpdate-1.0.0.AppImage', or display its contents?"*, click **Run** or **Execute**.
3. Wait 3–5 seconds. The Naukri Update window will launch.

---

### Step 4 — Troubleshooting: If the AppImage does NOT open

If double-clicking the AppImage does nothing or fails, review the common causes below:

#### Issue 1: Missing FUSE Library (`dlopen(): error loading libfuse.so.2`)

##### What it means:
AppImage files rely on a system utility called **FUSE** (Filesystem in Userspace) to mount and run. Modern Linux distributions (such as Ubuntu 22.04+, Debian 12+, Fedora 38+, and Arch Linux) no longer include the legacy `libfuse2` library by default. If it is missing, double-clicking the file does nothing or outputs `error loading libfuse.so.2` when run from a terminal.

##### Recommended Fix for Ubuntu/Debian users:
Download and use the **`.deb` package** instead (see [Option B](#option-b-using-the-deb-package-ubudebian-recommended)). The `.deb` package installs cleanly via your system package manager and does not require FUSE.

##### How to fix FUSE for AppImage:
If you prefer to use the AppImage format, install the required legacy FUSE library for your Linux distribution:

- **Ubuntu 22.04 / 24.04, Debian 12, Linux Mint 21+, Pop!_OS:**
  ```bash
  sudo apt update
  sudo apt install libfuse2t64 libfuse2
  ```
- **Fedora 38+:**
  ```bash
  sudo dnf install fuse-libs
  ```
- **Arch Linux / Manjaro:**
  ```bash
  sudo pacman -S fuse2
  ```
- **openSUSE:**
  ```bash
  sudo zypper install libfuse2
  ```

*Note on recent builds:* Release builds produced with `electron-builder` v27+ bundle a static AppImage runtime, eliminating host FUSE dependencies on newer systems.

---

#### Issue 2: Terminal permission fallback
If your file manager's Properties dialog did not save the executable permission properly:
1. Open your **Terminal** app.
2. Run this command:
   ```bash
   chmod +x ~/Downloads/NaukriUpdate-1.0.0.AppImage
   ```
3. Run the application:
   ```bash
   ~/Downloads/NaukriUpdate-1.0.0.AppImage
   ```

---

#### Issue 3: "Exec format error" (Wrong CPU Architecture)
- **What it means:** You downloaded a binary built for a different processor type (for example, running an x86_64 binary on an ARM64 system like a Raspberry Pi or ARM Chromebook).
- **What to check:** Official Naukri Update releases are currently built for **64-bit Intel/AMD systems (`x86_64` / `amd64`)**. To check your CPU type, run `uname -m` in terminal. It should say `x86_64`.

---

#### Issue 4: Corrupted Download
- **What it means:** The download was interrupted or incomplete.
- **What to do:** Delete the file from Downloads and re-download `NaukriUpdate-1.0.0.AppImage` from the official GitHub release page.

---

## Option B: Using the `.deb` Package (Ubuntu/Debian Recommended)

> **What is a `.deb` package?**  
> A `.deb` file is a standard software installer for Debian-based Linux systems (Ubuntu, Linux Mint, Pop!_OS, Zorin OS, Elementary OS). It registers the app in your system application menu and handles dependencies automatically.

### GUI Installation Method:
1. Open your **Downloads** folder.
2. Double-click `naukri-update_1.0.0_amd64.deb`.
3. Your distribution's Software Center (Ubuntu Software, App Center, or GDebi) will open.
4. Click **Install**.
5. Type your computer account password when prompted.
6. Once installation completes, open your system application menu, search for **Naukri Update**, and click to launch.

### Terminal Installation Method:
If double-clicking `.deb` does not launch Software Center:
```bash
sudo dpkg -i ~/Downloads/naukri-update_1.0.0_amd64.deb
sudo apt-get install -f   # Fixes any missing dependencies automatically
```

---

# Complete Installation Guide — Windows

You downloaded: `NaukriUpdate-Setup-1.0.0.exe`

### Step 1 — Run the Installer
1. Open your **Downloads** folder.
2. Double-click `NaukriUpdate-Setup-1.0.0.exe`.

### Step 2 — Understanding the SmartScreen Warning
If Windows displays a blue pop-up box stating:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

#### What this warning actually means:
This warning appears because the installer is an independent open-source release that has not been purchased with an expensive commercial Code Signing Certificate from Microsoft. **It does not mean the file contains malware.**

#### What to click:
1. Click the text link labeled **"More info"** inside the blue window.
2. A button labeled **"Run anyway"** will appear at the bottom.
3. Click **Run anyway**.

### Step 3 — Complete Setup
1. Follow the installer prompt (choose installation directory, click **Next**).
2. Click **Install**, then click **Finish**.
3. Naukri Update will automatically launch and create a shortcut on your Desktop and Start Menu.

---

# Complete Installation Guide — macOS

You downloaded: `NaukriUpdate-1.0.0.dmg`

### Step 1 — Install the Application
1. Open your **Downloads** folder.
2. Double-click `NaukriUpdate-1.0.0.dmg` to open the disk image.
3. A window will open showing the **Naukri Update** icon and an **Applications** folder shortcut.
4. Drag the **Naukri Update** icon into the **Applications** folder.
5. Unmount/Eject the disk image from your Finder sidebar.

### Step 2 — Handling the macOS Gatekeeper Warning
When launching Naukri Update for the first time, macOS may show a warning:
> *"Naukri Update can't be opened because Apple cannot check it for malicious software."*

#### How to open it legitimately:
1. Open your **Applications** folder in Finder.
2. **Right-click** (or `Control` + Click) on **Naukri Update**.
3. Select **Open** from the context menu.
4. A prompt will appear asking for confirmation. Click **Open**.
5. You only need to do this once. Future launches can be done normally.

---

# First-Time Setup Walkthrough

When you open Naukri Update for the first time, the interactive **Onboarding Wizard** will automatically guide you through configuration step by step:

```
Step 0: Welcome Screen
   ↓
Step 1: Naukri Profile Link
   ↓
Step 2: Credentials Configuration
   ↓
Step 3: Establish Login Session (Connect Chrome)
   ↓
Step 4: Choose Your Resume
   ↓
Step 5: Resume Upload Settings
   ↓
Step 6: Resume Headline Settings
   ↓
Dashboard Main View
```

### Step-by-Step Breakdown:

1. **Step 0 — Welcome:** Review privacy information and click **Get Started**.
2. **Step 1 — Profile URL:** Enter your Naukri profile editor URL (default: `https://www.naukri.com/mnjuser/profile`).
3. **Step 2 — Credentials:** Enter your Naukri login email and password.
4. **Step 3 — Establish Login Session:** Click **Connect Chrome**. A dedicated Chrome browser window opens. Log in to your Naukri account if prompted. If Naukri presents an **OTP** or **CAPTCHA**, complete it manually in that Chrome window.
5. **Step 4 — Choose Resume:** Click **Choose PDF File** to select your resume PDF. The app validates the PDF format and stores a copy in its local application directory.
6. **Step 5 — Resume Upload Settings:** Toggle **Daily Resume PDF Upload** ON or OFF and set your preferred daily upload time (e.g., `07:00`).
7. **Step 6 — Headline Refresh Settings:** Toggle **Hourly Resume Headline Refresh** ON or OFF, select interval hours (e.g., every `1` hour), and save.

---

# Credentials & Security

### What information is requested?
- Your Naukri account email address.
- Your Naukri account password.
- Your Naukri profile URL.

### Why is it needed?
Naukri login sessions periodically expire. The application requires stored credentials so Playwright can re-authenticate your session automatically in the background without interrupting you.

### How are credentials stored?
Credentials are saved locally in a standard key-value file named `.env` inside your operating system's application data directory.

> ⚠️ **Storage Disclosure:** Credentials are stored in **plain text** within the `.env` file. They are **not encrypted**.  
> On Linux and macOS, the app restricts file permissions (`chmod 0600`) so that only your system user account can read the file. Anyone with administrator or physical access to your logged-in user account can read this file.

### What network destinations receive your data?
- **Naukri.com ONLY:** Credentials and resume files are transmitted directly to `https://www.naukri.com` via HTTPS using Chrome.
- **Zero Telemetry / Analytics:** Naukri Update contains **no telemetry, no analytics, no crash reporting, and no external tracking servers**. No data is ever sent to the app developers or third parties.

---

# Chrome Connection & Isolated Profile

Naukri Update runs browser interactions using a **dedicated, isolated Chrome profile** stored in `.naukri-chrome-profile` inside your app data directory.

- **Isolation:** It operates completely independently of your personal Chrome browser. Your personal history, bookmarks, saved passwords, and extensions are not accessible to Naukri Update.
- **Connecting:** Clicking **Connect Chrome** launches Google Chrome with `--remote-debugging-port=9222`. Playwright connects locally via Chrome DevTools Protocol (CDP) at `http://127.0.0.1:9222`.
- **OTP & CAPTCHA Handling:** The app **never** attempts to bypass security checks. If Naukri requests an OTP code or CAPTCHA, the dashboard status displays *"Please complete OTP/CAPTCHA in the Chrome window"*. Complete the verification step directly in the Chrome window. Once on your profile page, the app automatically detects the active session.

---

# Resume Management & Upload Safety

### How resume selection works:
When you choose a PDF resume file from **Settings → Resume File Source**, the application validates the file:
1. Checks that the file header matches `%PDF`.
2. Checks that the file size is non-zero and stable (not currently being written to).
3. Copies the file to the local `resume/` directory inside application storage.

### Dynamic Date-Stamping:
Naukri rejects uploads that share the exact filename of your current resume. To ensure every daily upload is accepted without modifying your original local file, Naukri Update automatically appends today's date during upload:

| Your Original Local File | File Uploaded to Naukri |
| :--- | :--- |
| `Ram_Resume.pdf` | `Ram_Resume_29-08-2026.pdf` |
| `Anwar_Rizwan_Resume.pdf` | `Anwar_Rizwan_Resume_29-08-2026.pdf` |
| `resume_28-08-2026.pdf` | `resume_29-08-2026.pdf` *(old date updated)* |

You **do not** need to rename your local file manually.

### Safe Upload & Verification Flow:
Naukri Update implements a strict 9-step safe upload pipeline to prevent corrupted or partial uploads:
```
1. Find Authoritative Local Resume
   ↓
2. Validate PDF Header & File Size Stability
   ↓
3. Generate Today's Dated Upload Filename
   ↓
4. Fill File Input on Naukri Profile Page
   ↓
5. Monitor Upload Progress Bar (0% → 100%)
   ↓
6. Wait for Naukri Upload Success Confirmation Message
   ↓
7. Click Save & Wait for Network Idle
   ↓
8. Reload Page & Verify Active Resume Filename Matches Expected Name
   ↓
9. Clean Up Local Temporary Files & Old Dated Copies
```

If the upload fails at any stage or the post-reload verification fails, the task aborts and logs an error without marking the update as successful.

---

# Resume Headline Automation

### How it works:
Naukri records a *"Last Updated"* timestamp whenever your profile data changes. The headline automation opens your profile editor, inspects your existing headline text, and toggles a trailing period (`.`):
- `"Senior Software Engineer"` ➔ `"Senior Software Engineer."`
- `"Senior Software Engineer."` ➔ `"Senior Software Engineer"`

This tiny edit triggers Naukri's system timestamp update without changing the visible meaning of your headline to recruiters.

> **Disclaimer:** Profile auto-refreshes update your profile timestamp on Naukri.com. Naukri Update does **not** guarantee increased recruiter calls, interviews, or ranking positions, as candidate search ranking is entirely controlled by Naukri's internal proprietary algorithms.

---

# Background Automation, Auto-Start & Power States

### Native OS Scheduler Integration:
When you save your settings with automation enabled, the app automatically registers a native background task on your operating system:
- **Windows:** Task Scheduler task named `NaukriUpdateTask` (runs every 15 minutes).
- **macOS:** LaunchAgent file at `~/Library/LaunchAgents/com.naukri.update.plist` (runs every 15 minutes).
- **Linux:** User `crontab` entry (runs every 15 minutes).

Every 15 minutes, the OS background task starts the app in headless mode (`--run-automation`). The script checks if a scheduled headline refresh or resume upload is due. If nothing is due, it exits immediately with zero memory consumption.

### System Tray & Closing the Window:
- **Clicking the Close (✕) Button:** Hides the main window to your system tray (near your clock). The application continues running silently in the background.
- **Quitting the Application:** Right-clicking the tray icon and selecting **Quit Application** exits the desktop window. However, because native OS background scheduling is configured, your system scheduler will still trigger headless automation runs at the scheduled times.

### Auto-Start on System Boot:
The application automatically configures itself to launch on system login (`openAtLogin: true`, `openAsHidden: true`). When you turn on or log in to your computer:
1. Naukri Update starts minimized in the background.
2. OS background triggers resume execution automatically.

### System Shutdown & Sleep:
- **When computer is powered OFF or in Sleep mode:** Automation **cannot** run.
- **When computer turns back ON:** On the next 15-minute check cycle, the scheduler detects if a task was missed while the computer was powered down and executes the update immediately.

---

# Detailed Troubleshooting Guide

### 1. Application Installation & Launch Issues

#### Problem: App image / `.exe` / `.dmg` won't open or throws permission error
- **What it means:** Operating system security policies blocked execution or execute permissions are missing.
- **What to do:**
  - **Linux:** Follow [Step 2 of the Linux Guide](#step-2--make-the-file-executable) or run `chmod +x <filename>`. If `libfuse.so.2` error occurs, install `libfuse2` or use the `.deb` package.
  - **Windows:** Click **More info** ➔ **Run anyway** on the SmartScreen pop-up.
  - **macOS:** Right-click the app icon in Applications ➔ Click **Open** ➔ Click **Open**.

#### Problem: "Exec format error" in Linux Terminal
- **What it means:** CPU architecture mismatch.
- **What to do:** Ensure your system is an x86_64 (amd64) architecture. Run `uname -m` to verify.

---

### 2. Chrome Connection & Session Issues

#### Problem: Dashboard shows "Disconnected" or "Chrome is not connected"
- **What it means:** The dedicated Chrome browser process is not currently running or its debugging port (`9222`) is unreachable.
- **What to do:**
  1. Click **Connect Chrome** on the Dashboard or Settings tab.
  2. If Chrome does not open, close any existing Chrome instances and try clicking **Connect Chrome** again.

#### Problem: "SingletonLock" Error or Browser Profile Locked
- **What it means:** Chrome crashed previously and left a lock file in the profile directory.
- **What to do:**
  1. Open **Settings ➔ Privacy & Data Management**.
  2. Click **Reset Browser Profile**.
  3. Click **Connect Chrome** to launch a fresh browser session and log in.

---

### 3. Naukri Login & OTP / CAPTCHA Issues

#### Problem: Naukri requests OTP or CAPTCHA
- **What it means:** Naukri flagged the login attempt for two-factor verification.
- **What to do:**
  1. Look at the dedicated Chrome browser window that opened.
  2. Enter the OTP sent to your phone/email, or solve the puzzle.
  3. Once your Naukri profile edit page appears, the application will update to **Connected** automatically.

---

### 4. Resume & Upload Issues

#### Problem: "No valid resume PDF loaded" or Upload Failed
- **What it means:** The selected resume file is missing, corrupted, open in another program, or not a valid PDF.
- **What to do:**
  1. Open **Settings ➔ Resume File Source**.
  2. Click **Choose PDF** and re-select your resume file.
  3. Ensure the file opens cleanly in a PDF viewer and is less than 2MB.
  4. Click **Upload Resume Now** on the Dashboard to test.

---

# Activity Logs & Diagnostics

### Viewing Logs in the Desktop App:
Go to the **Activity Logs** tab inside Naukri Update to view real-time log outputs:
- **Profile Refresh Log:** Displays detailed execution steps, progress percentages, and DOM verification checks.
- **Hourly Scheduler Runner Log:** Displays OS background trigger events and due-date calculation checks.

### Diagnostic Screen Capture:
If an automation task fails, the application automatically saves a diagnostic screenshot at `naukri-refresh-error.png` inside your application data directory.

### Log Masking & Confidentiality:
All log outputs automatically scrub sensitive credentials before writing to disk or displaying in the UI (e.g., `NAUKRI_PASSWORD=••••••••`).

---

# Data Storage Locations & File Paths

All application state, logs, resume copies, and browser session data are stored locally in your operating system's standard application data folder:

| Operating System | Application Data Base Directory |
| :--- | :--- |
| **Windows** | `%APPDATA%\NaukriUpdate\` |
| **macOS** | `~/Library/Application Support/NaukriUpdate/` |
| **Linux** | `~/.config/NaukriUpdate/` |

### Storage Structure:
- `Config (.env)` ➔ Credentials, URL, schedule preferences
- `resume/` ➔ Managed local copy of your resume PDF
- `.naukri-chrome-profile/` ➔ Dedicated Chrome cookies, cache, and session
- `naukri-refresh.log` ➔ Execution activity log (automatically rotated, max 5 runs retained)
- `.naukri-refresh-state.json` ➔ Last execution timestamps and pause state

---

# Reset Operations

You can manage or clear your local data anytime under **Settings ➔ Privacy & Data Management**:

- **Clear Credentials:** Erases your saved email and password from `.env`. *(Automation will pause until credentials are re-entered).*
- **Remove Resume PDF:** Deletes the PDF stored in the application `resume/` folder. *(Your original file outside the app directory is untouched).*
- **Reset Browser Profile:** Deletes `.naukri-chrome-profile`. Clears all saved Naukri cookies and login sessions.
- **Reset Entire Application:** Performs a complete wipe of credentials, configuration, resume copies, logs, browser profile, and removes native OS background scheduler registrations. Restores the app to its fresh first-run state.

---

# How to Uninstall Naukri Update

### Windows:
1. Open **Start Menu** ➔ **Settings** ➔ **Apps** ➔ **Installed Apps** (or Control Panel ➔ Programs and Features).
2. Find **NaukriUpdate** and click **Uninstall**.

### macOS:
1. Open **Finder** ➔ **Applications**.
2. Drag **Naukri Update** to the **Trash**.
3. Empty the Trash.

### Linux AppImage:
1. Delete the `NaukriUpdate-1.0.0.AppImage` file from your computer.
2. (Optional) Remove the crontab entry by running `crontab -e` in terminal and deleting lines containing `NaukriUpdate`.

### Linux `.deb` Package:
- **GUI:** Open Software Center ➔ Search **Naukri Update** ➔ Click **Remove**.
- **Terminal:** `sudo apt remove naukri-update`

> **Note on App Data:** Uninstalling the application binary does not automatically delete your local `.env` and log files. To remove all local data completely, perform a **Reset Entire Application** inside the app before uninstalling, or manually delete the `NaukriUpdate` folder from your system application data path listed above.

---

# Official GitHub Releases & Artifacts

Always download Naukri Update from the official GitHub release page:
👉 **[Official Releases Page](https://github.com/anwarbuilds1/naukri_update/releases/latest)**

### Published Artifacts:

| Platform | Architecture | File Name | Description |
| :--- | :--- | :--- | :--- |
| **Windows** | x64 (64-bit) | `NaukriUpdate-Setup-1.0.0.exe` | Standard Windows NSIS Installer |
| **macOS** | Universal / Intel / Apple Silicon | `NaukriUpdate-1.0.0.dmg` | macOS Disk Image Package |
| **Linux** | x64 (amd64) | `NaukriUpdate-1.0.0.AppImage` | Standalone Linux Portable AppImage |
| **Linux** | x64 (amd64) | `naukri-update_1.0.0_amd64.deb` | Debian/Ubuntu Installer Package |

---

# Developer Setup & Source Build Guide

> ⚠️ **Notice:** This section is intended exclusively for developers and software contributors. End users do **not** need to install Node.js, Git, or run terminal commands.

### Prerequisites:
- **Node.js:** v20.0.0 or higher
- **npm:** v9.0.0 or higher
- **Google Chrome:** Installed locally
- **Git:** Installed locally

### One-Command Setup:
Clone the repository and run the setup bootstrapper script:
```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

#### What `npm run setup` (`scripts/setup.js`) does:
1. Detects OS, Node.js version (verifies `>= 18`), and Chrome binary path.
2. Installs npm dependencies if `node_modules` is absent.
3. Initializes application data directories (`resume/`, `logs/`, `temp/`).
4. Migrates existing `.env` files from repository root to AppData directory if applicable.
5. Launches the Electron desktop app in a detached background process.

### Developer Commands:

| Command | Description |
| :--- | :--- |
| `npm run setup` | One-command bootstrap and application launch |
| `npm start` | Launch Electron application directly |
| `npm run refresh` | Run Playwright profile refresh script once via CLI |
| `npm run pack` | Package application directory without creating installers |
| `npm run dist` | Build production installer binaries (`.exe`, `.dmg`, `.AppImage`, `.deb`) |

### Repository Structure:
```
naukri_update/
├── main.js                   # Electron main process (IPC handlers, tray, scheduler)
├── preload.js                # ContextBridge script (contextIsolation: true)
├── config-service.js         # Central config loader, validator, diagnostics, permissions
├── config.js                 # Automation wrapper for environment variables
├── naukri-profile-refresh.js # Playwright automation core engine
├── renderer/
│   ├── index.html            # App GUI structure & Onboarding Wizard
│   ├── style.css             # Theme styles & layout components
│   └── app.js                # Frontend state management & IPC bridge events
└── scripts/
    ├── setup.js              # One-command setup bootstrapper
    └── scheduler.js          # CLI helper for OS background scheduler check
```

---

# Disclaimer

Naukri Update is an independent open-source project. It is **not affiliated with, authorized by, maintained by, sponsored by, or endorsed by Naukri.com or Info Edge (India) Ltd.**

Users are solely responsible for complying with Naukri.com's Terms of Service and any applicable local policies. The developers assume no liability for account suspensions, profile modifications, or data loss resulting from the use of this software.

---

# License

Licensed under the [ISC License](LICENSE).
