/**
 * Local HTTP server for the agent.
 *
 * Exposes the Agent ↔ Web API contract on localhost.
 * Authenticated with AGENT_SECRET header.
 *
 * Phase 1: defines routes and validates contract.
 * Phase 2: implements actual command execution.
 *
 * See docs/agent-api.md for the full API specification.
 */

import * as http from 'http';
import type { AgentStatus, ApiResponse } from '@naukri-update/shared';

export interface AgentServerOptions {
  port: number;
  agentSecret: string;
  getStatus: () => AgentStatus;
  handleCommand: (type: string, requestId: string) => Promise<void>;
}

function json<T>(res: http.ServerResponse, status: number, body: T): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function unauthorized(res: http.ServerResponse): void {
  const body: ApiResponse<never> = {
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Missing or invalid AGENT_SECRET.' },
  };
  json(res, 401, body);
}

function notFound(res: http.ServerResponse): void {
  const body: ApiResponse<never> = {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  };
  json(res, 404, body);
}

export function createAgentServer(opts: AgentServerOptions): http.Server {
  const { port, agentSecret, getStatus, handleCommand } = opts;

  const server = http.createServer(async (req, res) => {
    // CORS for local web UI
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Authenticate every request (except OPTIONS)
    if (agentSecret) {
      const providedSecret = req.headers['x-agent-secret'];
      if (providedSecret !== agentSecret) {
        unauthorized(res);
        return;
      }
    } else {
      console.warn('[server] AGENT_SECRET is not set. Agent API is unauthenticated. Set AGENT_SECRET in agent environment.');
    }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // GET /api/agent/status
    if (req.method === 'GET' && url.pathname === '/api/agent/status') {
      const status = getStatus();
      const body: ApiResponse<AgentStatus> = { success: true, data: status };
      json(res, 200, body);
      return;
    }

    // POST /api/agent/command
    if (req.method === 'POST' && url.pathname === '/api/agent/command') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body) as { type?: string; requestId?: string };
          if (!payload.type || !payload.requestId) {
            json(res, 400, {
              success: false,
              error: { code: 'INVALID_PAYLOAD', message: 'type and requestId are required.' },
            });
            return;
          }
          await handleCommand(payload.type, payload.requestId);
          json(res, 202, { success: true, data: { queued: true, requestId: payload.requestId } });
        } catch (err) {
          json(res, 400, {
            success: false,
            error: { code: 'BAD_REQUEST', message: String(err) },
          });
        }
      });
      return;
    }

    // GET /api/agent/logs — Phase 2: stream from local log file
    if (req.method === 'GET' && url.pathname === '/api/agent/logs') {
      json(res, 200, {
        success: true,
        data: {
          lines: [],
          note: 'Log streaming not yet implemented. Phase 2.',
        },
      });
      return;
    }

    // POST /api/agent/credentials — Phase 2: update local credential store
    if (req.method === 'POST' && url.pathname === '/api/agent/credentials') {
      json(res, 200, {
        success: true,
        data: {
          note: 'Credential update not yet implemented. Phase 2.',
        },
      });
      return;
    }

    // POST /api/agent/resume — Phase 2: receive and store resume PDF
    if (req.method === 'POST' && url.pathname === '/api/agent/resume') {
      json(res, 200, {
        success: true,
        data: {
          note: 'Resume upload not yet implemented. Phase 2.',
        },
      });
      return;
    }

    notFound(res);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[server] Agent API listening on http://127.0.0.1:${port}`);
  });

  return server;
}
