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

- **Node.js**: 20 or higher.
- **Google Chrome**: Stable version installed.
- **cron**: Standard task scheduler.
- **bash**: Default shell.

### Windows

- **Node.js**: 20 or higher.
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

Open `.env` and fill in your configuration:

```dotenv
NAUKRI_PROFILE_URL=https://www.naukri.com/mnjuser/profile
NAUKRI_EMAIL=your-email@example.com
NAUKRI_PASSWORD=your-naukri-password

# --- Headline Refresh Scheduling ---
# Mode can be "interval" or "fixed_time"
REFRESH_MODE=interval
REFRESH_INTERVAL_HOURS=1
REFRESH_INTERVAL_MINUTES=0
REFRESH_TIME=06:11

# --- Active Time Window (Optional) ---
# When enabled, the script will only execute refreshes inside this window
REFRESH_WINDOW_ENABLED=false
REFRESH_WINDOW_START=07:00
REFRESH_WINDOW_END=19:00

RESUME_UPDATE_ENABLED=false
RESUME_UPDATE_TIME=07:00
RESUME_FILE=resume/Anwar_Rizwan_Resume.pdf
```

### Detailed Configuration Reference

#### 1. Headline Refresh Scheduling
* **`REFRESH_MODE`**: The scheduling strategy for profile refreshes. 
  * `interval`: Refreshes the profile periodically at regular intervals.
  * `fixed_time`: Refreshes the profile exactly once per day at a specific time.
* **`REFRESH_INTERVAL_HOURS`**: (Used when `REFRESH_MODE=interval`) The hour component of the refresh frequency.
* **`REFRESH_INTERVAL_MINUTES`**: (Used when `REFRESH_MODE=interval`) The minute component of the refresh frequency.
  * *Example:* Setting hours to `1` and minutes to `30` will trigger a refresh every 1 hour and 30 minutes.
* **`REFRESH_TIME`**: (Used when `REFRESH_MODE=fixed_time`) The exact time of day (24-hour format, `HH:MM`, e.g., `06:11`) to execute the daily refresh.

#### 2. Active Time Window (Optional)
* **`REFRESH_WINDOW_ENABLED`**: If set to `true`, limits interval refreshes to occur only within the specified start and end times. If `false`, refreshes will happen 24/7.
* **`REFRESH_WINDOW_START`**: (Used when `REFRESH_WINDOW_ENABLED=true`) The start time of the active window (24-hour format, `HH:MM`, e.g., `07:00`).
* **`REFRESH_WINDOW_END`**: (Used when `REFRESH_WINDOW_ENABLED=true`) The end time of the active window (24-hour format, `HH:MM`, e.g., `19:00`). 
  * *Note:* Supports midnight-crossing windows (e.g., start at `22:00` and end at `06:00`).

#### 3. Resume PDF Updates (Optional)
* **`RESUME_UPDATE_ENABLED`**: Toggles daily resume updates. Set to `true` to enable daily uploads, or `false` to disable.
* **`RESUME_UPDATE_TIME`**: (Used when `RESUME_UPDATE_ENABLED=true`) The exact daily time (24-hour format, `HH:MM`, e.g., `07:00`) when the resume should be uploaded.
* **`RESUME_FILE`**: Path to your local resume PDF file (e.g., `resume/Ram_Resume.pdf`).
  * **Automatic Discovery**: If `RESUME_FILE` is empty or omitted, the automation automatically discovers the single resume PDF file inside the `resume/` directory.
  * **Single Resume Rule**: The `resume/` directory must contain exactly one source resume PDF file. If multiple PDFs are present and `RESUME_FILE` is not set explicitly, the script fails with a clear error to prevent ambiguity.
  * **Dynamic Filename Generation**: The upload filename is dynamically generated with today's date (e.g., `Ram_Resume_DD-MM-YYYY.pdf`). The system normalizes filenames, removes any existing trailing dates, sanitizes special characters/spaces, and ensures date idempotency without modifying your local source filename.
  * **Duplicate & Stale Cleanup**: Old dated uploads, duplicate generic files, or copy duplicates (e.g. matching your resume base name, `resume`, or `cv`) within the `resume/` directory are automatically cleaned up safely *only after* a successful upload and verification.




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

We provide an installer script `install-cron.sh` that validates the scheduling settings in your `.env` and configures a cron job that checks the schedule every minute. The runner script then dynamically decides whether a headline refresh or a resume upload is due based on the precise scheduling settings.

To configure and install the scheduling:

1. Open `.env` and configure the scheduling variables under the `# Scheduling Configuration` section.
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

## Optimization & Resource Safety

This automation is designed to run 24/7 without consuming unnecessary resources, leaking handles, or cluttering your system:

- **Lightweight Check Intervals**: Although the cron job triggers every minute, it performs a lightweight Node.js check (taking less than 100ms with virtually 0% CPU/RAM) and exits immediately if no task is due. Heavy browser processes are only launched when necessary.
- **Concurrency Protection**: The runner uses Linux's native `flock` utility. If a previous run is still active (e.g. during a network slowdown), subsequent minute-checks exit immediately, preventing process stacking.
- **Automatic Log Rotation**: To prevent disk bloat, both log files (`naukri-hourly-refresh.log` and `naukri-refresh.log`) are automatically rotated and trimmed to keep only the **last 5 runs**.
- **Process Detachment & Handle Safety**: When starting Chrome in the background, the runner closes inherited file descriptors (`9>&-`) to ensure clean execution and prevent leaked file locks.
- **Self-Healing Lock Cleanup**: The browser launcher automatically detects and cleans up stale `SingletonLock` files if Chrome was killed unexpectedly, avoiding startup lockups.

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
