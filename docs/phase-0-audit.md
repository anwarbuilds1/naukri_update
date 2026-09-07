# Phase 0 — Migration Audit

> **Naukri Update**: Electron + Playwright → Next.js PWA + Next.js API + Supabase + Node.js/Playwright Agent  
> **Status**: Analysis only. No code has been modified.  
> **Date**: 2026-09-07  
> **Codebase**: `/home/anwar/Workspace/personal/naukri_update` (v1.0.6)

---

## 1. Executive Summary

The current application is a single-repository **Electron desktop app** (v1.0.6) that automates two Naukri.com profile tasks:

1. **Headline refresh** — toggles a trailing `.` on the resume headline to force Naukri's "last active" timestamp to update.
2. **Resume upload** — uploads a dated PDF copy of the authoritative resume once per day.

The automation is implemented with **`playwright-core`** connecting to a local **Google Chrome** instance over Chrome DevTools Protocol (CDP) on `127.0.0.1:9222`. A persistent, dedicated Chrome profile (`~/.config/NaukriUpdate/.naukri-chrome-profile`) holds the authenticated Naukri session.

The app has two execution modes:

| Mode | Entry | Trigger |
|------|-------|---------|
| **GUI** | `electron main.js` | Manual launch or OS login item |
| **Headless** | `electron main.js --run-automation` | OS scheduler (cron / Task Scheduler / LaunchAgent) |

The app is fully local today. The proposed target architecture introduces a **web frontend** (Next.js PWA), a **cloud backend** (Supabase), and retains a thin **local agent** (Node.js + Playwright) as the only component that needs local filesystem and Chrome access.

**Key finding**: The automation core (`naukri-profile-refresh.js`, `scripts/scheduler.js`) is already largely decoupled from Electron and can be moved to `apps/agent` with minimal changes. The credential and configuration layers need careful splitting between Supabase (primary) and local agent (cache/fallback).

---

## 2. Current Architecture

### 2.1 File Map

```
naukri_update/
├── main.js                        # Electron main process (GUI + headless entry)
├── preload.js                     # Electron contextBridge (IPC bridge to renderer)
├── config.js                      # Thin compatibility shim — loads from ConfigService
├── config-service.js              # ConfigService singleton: load/save/validate/migrate
├── secure-store.js                # SecureStoreService: Electron safeStorage + AES-256-GCM fallback
├── naukri-profile-refresh.js      # Core automation: headline refresh + resume upload (Playwright)
├── auto-updater-service.js        # electron-updater + GitHub Releases API fallback
├── renderer/
│   ├── index.html                 # Single-page HTML shell
│   ├── app.js                     # Renderer JS (vanilla; ~1510 lines)
│   └── style.css                  # Custom CSS (~23 KB)
├── scripts/
│   ├── scheduler.js               # CLI: scheduling decisions, state R/W, log rotation
│   ├── setup.js                   # One-command setup bootstrapper (Node.js)
│   ├── naukri-refresh-runner.sh   # Bash: cron entry point (Linux/macOS)
│   ├── install-cron.sh            # Bash: installs cron job
│   ├── start-naukri-chrome.sh     # Bash: starts Chrome with CDP (Linux/macOS)
│   ├── start-naukri-chrome.ps1    # PowerShell: starts Chrome with CDP (Windows)
│   ├── test-persistence.js        # Manual integration test for ConfigService
│   └── test-resume-management.js  # Manual integration test for resume management
├── assets/                        # icon.png / icon.ico / icon.icns
├── .env.example                   # Configuration template
├── .env                           # Live config (AppData, not repo root — migrated)
├── .naukri-chrome-profile/        # Persistent Chrome user-data-dir (gitignored)
├── .naukri-refresh-state.json     # Runtime state: lastRefreshTime, lastResumeUploadTime
├── resume/
│   └── Anwar_Rizwan_Resume.pdf    # Authoritative resume (repo root copy; migrated to AppData)
├── package.json                   # electron@41, electron-builder@26, playwright-core@1.61
└── .github/workflows/release.yml  # CI: builds Win/Mac/Linux installers, publishes GitHub Release
```

### 2.2 Platform AppData Paths

| Platform | Config Directory |
|----------|-----------------|
| Linux | `~/.config/NaukriUpdate/` |
| macOS | `~/Library/Application Support/NaukriUpdate/` |
| Windows | `%APPDATA%\NaukriUpdate\` |

Files inside: `config.json`, `.env`, `.credentials.enc`, `.naukri-refresh-state.json`, `.naukri-automation.lock`, `naukri-refresh.log`, `naukri-hourly-refresh.log`, `naukri-app.log`, `chrome_startup.log`, `resume/`, `.naukri-chrome-profile/`.

### 2.3 Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^41 | Desktop shell, BrowserWindow, Tray, IPC |
| `electron-builder` | ^26 | Cross-platform packaging (NSIS, DMG, AppImage, deb) |
| `electron-updater` | ^6.8.9 | OTA update delivery |
| `playwright-core` | ^1.61.1 | CDP-based browser automation |
| Node.js built-ins | — | `fs`, `crypto`, `child_process`, `http`, `path` |

**No third-party HTTP client, no database driver, no ORM, no React/Vue/Angular** — renderer is vanilla JS.

---

## 3. Execution Flow

### 3.1 GUI Mode (`electron main.js`)

```
app.whenReady()
  │
  ├─ ConfigService.migrate(__dirname)     # Copy repo .env → AppData once
  ├─ ConfigService.load()                 # Load config.json → resolve SecureStore password
  ├─ configureOSSchedule(config)          # Register/update cron/Task Scheduler/LaunchAgent
  ├─ loadPausedState()                    # Read .naukri-refresh-state.json → isAutomationPaused
  ├─ createWindow()                       # BrowserWindow → renderer/index.html
  ├─ createTray()                         # System tray icon + context menu
  ├─ AutoUpdaterService.checkForUpdates() # 5 s delay; electron-updater or GitHub API
  ├─ setInterval(executeDueTasks, 60 s)   # In-app heartbeat scheduler
  ├─ app.setLoginItemSettings(openAtLogin:true, openAsHidden:true)
  ├─ startConnectionHealthCheck()         # setInterval(checkCDPAvailable, 2 s)
  └─ verifyInitialConnectionState()       # CDP probe → Playwright → check Naukri auth
```

**Every 60 s** (`executeDueTasks`):
```
checkTaskDue('--should-refresh')   # Forks scheduler.js, reads exit code
checkTaskDue('--should-upload-resume')
  │ if either due:
  └─ ensureChromeRunning()          # checkCDPAvailable → spawn Chrome if needed
       └─ runAutomationTask(flag)   # Forks naukri-profile-refresh.js as child process
```

### 3.2 Headless Mode (`electron main.js --run-automation`)

```
app.whenReady()
  │
  ├─ acquireAutomationLock()        # Write .naukri-automation.lock (PID + timestamp)
  ├─ checkTaskDue('--should-refresh') / ('--should-upload-resume')
  ├─ ensureChromeRunning()
  ├─ runAutomationTask(flag)        # Child process: naukri-profile-refresh.js
  └─ releaseAutomationLock() → app.quit()
```

### 3.3 Shell-Cron Path (Linux/macOS)

```
crontab: */1 * * * *  naukri-refresh-runner.sh
  │
  ├─ flock -n 9 .lock              # Single-instance guard
  ├─ scheduler.js --validate       # Config validation
  ├─ scheduler.js --should-refresh / --should-upload-resume
  ├─ start-naukri-chrome.sh        # If CDP not available → spawn Chrome
  └─ node naukri-profile-refresh.js --refresh-headline / --upload-resume
```

### 3.4 Automation Core (`naukri-profile-refresh.js`)

```
chromium.connectOverCDP('http://127.0.0.1:9222')
  │
  ├─ contexts()[0]                  # Reuse existing Chrome context
  ├─ page.goto(NAUKRI_PROFILE_URL)
  ├─ hasAuthenticatedProfile()      # Check #lazyResumeHead .edit.icon visibility
  │   └─ false → loginWithNaukriCredentials()
  │         ├─ page.goto(NATIVE_LOGIN_URL)
  │         ├─ fill email + password → click submit
  │         └─ waitForURL(/mnjuser/)  [OTP wait happens here — manual user action]
  │
  ├─ [--refresh-headline]
  │   └─ updateAndVerifyHeadline()
  │         ├─ Locate #lazyResumeHead .edit.icon
  │         ├─ Click → form[name="resumeHeadlineForm"] appears
  │         ├─ Read textarea#resumeHeadline → toggle trailing "."
  │         ├─ Fill → click Save → modal hidden + networkidle
  │         ├─ Reload page
  │         └─ Re-open editor → verify saved value matches expected
  │
  └─ [--upload-resume]
      └─ uploadAndVerifyResume()
            ├─ findAuthoritativeResume(resumeDir)   # Exactly 1 PDF rule
            ├─ validateFile()                        # PDF header check + stability
            ├─ sanitizeFilename()                    # Appends _DD-MM-YYYY.pdf
            ├─ Check if today's filename already on Naukri → skip if so
            ├─ copyFileSync(source → datedCopy)
            ├─ fileInput.setInputFiles(datedCopy)
            ├─ Wait for progress bar + success message + name match
            ├─ Reload + verify final filename
            └─ cleanupStaleResumes()
```

---

## 4. Code Classification

| Area | Current Implementation | Keep | Move | Rewrite | Remove | Notes |
|------|----------------------|------|------|---------|--------|-------|
| **Playwright/Naukri automation** | `naukri-profile-refresh.js` — `updateAndVerifyHeadline`, `uploadAndVerifyResume`, `loginWithNaukriCredentials`, `hasAuthenticatedProfile`, `validateFile`, `findAuthoritativeResume`, `sanitizeFilename`, `cleanupStaleResumes` | ✓ (agent) | → `apps/agent` | Minor | — | 18-step headline verification; solid retry-free design. Needs CDP endpoint and config to be injected rather than imported |
| **Chrome/CDP management** | `main.js`: `ensureChromeRunning`, `checkCDPAvailable`, `findChromeExecutable`, `disconnectChrome`; `scripts/start-naukri-chrome.sh`; `scripts/start-naukri-chrome.ps1` | ✓ (agent) | → `apps/agent` | Minimal | — | Pure Node.js + child_process; no Electron API used |
| **Authentication/session** | `main.js`: `startNaukriConnection`, `verifyInitialConnectionState`; `naukri-profile-refresh.js`: `loginWithNaukriCredentials` | ✓ (agent) | → `apps/agent` | Minimal | — | Session lives in Chrome profile; login only triggered when session expires |
| **OTP/CAPTCHA** | `main.js` L1115-1119: detects OTP field → shows `verifying` status; user completes manually in Chrome window | ✓ (agent) | → `apps/agent` | None | — | Manual-only by design; agent status reporting replaces Electron notification |
| **Resume file handling** | `naukri-profile-refresh.js`: `findAuthoritativeResume`, `validateFile`, `sanitizeFilename`, `cleanupStaleResumes`, `uploadAndVerifyResume` | ✓ (agent) | → `apps/agent` | Minimal | — | Local filesystem access; cannot move to web |
| **Credentials storage** | `secure-store.js`: `SecureStoreService` (Electron safeStorage primary, AES-256-GCM+machine-ID fallback); `config-service.js`: load/save with `[SECURE_STORE]` sentinel in `.env` | ✓ (agent) | Agent: AES fallback only | Partial | Electron safeStorage | Electron safeStorage removed; agent uses AES-GCM fallback; web uses Supabase Auth |
| **Configuration/state** | `config-service.js`: `ConfigService` (config.json + .env dual write, schema migration, validation); `scripts/scheduler.js`: reads state from `.naukri-refresh-state.json` | Split | Agent: local cache; Web: Supabase | Partial | — | Schedule config moves to Supabase; state (last run times) moves to Supabase |
| **Scheduling** | `main.js`: `configureOSSchedule` (cron/Task Scheduler/LaunchAgent), `executeDueTasks`, 60 s in-app timer; `scripts/scheduler.js`; `scripts/install-cron.sh`; `scripts/naukri-refresh-runner.sh` | Agent-side decision logic only | Agent polls Supabase instead | Rewrite | OS scheduler wiring | OS scheduler replaced by agent's own poll loop; web/Supabase drives schedule config |
| **Logging/diagnostics** | `naukri-profile-refresh.js`: `log()` → `naukri-refresh.log`; `main.js`: `logAppInfo()` → `naukri-app.log`; `scripts/scheduler.js`: `rotateLogs()`; `config-service.js`: `runDiagnostics()` | Agent: file logs | Agent → POST run results to Supabase | Rewrite | — | Structured run log in Supabase enables web log viewer |
| **Electron IPC** | `preload.js`: 18 channels via `contextBridge`; `main.js`: 18 `ipcMain.handle()` handlers | ✗ | → HTTP API (Next.js) | Rewrite | All Electron IPC | Every IPC call maps to an API route |
| **System tray** | `main.js`: `createTray`, `updateTrayMenu`, `updateTrayTooltip` | ✗ | — | — | Remove | No tray in PWA; notifications via web push or agent desktop notification |
| **Auto-update** | `auto-updater-service.js`: `electron-updater` + GitHub Releases API fallback | ✗ | — | — | Remove | Agent updates via package manager / Docker image; PWA auto-updates via Next.js |
| **UI** | `renderer/index.html` (72 KB), `renderer/app.js` (59 KB vanilla JS), `renderer/style.css` (23 KB) | ✗ | → `apps/web` | Rewrite (Next.js + React) | — | All tabs: Dashboard, Settings, Resume, Logs, Guide, Data & Privacy |
| **OS integration** | `main.js`: `app.setLoginItemSettings`; `configureOSSchedule` (cron/LaunchAgent/Task Scheduler); `scripts/start-naukri-chrome.sh/.ps1` | Agent: Chrome start | Agent self-daemonizes | Partial | Login item, LaunchAgent, Task Scheduler | Agent runs as a persistent background process or OS service |
| **CLI/scripts** | `scripts/setup.js`, `scripts/install-cron.sh`, `scripts/naukri-refresh-runner.sh` | `setup.js` logic | → `apps/agent` installer | Rewrite | Shell-cron runner | Agent has its own installer; `setup.js` phases 1-4 merge into agent setup |
| **Tests** | `scripts/test-persistence.js`, `scripts/test-resume-management.js` | ✓ | → `apps/agent` | Minimal | — | No test framework; plain Node.js assertion scripts |

---

## 5. Automation Audit

### 5.1 Naukri Login / Session

**Implementation**: `naukri-profile-refresh.js` L283-320 (`loginWithNaukriCredentials`); `main.js` L1043-1150 (`startNaukriConnection`).

**Flow**:
1. CDP connect to existing Chrome on `:9222`.
2. Navigate to `https://www.naukri.com/mnjuser/profile`.
3. Check `#lazyResumeHead span.edit.icon` visibility (authenticated if found).
4. If not authenticated: navigate to `https://www.naukri.com/nlogin/login?URL=<profile>`.
5. Fill email + password → click submit.
6. `waitForURL(/mnjuser/)` with 60 s timeout.
7. Re-check `hasAuthenticatedProfile`.

**OTP/CAPTCHA**: If URL contains `/otp`, `/verify`, `/challenge`, or `/verification`, or if `input[name="otp"]` is visible, the system enters `verifying` state and waits (up to 120 s in GUI mode). **Manual user action is required.** There is no automated OTP handling.

**Session persistence**: Stored in Chrome user-data-dir (`.naukri-chrome-profile`). Session typically persists for weeks without re-login.

**Classification**: **Reusable** — no Electron APIs used in the automation itself.

---

### 5.2 OTP / CAPTCHA Handling

**Implementation**: `main.js` L1115-1119 (GUI state update); `naukri-profile-refresh.js` does not separately handle OTP — it falls through to `loginWithNaukriCredentials` which blocks on `waitForURL`.

**Current behavior**:
- GUI mode: Shows "Verifying OTP/CAPTCHA..." status in tray and dashboard. Waits up to 120 s for user to complete manually.
- Headless/cron mode: No interactive prompt. If OTP is required, `loginWithNaukriCredentials` throws after 60 s timeout. The run fails; the next cron execution retries.

**Classification**: **Needs refactor** — agent mode needs a way to signal to the web UI that human intervention is needed (status push to Supabase Realtime).

---

### 5.3 Chrome Profile Lifecycle

| Action | Code Location | Details |
|--------|--------------|---------|
| Start Chrome | `main.js`: `ensureChromeRunning()` | `spawn(chromePath, ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1', '--user-data-dir=<configDir>/.naukri-chrome-profile', ...])`, `detached: true` |
| Detect Chrome | `checkCDPAvailable()` | HTTP GET `http://127.0.0.1:9222/json/version`, 1.5 s timeout |
| Clean stale lock | `ensureChromeRunning()` | `fs.unlinkSync(profileDir + '/SingletonLock')` |
| CDP connect | `naukri-profile-refresh.js` | `chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 })` |
| Disconnect | `main.js`: `disconnectChrome()` | Playwright `browser.close()` + SIGKILL on `chromeProcess.pid`; fallback: `pkill -f remote-debugging-port=9222` |
| Health check | `main.js`: `startConnectionHealthCheck()` | `setInterval(checkCDPAvailable, 2000)` |

**Shell script path**: `scripts/start-naukri-chrome.sh` — checks SingletonLock, removes stale lock, `exec chrome ...`.

**Classification**: **Reusable** (Chrome start/detect logic); **Needs refactor** (health check is Electron in-app only, needs agent equivalent).

---

### 5.4 Resume Selection / Validation / Upload

| Step | Code | Notes |
|------|------|-------|
| File selection | `main.js` L777-825: `ipcMain.handle('select-resume')` | Electron `dialog.showOpenDialog`; validates via `validateFile()`; copies to `<configDir>/resume/`; updates `RESUME_FILE` |
| Validation | `naukri-profile-refresh.js` L383-420: `validateFile()` | Checks existence, `.pdf` extension, size > 0, size stability (500 ms), `%PDF` magic bytes |
| Single-file rule | `config-service.js`: `checkResumeHealth()` uses first PDF in `resume/`; `main.js` clears directory before copy | Exactly one authoritative PDF in `resume/` directory |
| Discovery | `naukri-profile-refresh.js` L322-381: `findAuthoritativeResume()` | RESUME_FILE env → absolute path → directory scan fallback; path-traversal guard |
| Filename sanitization | `sanitizeFilename()` L422-446 | Strips existing date suffix, removes non-alphanum chars, appends `_DD-MM-YYYY.pdf` |
| Skip if current | `uploadAndVerifyResume()` L513-521 | Checks `#lazyAttachCV .resume-name-inline` against `datedFilename`; skips if already today's |
| Upload | `fileInput.setInputFiles(datedFilePath)` | Playwright native file input; no JS injection |
| Progress tracking | L546-616 | Polls progress bar `width%` style + success message + name match; configurable timeout (default 120 s) |
| Post-upload verify | L638-650 | Reload + check `.resume-name-inline` equals `datedFilename` |
| Cleanup | `cleanupStaleResumes()` L462-492 | Deletes old dated copies by base-name matching |

**Classification**: **Reusable** — pure Node.js + Playwright; no Electron API. File dialog (selection) needs to move to web (upload endpoint).

---

### 5.5 Headline Refresh

**Steps** (18-step verified flow in `updateAndVerifyHeadline()`):
1. Navigate to profile URL.
2. Assert `isAuthenticatedProfile`.
3. Locate `#lazyResumeHead span.edit.icon`.
4. Click edit (with force fallback).
5. Confirm `form[name="resumeHeadlineForm"]` visible.
6. Find `textarea#resumeHeadline` or placeholder.
7. Read current value.
8. Toggle trailing `.` to compute expected.
9. Fill expected value.
10. Verify fill actually changed field.
11. Click Save button (role `button` name `/^save$/i`).
12. Wait for modal hidden + networkidle.
13. Reload page.
14. Re-open editor.
15. Read saved value.
16. Close modal.
17. Compare saved vs expected.
18. Log result.

**Error path**: If fill verification fails (step 10-11), captures screenshot to `naukri-refresh-error.png` and runs `printHeadlineEditorDiagnostics()`.

**Classification**: **Reusable** — pure Playwright; no Electron API.

---

### 5.6 Post-Action Verification

- **Headline**: Re-opens editor after reload, reads textarea value, compares to expected. Hard failure if mismatch.
- **Resume**: Reloads after upload, checks `.resume-name-inline` text equals `datedFilename`. Hard failure if mismatch.
- **Screenshots**: `naukri-refresh-error.png` written to `configDir` on automation failure (if not on login page).

**Classification**: **Reusable**.

---

### 5.7 Failure / Retry Behavior

- No internal retry loop in `naukri-profile-refresh.js`. One attempt per run.
- If run fails, `process.exitCode = 1`. Parent (cron/headless Electron) reports failure.
- Next cron tick (every minute or configured interval) retries naturally.
- Automation lock (`acquireAutomationLock`) prevents concurrent runs: 30-minute stale timeout.
- In-app `executeDueTasks` (60 s interval) retries on next tick automatically.
- No exponential backoff; no max-retry tracking.

**Classification**: **Needs refactor** — structured retry/backoff + Supabase run-result storage needed.

---

### 5.8 Screenshots / Logging

| Log | Path | Rotation |
|-----|------|----------|
| `naukri-refresh.log` | `<configDir>/naukri-refresh.log` | Keeps last 5 runs (split on `=== RUN START ===`) |
| `naukri-hourly-refresh.log` | `<configDir>/naukri-hourly-refresh.log` | Same rotation |
| `naukri-app.log` | `<configDir>/naukri-app.log` | No rotation; `appendFileSync` |
| Error screenshot | `<configDir>/naukri-refresh-error.png` | Overwritten per failure |

**Classification**: **Needs refactor** — agent keeps local file logs; structured results (timestamp, task, success/failure, message) stored in Supabase for web log viewer.

---

## 6. Persistence & Security Audit

### 6.1 Credentials

| What | Where | How |
|------|-------|-----|
| `NAUKRI_EMAIL` | `<configDir>/config.json` (plaintext) | JSON field |
| `NAUKRI_PASSWORD` | `<configDir>/.credentials.enc` | Electron `safeStorage.encryptString` (libsecret/Keychain/DPAPI) primary; AES-256-GCM with machine-derived key (PBKDF2 100k iterations, salt `naukri_secure_salt_v1`) fallback |
| Password in `.env` | `<configDir>/.env` | Sentinel value `NAUKRI_PASSWORD=[SECURE_STORE]` — never plain text |
| Machine ID for fallback key | `/etc/machine-id` (Linux) / `ioreg IOPlatformUUID` (macOS) / `wmic csproduct` (Windows) | Used as PBKDF2 input |

**Security observations** (not fixes):
- Password is never stored in plaintext in `config.json` or `.env`. The `[SECURE_STORE]` sentinel is correctly used.
- The AES-256-GCM fallback key is derived from `/etc/machine-id` — machine-bound but not user-bound. On Linux, `/etc/machine-id` is readable by all users on the system.
- The salt `naukri_secure_salt_v1` is a fixed constant — not random. This reduces the entropy of the key derivation slightly.
- `config.json` is `chmod 0600` on Unix; `.env` and `.credentials.enc` are also `chmod 0600`.
- **Contradiction**: `config.js` L55 reads `process.env['RESUME_FILE']` directly, bypassing SecureStore. This is for a non-sensitive field (resume path), so not a security issue.
- **Contradiction**: `install-cron.sh` L6 checks for `.env` at the repo root (`$repo_dir/.env`), not at the AppData path. This is a legacy path that `ConfigService.migrate()` handles on first launch, but `install-cron.sh` doesn't call the migration. This means `install-cron.sh` fails if only `config.json` exists (post-migration).

### 6.2 Browser Sessions

| What | Where |
|------|-------|
| Chrome user-data-dir | `<configDir>/.naukri-chrome-profile/` |
| Naukri session cookies | Inside Chrome profile (IndexedDB / cookies) |
| CDP endpoint | `http://127.0.0.1:9222` (localhost only; `--remote-debugging-address=127.0.0.1`) |

**Security observation**: CDP is bound to `127.0.0.1`, not `0.0.0.0`. Session is not network-accessible. No auth on CDP endpoint (Chrome by design). Any local process can connect if it knows the port.

### 6.3 Resume Files

| What | Where |
|------|-------|
| Authoritative PDF | `<configDir>/resume/<filename>.pdf` |
| Temporary dated copy | `<configDir>/resume/<filename>_DD-MM-YYYY.pdf` (created at upload time, deleted after successful upload; kept on failure for debugging) |
| Repo-root copy | `resume/Anwar_Rizwan_Resume.pdf` (not gitignored — **present in repo**) |

**Security observation**: `resume/Anwar_Rizwan_Resume.pdf` is committed to the repository. This is a real user's resume and should be gitignored or removed.

### 6.4 Configuration and State

| File | Purpose | Format |
|------|---------|--------|
| `config.json` | Primary config source of truth | JSON (schema version 1) |
| `.env` | CLI compatibility layer + legacy fallback | KEY=VALUE |
| `.naukri-refresh-state.json` | Scheduler state | `{ lastRefreshTime, lastResumeUploadTime, paused }` |
| `.naukri-automation.lock` | Concurrent run guard | `{ pid, timestamp }` |
| `.naukri-hourly-refresh.lock` | Shell-cron flock target | Touched by `flock` |

**Observation**: State is written directly with `fs.writeFileSync` (not atomic) in `scheduler.js` L115. `config-service.js` uses an atomic write pattern (tmp → rename) for `config.json` and `.env`, but `scheduler.js` does not.

### 6.5 Local vs Remote Data

Currently **100% local**. All credentials, config, state, logs, and resume files live on the local machine. No data leaves the machine except:
- Playwright navigating `naukri.com` (automation traffic)
- `electron-updater` / GitHub API (version check)

---

## 7. Scheduling Audit

### 7.1 How Scheduling Works

The scheduling logic is split across two layers:

**Layer 1 — OS-level trigger** (runs the app every N minutes):

| Platform | Mechanism | Frequency | Implementation |
|----------|-----------|-----------|---------------|
| Linux | `crontab` | Every 15 minutes (`*/15 * * * *`) | `configureOSSchedule()` in `main.js` L150-173; OR every 1 minute (`* * * * *`) via `install-cron.sh` → `naukri-refresh-runner.sh` |
| macOS | `LaunchAgent` (`com.naukri.update.plist`) | Every 900 s (15 min) | `main.js` L115-148 |
| Windows | Task Scheduler (`NaukriUpdateTask`) | Every 15 minutes | `main.js` L101-114: `schtasks /create /sc minute /mo 15` |

**Layer 2 — Application-level scheduling decision** (checks if task is actually due):

- `scripts/scheduler.js` implements `checkRefreshDue()` and `checkResumeDue()`.
- Exit code `0` = task due; exit code `1` = not due.
- Called from: `main.js` `checkTaskDue()` (forks `scheduler.js`), `naukri-refresh-runner.sh` (direct node call).

**Configuration options**:
| Setting | Values | Default |
|---------|--------|---------|
| `REFRESH_MODE` | `interval` or `fixed_time` | `interval` |
| `REFRESH_INTERVAL_HOURS` | integer ≥ 0 | `1` |
| `REFRESH_INTERVAL_MINUTES` | integer ≥ 0 | `0` |
| `REFRESH_TIME` | `HH:MM` | `06:11` |
| `REFRESH_WINDOW_ENABLED` | `true`/`false` | `false` |
| `REFRESH_WINDOW_START` / `REFRESH_WINDOW_END` | `HH:MM` | `07:00` / `19:00` |
| `RESUME_UPDATE_ENABLED` | `true`/`false` | `false` |
| `RESUME_UPDATE_TIME` | `HH:MM` | `07:00` |

**Note**: The cron and LaunchAgent intervals (15 min) are hard-coded in `main.js`. The actual task cadence is controlled by `scheduler.js` reading `REFRESH_INTERVAL_*`. There is a disconnect: if the user sets a 5-minute interval, cron still only fires every 15 minutes.

### 7.2 Dual-Path Inconsistency

There are **two separate scheduling paths** that can coexist:

1. **Electron headless path** (`main.js --run-automation` via OS scheduler): Calls `scheduler.js`, then forks `naukri-profile-refresh.js` as a child process, with Electron as the runtime. Uses `app.whenReady()` which loads all Electron modules.

2. **Shell runner path** (`scripts/naukri-refresh-runner.sh` via cron): Calls `scheduler.js` and `naukri-profile-refresh.js` directly with plain `node`, no Electron dependency. Installed by `install-cron.sh`.

Both paths can be active simultaneously if the user installs the desktop app (which sets up path 1) and also runs `install-cron.sh` (which sets up path 2). The `isNaukriCronLine()` filter in `main.js` tries to clean up all Naukri cron entries idempotently on each save, but `naukri-refresh-runner.sh` references differ from the Electron app path.

### 7.3 Scheduler-Related Files

| File | Electron-dependent | Notes |
|------|-------------------|-------|
| `main.js` `configureOSSchedule()` | Yes | Fully Electron-dependent (uses `app.getPath('exe')`) |
| `main.js` `checkTaskDue()`, `updateLastRunTime()` | Yes | Forks `scheduler.js` using `process.execPath` with `ELECTRON_RUN_AS_NODE=1` |
| `main.js` `executeDueTasks()` | Yes | In-app 60 s timer |
| `scripts/scheduler.js` | **No** | Pure Node.js; no Electron import |
| `scripts/naukri-refresh-runner.sh` | **No** | Pure bash + node |
| `scripts/install-cron.sh` | **No** | Pure bash |

---

## 8. Target Architecture Boundaries

### 8.1 Proposed Responsibilities

```
apps/
├── web/                        Next.js PWA
│   ├── Dashboard               Connection status, automation status, manual triggers
│   ├── Settings                Credentials, scheduling config, resume management
│   ├── Logs                    Run history (from Supabase)
│   ├── Guide                   Documentation tab
│   └── API routes              /api/agent/* (command endpoints polled by agent)
│
└── agent/                      Node.js process (local machine)
    ├── main.js                 Agent entry: poll loop, lock, task dispatch
    ├── chrome.js               Chrome lifecycle: find, start, CDP check, kill
    ├── automation.js           ← naukri-profile-refresh.js (extracted, injectable config)
    ├── scheduler.js            ← scripts/scheduler.js (adapted: poll Supabase for config)
    ├── config.js               Local config cache (AES-GCM only; no Electron safeStorage)
    ├── reporter.js             POST run results to Supabase; local log fallback
    └── setup.js                ← scripts/setup.js (adapted for agent-only install)

packages/
├── shared/
│   ├── types.ts                Shared TypeScript types (RunResult, ScheduleConfig, AgentStatus)
│   ├── validation.ts           ← config-service.js validate() logic
│   └── sanitize.ts             ← sanitizeFilename, isStaleDuplicate logic
│
└── database/
    ├── schema.sql              Supabase PostgreSQL schema
    ├── client.ts               Supabase client wrapper
    └── migrations/             SQL migration files

Supabase/
    ├── auth                    Email/password auth for web UI
    ├── PostgreSQL tables:
    │   ├── agent_config        schedule settings, NAUKRI_EMAIL (no password in DB)
    │   ├── run_log             per-run results (task, success, message, timestamp)
    │   └── agent_status        current agent status (online, last_seen, chrome_connected)
    └── Realtime (optional)     Agent status updates → web dashboard
```

### 8.2 Boundary Challenges Found in Code

1. **Password cannot go to Supabase**: `NAUKRI_PASSWORD` must stay local (agent) — it is used only by Playwright during login. Even encrypted storage in Supabase would expose it to the backend. **Agent holds password; web UI sets it via encrypted agent API.**

2. **Resume file cannot go to Supabase Storage directly**: The upload mechanism uses `fileInput.setInputFiles(localPath)` in Playwright. The file must be physically present on the machine running Chrome. **Agent manages resume file; web provides upload endpoint that streams to agent.**

3. **Chrome session cannot be cloud-managed**: The Chrome user-data-dir contains Naukri cookies/session. It must live on the same machine as the agent. Resetting it from the web UI requires an agent-mediated action.

4. **OTP is inherently interactive**: The web UI should show an OTP-required alert (via Supabase Realtime push from agent) so the user knows to open Chrome and complete the challenge. The agent waits and polls. No code change to the OTP wait logic is needed.

5. **Scheduling state** (`lastRefreshTime`, `lastResumeUploadTime`) should move to Supabase `run_log` (last successful run per task). The agent reads from there. Local `.naukri-refresh-state.json` is the offline fallback.

---

## 9. Migration Map

```
CURRENT: Electron Monolith
├── main.js (1237 lines)
│   ├── GUI entry + BrowserWindow            → apps/web (remove)
│   ├── Tray + notifications                 → remove (web push notifications)
│   ├── configureOSSchedule()                → agent: self-managed process/service
│   ├── ensureChromeRunning()                → apps/agent/chrome.js
│   ├── checkCDPAvailable()                  → apps/agent/chrome.js
│   ├── findChromeExecutable()               → apps/agent/chrome.js
│   ├── checkTaskDue() / executeDueTasks()   → apps/agent/scheduler.js
│   ├── runAutomationTask()                  → apps/agent/main.js (dispatch)
│   ├── acquireAutomationLock()              → apps/agent/main.js
│   ├── startNaukriConnection()              → apps/agent/automation.js
│   ├── disconnectChrome()                   → apps/agent/chrome.js
│   ├── All ipcMain.handle() handlers        → apps/web/app/api/routes/
│   └── App lifecycle (tray, window, quit)   → remove
│
├── preload.js                               → remove (Electron IPC bridge)
├── config.js                                → apps/agent/config.js (thin shim)
├── config-service.js                        → Split:
│   ├── getAppConfigDir() / paths            → apps/agent/config.js
│   ├── load() / save() / validate()         → apps/agent/config.js + packages/shared/validation.ts
│   ├── migrate()                            → apps/agent/setup.js (one-time)
│   ├── checkResumeHealth()                  → apps/agent/config.js
│   ├── runDiagnostics()                     → apps/agent/main.js (agent health report)
│   └── isOSTaskConfigured()                 → remove (agent manages its own lifecycle)
│
├── secure-store.js                          → apps/agent/secure-store.js
│   ├── Electron safeStorage path            → remove
│   └── AES-256-GCM machine-key path        → keep (agent-only credential store)
│
├── naukri-profile-refresh.js               → apps/agent/automation.js
│   ├── updateAndVerifyHeadline()            → keep (no changes needed)
│   ├── uploadAndVerifyResume()              → keep
│   ├── loginWithNaukriCredentials()         → keep
│   ├── hasAuthenticatedProfile()            → keep
│   ├── findAuthoritativeResume()            → keep
│   ├── validateFile()                       → packages/shared/validation.ts
│   ├── sanitizeFilename()                   → packages/shared/sanitize.ts
│   ├── cleanupStaleResumes()                → keep
│   └── isAuthenticatedProfile()             → keep
│
├── auto-updater-service.js                  → remove (Electron-specific)
│
├── renderer/
│   ├── index.html                           → remove
│   ├── app.js (1510 lines vanilla JS)       → apps/web (React components):
│   │   ├── Dashboard tab                    → app/(dashboard)/page.tsx
│   │   ├── Settings tab                     → app/settings/page.tsx
│   │   ├── Resume tab                       → app/resume/page.tsx
│   │   ├── Logs tab                         → app/logs/page.tsx
│   │   ├── Guide tab                        → app/guide/page.tsx
│   │   └── First-run wizard                 → app/onboarding/page.tsx
│   └── style.css                            → apps/web (Tailwind / CSS modules)
│
└── scripts/
    ├── scheduler.js                         → apps/agent/scheduler.js (adapted)
    ├── setup.js                             → apps/agent/install/setup.js
    ├── naukri-refresh-runner.sh             → remove (agent is a persistent process)
    ├── install-cron.sh                      → remove (agent manages its own lifecycle)
    ├── start-naukri-chrome.sh               → apps/agent/chrome.sh (optional helper)
    ├── start-naukri-chrome.ps1              → apps/agent/chrome.ps1 (optional helper)
    ├── test-persistence.js                  → apps/agent/__tests__/config.test.js
    └── test-resume-management.js            → apps/agent/__tests__/resume.test.js

TARGET:
Next.js PWA (apps/web)
├── app/
│   ├── (dashboard)/page.tsx                 ← Electron dashboard tab
│   ├── settings/page.tsx                    ← Electron settings tab
│   ├── resume/page.tsx                      ← Electron resume tab
│   ├── logs/page.tsx                        ← Electron logs tab (reads Supabase run_log)
│   └── onboarding/page.tsx                  ← First-run wizard
├── app/api/
│   ├── agent/status/route.ts                Agent heartbeat endpoint
│   ├── agent/command/route.ts               Queue commands for agent (trigger-refresh, etc.)
│   └── agent/resume/upload/route.ts         Accept PDF upload, stream to agent
└── lib/
    ├── supabase.ts                           Supabase client
    └── agent-client.ts                       Agent HTTP client (localhost poll)

Node Agent (apps/agent)
├── main.ts                                  Poll loop + lock + dispatch
├── chrome.ts                                Chrome find/start/check/kill
├── automation.ts                            ← naukri-profile-refresh.js
├── scheduler.ts                             ← scheduler.js (reads Supabase config)
├── config.ts                                Local config cache + AES-GCM credentials
├── reporter.ts                              POST results to Supabase; local log fallback
├── server.ts                                Local HTTP server for web UI direct commands
└── install/
    └── setup.ts                             ← setup.js phases 1-4
```

---

## 10. Risks & Unknowns

### Critical

| Risk | Detail | Mitigation |
|------|--------|-----------|
| **Chrome session loss on profile reset** | Chrome profile holds Naukri cookies. If reset (manually or by agent update), full re-login + OTP is required. During OTP, automation is blocked. | Agent must detect profile absence and signal `OTP_REQUIRED` state to web UI before attempting automation. |
| **Credential bridging between web and agent** | `NAUKRI_PASSWORD` must not transit through Supabase or any cloud API unencrypted. Web UI must send password to agent over a secure local channel. | Use HTTPS localhost (self-signed) or a Supabase Edge Function encrypted payload. Define protocol in Phase 1. |
| **Agent authentication to Supabase** | Agent needs to read config and write run logs. Using a service role key on a local machine is high risk if the machine is compromised. | Use a per-device JWT issued by Supabase Auth (machine account); rotate on each agent setup. |

### High

| Risk | Detail |
|------|--------|
| **OTP/CAPTCHA with no human present** | If Naukri triggers OTP during a headless scheduled run, the current code fails after 60 s. The agent must signal this to the web UI. Users may not be watching. |
| **Naukri selector brittleness** | Automation uses CSS selectors like `#lazyResumeHead span.edit.icon` and `form[name="resumeHeadlineForm"]`. Naukri's frontend can change without notice. These are not covered by any automated regression test. |
| **Multiple Chrome profiles conflict** | If the user's system Chrome is also open, the CDP port `:9222` may be in use by the wrong instance. The profile-dir approach mitigates this, but is not foolproof (e.g., Chrome opening `--remote-debugging-port` already). |
| **Agent offline behavior** | If the agent machine is off, no automation runs. The web UI must clearly show "Agent offline" rather than showing stale data as current. |

### Medium

| Risk | Detail |
|------|--------|
| **Dual scheduling path** | `install-cron.sh` and Electron headless path can both be active; only the shell runner path is compatible with the target agent. Remove `install-cron.sh` early. |
| **State file race condition** | `scheduler.js` writes `.naukri-refresh-state.json` with non-atomic `writeFileSync`. Low-frequency writes make this unlikely to cause corruption, but Supabase as the state store eliminates it. |
| **Resume file committed to repo** | `resume/Anwar_Rizwan_Resume.pdf` is in the repository. Should be removed and gitignored before making the repo public or OSS. |
| **`install-cron.sh` legacy path** | Checks for `.env` at repo root (`$repo_dir/.env`), not AppData. Fails post-migration if only `config.json` exists. |
| **`setup.js` AppData path mismatch** | `getAppDataDir()` in `setup.js` returns `naukri-update` (lowercase, hyphen); `config-service.js` `getAppConfigDir()` returns `NaukriUpdate` (PascalCase). On case-sensitive filesystems (Linux), these are different directories. **Verified discrepancy.** |

### Low

| Risk | Detail |
|------|--------|
| **Node.js version enforcement** | `naukri-profile-refresh.js` exits if Node < 20; `setup.js` exits if Node < 18. Inconsistency. |
| **Log files not gitignored** | `naukri-hourly-refresh.log`, `naukri-refresh.log`, `chrome_startup.log` are in the repo root. They may contain email addresses or partial run output. |
| **`GEMINI_KEY` in config** | `config.js` exports `geminiKey = g('GEMINI_KEY')` and `config-service.js` defaults don't include it. The key is loaded from env but never used in the current codebase. Vestigial or planned future use. |
| **AES-GCM salt is fixed** | `naukri_secure_salt_v1` — no per-credential random salt. This is acceptable for a local machine credential store where the machine ID provides uniqueness, but worth noting. |

---

## 11. Phase 1 Prerequisites

These are the smallest concrete changes needed **before** beginning Phase 1 implementation. They do not change behavior — they prepare the codebase for safe splitting.

### P1.1 — Fix the AppData Path Inconsistency *(Medium risk)*
`setup.js` L174-176 uses `naukri-update` (lowercase); `config-service.js` uses `NaukriUpdate`. On Linux, these create separate directories. Align to `NaukriUpdate` in `setup.js` before any agent work begins.

### P1.2 — Remove Resume PDF from Repository *(Security)*
`resume/Anwar_Rizwan_Resume.pdf` is committed to the repo. Remove it and add `resume/*.pdf` to `.gitignore`.

### P1.3 — Add Log Files to `.gitignore`
`naukri-hourly-refresh.log`, `naukri-refresh.log`, `chrome_startup.log`, `naukri-refresh-error.png`, `.naukri-refresh-state.json`, `.naukri-hourly-refresh.lock` should all be gitignored.

### P1.4 — Extract Automation Core as a Standalone Module
Refactor `naukri-profile-refresh.js` so that `config`, `CDP_ENDPOINT`, `LOG_FILE`, `ERROR_SHOT` are injected (constructor parameters or function arguments) rather than read from module-level globals. This is the single largest enabler for the agent. The current `module.exports` already exports 5 functions — extend to export the main automation entry as a function.

### P1.5 — Define Agent↔Web API Contract
Document the local HTTP API that the agent exposes to the web UI:
- `GET /status` — agent health, Chrome state, last run times
- `POST /command` — `{ type: "trigger-refresh" | "trigger-upload" | "disconnect" }`
- `POST /credentials` — encrypted credential update
- `POST /resume` — stream resume PDF to agent
- `GET /logs` — last N log lines

This contract must be defined before writing any web or agent code.

### P1.6 — Define Supabase Schema
Define tables before any Phase 1 code:
```sql
-- User-level config (web-managed)
agent_config (user_id, refresh_mode, refresh_interval_hours, refresh_interval_minutes,
              refresh_time, refresh_window_enabled, refresh_window_start,
              refresh_window_end, resume_update_enabled, resume_update_time,
              naukri_email, updated_at)
-- Per-run results (agent-written)
run_log (id, user_id, task, success, message, duration_ms, created_at)
-- Agent heartbeat
agent_status (user_id, last_seen, version, chrome_connected, status, updated_at)
```

### P1.7 — Decide Agent Deployment Model
Agent can be deployed as:
- **Option A**: Persistent `node` process managed by the OS (systemd unit / launchd / Windows Service). Simpler; eliminates cron.
- **Option B**: Docker container. Cleaner; harder to access Chrome on the host.
- **Option C**: Retain Electron shell as agent wrapper (thin shell, no UI). Lowest migration cost but defeats the purpose.

**Recommendation**: Option A (systemd/launchd service). This is the cleanest approach and makes the OS scheduler integration trivial. Decide before Phase 1 begins.

### P1.8 — Resolve Dual Scheduling Path
Remove or disable `scripts/install-cron.sh` and the Electron headless path (`--run-automation`) once the agent takes over. Do not run both paths simultaneously during migration.

---

*This document reflects the repository state as of 2026-09-07 at v1.0.6. All assertions are based on code inspection of the files listed in Section 2.1. Any behavior described as "Unknown" was not verifiable from code alone.*
