# Rollback Guide: Restoring the Legacy Electron Application

This document provides definitive instructions for rolling back from the Next.js PWA + Node.js Agent architecture to the verified, known-good legacy Electron application.

---

## 1. Baseline Identity

- **Git Tag**: `v1.0-electron-baseline`
- **Baseline Commit**: `55b7bef0702c8c77c05720cded4a54304ecbb1e8`
- **Release Verification**: Verified across all 10 Phase 7E criteria with full bidirectional credential compatibility, real Naukri headline mutations, and real resume uploads.

---

## 2. Shared Runtime Directory & File Locations

Both runtimes are architected to use the exact same operating system directories. When rolling back to Electron, all existing sessions, credentials, and resumes remain immediately recognized without data loss or re-configuration:

- **Base Configuration Directory**:
  - Linux: `~/.config/NaukriUpdate`
  - macOS: `~/Library/Application Support/NaukriUpdate`
  - Windows: `%APPDATA%\NaukriUpdate`
- **Dedicated Chrome Profile**:
  - Path: `~/.config/NaukriUpdate/.naukri-chrome-profile`
  - Contains: Live authenticated Naukri.com session cookies, local storage, and Chrome preferences.
- **Candidate Resume Storage**:
  - Path: `~/.config/NaukriUpdate/resume/`
  - Active Resume: `~/.config/NaukriUpdate/resume/Anwar_Rizwan_Resume.pdf`
- **Encrypted Credentials**:
  - Path: `~/.config/NaukriUpdate/.credentials.enc`
  - Format: Machine-bound AES-256-GCM (`type: 'machine_aes_gcm'`) or legacy Electron OSCrypt (`type: 'electron_safestorage'`).
- **Configuration & Environment**:
  - `~/.config/NaukriUpdate/config.json`
  - `~/.config/NaukriUpdate/.env`

---

## 3. Step-by-Step Rollback Procedure

### Step 1: Stop the New Agent Daemon and Web Server
Before launching Electron, ensure the background agent daemon and web control plane are stopped so they do not contend for Chrome or the single-instance locks:

```bash
# If running as a systemd user service:
systemctl --user stop naukri-agent.service
systemctl --user disable naukri-agent.service

# If running as a process / pm2 / supervisor:
pkill -f "apps/agent/dist/main.js"
pkill -f "apps/web"

# Verify ports 7842 and 3000 are free:
lsof -i :7842
lsof -i :3000
```

### Step 2: Checkout the Known-Good Electron Baseline
Use the immutable tag `v1.0-electron-baseline`:

```bash
cd /home/anwar/Workspace/personal/naukri_update

# Checkout the baseline tag into a new rollback branch:
git checkout -b rollback-to-electron v1.0-electron-baseline
```

### Step 3: Reinstall Root Dependencies
Reinstall Electron and its build tooling:

```bash
# Clean install using pnpm:
pnpm install
```

### Step 4: Verify Filesystem Baseline
Confirm that legacy entry points and services are restored:
```bash
ls -la main.js preload.js config-service.js secure-store.js naukri-profile-refresh.js renderer/
```

### Step 5: Launch Electron
Start the legacy Electron desktop application:

```bash
# Interactive GUI mode:
npm start

# Or headlessly for automated refresh runs:
npx electron main.js --run-automation
```

---

## 4. Credential Compatibility Notes

- If credentials were saved using the Agent / PWA Web UI, they are encrypted with machine-bound AES-256-GCM (`type: 'machine_aes_gcm'`). Electron's `SecureStoreService` (`secure-store.js`) seamlessly decrypts this format via its built-in machine PBKDF2 key derivation fallback.
- If credentials were saved using the Electron GUI desktop app (`type: 'electron_safestorage'`), Electron decrypts them directly via Chromium's native `safeStorage` API.
- No re-entry of passwords or session reconfiguration is required when rolling back.

---

## 5. Chrome CDP & Automation State

- The dedicated Chrome instance uses port `9222`.
- If Chrome was left running by the agent, Electron will cleanly attach to the existing CDP session or restart Chrome with `--remote-debugging-port=9222 --user-data-dir=~/.config/NaukriUpdate/.naukri-chrome-profile`.
- To kill any dangling Chrome instances before launching Electron:
  ```bash
  pkill -f "remote-debugging-port=9222.*\.naukri-chrome-profile"
  ```
