# Naukri Update

> **Automate your Naukri profile updates — keep your profile active and visible to recruiters, entirely from your own computer.**

No technical knowledge required. No Node.js. No terminal. No configuration files.

---

## For Normal Users — Recommended

### Download the Desktop Application

Download the latest release for your operating system from the [Releases page](https://github.com/anwarbuilds1/naukri_update/releases/latest):

| OS | Download |
|:---|:---|
| **Windows** | `NaukriUpdate-Setup.exe` |
| **macOS** | `NaukriUpdate.dmg` |
| **Linux** | `NaukriUpdate.AppImage` or `.deb` |

### Install & Open

1. **Windows:** Run the `.exe` installer and follow the prompts.
2. **macOS:** Open the `.dmg`, drag the app to your Applications folder.
3. **Linux:** Make the `.AppImage` executable (`chmod +x`), or install the `.deb` with your package manager.

### In-App Setup (No Terminal Needed)

Once the app opens, an onboarding wizard walks you through everything:

```
Welcome
  ↓
Enter your Naukri email & password
  ↓
Connect Chrome (log in to Naukri once)
  ↓
Select your resume PDF
  ↓
Configure automation schedule
  ↓
Enable background automation
  ↓
Check setup — verify everything works
  ↓
Dashboard — you're done
```

**After that:**
- The app runs in your **System Tray** (near the clock) — no terminal needed.
- Right-click the tray icon to pause, reconnect, or open the dashboard.
- Background automation runs automatically, even after a reboot.

---

## Running From Source (Developers / Advanced Users)

> ⚠️ This section is **not** the primary user path. Normal users should use the installer above.

If you have the repository and want to run directly from source, use the **one-command setup**:

```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

That's it. The setup command will:

1. ✓ Detect your operating system and environment
2. ✓ Check for Node.js ≥ 18 and provide a clear message if missing
3. ✓ Check for Google Chrome and warn if not found
4. ✓ Install all required dependencies automatically
5. ✓ Create required application directories
6. ✓ Migrate or initialize configuration storage
7. ✓ Launch the desktop application
8. ✓ Open the in-app onboarding wizard

**You do not need to run `npm install` separately.** The setup command handles it.

### Setup Requirements (Source Only)

| Requirement | Notes |
|:---|:---|
| **Node.js ≥ 18** | Download from [nodejs.org](https://nodejs.org). The setup command will tell you if it's missing. |
| **Google Chrome** | Install from [google.com/chrome](https://www.google.com/chrome/). The app needs Chrome for browser automation. |
| **npm** | Comes bundled with Node.js. |

> If Node.js is missing, the setup command will not crash silently — it will show you exactly what to install and how.

### Re-running Setup

`npm run setup` is idempotent — safe to run multiple times:

- Already installed? **Dependencies are skipped.**
- Existing configuration found? **It is preserved — never deleted.**
- Existing resume files? **They are untouched.**
- Existing browser profile? **It is reused.**

### Other Developer Commands

| Command | Description |
|:---|:---|
| `npm run setup` | **One-command setup + launch** (recommended) |
| `npm start` | Launch the desktop app directly (requires prior `npm install`) |
| `npm run refresh` | Run the automation script once from CLI |
| `npm run pack` | Package app without installer (for testing) |
| `npm run dist` | Build production installer binaries |

For full developer documentation, see [DEVELOPER_ROADMAP.md](DEVELOPER_ROADMAP.md).

---

## Privacy & Security

| Question | Answer |
|:---|:---|
| Does this app have a backend server? | **No.** The app runs entirely on your computer. |
| Are credentials sent anywhere except Naukri.com? | **No.** Credentials are used only to authenticate on Naukri.com directly. |
| Where are credentials stored? | Locally in your system's app data directory, in a plain-text config file restricted to your user account. |
| Is there any telemetry or analytics? | **No.** None whatsoever. |
| What does the app communicate with? | Only `naukri.com` — and only to perform the profile updates you configured. |
| Can I delete my data? | Yes. From the app: **Settings → Privacy & Data Management**. |

---

## Features

- **Headline Toggle:** Automatically toggles a trailing period on your resume headline to trigger Naukri's "last updated" timestamp.
- **Daily Resume Upload:** Re-uploads your PDF resume once a day with a date-stamped filename (e.g. `Resume_29-08-2026.pdf`) to stay visible.
- **Dedicated Browser Session:** Uses an isolated Chrome profile — completely separate from your personal browser.
- **Headless Automation:** Runs invisibly in the background without opening a visible browser window.
- **Background Scheduling:** Uses native OS scheduling (cron / LaunchAgent / Task Scheduler) — configured automatically by the app.
- **System Tray Integration:** Lives quietly in the tray. Right-click for quick actions.
- **Active Time Window:** Optionally restrict automation to specific hours of the day.
- **Server Verification:** Verifies every update was applied successfully by reloading the page.
- **Automatic Log Rotation:** Keeps the last 5 run logs to prevent disk bloat.

---

## Troubleshooting

| Problem | Solution |
|:---|:---|
| App won't connect to Chrome | Click **Connect Chrome** on the Dashboard. If Chrome is already open, close it and try again. |
| Naukri asked for OTP / CAPTCHA | Complete it manually in the dedicated Chrome window — the app will wait and resume. |
| Background automation not running | Go to **Settings → Background Automation** and re-enable it. The app will re-register the OS task. |
| Resume upload failed | Ensure your resume file is a valid PDF under 2 MB. Re-select it from the Settings tab. |
| Existing `.env` from an old version | The app will detect and migrate it automatically. You can also import settings from the wizard. |

---

## Disclaimer

This project is an independent automation tool and is **not affiliated with, authorized by, maintained by, sponsored by, or endorsed by Naukri.com or Info Edge (India) Ltd.**

You are solely responsible for compliance with Naukri's Terms of Service.

---

## License

ISC License — see [LICENSE](LICENSE) for details.
