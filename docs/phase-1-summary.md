# Phase 1 Summary — Foundation & Architecture

> Completed: September 2026  
> Status: ✅ All typechecks passing, Electron app preserved

---

## What Was Implemented

Phase 1 establishes the monorepo foundation without migrating or modifying any existing
Electron/Playwright automation code. The current app remains the production baseline.

---

## Repository Structure

```
naukri_update/                          ← Existing Electron root (unchanged)
│
├── main.js                             ← Electron main (NOT MODIFIED)
├── preload.js                          ← Electron IPC (NOT MODIFIED)
├── config.js                           ← Config shim (NOT MODIFIED)
├── config-service.js                   ← ConfigService (NOT MODIFIED)
├── secure-store.js                     ← Credential store (NOT MODIFIED)
├── naukri-profile-refresh.js           ← Playwright automation (NOT MODIFIED)
├── auto-updater-service.js             ← Auto-updater (NOT MODIFIED)
├── scripts/scheduler.js                ← Scheduler (NOT MODIFIED)
│
├── package.json                        ← [MODIFIED] added private, packageManager, turbo scripts
├── pnpm-workspace.yaml                 ← [NEW] pnpm workspace definition
├── turbo.json                          ← [NEW] Turborepo task graph
├── tsconfig.base.json                  ← [NEW] Shared TypeScript base config
├── .gitignore                          ← [UPDATED] added runtime artifacts + monorepo outputs
│
├── apps/
│   ├── web/                            ← [NEW] Next.js 15 PWA
│   │   ├── app/
│   │   │   ├── layout.tsx              ← Root layout + SW registration
│   │   │   ├── page.tsx                ← Redirect → /dashboard
│   │   │   ├── globals.css             ← Tailwind CSS entry
│   │   │   ├── (app)/                  ← App shell route group (with sidebar)
│   │   │   │   ├── layout.tsx          ← AppSidebar wrapper
│   │   │   │   ├── dashboard/page.tsx  ← Status cards
│   │   │   │   ├── settings/page.tsx   ← Phase 2 placeholder
│   │   │   │   ├── resume/page.tsx     ← Phase 2 placeholder
│   │   │   │   ├── logs/page.tsx       ← Phase 2 placeholder
│   │   │   │   └── guide/page.tsx      ← Getting started guide
│   │   │   ├── onboarding/page.tsx     ← Onboarding (no sidebar)
│   │   │   └── api/agent/
│   │   │       ├── status/route.ts     ← GET  /api/agent/status
│   │   │       ├── command/route.ts    ← POST /api/agent/command
│   │   │       ├── credentials/route.ts← POST /api/agent/credentials
│   │   │       ├── resume/route.ts     ← POST /api/agent/resume
│   │   │       └── logs/route.ts       ← GET  /api/agent/logs
│   │   ├── components/
│   │   │   ├── layout/AppSidebar.tsx   ← Navigation sidebar
│   │   │   └── dashboard/
│   │   │       ├── AgentStatusCard.tsx ← Phase 2: polls /api/agent/status
│   │   │       └── AutomationStatusCard.tsx ← Phase 2: reads Supabase
│   │   ├── lib/supabase.ts             ← Server + browser Supabase clients
│   │   ├── public/
│   │   │   ├── manifest.json           ← PWA manifest
│   │   │   └── sw.js                   ← Service worker
│   │   └── .env.example                ← Environment variable template
│   │
│   └── agent/                          ← [NEW] Node.js + TypeScript agent
│       ├── src/
│       │   ├── main.ts                 ← Entry + poll loop + startup
│       │   ├── config.ts               ← AgentConfig, loadAgentConfig()
│       │   ├── chrome.ts               ← CDP check, Chrome launch stubs
│       │   ├── scheduler.ts            ← getDueTasks(), isRefreshDue()
│       │   ├── automation.ts           ← runTask() stub (Phase 2: Playwright)
│       │   ├── reporter.ts             ← Log to file (Phase 2: + Supabase)
│       │   └── server.ts               ← Local HTTP server (5 routes)
│       └── .env.example                ← Agent environment template
│
├── packages/
│   ├── shared/                         ← [NEW] Framework-agnostic types
│   │   └── src/
│   │       ├── types.ts                ← RunResult, ScheduleConfig, AgentStatus, AgentCommand, TaskType
│   │       ├── validation.ts           ← Zod schemas for all types
│   │       └── index.ts                ← Re-exports
│   │
│   └── database/                       ← [NEW] Supabase schema + client
│       ├── src/
│       │   ├── schema.sql              ← 3 tables + RLS + triggers
│       │   ├── types.ts                ← TypeScript type stubs for DB
│       │   ├── client.ts               ← createServerClient() / createBrowserClient()
│       │   └── index.ts                ← Re-exports
│       └── migrations/
│           └── 001_initial_schema.sql  ← Same as schema.sql (apply to Supabase)
│
└── docs/
    ├── phase-0-audit.md                ← Existing audit (unchanged)
    ├── phase-1-summary.md              ← This file
    ├── architecture.md                 ← [NEW] System diagram + ownership
    └── agent-api.md                    ← [NEW] Full API contract
```

---

## New Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `turbo@^2.1.3` | root devDep | Monorepo build orchestration |
| `zod@^3.23.8` | shared, agent, web | Schema validation |
| `@supabase/supabase-js@^2.45.4` | database, web | Supabase client |
| `@supabase/ssr@^0.5.1` | web | Supabase SSR helpers |
| `next@15.3.4` | web | Next.js framework |
| `react@19.0.0` | web | React |
| `react-dom@19.0.0` | web | React DOM |
| `tailwindcss@^3.4.14` | web devDep | CSS utility framework |
| `playwright-core@^1.61.1` | agent | Playwright (already in root) |

---

## Database Schema

### Tables

**`agent_config`** — user schedule configuration
```
user_id (PK, FK auth.users)
refresh_mode: interval | fixed_time | disabled
refresh_interval_hours, refresh_interval_minutes
refresh_time (HH:MM)
refresh_window_enabled, refresh_window_start, refresh_window_end
resume_update_enabled, resume_update_time
naukri_email (nullable)          ← NEVER naukri_password
updated_at
```

**`run_log`** — automation run history
```
id (UUID PK)
user_id (FK auth.users)
task: headline-refresh | resume-upload
success (bool)
message (text)
duration_ms (int)
created_at
```

**`agent_status`** — live agent heartbeat
```
user_id (PK, FK auth.users)
last_seen (timestamptz)
version (text)
chrome_connected (bool)
status: idle | running | chrome-disconnected | otp-required | error | offline
updated_at
```

All tables have Row Level Security enabled. Users can only read/write their own rows.

**Critical constraint: `NAUKRI_PASSWORD` is never stored in any table.**

---

## API Contract (Summary)

| Route | Method | Handler | Description |
|-------|--------|---------|-------------|
| `/api/agent/status` | GET | Next.js → Agent | Agent status (offline-safe) |
| `/api/agent/command` | POST | Next.js → Agent | Queue command (Zod validated) |
| `/api/agent/credentials` | POST | Next.js → Agent | Update credentials (never logged) |
| `/api/agent/resume` | POST | Next.js → Agent | Upload resume PDF to agent FS |
| `/api/agent/logs` | GET | Next.js → Agent | Fetch run log lines |

All routes proxy from Next.js server to the agent's local HTTP server on `127.0.0.1:7842`.  
`AGENT_SECRET` is kept server-side only.

Full specification: [`docs/agent-api.md`](./agent-api.md)

---

## Security Decisions

| Decision | Implementation | Rationale |
|----------|---------------|-----------|
| Password never in Supabase | Agent-only `.credentials.enc` | Machine-bound AES-256-GCM |
| Password transport | Browser→API→Agent HTTP localhost | Localhost-only, AGENT_SECRET authenticated |
| Resume never in cloud | Agent local filesystem | Playwright requires local path |
| AGENT_SECRET | Server env only | Never in browser, never in Supabase |
| Service-role key | Server env only | Bypasses RLS; must stay server-side |
| OTP handling | Manual only (`otp-required` status) | By design — matches existing behavior |

---

## Validation Results

```
✅ pnpm install              — 386 packages installed, exit 0
✅ @naukri-update/shared     — typecheck: exit 0 (0 errors)
✅ @naukri-update/database   — typecheck: exit 0 (0 errors)
✅ @naukri-update/agent      — typecheck: exit 0 (0 errors)
✅ @naukri-update/web        — typecheck: exit 0 (0 errors)
✅ Electron files intact     — main.js, preload.js, config-service.js, etc. unmodified
```

---

## Electron App Preserved

The following files were **NOT modified**:
- `main.js` (38,542 bytes — Electron main process)
- `preload.js` (2,760 bytes — IPC bridge)
- `config.js` (2,640 bytes — config shim)
- `config-service.js` (20,237 bytes — ConfigService singleton)
- `secure-store.js` (6,140 bytes — AES-256-GCM credential store)
- `naukri-profile-refresh.js` (27,919 bytes — Playwright automation)
- `auto-updater-service.js` (7,198 bytes — GitHub Releases updater)
- `scripts/scheduler.js` (7,721 bytes — OS schedule checker)
- All `renderer/` files, `assets/`, `.github/workflows/`

---

## Open Questions / TODOs for Phase 2

1. **Password transport encryption**: The password currently flows over HTTP localhost.
   Evaluate end-to-end encryption using a Supabase session-derived keypair.

2. **Agent authentication**: Phase 1 uses a shared `AGENT_SECRET`. Phase 2 should evaluate
   Supabase-issued JWTs for multi-device support and revocation.

3. **AppData path**: `scripts/setup.js` uses `naukri-update` (lowercase); `config-service.js`
   uses `NaukriUpdate` (PascalCase). The new agent uses `NaukriUpdate` consistently.
   Do not fix `scripts/setup.js` until the Electron app is fully replaced.

4. **Supabase project**: Not yet provisioned. Apply `packages/database/migrations/001_initial_schema.sql`
   to a new Supabase project and populate `.env.local` / agent `.env`.

5. **PWA icons**: `public/icon-192.png` and `public/icon-512.png` not yet generated.
   Create from existing `assets/icon.png`.

6. **`@supabase/ssr`**: Imported but not yet used. Will be needed for Phase 2 Auth
   (server-side session management with Middleware).

---

## Phase 2 Plan

1. **Supabase Auth** — user signup/login with `@supabase/ssr`
2. **Settings page** — full form: schedule config + credentials
3. **Automation port** — `apps/agent/src/automation.ts`: port `naukri-profile-refresh.js`
   logic with injectable `AutomationOptions` instead of module globals
4. **Config port** — `apps/agent/src/config.ts`: full read from `<configDir>/config.json`
   mirroring `config-service.js`
5. **Credential store** — AES-256-GCM read/write in agent (no Electron safeStorage)
6. **Supabase integration** — agent writes `run_log`, reads `agent_config`, heartbeats `agent_status`
7. **Resume upload** — agent receives PDF via HTTP, stores in `<configDir>/resume/`
8. **Logs page** — reads from Supabase `run_log`
9. **Onboarding wizard** — first-run setup flow
10. **OS service** — systemd (Linux), launchd (macOS), Windows Service for persistent agent
11. **Electron removal** — remove `main.js`, `preload.js`, Electron deps after Phase 2 completes
