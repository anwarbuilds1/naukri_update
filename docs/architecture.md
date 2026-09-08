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
**Owns**: User Auth, PostgreSQL persistent data (`agent_config`, `run_log`, `agent_status`, `agent_commands`)  
**Does NOT own**: `NAUKRI_PASSWORD`, resume PDF files, Chrome sessions, automation Playwright execution

| Table | Writer | Reader | Security |
|-------|--------|--------|----------|
| `agent_config` | Web (user settings) | Agent via Next.js `/api/agent/schedule` | RLS (`auth.uid() = user_id`) |
| `run_log` | Web `/api/agent/report` | Web (logs page & dashboard) | RLS (`auth.uid() = user_id`) |
| `agent_status` | Web `/api/agent/report` | Web `/api/agent/status` | RLS (`auth.uid() = user_id`) |
| `agent_commands` | Web `/api/agent/command` | Web `/api/agent/command` | RLS (`auth.uid() = user_id`) |

**Critical security rules**:
- `NAUKRI_PASSWORD` is **never** stored in Supabase.
- Resume PDFs are **never** stored in Supabase Storage (Playwright requires local disk access).
- `SUPABASE_SERVICE_ROLE_KEY` is **never** given to the local agent. Next.js API is the sole control plane gateway.

### Agent (`apps/agent`)
**Owns**: Chrome lifecycle, Playwright automation, local AES-256-GCM credentials, resume PDF, scheduling execution  
**Does NOT own**: UI, user authentication, Supabase schema or direct Supabase credentials

- Node.js 20+ + TypeScript
- Persistent poll loop (every 60 seconds) with schedule synchronization from `/api/agent/schedule`
- Local HTTP server on `127.0.0.1:7842` authenticated with `X-Agent-Secret`
- Machine-bound credential store (`.credentials.enc`)
- Reports run results and heartbeats to Next.js gateway (`POST /api/agent/report`)

---

## Security Boundaries

| Data | Location | Transport | Rationale |
|------|----------|-----------|-----------|
| `NAUKRI_PASSWORD` | Agent local `.credentials.enc` | Browser → Next.js API → Agent HTTP (localhost) | Never in Supabase; machine-bound AES-256-GCM |
| `NAUKRI_EMAIL` | Supabase `agent_config` | Normal API | Non-sensitive; tied to user account |
| Resume PDF | Agent `<configDir>/resume/` | Browser → Next.js API → Agent HTTP (localhost) | Validated (5MB, %PDF header); Playwright needs local file |
| Chrome session | Agent `.naukri-chrome-profile/` | Never transmitted | Chrome cookies cannot be cloud-managed |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server env only | Never transmitted | Kept strictly on server gateway; not in agent |
| `AGENT_SECRET` | Agent + Next.js server env | Localhost HTTP header (`X-Agent-Secret`) | Authenticates web ↔ agent requests |

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

The legacy Electron application was permanently retired in Phase 7F following full validation of all 10 Phase 7E criteria.
The complete, working legacy baseline is tagged at:
- **Git Tag**: `v1.0-electron-baseline`
- **Commit**: `55b7bef0702c8c77c05720cded4a54304ecbb1e8`
- **Restoration Guide**: Refer to [`docs/rollback.md`](./rollback.md) for instructions on checking out and launching the legacy Electron desktop application.

