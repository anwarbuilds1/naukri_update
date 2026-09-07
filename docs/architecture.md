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
                │ Supabase │ Agent Proxy
                │ Client   │ (HTTP localhost)
                ▼         ▼
     ┌──────────────┐  ┌────────────────────────────────────┐
     │   Supabase   │  │   Local Node Agent  (apps/agent)   │
     │              │  │                                    │
     │  PostgreSQL  │  │  main.ts  →  poll loop             │
     │  Auth        │  │  scheduler.ts  →  getDueTasks()    │
     │  Realtime*   │  │  chrome.ts  →  CDP management      │
     └──────────────┘  │  automation.ts  →  Playwright      │
                       │  reporter.ts  →  log + Supabase    │
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

* Realtime is optional, planned for Phase 2
```

## Component Ownership

### Web (`apps/web`)
**Owns**: UI, API proxy routes, application/business logic  
**Does NOT own**: automation, Chrome, credentials, resume files, Naukri session

- Next.js 15 PWA (installable)
- React 19 + Tailwind CSS
- Six pages: Dashboard, Settings, Resume, Logs, Guide, Onboarding
- Five API routes that proxy to the local agent or query Supabase
- Supabase client (anon key in browser; service-role key server-only)

### Supabase
**Owns**: Auth, PostgreSQL, optional Realtime  
**Does NOT own**: NAUKRI_PASSWORD, resume files, Chrome sessions, automation logic

| Table | Writer | Reader |
|-------|--------|--------|
| `agent_config` | Web (user edits settings) | Agent (reads schedule) |
| `run_log` | Agent (after each run) | Web (logs page) |
| `agent_status` | Agent (heartbeat) | Web (dashboard) |

**Critical constraint**: `NAUKRI_PASSWORD` is **never** stored in Supabase.

### Agent (`apps/agent`)
**Owns**: Chrome lifecycle, Playwright automation, local credentials, resume PDF, scheduling decisions  
**Does NOT own**: UI, user authentication, Supabase schema design

- Node.js 20+ + TypeScript
- Persistent poll loop (every 60 seconds)
- Local HTTP server on `127.0.0.1:7842`
- AES-256-GCM credential store (machine-bound key)
- Reads schedule config from Supabase `agent_config` (Phase 2)
- Writes run results to Supabase `run_log` (Phase 2)

## Security Boundaries

| Data | Location | Transport | Rationale |
|------|----------|-----------|-----------|
| `NAUKRI_PASSWORD` | Agent local `.credentials.enc` | Browser → Next.js API → Agent HTTP (localhost) | Never in Supabase; machine-bound AES-256-GCM |
| `NAUKRI_EMAIL` | Supabase `agent_config` | Normal API | Non-sensitive |
| Resume PDF | Agent `<configDir>/resume/` | Browser → Next.js API → Agent HTTP (localhost) | Playwright requires local filesystem path |
| Chrome session | Agent `.naukri-chrome-profile/` | Never transmitted | Chrome cookies cannot be cloud-managed |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server env only | Never transmitted | Bypasses RLS; must stay server-side |
| `AGENT_SECRET` | Agent + Next.js server env | Never in browser | Authenticates web→agent requests |

## Data Flows

### Credential Update
```
Browser
  → POST /api/agent/credentials (Next.js API)
      [validates email format]
      → POST http://127.0.0.1:7842/api/agent/credentials
          [agent writes to .credentials.enc]
          [agent returns { updated: true }]
      [password NEVER logged, NEVER sent to Supabase]
```

### Scheduled Automation Run
```
Agent poll loop (every 60s)
  → getDueTasks(scheduleConfig, taskState)
  → if tasks due:
      → ensureChromeRunning()  [CDP check → spawn Chrome if needed]
      → runTask(task, options)
          → chromium.connectOverCDP('http://127.0.0.1:9222')
          → updateAndVerifyHeadline()  OR  uploadAndVerifyResume()
      → reporter.report(result)
          → local agent-run.log
          → POST Supabase run_log  [Phase 2]
```

### Manual Trigger from Web
```
Browser
  → POST /api/agent/command  { type: 'trigger-refresh', requestId: uuid }
      → Next.js validates with AgentCommandSchema (Zod)
      → POST http://127.0.0.1:7842/api/agent/command
          → agent queues task (setImmediate)
          → returns { queued: true }
  Browser polls GET /api/agent/status to observe state change
```

## Agent ↔ Web API Contract

See [`agent-api.md`](./agent-api.md) for the full API specification.

## Current State (Phase 1)

The existing Electron app at the repository root is the **production baseline**.
All automation runs through it. The Phase 1 foundation:

- ✅ Monorepo structure (pnpm workspaces + Turborepo)
- ✅ `packages/shared` — TypeScript types + Zod validation
- ✅ `packages/database` — Supabase schema SQL + TypeScript stubs
- ✅ `apps/agent` — Node.js/TypeScript agent skeleton (stub automation)
- ✅ `apps/web` — Next.js 15 PWA skeleton (placeholder pages)
- ✅ Security boundaries documented and enforced
- ⏳ Phase 2: Full automation migration, Supabase integration, Settings UI

## What Phase 2 Must Implement

1. Port `naukri-profile-refresh.js` → `apps/agent/src/automation.ts` with injectable config
2. Port `config-service.js` credential store → `apps/agent/src/config.ts`
3. Read schedule config from Supabase `agent_config`
4. Write run results to Supabase `run_log`
5. Agent heartbeat → Supabase `agent_status`
6. Settings page — full form to save schedule + credentials
7. Resume page — file upload to agent
8. Logs page — read from Supabase `run_log`
9. Supabase Auth — user login/signup
10. Onboarding wizard — first-run setup flow
