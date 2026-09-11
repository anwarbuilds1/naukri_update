/**
 * Local HTTP server for the agent.
 *
 * Exposes the Agent ↔ Web API contract on localhost.
 * Authenticated with AGENT_SECRET header.
 *
 * See docs/agent-api.md for the full API specification.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { AgentStatus, ApiResponse, DiagnosticsResult, ResumeInfo } from '@naukri-update/shared';
import { cleanupStaleResumes, reconcileResumeCache, sanitizeFilename } from './automation.js';
import { checkCDPAvailable, findChromeExecutable } from './chrome.js';
import { getDefaultConfigDir, readEncryptedPassword, saveEncryptedPassword } from './config.js';
import { loadTaskState } from './state.js';

export interface AgentServerOptions {
  port: number;
  agentSecret: string;
  configDir?: string;
  getStatus: () => AgentStatus;
  handleCommand: (type: string, requestId: string) => Promise<void>;
  isBusy?: () => boolean;
  isDraining?: () => boolean;
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
  const configDir = opts.configDir ?? getDefaultConfigDir();

  const server = http.createServer(async (req, res) => {
    // CORS for local web UI
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Ensure request comes from loopback address
    const remoteIp = req.socket.remoteAddress;
    if (remoteIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteIp)) {
      json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Agent API is only accessible from localhost.' },
      });
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
      req.on('data', (chunk) => {
        body += chunk;
      });
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

          if (opts.isDraining?.()) {
            json(res, 503, {
              success: false,
              error: { code: 'AGENT_DRAINING', message: 'Agent daemon is currently shutting down.' },
            });
            return;
          }

          if (
            opts.isBusy?.() &&
            (payload.type === 'trigger-refresh' || payload.type === 'trigger-resume-upload')
          ) {
            json(res, 409, {
              success: false,
              error: { code: 'BUSY', message: 'Agent is already executing an automation task.' },
            });
            return;
          }

          await handleCommand(payload.type, payload.requestId);
          json(res, 202, { success: true, data: { queued: true, requestId: payload.requestId } });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          json(res, 400, {
            success: false,
            error: { code: 'BAD_REQUEST', message: msg },
          });
        }
      });
      return;
    }

    // GET /api/agent/logs
    if (req.method === 'GET' && url.pathname === '/api/agent/logs') {
      const logFile = path.join(configDir, 'agent-run.log');
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const lines: unknown[] = [];

      if (fs.existsSync(logFile)) {
        try {
          const raw = fs.readFileSync(logFile, 'utf8');
          const allLines = raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          const sliced = allLines.slice(-limit);
          for (const line of sliced) {
            try {
              lines.push(JSON.parse(line));
            } catch {
              lines.push({ message: line });
            }
          }
        } catch {
          // ignore read errors
        }
      }

      json(res, 200, {
        success: true,
        data: { lines },
      });
      return;
    }

    // POST /api/agent/credentials — updates local encrypted credentials
    if (req.method === 'POST' && url.pathname === '/api/agent/credentials') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as { naukriEmail?: string; naukriPassword?: string; clear?: boolean };
          const credPath = path.join(configDir, '.credentials.enc');
          if (payload.clear) {
            if (fs.existsSync(credPath)) {
              fs.unlinkSync(credPath);
            }
          } else if (payload.naukriPassword) {
            saveEncryptedPassword(credPath, payload.naukriPassword);
          }
          json(res, 200, {
            success: true,
            data: { updated: true },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          json(res, 400, {
            success: false,
            error: { code: 'BAD_REQUEST', message: msg },
          });
        }
      });
      return;
    }

    // DELETE /api/agent/credentials — clears stored encrypted credentials
    if (req.method === 'DELETE' && url.pathname === '/api/agent/credentials') {
      const credPath = path.join(configDir, '.credentials.enc');
      if (fs.existsSync(credPath)) {
        try {
          fs.unlinkSync(credPath);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          json(res, 500, {
            success: false,
            error: { code: 'CREDENTIALS_DELETE_ERROR', message: msg },
          });
          return;
        }
      }
      json(res, 200, {
        success: true,
        data: { cleared: true },
      });
      return;
    }

    // GET /api/agent/resume — inspect current active resume
    if (req.method === 'GET' && url.pathname === '/api/agent/resume') {
      const resumeDir = path.join(configDir, 'resume');
      if (!fs.existsSync(resumeDir)) {
        json(res, 200, {
          success: true,
          data: { exists: false } as ResumeInfo,
        });
        return;
      }

      try {
        const files = fs
          .readdirSync(resumeDir)
          .filter((f) => f.toLowerCase().endsWith('.pdf'))
          .map((f) => {
            const fullPath = path.join(resumeDir, f);
            const stat = fs.statSync(fullPath);
            return {
              filename: f,
              path: fullPath,
              sizeBytes: stat.size,
              lastModified: stat.mtime.toISOString(),
              mtimeMs: stat.mtimeMs,
            };
          })
          .sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (files.length === 0) {
          json(res, 200, {
            success: true,
            data: { exists: false } as ResumeInfo,
          });
          return;
        }

        const active = files[0]!;
        json(res, 200, {
          success: true,
          data: {
            exists: true,
            filename: active.filename,
            sizeBytes: active.sizeBytes,
            lastModified: active.lastModified,
          } as ResumeInfo,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, {
          success: false,
          error: { code: 'RESUME_READ_ERROR', message: msg },
        });
      }
      return;
    }

    // DELETE /api/agent/resume — delete all stored resume PDFs
    if (req.method === 'DELETE' && url.pathname === '/api/agent/resume') {
      const resumeDir = path.join(configDir, 'resume');
      if (fs.existsSync(resumeDir)) {
        try {
          const files = fs.readdirSync(resumeDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
          for (const file of files) {
            fs.unlinkSync(path.join(resumeDir, file));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          json(res, 500, {
            success: false,
            error: { code: 'RESUME_DELETE_ERROR', message: msg },
          });
          return;
        }
      }
      json(res, 200, {
        success: true,
        data: { deleted: true },
      });
      return;
    }

    // GET /api/agent/diagnostics — comprehensive local self-test
    if (req.method === 'GET' && url.pathname === '/api/agent/diagnostics') {
      const chromePath = findChromeExecutable();
      const cdpAvailable = await checkCDPAvailable();
      const profileDir = path.join(configDir, '.naukri-chrome-profile');
      const profileExists = fs.existsSync(profileDir);
      const credPath = path.join(configDir, '.credentials.enc');
      const credExists = fs.existsSync(credPath);
      let credValid = false;
      if (credExists) {
        const pass = readEncryptedPassword(credPath);
        credValid = Boolean(pass);
      }
      const resumeDir = path.join(configDir, 'resume');
      let resumeExists = false;
      let resumeFileName: string | undefined;
      if (fs.existsSync(resumeDir)) {
        const pdfs = fs.readdirSync(resumeDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
        if (pdfs.length > 0) {
          resumeExists = true;
          resumeFileName = pdfs[0];
        }
      }
      const taskState = loadTaskState(configDir);

      const diagnostics: DiagnosticsResult = {
        agent: {
          status: opts.isDraining?.() ? 'warning' : 'ok',
          message: `Agent daemon running (PID: ${process.pid}, uptime: ${Math.floor(process.uptime())}s).`,
        },
        chrome: {
          status: cdpAvailable ? 'ok' : chromePath ? 'warning' : 'failed',
          message: cdpAvailable
            ? 'Chrome CDP is active and responsive on port 9222.'
            : chromePath
            ? `Chrome installed at ${chromePath} (not currently running).`
            : 'Google Chrome executable was not found. Please install Chrome.',
        },
        browserProfile: {
          status: profileExists ? 'ok' : 'warning',
          message: profileExists
            ? `Dedicated browser profile initialized at ${profileDir}.`
            : 'Browser profile not initialized yet. It will be created on first Chrome launch.',
        },
        credentials: {
          status: credValid ? 'ok' : credExists ? 'warning' : 'failed',
          message: credValid
            ? 'Encrypted credentials are valid and decryptable.'
            : credExists
            ? 'Credentials file exists but could not be decrypted. Please re-enter credentials in Settings.'
            : 'Naukri credentials not configured.',
        },
        resume: {
          status: resumeExists ? 'ok' : 'warning',
          message: resumeExists
            ? `Active resume loaded (${resumeFileName}).`
            : 'No active resume PDF configured.',
        },
        scheduler: {
          status: taskState.paused ? 'warning' : 'ok',
          message: taskState.paused
            ? 'Automation scheduler is currently paused.'
            : 'Scheduler active and monitoring tasks.',
        },
      };

      json(res, 200, {
        success: true,
        data: diagnostics,
      });
      return;
    }

    // POST /api/agent/resume — receive, validate, and store resume PDF locally
    if (req.method === 'POST' && url.pathname === '/api/agent/resume') {
      const resumeDir = path.join(configDir, 'resume');
      if (!fs.existsSync(resumeDir)) {
        fs.mkdirSync(resumeDir, { recursive: true });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize <= MAX_SIZE + 1024) {
          chunks.push(chunk);
        }
      });

      req.on('end', () => {
        if (totalSize === 0) {
          json(res, 400, {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Uploaded file is empty.' },
          });
          return;
        }

        if (totalSize > MAX_SIZE) {
          json(res, 413, {
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum allowed size of 5 MB.' },
          });
          return;
        }

        const buffer = Buffer.concat(chunks);

        // Validate %PDF magic bytes
        if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
          json(res, 400, {
            success: false,
            error: { code: 'INVALID_FILE_CONTENT', message: 'File is not a valid PDF document.' },
          });
          return;
        }

        // Safe filename extraction & sanitization (prevent path traversal)
        const rawHeader = req.headers['x-filename'];
        const headerStr = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
        let originalName = 'resume.pdf';
        if (headerStr) {
          try {
            originalName = path.basename(decodeURIComponent(headerStr));
          } catch {
            originalName = path.basename(headerStr);
          }
        }

        if (!originalName.toLowerCase().endsWith('.pdf')) {
          originalName += '.pdf';
        }

        const sanitizedName = sanitizeFilename(originalName);
        const targetPath = path.join(resumeDir, sanitizedName);

        try {
          fs.writeFileSync(targetPath, buffer);
          // Clean up older stale resumes while keeping target
          cleanupStaleResumes(resumeDir, targetPath, sanitizedName);

          json(res, 200, {
            success: true,
            data: {
              filename: sanitizedName,
              path: targetPath,
              sizeBytes: buffer.length,
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          json(res, 500, {
            success: false,
            error: { code: 'FILE_WRITE_ERROR', message: msg },
          });
        }
      });
      return;
    }

    // POST /api/agent/resume/sync — trigger immediate resume cache reconciliation
    if (req.method === 'POST' && url.pathname === '/api/agent/resume/sync') {
      try {
        const result = await reconcileResumeCache(
          configDir,
          process.env['WEB_GATEWAY_URL'],
          agentSecret,
          getStatus().agentId
        );
        json(res, 200, {
          success: true,
          data: result,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        json(res, 500, {
          success: false,
          error: { code: 'RECONCILIATION_ERROR', message: msg },
        });
      }
      return;
    }

    notFound(res);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[server] Agent API listening on http://127.0.0.1:${port}`);
  });

  return server;
}
