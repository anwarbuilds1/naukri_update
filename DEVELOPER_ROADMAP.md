# Naukri Update: Developer Roadmap & System Status

Welcome to the developer documentation and implementation roadmap for **Naukri Update**.

---

## 1. High-Level Architecture

The system operates as a local-first distributed architecture:

```
Browser
  ↓
Next.js PWA (apps/web)
  ↓
Next.js API Routes (apps/web/app/api)
  ↓
Local Node.js Agent at 127.0.0.1:7842 (apps/agent)
  ↓
Chrome CDP at 127.0.0.1:9222
  ↓
Naukri.com
```

### Architectural Principles & Boundaries
- **Supabase Control Plane:** Supabase (PostgreSQL + Auth) acts as the persistent control plane, user database, and RLS security boundary.
- **Next.js Gateway:** The browser PWA (`apps/web`) communicates strictly with the Next.js API routes (`/api/agent/*`). The browser **never** communicates directly with the local Agent process.
- **Local Agent Boundary:** The Agent daemon (`apps/agent`) runs locally on `127.0.0.1:7842` authenticated with `X-Agent-Secret`. The Agent does **not** directly access Supabase or hold Supabase service-role keys. Next.js server acts as the gateway between PWA and Agent.

---

## 2. Master 11-Phase Roadmap Status

| Phase | Phase Name | Status | Description |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Architecture & cleanup | **COMPLETED** | Initial codebase audit, monorepo RFCs, clean isolation of legacy components. |
| **Phase 1** | Monorepo + Next.js PWA foundation | **COMPLETED** | `pnpm` workspace setup (`apps/web`, `apps/agent`, `packages/shared`, `packages/database`), Next.js 15.3.4 PWA framework. |
| **Phase 2** | Supabase + Database + Auth | **COMPLETED** | Supabase Auth integration, SSR cookie client (`@supabase/ssr`), migrations (`001_initial_schema.sql`, `002_agent_commands.sql`), RLS security policies. |
| **Phase 3** | Next.js API | **COMPLETED** | Server-side gateway routes (`/api/agent/status`, `/api/agent/command`, `/api/agent/report`, `/api/agent/schedule`, `/api/agent/logs`, `/api/agent/credentials`, `/api/agent/resume`, `/api/agent/diagnostics`). |
| **Phase 4** | Extract Local Node Agent | **COMPLETED** | Standalone Node.js Agent daemon (`apps/agent`), Playwright automator, Chrome CDP engine, local machine-bound AES-256-GCM credential store. |
| **Phase 5** | Connect Agent ↔ API | **COMPLETED** | Authenticated localhost HTTP bridge on `127.0.0.1:7842` with `X-Agent-Secret`, secret synchronization (`~/.config/NaukriUpdate/agent.env`), heartbeat reporting. |
| **Phase 6** | Scheduling & Automation | **COMPLETED** | Schedule synchronization from `/api/agent/schedule`, interval/fixed-time task execution, state commitment, `naukri-agent.service` systemd unit installation. |
| **Phase 7** | Dashboard + Logs + Diagnostics | **COMPLETED** | Next.js PWA Dashboard UI (`AgentStatusCard`), live status polling, structured execution logs view, system diagnostics route. |
| **Phase 8** | PWA + Installation UX | **IN PROGRESS** | **CURRENT STAGE:** Final Phase 8 verification and end-to-end installation/runtime validation. |
| **Phase 9** | Security + Reliability | **COMPLETED** | Machine-bound AES-256-GCM encryption, strict RLS enforcement, single-agent file lock, process failure recovery. |
| **Phase 10** | Remove Electron + Release | **COMPLETED** | Electron framework retired. Legacy baseline immutably tagged at `v1.0-electron-baseline`. |

> **Roadmap Note:** Phases 0 through 7, Phase 9, and Phase 10 are completed. Phase 8 is the single active remaining phase, currently undergoing final verification.

---

## 3. Current System Verification Matrix

```
Next.js PWA                 PASS
Supabase/Auth               PASS
Next.js -> Agent             PASS
Agent heartbeat             PASS
Agent daemon/service         PASS
Agent persistence/reboot     PASS
Agent lock                   PASS
Agent -> Chrome CDP           CURRENT ISSUE
Chrome CDP :9222             DISCONNECTED
Naukri automation            Previously validated, currently blocked by Chrome/CDP
Electron retirement         COMPLETE
```

### Detailed Status Breakdown

#### VERIFIED
- **Next.js PWA & Auth:** Supabase Auth login, session cookies, dashboard UI, settings management, and all API gateway routes (`/api/agent/*`) are 100% operational.
- **Next.js ↔ Agent Connectivity:** Secret synchronization between `~/.config/NaukriUpdate/agent.env` and `apps/web/.env.local` is verified. Next.js API routes successfully authenticate with local Agent on `127.0.0.1:7842`.
- **Agent Service Daemon:** `naukri-agent.service` systemd user service is active (running), survives reboots, maintains persistent identity (`agentId: 239de3e1-6360-4a1d-a2b8-838de5480178`), enforces single-agent lock, and reports live heartbeats (`Last Heartbeat: Just now`, `Version: v0.1.0`).
- **Automation Engine Logic:** Previous automation runs were validated and succeeded: headline refresh updated headline text on Naukri.com, resume upload succeeded with dynamic date-stamping, duplicate upload protection passed, and DOM verification succeeded.
- **Electron Retirement:** Electron dependency has been fully removed from the active stack.

#### CURRENTLY BLOCKED
- **Chrome CDP Connection (127.0.0.1:9222):** The dashboard currently displays **Chrome CDP Disconnected**. Recent manual and scheduled automation attempts report:
  > `"Naukri Chrome is not running and could not be started. CDP endpoint unavailable at http://127.0.0.1:9222."`
  *Note:* The local Agent service itself is healthy and communicating with Next.js; the current failure is strictly isolated to Chrome/CDP availability at port 9222.

#### UNKNOWN / NOT YET VERIFIED
- **Multi-Month Long-Term Unattended Stability:** Needs continuous multi-month observation across OS sleep/wake cycles and network disruptions once Chrome CDP connection is resolved.
- **Future Naukri DOM Changes:** Naukri.com frontend layout updates could occur outside the project's control.

---

## 4. Test & Build Status

- **Unit Test Suite:** `93/93` tests passing (100% green across 36 test suites).
- **TypeScript:** `0 errors` across all workspace packages (`@naukri-update/web`, `@naukri-update/agent`, `@naukri-update/shared`, `@naukri-update/database`).
- **Framework Versions:** Next.js `15.3.4`, React `19.0.0`, Node.js `v20+`.
- **Production Build:**
  - `apps/web`: Next.js production build compiled successfully (21/21 routes).
  - `apps/agent`: Agent TypeScript build compiled successfully to `apps/agent/dist`.

---

## 5. Legacy Electron Baseline & Rollback Reference

The legacy Electron application was permanently retired in Phase 10 following full migration verification.
- **Git Baseline Tag:** `v1.0-electron-baseline`
- **Baseline Commit:** `55b7bef0702c8c77c05720cded4a54304ecbb1e8`
- **Rollback Instructions:** Refer to [`docs/rollback.md`](docs/rollback.md) for checkout and execution instructions.

---

## 6. Next Step

- **Immediate Task:** Diagnose why Chrome/CDP on `127.0.0.1:9222` is unavailable and resolve the Chrome launcher / CDP connection state so automation tasks can resume execution.
