# Legacy Electron Desktop Application Reference

> **Historical Context**: In early migration phases (Phases 0–10), **Naukri Update** was built as a standalone Electron desktop application packaged for Windows (`.exe`), macOS (`.dmg`), and Linux (`.deb` / `.AppImage`). The application has since been permanently migrated to a **Next.js 15 PWA + Local Node.js Agent + Supabase Storage** architecture.
>
> The legacy baseline code remains permanently archived at Git Tag `v1.0-electron-baseline` (`commit 55b7bef0702c8c77c05720cded4a54304ecbb1e8`). Refer to [`docs/rollback.md`](./rollback.md) for checkout and execution instructions.

---

## Legacy Architecture Overview

The pre-migration desktop application combined the renderer UI, main process control loop, system tray integration, and Playwright automation into a single Electron binary.

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron App                           │
│                                                             │
│   ┌──────────────────────┐      ┌───────────────────────┐   │
│   │   Renderer UI        │◄────►│    Main Process       │   │
│   │   (HTML/JS/CSS)      │      │    (main.js)          │   │
│   └──────────────────────┘      └───────────┬───────────┘   │
│                                             │               │
│                                             ▼               │
│                                  ┌──────────────────────┐   │
│                                  │   System Tray Icon   │   │
│                                  └──────────────────────┘   │
└──────────────────────────────┬──────────────────────────────┘
                               │ CDP (localhost:9222)
                               ▼
                      ┌─────────────────┐
                      │  Google Chrome  │
                      └─────────────────┘
```

---

## Legacy Installer Formats & Auto-Update

### Target Platform Packages
- **Windows (x64)**: `NaukriUpdate-Setup-<version>.exe` (NSIS installer).
- **macOS**: `NaukriUpdate-<version>.dmg` (Apple Silicon & Intel).
- **Linux (Debian/Ubuntu)**: `naukri-update_<version>_amd64.deb`.
- **Linux (Generic)**: `NaukriUpdate-<version>.AppImage`.

### In-App Auto-Update Mechanism (`electron-updater`)
- Legacy clients checked GitHub Releases for update metadata (`latest.yml`, `latest-linux.yml`).
- Downloads were performed in the background with `electron-updater`.
- Differential updates were supported for AppImage on Linux and NSIS on Windows.

---

## Legacy Data Storage & Credential Paths

In the Electron desktop implementation, settings and credentials were stored locally:
- **Windows**: `%APPDATA%\NaukriUpdate\`
- **macOS**: `~/Library/Application Support/NaukriUpdate/`
- **Linux**: `~/.config/NaukriUpdate/`

### Legacy Files:
- `config.json`: Application settings.
- `.credentials.enc`: Machine-bound encrypted password file.
- `.env`: Plaintext fallback settings for CLI execution.
- `resume/`: Authoritative local resume folder.
- `.naukri-chrome-profile/`: Isolated Chrome user data directory.

---

## Legacy FUSE & Linux Dependencies (Reference)

AppImage builds required legacy FUSE 2 (`libfuse.so.2`):
- Ubuntu/Debian: `sudo apt install libfuse2t64`
- Fedora: `sudo dnf install fuse-libs`
- Arch Linux: `sudo pacman -S fuse2`

---

*This document serves strictly as historical documentation for the retired Electron implementation.*
