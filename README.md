# Naukri Update

> **Automate your Naukri profile updates — keep your profile active and visible to recruiters, entirely from your own computer.**

No servers. No cloud. No tracking. Runs entirely on your own machine.

---

## Getting Started

> **Pre-built installers are not yet available.** Use the one-command setup below — it handles everything automatically.
>
> _(Packaged installers for Windows, macOS, and Linux are planned for a future release.)_

### Step 1 — Prerequisites

You need two things installed before running the setup command:

| Requirement | Where to get it | Why it's needed |
|:---|:---|:---|
| **Node.js ≥ 18** | [nodejs.org](https://nodejs.org) — download the **LTS** version | Runs the desktop application |
| **Google Chrome** | [google.com/chrome](https://www.google.com/chrome/) | Used for browser automation |

> **Tip:** After installing Node.js, close and reopen your terminal before continuing.

### Step 2 — Run the One-Command Setup

Open a terminal, then run:

```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm run setup
```

The setup command automatically:

1. ✓ Detects your OS and environment
2. ✓ Checks Node.js version — shows a clear message if it's missing or outdated
3. ✓ Checks for Google Chrome
4. ✓ Installs all required dependencies
5. ✓ Creates required application directories
6. ✓ Migrates or initializes your configuration
7. ✓ **Launches the desktop application**

**You do not run `npm install` separately.** `npm run setup` handles everything.

### Step 3 — In-App Setup (No Terminal Needed After This)

Once the app opens, a guided wizard takes you through the rest:

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

**After completing the wizard:**
- The app lives in your **System Tray** (near the clock). No terminal needed.
- Right-click the tray icon to pause, reconnect, or open the dashboard.
- Background automation runs on a schedule, even after a reboot.

---

## Re-running Setup

`npm run setup` is safe to run multiple times:

- Already installed? **Dependencies are skipped.**
- Existing config found? **Preserved — never deleted.**
- Existing resume files? **Untouched.**
- Existing browser profile? **Reused.**

---

## Developer Commands

> ⚠️ This section is for developers and contributors only.

| Command | Description |
|:---|:---|
| `npm run setup` | **One-command setup + launch** (primary entry point) |
| `npm start` | Launch the app directly (requires prior `npm install`) |
| `npm run refresh` | Run the automation script once from the CLI |
| `npm run pack` | Package the app without creating an installer |
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
