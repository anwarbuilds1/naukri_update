# I downloaded Naukri Update. What do I do now?

This guide will walk you through every step — from opening the file you downloaded,
all the way to the app running and keeping your Naukri profile active automatically.

You do **not** need to know anything about programming, terminals, or computers beyond
opening a folder and clicking buttons.

---

## Pick your situation:

- 👉 [I'm on **Linux** — I downloaded an AppImage](#linux-from-download-to-running-the-app)
- 👉 [I'm on **Windows** — I downloaded a .exe installer](#windows-from-download-to-running-the-app)
- 👉 [I'm on **macOS** — I downloaded a .dmg file](#macos-from-download-to-running-the-app)

---

# Linux: From Download to Running the App

You downloaded:

```
NaukriUpdate-1.0.0.AppImage
```

and it is sitting in your **Downloads** folder.

Here is what to do, step by step.

---

## Step 1 — Open your Downloads folder

1. Open your **file manager**.
   *(This is the app that lets you browse your files — like "Files", "Nautilus",
   "Dolphin", "Thunar", or "Nemo" depending on which Linux you have.)*

2. Click on the **Downloads** folder in the left sidebar.

3. Find the file called:

   ```
   NaukriUpdate-1.0.0.AppImage
   ```

> **What is an AppImage?**
>
> An AppImage is a type of Linux application that lives entirely inside a single file.
> You do **not** install it like a normal program — there is no installer to run.
> The file itself **is** the application. You just need to tell Linux it is allowed to run.

---

## Step 2 — Allow the application to run

By default, Linux does not let you run a newly downloaded file.
You need to give it permission first.

**Do this:**

1. **Right-click** on `NaukriUpdate-1.0.0.AppImage`.

2. Click **Properties** from the menu that appears.

3. A window opens. Look for a tab or section called **Permissions**.
   *(Click on it if it is a tab.)*

4. Inside Permissions, look for a checkbox or toggle that says something like:

   - `Allow executing file as program`
   - `Is executable`
   - `Execute: Allow executing file as program`
   - `Make executable`

   The exact wording depends on your Linux desktop. They all mean the same thing.

5. **Enable** that checkbox or toggle (tick it or switch it on).

6. Click **OK** or **Close** to close the Properties window.

> **Don't see a Permissions tab?**
>
> Different Linux desktops show this differently. If you can't find it:
> - In **Nautilus** (GNOME Files): look for the "Permissions" tab in Properties
> - In **Dolphin** (KDE): look for the "Permissions" tab in Properties
> - In **Thunar** (XFCE): look for "Permissions" in Properties
>
> If you truly cannot find the option, skip to
> [Step 4 — If double-click does nothing](#step-4--if-double-click-does-nothing)
> for an alternative method.

---

## Step 3 — Open Naukri Update

1. Go back to your Downloads folder in the file manager.

2. **Double-click** on `NaukriUpdate-1.0.0.AppImage`.

3. If Linux asks:

   > "Do you want to run this file, or display its contents?"

   Click the option that says **Run** or **Execute**.
   Do **not** click "Display contents" or "Open with text editor".

4. **Wait a few seconds.**

   The Naukri Update window will open.

   > If your screen flickers or goes quiet for a moment, that is normal.
   > The application is loading.

---

## Step 4 — If double-click does nothing

Some Linux systems do not open AppImages with a double-click,
even after you enable the permission. This is a known quirk and is **not** your fault.

Try these options in order:

---

### Option A — Check the permission again

1. Right-click the file → **Properties** → **Permissions**
2. Make sure the "Allow executing" option is actually **ticked/enabled**
3. Close and try double-clicking again

---

### Option B — Right-click and run it

1. Right-click on `NaukriUpdate-1.0.0.AppImage`
2. Look for an option like:
   - `Run`
   - `Execute`
   - `Open with → AppImageLauncher`
3. Click it

---

### Option C — Use the terminal

If Options A and B did not work, this will:

1. Open your **Terminal** application.
   *(You can usually find it by searching "Terminal" in your app menu.)*

2. Type this command and press Enter:

   ```bash
   chmod +x ~/Downloads/NaukriUpdate-1.0.0.AppImage
   ```

   This is the same as enabling the permission in Step 2 — it just does it a different way.

3. Then type this command and press Enter:

   ```bash
   ~/Downloads/NaukriUpdate-1.0.0.AppImage
   ```

   The app will open.

> **What does `chmod +x` mean?**
>
> It is short for "change mode, add execute permission".
> It tells Linux: "this file is allowed to run as an application."
> You only need to do this once.

---

# Windows: From Download to Running the App

You downloaded:

```
NaukriUpdate-Setup.exe
```

Here is what to do:

1. Open your **Downloads** folder.
   *(Press `Windows key + E` to open File Explorer, then click Downloads.)*

2. **Double-click** `NaukriUpdate-Setup.exe`.

3. Windows may show a blue warning that says:
   > "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."

   This appears because the application is not yet code-signed with Microsoft.
   **The application is safe to run.**

   Click **More info**, then click **Run anyway**.

4. Follow the on-screen installer steps (click Next, accept the license, click Install).

5. When the installer finishes, click **Finish** or **Launch Naukri Update**.

6. The Naukri Update window will open.

---

# macOS: From Download to Running the App

You downloaded:

```
NaukriUpdate.dmg
```

Here is what to do:

1. Open your **Downloads** folder.
   *(Click the Finder icon in your dock, then click Downloads.)*

2. **Double-click** `NaukriUpdate.dmg` to open it.

3. A window opens showing the Naukri Update icon and an Applications folder shortcut.

4. **Drag** the Naukri Update icon into the Applications folder.

5. Close the window. **Eject** the disk image (right-click it on your Desktop → Eject).

6. Open your **Applications** folder and double-click **Naukri Update**.

7. macOS may say:
   > "Naukri Update can't be opened because Apple cannot check it for malicious software."

   **The application is safe.** To open it:
   - Right-click the app icon → click **Open**
   - Click **Open** again in the dialog that appears

8. The Naukri Update window will open.

---

# First Time Setup — What happens next

When you open Naukri Update for the first time, a **setup wizard** will guide you through everything.

Here is what each step asks:

| Step | What you do |
|:-----|:------------|
| **1. Welcome** | Read the overview. Click **Get Started**. |
| **2. Naukri Profile URL** | Paste the URL of your Naukri profile page. It usually looks like: `https://www.naukri.com/mnjuser/profile` |
| **3. Your Credentials** | Enter your Naukri email address and password. *(See [Where is my password stored?](#where-is-my-password-stored) below.)* |
| **4. Connect Chrome** | Click **Connect**. A Chrome window opens. Log in to Naukri in that window. |
| **5. Your Resume** | Click **Choose PDF** and select your resume file from your computer. |
| **6. Resume Upload** | Choose whether to automatically re-upload your resume once a day, and pick a time. |
| **7. Headline Refresh** | Choose whether to automatically refresh your profile headline, and how often. |
| **8. Background Automation** | Choose whether you want updates to run even when the app window is not open. |
| **9. Check Setup** | Click **Run Diagnostic** to confirm everything is working. |
| **10. Done!** | You are taken to the main dashboard. |

If you close the app in the middle of setup, **it will remember where you were** and continue from that step next time you open it.

---

# What does Naukri Update actually do?

After setup, Naukri Update does two things automatically on your Naukri profile:

### 1. Headline Refresh

It updates your resume headline by toggling a tiny invisible dot at the end of the text.
This tells Naukri that your profile was "recently updated" — which can improve how often recruiters see you.

Your headline **looks the same** to anyone visiting your profile.

### 2. Resume Re-Upload

It re-uploads your resume PDF once a day with today's date in the filename.
This keeps your resume marked as freshly submitted.

**Example:**

Your file `anwar_cv.pdf` is uploaded to Naukri as `anwar_cv_29-08-2026.pdf`.
Tomorrow it becomes `anwar_cv_30-08-2026.pdf`. Your original file is never changed.

---

# Where is my password stored?

Your Naukri email and password are stored in a file **on your own computer only**.
They are never sent to any server other than Naukri.com — and only when you need to log in.

| Your operating system | Where the file is stored |
|:----------------------|:------------------------|
| Windows | `C:\Users\YourName\AppData\Roaming\NaukriUpdate\.env` |
| macOS | `/Users/YourName/Library/Application Support/NaukriUpdate/.env` |
| Linux | `/home/YourName/.config/NaukriUpdate/.env` |

> ⚠️ **Important:** The password is stored as plain text in that file.
> Anyone who has access to your computer account can read it.
> If you share your computer, be aware of this.

---

# Logging into Naukri — OTP and CAPTCHA

When you click **Connect** during setup, a Chrome window will open.

**If Naukri asks for an OTP (one-time password):**

1. Check your phone or email for the OTP code
2. Type it in the Chrome window that opened
3. The app will detect that you are logged in and move on automatically

**If Naukri shows a CAPTCHA:**

1. Solve the CAPTCHA in the Chrome window
2. The app will wait for you

The application **does not skip or bypass** OTPs or CAPTCHAs.
You need to complete them yourself in the Chrome window.

---

# The Chrome window — what is it?

When Naukri Update connects to your account, it opens a **separate Chrome window**
that is completely isolated from your personal Chrome browser.

- Your personal Chrome bookmarks, passwords, and history are **not visible** to this window
- This window is only used by Naukri Update
- You do not need to use or look at it after logging in — the app controls it automatically

---

# What happens when I close the app?

### If you click the ✕ (close) button:

The window hides. The application **keeps running** in the background —
you can see its icon near your clock (in the system tray).

To bring the window back: **click the tray icon** near the clock.

### If you want to fully quit:

Right-click the tray icon → **Quit Application**.

> Even after quitting, if you enabled **background automation**, your profile will
> still be refreshed on schedule without the window being open.

---

# What happens when my computer restarts?

If you enabled background automation during setup:
- The app will start automatically when you log back in
- It will continue refreshing your profile on schedule

You do not need to open the app manually after every restart.

---

# What happens when my computer is off?

Naukri Update only runs on **your computer**. There is no cloud service.

If your computer is off, automation is paused. When you turn it back on,
the app will catch up and run any missed updates on the next scheduled check.

---

# Troubleshooting

### The app opened but it says "Disconnected"

The Chrome session is not running or was closed. Fix it:
1. Open the Naukri Update window
2. Click **Reconnect Chrome**
3. Wait a few seconds for it to say "Connected"

---

### Chrome opened but the app says it can't connect

1. Close all Chrome windows (including any personal ones)
2. Wait 5 seconds
3. Click **Reconnect Chrome** again

---

### Naukri is asking me to log in again

Your session expired. This is normal. Click **Reconnect Chrome** — the app will log you back in
using the email and password you saved during setup. If Naukri sends an OTP, complete it in the Chrome window.

---

### The resume upload failed

1. Go to **Settings → Resume**
2. Click **Choose PDF** and select your resume file again
3. Try the upload again from the dashboard

Make sure the file you select is a real PDF and not corrupted.

---

### Background automation stopped working

1. Go to **Settings → Background Automation**
2. Toggle the switch **off**, then **on** again
3. Click **Save Settings**

---

### I get a "SingletonLock" error

This means Chrome crashed unexpectedly and left a lock file behind.
Naukri Update usually fixes this automatically. If the error keeps appearing:

1. Go to **Settings → Privacy & Data Management**
2. Click **Reset Browser Profile**
3. Then click **Reconnect Chrome** and log in again

---

# Changing settings later

After setup, you can change anything from inside the app:

| What you want to change | Where to find it |
|:------------------------|:-----------------|
| Your Naukri email or password | **Settings → Credentials** |
| Your resume file | **Settings → Resume** |
| When the headline is refreshed | **Settings → Headline Refresh** |
| When the resume is uploaded | **Settings → Resume Update** |
| Background automation | **Settings → Background Automation** |
| Clear credentials | **Settings → Privacy & Data Management → Clear Credentials** |
| Remove your resume from the app | **Settings → Privacy & Data Management → Remove Resume File** |
| Full reset (start over) | **Settings → Privacy & Data Management → Reset Application** |

---

# Uninstalling Naukri Update

### Windows

1. Open **Control Panel** → **Programs** → **Uninstall a program**
2. Find **NaukriUpdate** in the list
3. Click **Uninstall**

### macOS

1. Open the **Applications** folder
2. Drag **Naukri Update** to the Trash
3. Empty the Trash

### Linux (AppImage)

1. Delete the `NaukriUpdate-1.0.0.AppImage` file from your Downloads folder

### Linux (deb package)

Open a terminal and run:
```bash
sudo apt remove naukri-update
```

> **Note:** Uninstalling does not automatically delete your saved data
> (credentials, resume copy, Chrome session).
> To remove everything, go to **Settings → Privacy & Data Management → Reset Application**
> **before** uninstalling.

---

# Privacy — the short version

- All your data stays on **your computer only**
- Your password is only sent to **Naukri.com** — nowhere else
- Your resume is only uploaded to **Naukri.com** — nowhere else
- The app has **no analytics, no telemetry, no usage tracking**
- The Chrome session is **isolated** from your personal browser

---

# Disclaimer

Naukri Update is an **independent open-source project**.
It is not affiliated with, authorized by, or endorsed by Naukri.com or Info Edge (India) Ltd.

By using this application, you take responsibility for complying with Naukri's Terms of Service.
The authors are not liable for account suspension, data loss, or any other consequences.

---

# For developers

If you want to run from source code or contribute to the project, see the
[Developer Setup](#developer-setup) section below.

<details>
<summary>Developer Setup (click to expand)</summary>

### Requirements

| Requirement | Version |
|:------------|:--------|
| Node.js | ≥ 20 |
| npm | any recent (bundled with Node.js) |
| Google Chrome | stable |
| Git | any |

### One-command setup

```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

`npm run setup` will:
1. Check your Node.js version and Chrome installation
2. Run `npm install` if needed
3. Create required directories
4. Migrate any existing config
5. Launch the Electron app

### Developer commands

| Command | What it does |
|:--------|:-------------|
| `npm run setup` | First-time bootstrap + launch |
| `npm start` | Launch the app (after `npm install`) |
| `npm run refresh` | Run automation once from the CLI |
| `npm run pack` | Build unpacked app for local testing |
| `npm run dist` | Build production installer binaries |

### Publishing a release

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions will build Windows, macOS, and Linux installers automatically
and publish them to GitHub Releases.

### Architecture

```
naukri_update/
│
├── main.js                    # Electron main process
│    ├── IPC handlers          # Renderer ↔ main communication
│    ├── Tray                  # System tray icon and menu
│    ├── Chrome manager        # Launch, poll, connect Chrome via CDP
│    ├── OS scheduler setup    # Cron / LaunchAgent / Task Scheduler
│    └── Headless runner       # --run-automation entry point
│
├── preload.js                 # Context bridge (contextIsolation: true)
│
├── renderer/
│    ├── index.html            # UI and onboarding wizard
│    └── app.js                # UI logic, state, event handlers
│
├── config-service.js          # Config: load, save, validate, migrate, diagnostics
├── config.js                  # Thin wrapper: parsed values for automation
│
├── naukri-profile-refresh.js  # Playwright automation core
│    ├── Headline update        # Toggle trailing period, verify
│    └── Resume upload          # Find, validate, date-stamp, upload, verify
│
└── scripts/
     ├── setup.js              # Bootstrap script
     └── scheduler.js          # CLI: check due tasks, update state, rotate logs
```

### Contributing

1. Fork the repository
2. Clone your fork
3. Create a branch: `git checkout -b feature/your-feature`
4. Make your changes
5. Test against a real Naukri account or a mock page
6. Open a Pull Request against `main`

Please keep PRs focused. Do not add telemetry, analytics, or external network calls beyond `naukri.com`.

</details>

---

## License

ISC — see [LICENSE](LICENSE) for details.
