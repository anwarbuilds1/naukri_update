# Agent ↔ Web API Contract

The local Node.js agent exposes an HTTP API on `http://127.0.0.1:7842` (localhost only).  
The Next.js app proxies all agent communication server-side — the browser never
contacts the agent directly and never sees `AGENT_SECRET`.

In Phase 3, the Next.js API acts as the secure gateway connecting the local agent to Supabase.

## Authentication

Every request between the Next.js server and the agent requires:

```
X-Agent-Secret: <AGENT_SECRET>
```

`AGENT_SECRET` is a shared symmetric secret configured via environment variable on both sides.

**Rules:**
- `AGENT_SECRET` must never appear in browser code or `NEXT_PUBLIC_` variables.
- `AGENT_SECRET` must never be committed to the repository.
- `AGENT_SECRET` must never be sent to or stored in Supabase.
- If `AGENT_SECRET` is unset, the agent logs a warning and runs unauthenticated (development only).

---

## Error Format

All endpoints return JSON conforming to `ApiResponse<T>`:

```typescript
// Success
{ "success": true,  "data": <T> }

// Error
{ "success": false, "error": { "code": string, "message": string, "details"?: unknown } }
```

**Standard error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid `X-Agent-Secret` or missing user session |
| `VALIDATION_ERROR` | 400 | Request body failed Zod schema validation |
| `INVALID_TRANSITION` | 409 | Command state machine transition disallowed |
| `NOT_FOUND` | 404 | Route does not exist |
| `BUSY` | 409 | Agent is already running an automation task |
| `AGENT_UNREACHABLE` | 503 | Agent HTTP server is offline (returned by Next.js proxy) |
| `AGENT_ERROR` | 5xx | Agent returned an unexpected error |

---

## Web Endpoints (Browser → Next.js API)

### `GET /api/agent/status`
Observes live agent state (`http://127.0.0.1:7842/api/agent/status`) and falls back to persisted Supabase `agent_status` if the agent is unreachable. Evaluates availability using `getAgentAvailability(lastSeenMs, nowMs, rawStatus)` with a 90s stale threshold.

### `POST /api/agent/command`
Enforces Supabase session authentication, Zod schema validation, atomic database idempotency on `request_id` (`agent_commands` table), and state machine lifecycle transitions (`queued` → `dispatched` → `running` → `succeeded`/`failed`).

### `POST /api/agent/credentials`
Saves non-sensitive `naukriEmail` to Supabase `agent_config` under the authenticated user. Streams `naukriPassword` directly to the local agent (`.credentials.enc` with AES-256-GCM). NEVER logs or stores the password in Supabase.

### `POST /api/agent/resume`
Validates PDF headers (`%PDF`), `.pdf` extension, and 5MB size limit. Streams the resume directly to the local agent's resume directory. NEVER stores resumes in Supabase Storage.

### `GET /api/agent/logs`
Queries historical automation runs from Supabase `run_log` with Row Level Security (`user_id = auth.uid()`), falling back to the local agent log file if offline.

---

## Agent Gateway Endpoints (Agent → Next.js API)

### `POST /api/agent/report`
Called by the local agent to report heartbeats and execution run results. Authenticated via `X-Agent-Secret`. The server derives `user_id` server-side (never trusts agent-supplied user_id) and writes to `agent_status` and `run_log`.

### `GET /api/agent/schedule`
Called by the local agent to fetch the authoritative schedule configuration from Supabase `agent_config`. Authenticated via `X-Agent-Secret`.

---

## Agent HTTP Endpoints (Next.js API → Agent :7842)

- `GET /api/agent/status` — Returns live memory status, Chrome CDP state, and last run timestamps.
- `POST /api/agent/command` — Receives `AgentCommand` with idempotency token `requestId`.
- `POST /api/agent/credentials` — Receives and encrypts Naukri credentials to `.credentials.enc`.
- `POST /api/agent/resume` — Receives and stores sanitized resume file.
- `GET /api/agent/logs` — Returns recent log lines from local `agent-run.log`.
