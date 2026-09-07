# Phase 3 Implementation Summary: Supabase Integration & Web ↔ Agent Control Plane

**Date**: September 7, 2026  
**Status**: Completed  
**Packages Verified**: `@naukri-update/shared`, `@naukri-update/database`, `@naukri-update/agent`, `@naukri-update/web`  
**Test Suite**: 42/42 tests passing (100% green)

---

## 1. Architecture Overview

Phase 3 establishes the end-to-end communication and control plane across:
1. **User Browser**: Next.js PWA with Supabase SSR authentication, responsive status dashboard, settings management, and resume upload.
2. **Next.js Web API (`apps/web`)**: The secure control plane gateway. Handles authentication, RLS enforcement, command state machine tracking with idempotency, and proxying to the local agent.
3. **Supabase**: PostgreSQL database providing user management, configuration persistence, and execution run history.
4. **Local Agent (`apps/agent`)**: Node.js service running on `http://127.0.0.1:7842`. Manages Chrome CDP, Playwright automation, local resume files, and machine-bound AES-256-GCM credentials.

---

## 2. Security Boundaries & Constraints Preserved

- **No `SUPABASE_SERVICE_ROLE_KEY` in the agent**: The local agent never receives elevated database credentials. It communicates exclusively with Next.js API endpoints (`/api/agent/report`, `/api/agent/schedule`) authenticated via `X-Agent-Secret`.
- **Server-Derived Identity**: Endpoints that write to Supabase derive `user_id` server-side from the authenticated session or authoritative single-user mapping. No agent-supplied `user_id` is trusted.
- **No Password in Supabase**: `NAUKRI_PASSWORD` is never written to PostgreSQL or Supabase. It is stored exclusively on the agent machine encrypted with AES-256-GCM using machine-derived cryptographic keys.
- **No Resume Files in Supabase Storage**: Resume PDFs are validated (5MB limit, `%PDF` magic bytes, `.pdf` extension) and streamed directly to the agent's local filesystem where Playwright accesses it.
- **Electron Baseline Untouched**: All existing Electron files (`main.js`, `naukri-profile-refresh.js`, `config-service.js`, `renderer/`) remain 100% intact.
- **Next.js Version**: Locked at `15.3.4` with React `19.0.0`.

---

## 3. Detailed Component Implementations

### A. Shared Package (`packages/shared`)
- **Command Status & Lifecycle**: Added `CommandStatus` type (`queued`, `dispatched`, `running`, `succeeded`, `failed`, `cancelled`).
- **State Machine Validator**: Implemented `isValidCommandTransition()` enforcing legal transitions:
  - `queued` → `dispatched`
  - `dispatched` → `running`
  - `running` → `succeeded`
  - `dispatched` / `running` → `failed`
  - `failed` → `queued` (retry)
  - `queued` → `cancelled`
- **Centralized Availability**: Implemented `getAgentAvailability()` with `AGENT_HEARTBEAT_STALE_MS = 90_000` (90s stale threshold).

### B. Database Package (`packages/database`)
- **Migration `002_agent_commands.sql`**:
  - Created `public.agent_commands` table with primary key `request_id`, foreign key to `auth.users(id)`, status check constraints, and `updated_at` trigger.
  - Enabled RLS with policies for authenticated users (`auth.uid() = user_id`).
- **Database Schema & Types**: Updated `schema.sql` and `types.ts` with Supabase-compatible table types and relationships.

### C. Agent Implementation (`apps/agent`)
- **Gateway Client (`src/gateway.ts`)**: Local client communicating with Next.js server (`/api/agent/report`, `/api/agent/schedule`) using `X-Agent-Secret`.
- **Reporter (`src/reporter.ts`)**: Reports automation outcomes (`headline-refresh`, `resume-upload`) directly to the Next.js gateway for Supabase logging without direct database access.
- **Main Daemon (`src/main.ts`)**: Periodically syncs schedule from Supabase via Next.js gateway, sends regular heartbeats, and broadcasts state changes.
- **Unit Tests (`src/phase3.test.ts`)**: 14 new tests covering availability logic, state machine validation, schedule configuration mapping, credential isolation, and resume upload validation rules.

### D. Web Application (`apps/web`)
- **Supabase SSR Clients**:
  - `lib/supabase/client.ts`: Browser client using `createBrowserClient` with public anon key.
  - `lib/supabase/server.ts`: Server client using `createServerClient` with cookies for route handlers and Server Components.
  - `middleware.ts`: Refreshing session tokens and protecting routes (`/dashboard`, `/settings`, `/resume`, `/logs`).
- **Agent Client Gateway (`lib/agent-client.ts`)**: Configurable HTTP client with `SharedSecretAuthProvider` for secure localhost communication with the agent.
- **Web API Routes**:
  - `GET /api/agent/status`: Live status observation with Supabase fallback using `getAgentAvailability`.
  - `POST /api/agent/command`: Idempotent command registration in `agent_commands` with state machine transition checks.
  - `POST /api/agent/credentials`: Email persistence in Supabase `agent_config`; password dispatched directly to agent `.credentials.enc`.
  - `POST /api/agent/resume`: PDF validation (size, magic bytes) and direct streaming to agent.
  - `GET /api/agent/logs`: RLS-secured query against Supabase `run_log` with local agent fallback.
  - `POST /api/agent/report`: Gateway endpoint for agent heartbeats and run reports.
  - `GET /api/agent/schedule`: Authoritative schedule delivery for agent synchronization.
- **UI Components**:
  - `SettingsPage`: Full schedule configuration, Zod validation, and secure credential handling.
  - `AgentStatusCard`: Real-time status polling with OTP/CAPTCHA high-visibility action banner.
  - `AutomationStatusCard`: History list populated from Supabase `run_log`.
  - `LogsPage`: Filterable log view (`all`, `headline-refresh`, `resume-upload`).
  - `ResumePage`: Direct resume upload to local agent with status feedback.
  - `AppSidebar`: Authentication status, active user email, and sign out button.

---

## 4. Verification & Test Results

```bash
$ pnpm typecheck && pnpm test
✔ Shared URL and Profile Validators (4.8ms)
✔ Filename Sanitization and Duplicate Detection (3.7ms)
✔ Resume File Discovery and Validation (1009.6ms)
✔ Schedule and Task Mapping (2.3ms)
✔ AES-256-GCM Secure Credential Storage (196.7ms)
✔ Automation Lock Mechanism (1.2ms)
✔ Phase 3: Centralized Agent Availability and Stale Threshold (4.4ms)
✔ Phase 3: Command State Machine Transitions (1.9ms)
✔ Phase 3: Schedule Configuration Mapping (1.9ms)
✔ Phase 3: Credential Safety & Database Isolation (0.5ms)
✔ Phase 3: Resume Upload Validation Rules (2.1ms)

ℹ tests 42
ℹ suites 11
ℹ pass 42
ℹ fail 0

$ pnpm --filter @naukri-update/web build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (20/20)
✓ Finalizing page optimization
```

All 42 unit tests pass and all Next.js routes compile and build without errors or warnings.
