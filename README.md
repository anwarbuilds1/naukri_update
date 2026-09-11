# Naukri Update

**Naukri Update** is an automated profile activity system that keeps your Naukri.com job seeker profile active and visible to recruiters. It regularly updates your profile activity timestamp and uploads your resume PDF on a schedule using a **Next.js PWA Control Plane**, a **Local Node.js Background Agent**, **Supabase Cloud Persistence**, and **Google Chrome CDP**.

---

## Key Features

1. **Hourly Resume Headline Refresh**: Toggles a trailing period (`.`) at the end of your resume headline (e.g., `"Senior Software Engineer"` ↔ `"Senior Software Engineer."`). This updates your profile's "Last Updated" timestamp without altering visible text.
2. **Daily Resume PDF Upload**: Uploads your resume PDF on a daily schedule. Appends today's date to the uploaded filename (e.g., `Anwar_Resume_12-09-2026.pdf`) so Naukri accepts every upload cleanly.
3. **Cloud Authoritative Resume Storage**: Upload and manage your resume from any device via the Progressive Web App (PWA). Resumes are stored securely in **Supabase Storage** with user Row Level Security (RLS) and automatically synced to your local background agent.
4. **Isolated Chrome Session**: Executes Playwright automation through a dedicated, persistent Chrome profile (`.naukri-chrome-profile`) over Chrome DevTools Protocol (CDP) on port `9222`. Your personal browser session is untouched.
5. **Zero Secret Storage in Cloud**: Your Naukri account password is **never** stored in Supabase or cloud databases. Credentials are encrypted locally using machine-bound AES-256-GCM encryption (`.credentials.enc`).

---

## End-to-End Architecture

```
User (PWA UI / Browser)
  │
  ├──► Upload Resume PDF ──► Next.js API (/api/agent/resume)
  │                                │
  │                                ├──► Supabase Storage (resumes/{user_id}/resume.pdf)
  │                                └──► Supabase DB (agent_config metadata & SHA-256)
  │
  └──► Control & Monitor Dashboard
                                │
                                ▼
                   Local Node Agent (127.0.0.1:7842)
                                │
                                ├──► Self-Reconcile Resume Cache (SHA-256 check)
                                │         │
                                │         └──► Download from Next.js API (/api/agent/resume/download)
                                │              Atomic rename ➔ cached_resume.pdf
                                │
                                ├──► Manage Chrome CDP (127.0.0.1:9222)
                                │
                                └──► Playwright Engine ──► Naukri.com
```

### Return Diagnostic Flow
```
Naukri.com ──► Playwright ──► Agent Reporter ──► Next.js API Gateway (/api/agent/report)
                                                       │
                                                       ├──► Supabase DB (run_log & agent_status)
                                                       │
                                                       └──► PWA Dashboard Updates
```

---

## Data Ownership & Security Boundaries

| Data Domain | Source of Truth | Local Cache | Security & RLS Policy |
| :--- | :--- | :--- | :--- |
| **User Account & Auth** | Supabase Auth (`auth.users`) | SSR Session | `@supabase/ssr` with RLS |
| **Schedule Configuration** | Supabase DB (`public.agent_config`) | Agent Memory | RLS (`auth.uid() = user_id`) |
| **Authoritative Resume PDF** | **Supabase Storage** (`resumes` bucket) | `~/.config/NaukriUpdate/resume/cached_resume.pdf` | RLS (`bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]`) |
| **Naukri Password** | Local Machine (`.credentials.enc`) | Agent AES-256-GCM Store | Never transmitted; `0600` file permissions |
| **Chrome Browser Session** | Local Chrome Profile (`.naukri-chrome-profile`) | Native Cookies | Isolated profile; local CDP (`127.0.0.1:9222`) |
| **Agent Secret** | `~/.config/NaukriUpdate/agent.env` | Environment | `0600` file permissions; `X-Agent-Secret` localhost header |

---

## Quickstart & Installation

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **pnpm**: v9.0.0 or higher
- **Google Chrome**: Installed locally
- **Supabase Project**: Active project with Auth, PostgreSQL database, and Storage enabled.

### 2. Monorepo Setup
```bash
git clone https://github.com/anwarbuilds1/naukri_update.git
cd naukri_update
pnpm install
```

### 3. Environment Configuration
Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AGENT_URL=http://127.0.0.1:7842
AGENT_SECRET=your-256bit-agent-secret
```

### 4. Install Local Agent Systemd Service (Linux)
```bash
# Build workspace packages
pnpm build

# Install systemd user service
node apps/agent/dist/main.js --service-install
```

Check status:
```bash
systemctl --user status naukri-agent.service
```

### 5. Launch Next.js PWA Control Plane
```bash
pnpm --filter @naukri-update/web dev
```
Open **`http://localhost:3000`** in your browser to log in, configure schedules, and upload your resume.

---

## Verification & Self-Check Commands

Run workspace tests and type checking:
```bash
# Run unit and integration tests across monorepo
pnpm test

# Verify TypeScript types across all 4 workspace packages
pnpm typecheck

# Build production artifacts for Agent and Web
pnpm --filter @naukri-update/agent build
pnpm --filter @naukri-update/web build
```

---

## Documentation Index

- [`docs/architecture.md`](./docs/architecture.md): Complete architecture specification, component boundaries, and command state machine.
- [`docs/agent-api.md`](./docs/agent-api.md): Local Agent HTTP API specification.
- [`docs/legacy-electron.md`](./docs/legacy-electron.md): Historical documentation for the retired Electron desktop application.
- [`docs/rollback.md`](./docs/rollback.md): Restoration guide for Git Tag `v1.0-electron-baseline`.

---

## License & Privacy

- **100% Private & Open Source**: Zero telemetry, zero analytics, zero external tracking.
- **Local Credentials**: Passwords remain on your computer inside `.credentials.enc`.
- **Cloud Resumes**: Resumes are protected by strict per-user Supabase Storage Row Level Security.
