# Naukri Update

Naukri Update is a desktop application that automatically keeps your Naukri.com job profile active and visible to recruiters. It regularly updates your profile activity timestamp and re-uploads your resume PDF on a schedule—completely running from your own computer with zero third-party servers.

---

# What Does Naukri Update Do?

Naukri's candidate search algorithms prioritize active job seekers by looking at when a profile was last updated. Naukri Update automates two specific actions to keep your profile marked as active:

1. **Resume Headline Refresh:** Automatically toggles a trailing period (`.`) at the end of your resume headline (for example, changing `"Senior Software Engineer"` to `"Senior Software Engineer."` and back). This updates your profile's "Last Updated" timestamp without altering your visible profile text.
2. **Daily Resume PDF Upload:** Automatically re-uploads your resume PDF file once a day at your chosen time. It dynamically appends today's date to the uploaded filename (for example, `Ram_Resume_29-08-2026.pdf`) so Naukri accepts the upload as a fresh document without duplicate warnings.

---

# Download Naukri Update

If you are a normal user, you do **NOT** need Node.js, npm, Git, or a terminal. Download the ready-to-use application for your operating system.

👉 **[Download Latest Naukri Update Release](https://github.com/anwarbuilds1/naukri_update/releases/latest)**

### How to download:
1. Open the official **[Releases Page](https://github.com/anwarbuilds1/naukri_update/releases/latest)**.
2. Always download the latest release available at the top of the page.
3. Scroll down to the **Assets** section of the latest release.
4. Download the file that matches your computer's operating system (see guide below).
5. **Do NOT download "Source code (zip)" or "Source code (tar.gz)"** unless you are a developer intending to modify the code.

---

# Which File Should I Download?

Use this table to choose the correct file from the Releases page:

| Operating System | Download File Pattern | Example Filename | Recommendation |
| :--- | :--- | :--- | :--- |
| **Windows** (64-bit) | `NaukriUpdate-Setup-<version>.exe` | `NaukriUpdate-Setup-1.0.0.exe` | **Recommended** |
| **macOS** (Intel / Apple Silicon) | `NaukriUpdate-<version>.dmg` | `NaukriUpdate-1.0.0.dmg` | **Recommended** |
| **Ubuntu / Debian / Linux Mint / Pop!_OS** | `naukri-update_<version>_amd64.deb` | `naukri-update_1.0.0_amd64.deb` | **Recommended** |
| **Other Linux Distributions** | `NaukriUpdate-<version>.AppImage` | `NaukriUpdate-1.0.0.AppImage` | Portable option |

### Architecture Notes:
- **Windows x64:** `NaukriUpdate-Setup-<version>.exe` supports 64-bit Windows 10 and Windows 11.
- **macOS:** `NaukriUpdate-<version>.dmg` supports Apple Silicon (M1/M2/M3/M4) and Intel Macs running macOS 11+.
- **Linux x64 (amd64):** Official builds are compiled for standard 64-bit x86_64 processors.

---

## Not sure what to download?

### Windows
Download the `.exe` installer (e.g. `NaukriUpdate-Setup-1.0.0.exe`).  
Then go to the **[Windows Installation Guide](#windows)**.

### Mac
Download the `.dmg` file (e.g. `NaukriUpdate-1.0.0.dmg`).  
Then go to the **[macOS Installation Guide](#macos)**.

### Ubuntu / Debian / Linux Mint / Pop!_OS
Download the `.deb` package (e.g. `naukri-update_1.0.0_amd64.deb`).  
Then go to the **[Linux .deb Installation Guide](#deb)**.

### Other supported Linux
Download the `.AppImage` file (e.g. `NaukriUpdate-1.0.0.AppImage`).  
Then go to the **[Linux AppImage Installation Guide](#appimage)**.

---

# Complete Installation Guide

Choose your operating system below for step-by-step instructions.

---

## Windows

Downloaded file: `NaukriUpdate-Setup-<version>.exe` (e.g. `NaukriUpdate-Setup-1.0.0.exe`)

### Step 1 — Open your Downloads folder
1. Open File Explorer and click on **Downloads**.
2. Double-click `NaukriUpdate-Setup-1.0.0.exe`.

### Step 2 — Handle Windows SmartScreen (if it appears)
If a blue window appears saying *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting"*:

#### What this warning means:
This warning appears because Naukri Update is an independent open-source application that does not purchase an expensive commercial digital certificate from Microsoft. It is a standard message for open-source software and does **not** mean the file is harmful.

#### What to do:
1. Click the text link labeled **"More info"** inside the blue pop-up window.
2. A button labeled **"Run anyway"** will appear at the bottom.
3. Click **"Run anyway"** ONLY if you downloaded the file from the official GitHub Releases page (`https://github.com/anwarbuilds1/naukri_update/releases/latest`).

*Note: Do not disable Windows Defender or your antivirus software; simply click "Run anyway" for this installer.*

### Step 3 — Complete Installation
1. Follow the installer setup steps and click **Next**.
2. Click **Install**, then click **Finish**.
3. Naukri Update will open automatically and place a shortcut on your Desktop and Start Menu.
4. Proceed to **[First-Time Setup](#first-time-setup)** below.

---

## macOS

Downloaded file: `NaukriUpdate-<version>.dmg` (e.g. `NaukriUpdate-1.0.0.dmg`)

### Step 1 — Open the DMG file
1. Open Finder and go to your **Downloads** folder.
2. Double-click `NaukriUpdate-1.0.0.dmg` to mount the disk image.

### Step 2 — Drag to Applications
1. In the window that opens, drag the **Naukri Update** app icon into the **Applications** folder shortcut.
2. Wait for the copy process to finish.
3. Eject the disk image from Finder.

### Step 3 — Launch the Application & Handle Gatekeeper
1. Open your **Applications** folder in Finder.
2. Locate **Naukri Update**.

#### If macOS displays a Gatekeeper prompt:
If a pop-up appears stating *"Naukri Update can't be opened because Apple cannot check it for malicious software"*:

#### Legitimate way to open:
1. Do **NOT** disable Gatekeeper system-wide.
2. **Right-click** (or hold the `Control` key and click) the **Naukri Update** icon in your Applications folder.
3. Click **Open** from the context menu.
4. A security prompt will open with an **Open** button. Click **Open**.
5. You only need to perform this step once. Future launches work by double-clicking normally.
6. Proceed to **[First-Time Setup](#first-time-setup)** below.

---

## Linux

### `.deb`

Downloaded file: `naukri-update_<version>_amd64.deb` (e.g. `naukri-update_1.0.0_amd64.deb`)  
*Recommended for Ubuntu, Debian, Linux Mint, Pop!_OS, Zorin OS, and Elementary OS.*

#### GUI Installation Method (Recommended):
1. Open your file manager and go to **Downloads**.
2. Double-click `naukri-update_1.0.0_amd64.deb`.
3. Your distribution's Software Center (Ubuntu Software, App Center, or GDebi) will launch.
4. Click the **Install** button.
5. Enter your computer user password when prompted.
6. Wait for installation to complete.
7. Open your system Applications menu, search for **Naukri Update**, and click to launch.

#### Terminal Fallback Method:
If double-clicking `.deb` does not launch your Software Center:
```bash
sudo dpkg -i ~/Downloads/naukri-update_1.0.0_amd64.deb
sudo apt-get install -f
```
Proceed to **[First-Time Setup](#first-time-setup)** below.

---

### AppImage

Downloaded file: `NaukriUpdate-<version>.AppImage` (e.g. `NaukriUpdate-1.0.0.AppImage`)  
*For Arch, Fedora, openSUSE, and other Linux distributions.*

#### Step 1 — Open Downloads
1. Open your file manager (Files, Nautilus, Dolphin, or Thunar).
2. Go to **Downloads**.
3. Locate `NaukriUpdate-1.0.0.AppImage`.

#### Step 2 — Allow it to run as a program
1. Right-click `NaukriUpdate-1.0.0.AppImage` and select **Properties**.
2. Open the **Permissions** tab.
3. Turn **ON** the executable permission. Depending on your Linux desktop, this option is labeled:
   - **"Allow executing file as program"** *(Ubuntu / GNOME)*
   - **"Is executable"** *(KDE Plasma)*
   - **"Execute: Allow executing file as program"** *(XFCE)*
   - **"Make executable"** *(Cinnamon)*
4. Close the Properties window.

#### Step 3 — Open the application
1. Double-click `NaukriUpdate-1.0.0.AppImage`.
2. If prompted whether to "Run" or "Display contents", click **Run** / **Execute**.
3. The app window will launch. Proceed to **[First-Time Setup](#first-time-setup)** below.

#### Step 4 — Terminal Fallback (If double-clicking fails)
If your file manager does not set execution permissions properly, open Terminal and run:
```bash
chmod +x ~/Downloads/NaukriUpdate-1.0.0.AppImage
~/Downloads/NaukriUpdate-1.0.0.AppImage
```

#### FUSE Issue on Modern Linux (`dlopen(): error loading libfuse.so.2`):
- **What it means:** AppImages require the legacy FUSE 2 library (`libfuse.so.2`). Newer Linux distributions (such as Ubuntu 22.04+, Debian 12+, Fedora 38+, Arch Linux) do not install `libfuse2` by default.
- **Recommended Fix for Ubuntu / Debian users:** Download and use the **`.deb` package** instead. The `.deb` package does not require FUSE.
- **How to install FUSE for AppImage:** If you prefer AppImage, install `libfuse2` for your distribution:
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

---

# First-Time Setup

When you open Naukri Update for the first time, an in-app setup wizard will launch automatically. Follow the UI step by step:

```
Welcome Screen
   ↓
Naukri Profile Link (URL)
   ↓
Credentials Configuration (Email & Password)
   ↓
Establish Login Session (Connect Chrome)
   ↓
Login on Naukri.com (in Chrome window)
   ↓
OTP / CAPTCHA if required (complete manually in Chrome)
   ↓
Connected State Verified
   ↓
Choose Your Resume (Select PDF File)
   ↓
Resume Upload Settings (Daily Schedule)
   ↓
Resume Headline Settings (Interval / Fixed Time)
   ↓
Background System Scheduler
   ↓
Review Settings & Diagnostics (Verify Readiness)
   ↓
Dashboard Main View
```

### Setup Step Breakdown:
1. **Welcome Screen:** Review key privacy details and click **Get Started**.
2. **Naukri Profile Link:** Leave as default (`https://www.naukri.com/mnjuser/profile`) or enter your profile URL, then click **Next**.
3. **Credentials Configuration:** Enter your **Naukri Email** and **Naukri Password**, then click **Next**.
4. **Establish Login Session:** Click **Connect Chrome**. A dedicated Google Chrome browser window will open.
5. **Login:** If you are not already logged in, enter your credentials in the Chrome window.
6. **OTP / CAPTCHA:** If Naukri asks for security verification, enter the OTP or solve the CAPTCHA manually in the Chrome window. The app will detect when your profile page is visible and display "Connected".
7. **Choose Your Resume:** Click **Choose PDF File** to select your resume PDF. The app validates the file structure and copies it into application storage.
8. **Resume Upload Settings:** Turn **Daily Resume PDF Upload** ON and set your preferred daily upload time (e.g. `07:00`).
9. **Resume Headline Settings:** Turn **Hourly Resume Headline Refresh** ON, select your preferred interval (e.g. every `1` hour), and click **Next**.
10. **Background System Scheduler:** Keep **Register Background Task on Boot** checked so native system tasks execute background updates automatically.
11. **Review Settings & Diagnostics:** Click **Verify System Readiness** to run self-checks, then click **Finish Setup**.

---

# How Naukri Update Works

Naukri Update runs locally on your machine. Here is how its components interface:

- **Desktop Dashboard (GUI):** Built with Electron. Allows you to configure schedules, view logs, trigger manual updates, and monitor connection status.
- **Dedicated Chrome Profile:** Launches Google Chrome using a isolated user directory (`.naukri-chrome-profile`) located in your AppData directory. It does not touch your personal daily Chrome profile, cookies, or saved passwords.
- **Playwright Core Engine:** Connects to the local Chrome instance via Chrome DevTools Protocol (CDP) on port `9222` to perform page navigation, text filling, and file uploads.
- **System Tray Integration:** When you close the main window, the app stays running in your system tray (notification area). Clicking the tray icon opens the dashboard or lets you pause/resume automation.

---

# Naukri Credentials

### WHAT credentials are requested?
Your Naukri account email address, account password, and profile URL.

### WHY are they required?
Naukri login sessions expire periodically. Stored credentials allow Playwright to sign back into Naukri automatically during scheduled background runs without interrupting you.

### WHERE are they stored?
Stored locally in plain text inside a `.env` configuration file in your application data directory:
- **Windows:** `%APPDATA%\NaukriUpdate\.env`
- **macOS:** `~/Library/Application Support/NaukriUpdate/.env`
- **Linux:** `~/.config/NaukriUpdate/.env`

*On Linux and macOS, file permissions are restricted (`chmod 0600`) so only your operating system user account can read the file.*

### WHAT does the application do with them?
During login re-authentication, the app inputs the email and password directly into the official Naukri login form (`https://www.naukri.com/entry/login`).

### WHAT data is sent to Naukri?
Your email and password are sent strictly to Naukri.com's secure login servers via HTTPS inside the Chrome browser.

### IS anything sent to the developer?
**NO.** Naukri Update contains zero telemetry, zero analytics, zero crash reporting, and zero third-party tracking. No data is ever sent to the developer or any external server.

---

# Chrome Connection

Naukri Update automates browser tasks using Google Chrome over CDP (Chrome DevTools Protocol):

1. **Dedicated Browser Instance:** When you click **Connect Chrome**, the app launches Chrome with `--remote-debugging-port=9222` using a dedicated data directory (`.naukri-chrome-profile`).
2. **Session Persistence:** Once logged into Naukri, your cookies and session remain saved in `.naukri-chrome-profile`. Subsequent background runs re-use this session seamlessly.
3. **OTP & CAPTCHA Safety:** The application **never** attempts to bypass CAPTCHA or OTP checks. If Naukri triggers security verification, the app pauses and displays *"Please complete OTP/CAPTCHA in the Chrome window"*. Complete the prompt manually in Chrome; the app will resume automatically once your profile page appears.

---

# Resume Management

### Authoritative Resume PDF & Validation:
When you click **Choose PDF**, Naukri Update runs strict checks:
- Verifies the file extension is `.pdf`.
- Confirms the binary header starts with `%PDF`.
- Runs a 500ms file stability check to ensure the file is not partially downloaded or locked by another program.
- Copies the file into your local AppData `resume/` directory.

### Dynamic Date-Stamping:
Naukri rejects uploads that share the exact filename of your current profile resume. To ensure every daily upload is accepted without forcing you to rename your local file, Naukri Update automatically appends today's date (`DD-MM-YYYY`) during upload:

| Original Local File | Filename Uploaded to Naukri |
| :--- | :--- |
| `Ram_Resume.pdf` | `Ram_Resume_29-08-2026.pdf` |
| `Anwar_Rizwan_Resume.pdf` | `Anwar_Rizwan_Resume_29-08-2026.pdf` |
| `resume_28-08-2026.pdf` | `resume_29-08-2026.pdf` *(old date updated)* |

- You do **not** need to manually rename your original resume.
- Today's date is generated dynamically based on system time.
- The app maintains a strict **single-file rule** in `resume/` and cleans up old temporary dated files after upload.

---

# Resume Upload Safety

Naukri Update implements a 9-step safe upload pipeline to prevent partial or corrupted uploads from corrupting your Naukri profile:

```
1. Validate Resume Header & Size Stability
   ↓
2. Prepare Dated Filename (e.g. Ram_Resume_29-08-2026.pdf)
   ↓
3. Set File Input in Chrome
   ↓
4. WAIT for Upload Progress (0% → 100%)
   ↓
5. Verify Success Message ("Resume has been successfully uploaded.")
   ↓
6. Save Profile (Click Save button if present)
   ↓
7. Reload Page & Verify Final State
   ↓
8. Verify Active Filename Matches Expected Dated Name
   ↓
9. Mark Successful & Clean Up Local Temp Copies
```

> **Upload Safety Guarantee:** If an upload is interrupted, times out, or fails verification, the task is marked as **FAILED** and logged. Incomplete or partial uploads are **never** treated as successful updates.

---

# Headline Automation

The Resume Headline automation updates your profile's activity timestamp without changing your visible resume text:

1. Opens your Naukri profile page.
2. Locates the Resume Headline section and clicks **Edit**.
3. Inspects your current headline text.
4. Toggles a trailing period (`.`):
   - `"Software Engineer"` ➔ `"Software Engineer."`
   - `"Software Engineer."` ➔ `"Software Engineer"`
5. Clicks **Save**, reloads the page, and verifies that the new headline is saved on Naukri.

---

# Background Automation

### How it runs in the background:
When you enable automations, Naukri Update registers a native task with your operating system:
- **Windows:** Task Scheduler task named `NaukriUpdateTask` (runs every 15 minutes).
- **macOS:** LaunchAgent plist at `~/Library/LaunchAgents/com.naukri.update.plist` (runs every 15 minutes).
- **Linux:** User `crontab` entry (runs every 15 minutes).

Every 15 minutes, the OS scheduler triggers the app in headless mode (`--run-automation`). The app checks whether a scheduled update is due. If nothing is due, it exits immediately with zero memory usage.

---

# What Happens If...

## I close the window
Clicking the window close (✕) button hides the dashboard to your **System Tray** (near the clock). The application stays running in the background and will execute scheduled tasks as normal.

## I quit the app
Right-clicking the tray icon and selecting **Quit Application** stops the desktop window. However, because native OS background scheduling (Task Scheduler / LaunchAgent / crontab) is registered, your OS will still launch headless checks at your scheduled times.

## I close Chrome
If you close the dedicated Chrome browser window, the dashboard status displays **Disconnected**. On the next scheduled background run, the application will launch Chrome automatically to complete the task.

## I restart my computer
Naukri Update configures auto-start on boot (`openAtLogin: true`). Upon logging into your desktop, the app launches minimized in the system tray, and OS background tasks resume automatically.

## My computer is turned off
If your computer is completely powered down, background automation cannot run.

## Naukri asks for OTP
Automation will pause and set dashboard status to *"Please complete OTP/CAPTCHA in the Chrome window"*. Open the dedicated Chrome window, enter your OTP, and complete login. The app will detect your profile page and resume.

## Naukri asks for CAPTCHA
Automation will pause. Complete the CAPTCHA puzzle manually in the dedicated Chrome window. Once solved, the app detects your authenticated session and resumes normal operation.

---

# Troubleshooting

Use the solutions below if you encounter issues.

## Installation & Launch

### Problem: App does not open on double-click
- **What it means:** Operating system security settings or missing permissions are blocking execution.
- **What to do:**
  - **Windows:** Right-click installer ➔ **Run as Administrator**, or click **More info** ➔ **Run anyway** on SmartScreen.
  - **macOS:** Right-click app in Applications ➔ Click **Open** ➔ Click **Open**.
  - **Linux AppImage:** Right-click AppImage ➔ Properties ➔ Permissions ➔ Enable "Allow executing file as program".
- **If that doesn't work:** Download the installer file again from official Releases to fix potential file corruption.

### Problem: Permission denied (Linux)
- **What it means:** The `.AppImage` file lacks execute permissions.
- **What to do:** Open Terminal and run: `chmod +x ~/Downloads/NaukriUpdate-*.AppImage`.
- **If that doesn't work:** Install and use the `.deb` package instead: `sudo dpkg -i ~/Downloads/naukri-update_*.deb`.

### Problem: FUSE error (`dlopen(): error loading libfuse.so.2`)
- **What it means:** Legacy FUSE 2 library is missing on your modern Linux distribution.
- **What to do:** For Ubuntu/Debian, install the `.deb` package. If using AppImage, install `libfuse2`:
  - Ubuntu/Debian: `sudo apt install libfuse2t64 libfuse2`
  - Fedora: `sudo dnf install fuse-libs`
  - Arch: `sudo pacman -S fuse2`
- **If that doesn't work:** Use the recommended `.deb` installer.

### Problem: Missing library error on Linux
- **What it means:** Required system libraries for Chromium (such as GTK, NSS, or X11) are missing.
- **What to do:** On Ubuntu/Debian, run: `sudo apt-get install -y libgtk-3-0 libnss3 libxss1 libasound2`.
- **If that doesn't work:** Run `sudo apt-get install -f` to repair package dependencies.

### Problem: Wrong CPU architecture (`Exec format error`)
- **What it means:** You are attempting to run an x86_64 binary on an ARM system (e.g. Raspberry Pi or ARM Chromebook).
- **What to do:** Verify your architecture by running `uname -m` in Terminal. It must be `x86_64` or `amd64`.
- **If that doesn't work:** Run the application from source code using Node.js.

### Problem: Corrupted download file
- **What it means:** The downloaded installer file is incomplete due to network disruption.
- **What to do:** Delete the file from Downloads and re-download from GitHub Releases.
- **If that doesn't work:** Clear your browser cache and try downloading with another browser.

### Problem: Antivirus / SmartScreen warning (Windows)
- **What it means:** Windows Defender SmartScreen flagged the installer because it lacks a paid Microsoft commercial certificate.
- **What to do:** Click **More info**, then click **Run anyway**.
- **If that doesn't work:** Check your download source to confirm it was downloaded from `https://github.com/anwarbuilds1/naukri_update/releases/latest`.

### Problem: macOS Gatekeeper warning ("Apple cannot check it for malicious software")
- **What it means:** macOS blocked an un-notarized open-source application.
- **What to do:** Right-click **Naukri Update** in your Applications folder and click **Open**, then click **Open** on the dialog.
- **If that doesn't work:** Go to **System Settings ➔ Privacy & Security**, scroll down to Security, and click **Open Anyway**.

---

## Chrome

### Problem: Google Chrome is not installed
- **What it means:** Naukri Update relies on Google Chrome to execute browser automation.
- **What to do:** Download and install Google Chrome from `https://www.google.com/chrome/`.
- **If that doesn't work:** Ensure Chrome is installed in the default system location (`/Applications/Google Chrome.app` on Mac, `C:\Program Files\Google\Chrome\Application\chrome.exe` on Windows).

### Problem: Chrome does not launch when clicking Connect Chrome
- **What it means:** Existing background Chrome processes are locking port `9222` or the profile directory.
- **What to do:** Close all Chrome windows or click **Reset Browser Profile** under **Settings ➔ Privacy & Data Management**.
- **If that doesn't work:** Restart your computer and try clicking **Connect Chrome** again.

### Problem: Connect Chrome fails or times out
- **What it means:** Playwright was unable to establish a CDP connection at `http://127.0.0.1:9222`.
- **What to do:** Check if a local firewall is blocking internal port 9222 connection.
- **If that doesn't work:** Click **Reset Browser Profile** in Settings and retry.

### Problem: Dashboard status displays "Disconnected"
- **What it means:** The dedicated Chrome browser was closed or crashed.
- **What to do:** Click **Connect Chrome** on the Dashboard to reopen the browser.
- **If that doesn't work:** Ensure your Naukri credentials are properly saved in Settings.

### Problem: Browser profile locked / `SingletonLock` error
- **What it means:** Chrome crashed previously and left a lock file in `.naukri-chrome-profile`.
- **What to do:** Go to **Settings ➔ Privacy & Data Management** and click **Reset Browser Profile**.
- **If that doesn't work:** Open your AppData folder and manually delete the `.naukri-chrome-profile` folder.

---

## Naukri

### Problem: Login failed / Invalid credentials
- **What it means:** Naukri rejected the email or password stored in your settings.
- **What to do:** Go to **Settings ➔ Credentials**, double-check your email and password, re-enter them, and click **Save Configuration**.
- **If that doesn't work:** Log into `naukri.com` in your regular browser to verify your password is correct.

### Problem: Naukri requires OTP verification
- **What it means:** Naukri flagged the login attempt for two-factor authentication.
- **What to do:** Look at the dedicated Chrome window, enter the OTP sent to your mobile phone/email, and submit.
- **If that doesn't work:** Click **Connect Chrome** again to trigger a fresh OTP request.

### Problem: Naukri requires CAPTCHA verification
- **What it means:** Naukri displayed a bot protection puzzle.
- **What to do:** Solve the CAPTCHA puzzle manually inside the dedicated Chrome browser window.
- **If that doesn't work:** Complete login manually in the Chrome window until your profile page (`/mnjuser/profile`) is loaded.

### Problem: Session expired during background run
- **What it means:** Naukri automatically logged out your browser session after inactivity.
- **What to do:** The app will attempt auto-login using your saved credentials on the next scheduled run.
- **If that doesn't work:** Click **Connect Chrome** on the Dashboard and log in manually.

---

## Resume

### Problem: PDF file is invalid or unreadable
- **What it means:** The selected resume file is corrupted, zero bytes, or does not start with `%PDF`.
- **What to do:** Open the PDF in a PDF viewer (like Adobe Acrobat or Chrome) to ensure it opens cleanly. Re-select it in Settings.
- **If that doesn't work:** Re-save or export your resume as a fresh PDF document from Word/Google Docs.

### Problem: Resume missing in settings
- **What it means:** No resume PDF file has been selected or the file in `resume/` was deleted.
- **What to do:** Go to **Settings ➔ Resume File Source** and click **Choose PDF** to select your resume.
- **If that doesn't work:** Ensure your resume PDF is less than 2MB.

### Problem: Resume upload stuck at progress percentage
- **What it means:** Network slowdown or Naukri's upload server timed out.
- **What to do:** Click **Upload Resume Now** on the Dashboard to retry the upload.
- **If that doesn me work:** Check your internet connection stability.

### Problem: Upload failed or post-verification failed
- **What it means:** Naukri failed to save the uploaded file or the updated filename did not match after page reload.
- **What to do:** Click **Connect Chrome**, ensure your Naukri profile editor page is accessible, and test manual upload.
- **If that doesn't work:** Check **Activity Logs** for detailed step error messages.

### Problem: Partial upload detected
- **What it means:** File upload was interrupted before reaching 100% completion.
- **What to do:** The app automatically aborts and marks the task as failed. Click **Upload Resume Now** to re-run.
- **If that doesn't work:** Verify your resume PDF file size is under 2MB.

### Problem: Duplicate resume error on Naukri
- **What it means:** Naukri detected an identical filename to your existing active resume.
- **What to do:** Naukri Update automatically appends today's date (`DD-MM-YYYY`) to solve this. If it fails, re-select your resume file in Settings.
- **If that doesn't work:** Delete old resumes directly on Naukri's web interface.

---

## Automation

### Problem: Background automation is disabled
- **What it means:** Toggles for Headline Refresh or Daily Resume Upload are turned OFF in Settings.
- **What to do:** Go to **Settings**, turn ON the automation toggles, configure your desired schedule, and click **Save Configuration**.
- **If that doesn't work:** Ensure **Register Background Task on Boot** is checked in wizard setup.

### Problem: Scheduled task does not run at expected time
- **What it means:** OS task scheduler hook was missing or system was sleeping when task was due.
- **What to do:** Open **Settings** and click **Save Configuration** to re-register native OS scheduler tasks.
- **If that doesn't work:** Verify that your active time window constraints in Settings cover the current time.

### Problem: Computer was off during scheduled execution
- **What it means:** Computer was powered off when task was scheduled.
- **What to do:** No action required. On the next 15-minute check after power-on, the app detects the missed run and executes immediately.
- **If that doesn't work:** Click **Refresh Headline Now** or **Upload Resume Now** on the Dashboard.

### Problem: Computer restarted and automation stopped
- **What it means:** Application auto-start on boot was disabled in operating system settings.
- **What to do:** Open Naukri Update once. The app automatically re-asserts `openAtLogin` settings.
- **If that doesn't work:** Add Naukri Update to your OS Startup Applications list manually.

---

# Logs & Diagnostics

- **Activity Logs View:** Open the **Activity Logs** tab inside the app to view step-by-step logs for **Profile Refresh Log** and **Hourly Scheduler Runner Log**.
- **Log Masking:** Passwords and credentials are scrubbed automatically (e.g. `NAUKRI_PASSWORD=••••••••`) before writing to log files.
- **Error Screenshots:** If an automation run fails, a diagnostic screenshot is saved automatically to `naukri-refresh-error.png` inside your AppData directory.

---

# Privacy & Security

- **100% Local Execution:** Everything runs locally on your machine.
- **No External Servers:** Your credentials, resume files, and activity logs are **never** uploaded to any developer or third-party server.
- **Scrubbed Logs:** Confidential information is excluded from all log outputs.
- **Isolated Browser Environment:** The app runs inside a dedicated Chrome profile (`.naukri-chrome-profile`), leaving your main browser data untouched.

---

# Where Is My Data Stored?

All configuration, resume copies, logs, and browser profiles are stored in your operating system's standard application data folder:

| Operating System | Path |
| :--- | :--- |
| **Windows** | `%APPDATA%\NaukriUpdate\` |
| **macOS** | `~/Library/Application Support/NaukriUpdate/` |
| **Linux** | `~/.config/NaukriUpdate/` |

### Contents:
- `.env` ➔ Configuration settings & credentials
- `resume/` ➔ Authoritative local copy of your resume PDF
- `.naukri-chrome-profile/` ➔ Isolated Chrome cookies & session
- `naukri-refresh.log` ➔ Execution activity log (rotated, max 5 runs kept)
- `.naukri-refresh-state.json` ➔ Last run execution timestamps

To open this directory, go to **Settings ➔ Privacy & Data Management** and click **Open Data Folder**.

---

# Reset & Delete Data

You can clear your stored data anytime from **Settings ➔ Privacy & Data Management**:

- **Clear Credentials:** Erases saved email and password from `.env`.
- **Remove Resume PDF:** Deletes stored resume files from the application directory.
- **Reset Browser Profile:** Deletes `.naukri-chrome-profile` to clear browser cookies and active sessions.
- **Reset Entire Application:** Completely wipes configuration files, credentials, resume files, logs, browser sessions, and unregisters OS background tasks.

---

# Uninstall

### Windows
Go to **Start Menu ➔ Settings ➔ Apps ➔ Installed Apps**, find **NaukriUpdate**, and click **Uninstall**.

### macOS
Open **Finder ➔ Applications**, drag **Naukri Update** to the **Trash**, and empty Trash.

### Linux (`.deb`)
Run in terminal: `sudo apt remove naukri-update` or uninstall via Software Center.

### Linux (`AppImage`)
Delete the `NaukriUpdate-1.0.0.AppImage` file.

*To completely remove all residual settings files after uninstalling, manually delete the `NaukriUpdate` application data folder listed in [Where Is My Data Stored?](#where-is-my-data-stored).*

---

# Developer Setup

> ⚠️ **Notice:** This section is intended for developers and code contributors. Normal users should download pre-built release installers from [Releases](https://github.com/anwarbuilds1/naukri_update/releases/latest).

### Prerequisites
- **Node.js:** v20.0.0 or higher
- **npm:** v9.0.0 or higher
- **Google Chrome:** Installed locally
- **Git:** Installed locally

### One-Command Setup
Clone the repository and run setup:
```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

### Developer Scripts

| Command | Description |
| :--- | :--- |
| `npm run setup` | One-command setup bootstrapper and launcher |
| `npm start` | Launch Electron application directly |
| `npm run refresh` | Run automation Playwright core script via CLI |
| `npm run pack` | Package app directory into unpacked build |
| `npm run dist` | Build production installer binaries (`.exe`, `.dmg`, `.AppImage`, `.deb`) |

---

# Architecture

```
naukri_update/
├── main.js                   # Electron main process (IPC handlers, tray, OS scheduler)
├── preload.js                # Secure ContextBridge IPC bridge (contextIsolation: true)
├── config-service.js         # Central config loader, validator, diagnostics & permissions
├── config.js                 # Automation wrapper for environment variables
├── naukri-profile-refresh.js # Playwright browser automation core engine
├── renderer/
│   ├── index.html            # Main GUI layout & First-Run setup wizard
│   ├── style.css             # UI design system & responsive styling
│   └── app.js                # Frontend state management & IPC event handlers
└── scripts/
    ├── setup.js              # One-command developer bootstrap script
    └── scheduler.js          # CLI helper for OS background scheduler tasks
```

---

# Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue on GitHub for bugs, feature requests, or UI improvements.

1. Fork the repository (`https://github.com/anwarbuilds1/naukri_update`).
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

# Disclaimer

Naukri Update is an independent open-source project. It is **not affiliated with, authorized by, maintained by, sponsored by, or endorsed by Naukri.com or Info Edge (India) Ltd.**

Users are solely responsible for complying with Naukri.com's Terms of Service. The developers assume no liability for account suspensions, profile modifications, or data loss resulting from the use of this software.

---

# License

Licensed under the [ISC License](LICENSE).
