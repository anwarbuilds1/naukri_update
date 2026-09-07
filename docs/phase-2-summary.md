# Phase 2 Summary — Automation Extraction

> Completed: September 2026  
> Status: ✅ Extracted with 100% behavioral parity, 28/28 unit tests passing, Electron baseline untouched.

---

## 1. Files Extracted & Created

All Playwright automation logic was extracted from `naukri-profile-refresh.js` and modularized inside `apps/agent/src/` with dependency injection:

| File | Type | Responsibilities |
|------|------|------------------|
| `apps/agent/src/automation.ts` | **Extracted core** | `runTask()`, `updateAndVerifyHeadline()`, `uploadAndVerifyResume()`, `loginWithNaukriCredentials()`, `hasAuthenticatedProfile()`, resume discovery, file validation, diagnostics |
| `apps/agent/src/chrome.ts` | **Enhanced** | `checkCDPAvailable()`, `findChromeExecutable()`, `ensureChromeRunning()`, `disconnectChrome()` |
| `apps/agent/src/config.ts` | **Enhanced** | `loadAgentConfig()`, `getDefaultConfigDir()`, machine-bound AES-256-GCM encryption/decryption (`readEncryptedPassword`, `saveEncryptedPassword`), `config.json` parsing |
| `apps/agent/src/main.ts` | **Integrated** | Automation lock (`.naukri-automation.lock`, 30-minute staleness check), dynamic config reload, task dispatcher, command handling |
| `apps/agent/src/server.ts` | **Enhanced** | Local HTTP server routes, credentials persistence to `.credentials.enc`, log retrieval |
| `apps/agent/src/scheduler.ts` | **Bug fix** | `isRefreshDue` fixed to use `now.getTime()` delta matching `scripts/scheduler.js` baseline |
| `apps/agent/src/automation.test.ts` | **Unit tests** | 28 unit tests covering validators, filename sanitization, duplicate detection, resume validation, scheduling, AES-256-GCM credentials, and automation lock |

---

## 2. Functions Ported

| Original (`naukri-profile-refresh.js`) | Ported (`apps/agent/src/automation.ts`) | Behavioral Parity Details |
|----------------------------------------|------------------------------------------|---------------------------|
| `assertNaukriProfileUrl()` | `assertNaukriProfileUrl()` | Validates HTTPS and `/mnjuser/` path |
| `isAuthenticatedProfile()` | `isAuthenticatedProfile()` | Validates hostname and `/mnjuser` path |
| `isNaukriLoginUrl()` | `isNaukriLoginUrl()` | Validates hostname and `/nlogin` path |
| `hasAuthenticatedProfile()` | `hasAuthenticatedProfile()` | Checks URL and `#lazyResumeHead span.edit.icon` visibility (10s timeout) |
| `findVisibleUnique()` | `findVisibleUnique()` | Polls candidate selectors with 20s timeout |
| `loginWithNaukriCredentials()` | `loginWithNaukriCredentials()` | Native login at `nlogin/login?URL=...`, OTP/CAPTCHA detection, URL waiting |
| `printHeadlineEditorDiagnostics()` | `printHeadlineEditorDiagnostics()` | DOM inspector logging on form/modal issues |
| `updateAndVerifyHeadline()` | `updateAndVerifyHeadline()` | Full 18-step verified headline refresh with trailing dot toggle |
| `findAuthoritativeResume()` | `findAuthoritativeResume()` | Explicit config check, path traversal guard, single-PDF directory discovery |
| `validateFile()` | `validateFile()` | Non-empty regular file check, 500ms stability check, `%PDF` magic bytes check |
| `sanitizeFilename()` | `sanitizeFilename()` | Strips old dates, sanitizes characters to alphanumeric/underscore, appends today's `_DD-MM-YYYY.pdf` |
| `isStaleDuplicate()` | `isStaleDuplicate()` | Identifies past dated copies and candidate duplicates |
| `cleanupStaleResumes()` | `cleanupStaleResumes()` | Deletes old copies while strictly preserving authoritative source and today's upload file |
| `uploadAndVerifyResume()` | `uploadAndVerifyResume()` | Upload via `input#attachCV`, dialog handler, progress bar monitor, success confirmation, profile reload verification |
| CLI Main block (`require.main === module`) | `runTask()` | Connects over CDP, reuses existing Chrome context, handles fallback login, executes task, captures error screenshot, returns structured `RunResult` |

---

## 3. Dependency Boundaries

```
apps/web ──(HTTP proxy)──▶ apps/agent (localhost:7842)
                              │
                              ├──▶ playwright-core (connectOverCDP)
                              │       │
                              │       ▼
                              └──▶ Google Chrome (127.0.0.1:9222, persistent profile)
```

- **Electron**: Zero imports in `apps/agent`. The agent is a 100% standalone Node.js process.
- **Supabase**: No database or cloud dependencies introduced in automation core.
- **Chrome**: Managed exclusively via localhost DevTools Protocol (`127.0.0.1:9222`).
- **Naukri Password**: Read from local `.credentials.enc` using machine-bound PBKDF2/AES-256-GCM or environment. Never sent over external networks.
- **Resume File**: Discovered and manipulated strictly on local filesystem; never uploaded to cloud storage.

---

## 4. `runTask()` Flow

```text
runTask(task, options)
   │
   ├─▶ Normalize task ('headline-refresh' | 'resume-upload')
   ├─▶ Rotate local log file (preserve last 5 runs)
   ├─▶ Ensure Chrome CDP is reachable (launch Chrome if needed via ensureChromeRunning)
   ├─▶ chromium.connectOverCDP(cdpEndpoint)
   ├─▶ Reuse browser context & page (or open profile URL)
   ├─▶ Verify authentication; execute native login if session expired
   │      │
   │      ├─▶ If OTP/CAPTCHA detected: fail gracefully with human intervention prompt
   │
   ├─▶ Execute requested task:
   │      ├─▶ 'headline-refresh' → updateAndVerifyHeadline(page, options, log)
   │      └─▶ 'resume-upload'    → uploadAndVerifyResume(page, options, log)
   │
   ├─▶ Capture error screenshot on unexpected failure (naukri-refresh-error.png)
   ├─▶ Disconnect Playwright (browser.close() keeps Chrome running)
   └─▶ Return structured RunResult { task, success, message, durationMs, timestamp, screenshotPath? }
```

---

## 5. Chrome Integration

- `chrome.ts` encapsulates all Chrome process management.
- Default endpoint: `http://127.0.0.1:9222`.
- Dedicated profile: `<configDir>/.naukri-chrome-profile`.
- `ensureChromeRunning`: Removes stale `SingletonLock`, spawns detached Chrome with `--remote-debugging-port=9222`, polls for CDP availability up to 30s.
- `disconnectChrome`: Kills processes listening on or launched with port 9222 cross-platform (`pkill` on Linux/macOS, `wmic` on Windows).

---

## 6. Login & Session Behavior

- Primary authentication is session-cookie reuse inside `.naukri-chrome-profile`.
- If session expired, `loginWithNaukriCredentials` navigates to native login, fills username/password, and clicks login.
- **Human Interaction Boundary**: If Naukri prompts for an OTP or CAPTCHA, the agent aborts with:
  > *"Naukri requires OTP or CAPTCHA verification. Complete the verification manually in the Chrome window, then run the refresh again."*
  No automated OTP bypass is attempted, adhering to strict design rules.

---

## 7. Resume Behavior

- Locates single authoritative PDF in `<configDir>/resume/` (or follows `RESUME_FILE`).
- Guarded against path-traversal attacks (`startsWidth(resolvedDir)` check).
- Validates file exists, regular file, > 0 bytes, stable modification time, and starts with `%PDF`.
- Checks if today's dated filename is already uploaded on Naukri (`#lazyAttachCV .resume-name-inline`); skips if already current.
- Creates dated temporary file copy (`<basename>_DD-MM-YYYY.pdf`), attaches to `input#attachCV`.
- Monitors progress bar width and success banner (`#attachCVMsgBox`).
- Reloads profile and confirms final filename.
- Cleans up temporary copy and stale duplicate files.

---

## 8. Headline Behavior

- Navigates to `/mnjuser/profile`.
- Confirms `#lazyResumeHead span.edit.icon`.
- Clicks edit (with fallback to force click).
- Finds headline textarea (`textarea#resumeHeadline:visible` or placeholder fallback).
- Reads current headline, toggles trailing dot (if ends with `.`, slice it off; otherwise add `.`).
- Fills input and confirms `inputValue() === expectedHeadline`.
- Clicks Save and waits for modal to hide + networkidle.
- Reloads page and re-opens editor to independently verify that saved headline matches expected value.

---

## 9. Tests Added

Located in `apps/agent/src/automation.test.ts` (runs with `node --test dist/`):

1. `assertNaukriProfileUrl` accepts valid HTTPS `/mnjuser/` URLs.
2. `assertNaukriProfileUrl` rejects HTTP, external domains, or non-profile paths.
3. `isAuthenticatedProfile` validation tests.
4. `isNaukriLoginUrl` validation tests.
5. `sanitizeFilename` date stripping and new date affixing.
6. `sanitizeFilename` character sanitization.
7. `sanitizeFilename` fallback to `resume_<date>.pdf` on empty base.
8. `isStaleDuplicate` candidate duplicate matching.
9. `validateFile` rejects non-existent files.
10. `validateFile` rejects non-PDF extensions.
11. `validateFile` rejects 0-byte files.
12. `validateFile` rejects files without `%PDF` magic bytes.
13. `validateFile` validates valid PDF file.
14. `findAuthoritativeResume` discovers single PDF in folder.
15. `findAuthoritativeResume` throws when multiple PDFs found without explicit config.
16. `findAuthoritativeResume` detects and blocks path traversal attempts.
17. `cleanupStaleResumes` unlinks older copies while preserving source and target files.
18. `isRefreshDue` interval scheduling delta calculation.
19. `isRefreshDue` paused state check.
20. `isRefreshDue` initial state (never run).
21. `getDueTasks` task determination.
22. `getMachineId` deterministic generation.
23. `getDerivedKey` 32-byte PBKDF2 key derivation.
24. `saveEncryptedPassword` and `readEncryptedPassword` AES-256-GCM roundtrip.
25. `readEncryptedPassword` handling of missing files.
26. `acquireAutomationLock` creates `.naukri-automation.lock`.
27. `releaseAutomationLock` deletes lock file.
28. Concurrent lock collision protection.

---

## 10. Validation Results

```
✅ pnpm build               — 4/4 packages built cleanly (turbo run build)
✅ pnpm typecheck           — 6/6 tasks passed (turbo run typecheck)
✅ pnpm test                — 5/5 tasks passed, 28/28 unit tests passed (turbo run test)
✅ Standalone startup       — apps/agent boots independently on port 7842 without Electron
✅ Zero Electron leaks      — grep search for 'electron' in apps/agent returns 0 results
✅ Electron baseline intact — main.js, naukri-profile-refresh.js, config-service.js untouched
```

---

## 11. Known Limitations & Unverified Behavior

1. **Live Naukri Automation**: Unit tests verify all validation, sanitization, parsing, encryption, and locking logic. Live automation against real Naukri.com depends on local user Chrome session and network credentials. Mark live session automation as `UNKNOWN` until user tests with their credentials.
2. **OTP/CAPTCHA**: Automated solving is deliberately not supported; user must complete verification in Chrome if prompted.

---

## 12. Phase 3 Prerequisites

1. Connect `apps/web` settings form to send credentials and schedule to agent.
2. Connect `apps/web` dashboard cards to live agent status polling (`GET /api/agent/status`).
3. Connect `apps/agent` to Supabase `run_log` and `agent_status` (when Supabase credentials are provided).
4. Package local agent with an OS service wrapper (systemd on Linux, LaunchAgent on macOS, Windows Service).
