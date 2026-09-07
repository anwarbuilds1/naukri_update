# Agent ↔ Web API Contract

The local Node.js agent exposes an HTTP API on `http://127.0.0.1:7842` (localhost only).  
The Next.js app proxies all agent communication server-side — the browser never
contacts the agent directly and never sees `AGENT_SECRET`.

## Authentication

Every request from the Next.js server to the agent requires:

```
X-Agent-Secret: <AGENT_SECRET>
```

`AGENT_SECRET` is a shared symmetric secret configured via environment variable on both sides.

**Rules:**
- `AGENT_SECRET` must never appear in browser code or `NEXT_PUBLIC_` variables.
- `AGENT_SECRET` must never be committed to the repository.
- `AGENT_SECRET` must never be sent to or stored in Supabase.
- If `AGENT_SECRET` is unset, the agent logs a warning and runs unauthenticated (development only).

**Generate a secret:**
```bash
openssl rand -hex 32
```

## Error Format

All endpoints return JSON:

```typescript
// Success
{ "success": true,  "data": <T> }

// Error
{ "success": false, "error": { "code": string, "message": string, "details"?: unknown } }
```

**Standard error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid `X-Agent-Secret` |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `INVALID_PAYLOAD` | 400 | Required field missing or wrong type |
| `NOT_FOUND` | 404 | Route does not exist |
| `BUSY` | 409 | Agent is already running a task |
| `AGENT_UNREACHABLE` | 503 | Agent HTTP server is offline (returned by Next.js proxy) |
| `AGENT_ERROR` | 5xx | Agent returned an unexpected status |

---

## Endpoints

### `GET /api/agent/status`

Returns the current agent status. Poll this after sending commands to observe state changes.

**Response `200 OK`:**
```typescript
{
  success: true,
  data: {
    status: 'idle'
           | 'running'
           | 'chrome-disconnected'
           | 'otp-required'
           | 'error'
           | 'offline',
    version: string,               // e.g. "0.1.0"
    chromeConnected: boolean,
    lastSeen: number,              // Unix ms (0 when offline)
    lastRefreshTime?: number,      // Unix ms; absent if task never ran
    lastResumeUploadTime?: number, // Unix ms; absent if task never ran
    currentTask?: 'headline-refresh' | 'resume-upload'
  }
}
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `idle` | Agent running, no task executing |
| `running` | Automation task in progress |
| `chrome-disconnected` | Agent running, Chrome CDP not available |
| `otp-required` | Naukri requires OTP/CAPTCHA — manual action needed |
| `error` | Last run failed; see `run_log` for details |
| `offline` | Agent process is not running (returned by proxy) |

**Error codes:** `UNAUTHORIZED` (401)

---

### `POST /api/agent/command`

Queues a command for the agent. Fire-and-forget — poll `/api/agent/status` to observe changes.

**Request body:**
```typescript
{
  type: 'trigger-refresh'       // run headline refresh now
       | 'trigger-resume-upload' // run resume upload now
       | 'connect-chrome'        // ensure Chrome is running
       | 'disconnect-chrome'     // kill Chrome process
       | 'reset-browser-profile' // delete Chrome profile (logs out)
       | 'pause'                 // pause scheduled automation
       | 'resume',               // resume scheduled automation
  requestId: string,  // UUID v4 — caller-generated for idempotency
  issuedAt: number    // Unix ms
}
```

**Response `202 Accepted`:**
```typescript
{
  success: true,
  data: {
    queued: true,
    requestId: string  // echoed back
  }
}
```

**Error codes:** `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400), `BUSY` (409)

**Note:** `connect-chrome`, `disconnect-chrome`, and `reset-browser-profile` are not yet
implemented in Phase 1. The agent returns a warning log; implementation is in Phase 2.

---

### `POST /api/agent/credentials`

Update Naukri credentials on the agent's local credential store.

> **SECURITY**: The password flows:
> `Browser → HTTPS → Next.js API (server) → HTTP localhost → Agent`  
> It is **never** stored in Supabase and **never** logged anywhere.  
> The agent stores it in `<configDir>/.credentials.enc` (AES-256-GCM, machine-bound key).

**Request body:**
```typescript
{
  naukriEmail: string,    // also persisted in Supabase agent_config (non-sensitive)
  naukriPassword: string  // stored ONLY in agent local credential store
}
```

**Response `200 OK`:**
```typescript
{
  success: true,
  data: { updated: true }
}
```

**Error codes:** `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400)

---

### `POST /api/agent/resume`

Upload a resume PDF to the agent's local resume directory.

> **RATIONALE**: Resume must be physically present on the machine running Chrome.
> Playwright's `fileInput.setInputFiles()` requires a local filesystem path.
> Therefore, resume files are **not** stored in Supabase Storage.

**Request:** `multipart/form-data` with field `file` (PDF only, max 5 MB)  
or `application/octet-stream` with raw PDF bytes.

**Response `200 OK`:**
```typescript
{
  success: true,
  data: {
    filename: string,  // stored filename (e.g. "resume_07-09-2026.pdf")
    sizeBytes: number
  }
}
```

**Error codes:** `UNAUTHORIZED` (401), `INVALID_CONTENT_TYPE` (400), `FILE_TOO_LARGE` (413)

**Note:** Not yet implemented in Phase 1. Agent returns a stub response. Implementation is in Phase 2.

---

### `GET /api/agent/logs`

Returns recent run log entries from the agent.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max log lines to return |
| `task` | string | — | Filter: `headline-refresh` or `resume-upload` |

**Response `200 OK`:**
```typescript
{
  success: true,
  data: {
    lines: Array<{
      task: 'headline-refresh' | 'resume-upload',
      success: boolean,
      message: string,
      durationMs: number,
      timestamp: number,  // Unix ms
      iso: string         // ISO 8601
    }>
  }
}
```

**Error codes:** `UNAUTHORIZED` (401)

**Note:** Phase 2 will also query Supabase `run_log` for persistent history.

---

## Design Decisions

### Password Transport (Phase 1)

The Naukri password flows through three hops:

1. **Browser → Next.js API** — HTTPS (encrypted in transit)
2. **Next.js API → Agent** — HTTP localhost (no external exposure; AGENT_SECRET authenticated)
3. **Agent → `.credentials.enc`** — AES-256-GCM with machine-bound key (at rest)

This is acceptable for Phase 1 because:
- Step 2 is localhost-only (not reachable from outside the machine)
- `AGENT_SECRET` authenticates the proxy
- The password is never logged or stored in Supabase

**TODO (Phase 2):** Evaluate end-to-end encryption using a keypair derived from the user's
Supabase session to protect the password even on the localhost hop.

### Agent Authentication (Phase 1)

Pre-shared symmetric secret (`AGENT_SECRET`). Simple and effective for a single-user setup.

**TODO (Phase 2):** Replace with a per-device JWT issued by Supabase Auth, enabling
multi-user support and token revocation.

### OTP / CAPTCHA

When Naukri requires OTP, the agent sets `status: 'otp-required'`.
The web UI should poll `/api/agent/status` every 10 seconds and show an alert
prompting the user to complete the OTP in the Chrome window.

The agent waits up to 120 seconds for the user to complete OTP before timing out.
No automated OTP handling is implemented (by design).

### Offline Behavior

If the agent is unreachable:
- Next.js API routes return `{ success: true, data: { status: 'offline', ... } }` for status
- Command routes return `503 AGENT_UNREACHABLE`
- The web UI must handle `status: 'offline'` gracefully and not display stale data as current
