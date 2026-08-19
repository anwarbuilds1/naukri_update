# Naukri Profile Refresh

An automated utility that keeps your Naukri profile active and visible to recruiters by periodically toggling a trailing dot on your resume headline. This script interacts with a dedicated, local Google Chrome instance via the Chrome DevTools Protocol (CDP). By reusing a persistent Chrome profile, it retains your authenticated session without needing manual logins or storing cookies in untrusted places, completely avoiding Google authentication issues.

## Features

- **Headline Toggle**: Automatically toggles the trailing period on your resume headline to mark the profile as updated.
- **Dedicated Browser Session**: Uses a separate, isolated Chrome profile to retain login sessions securely.
- **Chrome CDP Integration**: Reuses an open browser instance via the Chrome DevTools Protocol.
- **Server-Side Verification**: Verifies the update by reloading the page and checking the headline directly from Naukri's server before logging success.
- **Flexible Automation**: Supports scheduling with configurable intervals (e.g. every 1, 2, 3, 4, 6, 8, 12, or 24 hours).
- **Cross-Platform**: Fully compatible with Linux (bash + cron) and Windows (PowerShell + Task Scheduler).

## How It Works

```
User
  ↓ (start browser once & authenticate)
Dedicated Chrome (runs on 127.0.0.1:9222)
  ↓
Naukri session (stored in local profile directory)
  ↓
Playwright/CDP (script connects to running Chrome)
  ↓
Resume headline (toggles trailing period)
  ↓
Save & Reload
  ↓
Server verification (verifies headline changes successfully)
```

## Recommended File Structure

```
naukri_update/
│
├── naukri-profile-refresh.js
├── config.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
│
├── scripts/
│   ├── start-naukri-chrome.sh     # Linux browser launcher
│   ├── start-naukri-chrome.ps1    # Windows browser launcher
│   ├── naukri-refresh-runner.sh   # Main refresh execution runner
│   └── install-cron.sh            # Cron job installation wizard
│
└── .naukri-chrome-profile/        # Chrome session profile (local & gitignored)
```

## Requirements

### Linux

- **Node.js**: 18 or higher.
- **Google Chrome**: Stable version installed.
- **cron**: Standard task scheduler.
- **bash**: Default shell.

### Windows

- **Node.js**: 18 or higher.
- **Google Chrome**: Stable version installed.
- **Task Scheduler**: Standard administrative tool.
- **PowerShell**: 5.1 or Core.

## Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
npm install
```

## Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Open `.env` and fill in your Naukri credentials:

```dotenv
NAUKRI_PROFILE_URL=https://www.naukri.com/mnjuser/profile
NAUKRI_EMAIL=your-email@example.com
NAUKRI_PASSWORD=your-naukri-password

# Refresh Interval (in hours) for scheduling.
# Supported values: 1, 2, 3, 4, 6, 8, 12, 24
REFRESH_INTERVAL_HOURS=1
```

> [!IMPORTANT]
> The `.env` file is excluded from version control (listed in `.gitignore`). Never commit your `.env` file containing credentials to Git.
> On Linux, restrict access permissions for the `.env` file:
>
> ```bash
> chmod 600 .env
> ```

## First Login & Authentication

To store your login session in the dedicated Chrome profile:

1. Run the launcher from the repository root:
   - **Linux**: `./scripts/start-naukri-chrome.sh`
   - **Windows**: `.\scripts\start-naukri-chrome.ps1`
2. Google Chrome will launch and open the Naukri profile page.
3. If you are not authenticated, fill in your credentials and complete any verification (such as CAPTCHA or OTP).
4. Keep this Chrome window open. Future runs will reuse this session automatically.

## Run Manually

You can test the script manually. Ensure the dedicated Chrome instance is running:

```bash
# Performs the profile refresh directly
node naukri-profile-refresh.js
```

To run the full automated check manually (which automatically starts Chrome in the background if it is not already running):

- **Linux**: `./scripts/naukri-refresh-runner.sh`

## Scheduling Automation

### Linux (cron)

We provide an installer script `install-cron.sh` that reads the `REFRESH_INTERVAL_HOURS` variable from your `.env` file, validates it, and generates/updates the cron entry dynamically without creating duplicate tasks.

To configure and install the scheduling:

1. Open `.env` and configure `REFRESH_INTERVAL_HOURS` to one of the supported values:

   | `REFRESH_INTERVAL_HOURS` | Cron Interval              | Cron Syntax Generated |
   | :----------------------- | :------------------------- | :-------------------- |
   | **1**                    | Every hour                 | `0 * * * *`           |
   | **2**                    | Every 2 hours              | `0 */2 * * *`         |
   | **3**                    | Every 3 hours              | `0 */3 * * *`         |
   | **4**                    | Every 4 hours              | `0 */4 * * *`         |
   | **6**                    | Every 6 hours              | `0 */6 * * *`         |
   | **8**                    | Every 8 hours              | `0 */8 * * *`         |
   | **12**                   | Every 12 hours             | `0 */12 * * *`        |
   | **24**                   | Once per day (at midnight) | `0 0 * * *`           |

2. Run the cron installer from the repository root:
   ```bash
   ./scripts/install-cron.sh
   ```

- **Inspect active cron jobs**: `crontab -l`
- **Pause or edit jobs**: `crontab -e`
- **Remove the scheduling**:
  ```bash
  crontab -l | grep -v "naukri-refresh-runner.sh" | crontab -
  ```

### Windows (Task Scheduler)

To run the script automatically on Windows:

1. Open **Task Scheduler** and click **Create Basic Task**.
2. Set the Trigger to **Daily** and configure it to repeat at your preferred interval (e.g. 1 hour, 2 hours, etc.).
3. Set the Action to **Start a Program**.
4. In the **Program/script** field, type `powershell.exe`.
5. In the **Add arguments** field, specify the path to the startup/refresh flow:
   ```powershell
   -NoProfile -WindowStyle Hidden -Command "& { Set-Location 'C:\path\to\your\naukri_update'; .\scripts\start-naukri-chrome.ps1; Start-Sleep -Seconds 10; node naukri-profile-refresh.js }"
   ```
   _(Be sure to replace `C:\path\to\your\naukri_update` with your actual cloned repository path.)_

## Security & Isolation

- **Isolated Browser**: The dedicated Chrome profile is stored locally in `.naukri-chrome-profile/` and is fully gitignored. It does not access your everyday Chrome profile cookies or passwords.
- **Local Credentials**: All passwords and configurations remain in `.env` locally.
- **No Exfiltration**: No telemetry, external webhooks, or remote servers are contacted. All traffic is bound to localhost (`127.0.0.1:9222`).

## Troubleshooting

- **CDP unavailable**: Make sure Google Chrome is running and listening on `127.0.0.1:9222`. Run `curl http://127.0.0.1:9222/json/version` to check.
- **Chrome SingletonLock error**: If Chrome refuses to start and complains about a profile in use, close any running instances. If none are running, delete `.naukri-chrome-profile/SingletonLock` manually.
- **Naukri selector changes**: If Naukri modifies its profile layout, the selectors in `naukri-profile-refresh.js` might need updating. Check the generated `naukri-refresh-error.png` screenshot for diagnostics.
- **Cron path issues**: Cron runs with a limited environment. Ensure the absolute paths in the crontab match your Node.js binary location.

## Git Safety

Before committing changes, check that your local credentials and profile directories are properly ignored:

```bash
git status
git check-ignore -v .env .naukri-chrome-profile naukri-refresh.log naukri-hourly-refresh.log
```

## Disclaimer

This project is an independent automation tool and is not affiliated with, authorized, maintained, sponsored, or endorsed by Naukri.com or Info Edge. You are solely responsible for compliance with Naukri's Terms of Service.
