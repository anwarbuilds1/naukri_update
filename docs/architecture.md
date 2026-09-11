# Architecture

> Naukri Update — Next.js PWA + Node.js Agent migration target

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser / Device                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │           Next.js PWA  (apps/web)                   │  │
│   │                                                     │  │
│   │  Dashboard · Settings · Resume · Logs · Guide       │  │
│   └─────────────────┬───────────────────────────────────┘  │
│                     │ HTTPS                                  │
└─────────────────────┼───────────────────────────────────────┘
                      ▼
         ┌────────────────────────┐
         │   Next.js API Routes   │
         │   (apps/web/app/api)   │
         └──────┬─────────┬───────┘
                │         │
                │ Supabase │ Agent Control Plane
                │ Client   │ (HTTP localhost:7842)
                ▼         ▼
     ┌──────────────┐  ┌────────────────────────────────────┐
     │   Supabase   │  │   Local Node Agent  (apps/agent)   │
     │              │  │                                    │
     │  PostgreSQL  │  │  main.ts  →  poll loop & gateway   │
     │  Auth (SSR)  │  │  scheduler.ts  →  getDueTasks()    │
     │  RLS secured │  │  chrome.ts  →  CDP management      │
     └──────────────┘  │  automation.ts  →  Playwright      │
                       │  reporter.ts  →  report to Next.js │
                       └────────────────┬───────────────────┘
                                        │ CDP (localhost:9222)
                                        ▼
                               ┌─────────────────┐
                               │  Google Chrome  │
                               │  (persistent    │
                               │   profile)      │
                               └────────┬────────┘
                                        │ HTTPS
                                        ▼
                                ┌──────────────┐
                                │  Naukri.com  │
                                └──────────────┘
```

## Component Ownership

### Web (`apps/web`)
**Owns**: UI, API control plane gateway, user authentication (Supabase SSR), schedule persistence, command state machine  
**Does NOT own**: automation execution, Chrome processes, plain password storage, resume storage, Naukri session cookies

- Next.js 15 PWA (installable, Next.js 15.3.4, React 19, Tailwind CSS)
- Authenticated pages: Dashboard, Settings, Resume, Logs, Guide, Onboarding, Login, Signup
- API routes acting as the sole gateway to Supabase and the agent
- Cookie-based SSR Supabase client (`@supabase/ssr`) enforcing RLS on all user requests

### Supabase
**Owns**: User Auth, PostgreSQL persistent data (`agent_config`, `run_log`, `agent_status`, `agent_commands`), **Authoritative Resume Storage** (`resumes` bucket with per-user RLS).  
**Does NOT own**: `NAUKRI_PASSWORD`, Chrome sessions, Playwright execution context.

| Resource | Writer | Reader | Security |
|---|---|---|---|
| `agent_config` | Web (user settings) | Agent via Next.js `/api/agent/schedule` | RLS (`auth.uid() = user_id`) |
| `resumes` Bucket | Web `/api/agent/resume` | Web & Agent `/api/agent/resume/download` | RLS (`bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]`) |
| `run_log` | Web `/api/agent/report` | Web (logs page & dashboard) | RLS (`auth.uid() = user_id`) |
| `agent_status` | Web `/api/agent/report` | Web `/api/agent/status` | RLS (`auth.uid() = user_id`) |
| `agent_commands` | Web `/api/agent/command` | Web `/api/agent/command` | RLS (`auth.uid() = user_id`) |

**Critical security rules**:
- `NAUKRI_PASSWORD` is **never** stored in Supabase.
- Authoritative Resume PDF is stored in private Supabase Storage (`resumes/{user_id}/resume.pdf`). Local agent syncs to execution cache (`~/.config/NaukriUpdate/resume/cached_resume.pdf`).
- `SUPABASE_SERVICE_ROLE_KEY` is **never** given to the local agent. Next.js API is the sole control plane gateway.

### Agent (`apps/agent`)
**Owns**: Chrome lifecycle, Playwright automation, local AES-256-GCM credentials, local resume execution cache, scheduling execution  
**Does NOT own**: UI, user authentication, Supabase schema or direct Supabase credentials

- Node.js 20+ + TypeScript
- Persistent poll loop (every 60 seconds) with schedule & resume SHA-256 synchronization from `/api/agent/schedule`
- Local HTTP server on `127.0.0.1:7842` authenticated with `X-Agent-Secret`
- Machine-bound credential store (`.credentials.enc`)
- Reports run results and heartbeats to Next.js gateway (`POST /api/agent/report`)

---

## Security Boundaries

| Data | Location | Transport | Rationale |
|------|----------|-----------|-----------|
| `NAUKRI_PASSWORD` | Agent local `.credentials.enc` | Localhost HTTP (`127.0.0.1:7842`) only | Never in Supabase; machine-bound AES-256-GCM |
| `NAUKRI_EMAIL` | Supabase `agent_config` | Normal API | Non-sensitive; tied to user account |
| Resume PDF | Supabase Storage (`resumes` bucket) | Browser ➔ Next.js API ➔ Supabase Storage; Agent downloads to local cache | Authoritative cloud source; 5MB limit, %PDF header validation, per-user RLS |
| Chrome session | Agent `.naukri-chrome-profile/` | Never transmitted | Chrome cookies cannot be cloud-managed |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server env only | Never transmitted | Kept strictly on server gateway; not in agent |
| `AGENT_SECRET` | Agent (`~/.config/NaukriUpdate/agent.env`) + Next.js server | Localhost HTTP header (`X-Agent-Secret`) | Authenticates web ↔ agent requests; stored in `chmod 0600` file outside repo |

### Local Agent Secret & Service Environment File

The local Agent daemon (`apps/agent`) requires authentication via the `X-Agent-Secret` HTTP header to prevent unauthorized local processes from triggering automations or accessing credentials.

- **Storage Location**: `~/.config/NaukriUpdate/agent.env` (outside the repository in user configuration directory).
- **Format**: `AGENT_SECRET=<hex_encoded_256_bit_secret>`
- **File Permissions**: Restrictive `0600` (`-rw-------`, user read/write only).
- **Systemd Integration**: Loaded natively via `EnvironmentFile=%h/.config/NaukriUpdate/agent.env` in `naukri-agent.service` alongside `Environment=NODE_ENV=production`.
- **Next.js Web Gateway Integration**: The server-side API gateway (`apps/web`) dynamically resolves the secret from `process.env.AGENT_SECRET` or falls back to reading `~/.config/NaukriUpdate/agent.env` on localhost. The secret is strictly server-side and never exposed to browser/client code.
- **Idempotent Service Installation**: Running `node apps/agent/dist/main.js --service-install` guarantees:
  - If `agent.env` exists, the existing secret is preserved without rotation.
  - If `agent.env` is missing, a 256-bit cryptographically secure random secret is generated and persisted with mode `0600`.

---

## Command State Machine & Idempotency

All commands sent via `POST /api/agent/command` are tracked in PostgreSQL (`agent_commands` table) with idempotency keyed on `request_id`:

```
              ┌───────────────┐
              │    queued     │◄──────────────┐ (retry)
              └───────┬───────┘               │
                      │                       │
                      ▼                       │
              ┌───────────────┐               │
              │  dispatched   │               │
              └───────┬───────┘               │
                      │                       │
                      ▼                       │
              ┌───────────────┐               │
              │    running    │               │
              └───────┬───────┘               │
                      │                       │
         ┌────────────┴────────────┐          │
         ▼                         ▼          │
  ┌───────────────┐         ┌───────────────┐ │
  │   succeeded   │         │    failed     ├─┘
  └───────────────┘         └───────────────┘

  [queued] ──(cancel)──> [cancelled]
```

- **Valid Transitions**:
  - `queued` → `dispatched`
  - `dispatched` → `running`
  - `running` → `succeeded`
  - `dispatched` → `failed`
  - `running` → `failed`
  - `failed` → `queued` (retry allowed)
  - `queued` → `cancelled`
- **Invalid Transitions** (e.g. `succeeded` → `running`, `cancelled` → `running`) are strictly rejected with HTTP 409 Conflict.

---

## Agent Availability & Heartbeat

Agent status is determined centrally via `getAgentAvailability(lastSeenMs, nowMs, rawStatus)` with a **90-second stale threshold** (`AGENT_HEARTBEAT_STALE_MS = 90_000`).
- If `now - lastSeen <= 90s`: reports agent's live status (`idle`, `running`, `chrome-disconnected`, `otp-required`, `error`).
- If `now - lastSeen > 90s`: automatically transitions to `offline`.
- Browser status polling observes live agent or persisted Supabase state without writing to `agent_status` on every poll.

---

## Rollback & Baseline Preservation

The legacy Electron application was permanently retired in Phase 10 following full migration verification.
The complete, working legacy baseline is tagged at:
- **Git Tag**: `v1.0-electron-baseline`
- **Commit**: `55b7bef0702c8c77c05720cded4a54304ecbb1e8`
- **Restoration Guide**: Refer to [`docs/rollback.md`](./rollback.md) for instructions on checking out and launching the legacy Electron desktop application.

---

## Current Verification & Runtime Status (Phase 8 Final Stage)

### Verification Matrix
```
Next.js PWA                 PASS
Supabase/Auth               PASS
Next.js -> Agent             PASS
Agent heartbeat             PASS
Agent daemon/service         PASS
Agent persistence/reboot     PASS
Agent lock                   PASS
Agent -> Chrome CDP           PASS
Chrome CDP :9222             PASS
Naukri automation            PASS (Real headline refresh & resume upload verified)
Electron retirement         COMPLETE
```

### Categorized Status
- **VERIFIED:**
  - Next.js PWA frontend & Supabase Auth SSR session management.
  - Next.js API gateway routes (`/api/agent/*`) ↔ local Agent HTTP bridge (`127.0.0.1:7842`).
  - Systemd user service `naukri-agent.service` (daemon operational, reboot-persistent, single-instance locked, reporting heartbeats).
  - Chrome CDP lifecycle & display environment resolution (`apps/agent/src/chrome.ts`, `apps/agent/src/service.ts`).
  - Real end-to-end headline refresh on Naukri.com (`OK: headline dot removed and verified from Naukri`).
  - Real end-to-end resume upload on Naukri.com (`OK: Resume uploaded, saved, and verified from Naukri. New filename: Anwar_Rizwan_Resume_12-09-2026.pdf`).
  - Disconnect / reconnect recovery (`disconnect-chrome` & `connect-chrome`).
  - Complete workspace build and test suite (`93/93` tests passing, `0` TypeScript errors).
- **CURRENTLY BLOCKED:**
  - None.
- **UNKNOWN / NOT YET VERIFIED:**
  - Multi-month long-term unattended operation across OS sleep/wake cycles.
  - Future unannounced Naukri.com DOM modifications.

### Chrome CDP Resolution Summary
- **Root Cause:** In the systemd user service daemon environment, session GUI environment variables (`DISPLAY`, `XAUTHORITY`) were missing. Spawning `/usr/bin/google-chrome` without explicit display environment resolution caused Chrome to exit immediately with `Missing X server or $DISPLAY`, preventing CDP port 9222 from opening.
- **Fix Implemented:**
  1. `apps/agent/src/chrome.ts`: Added `resolveChromeEnvironment()` to resolve `DISPLAY` and `XAUTHORITY` when spawning Chrome on Linux, with `--headless=new` fallback if Chrome cannot connect to an X display.
  2. `apps/agent/src/service.ts`: Added `PassEnvironment=DISPLAY XAUTHORITY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS` to `naukri-agent.service`.



