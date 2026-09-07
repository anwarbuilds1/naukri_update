/**
 * Run result reporter.
 *
 * Writes run results to:
 * 1. Local log file (always, as baseline)
 * 2. Next.js Agent API gateway (POST /api/agent/report) for persistent Supabase run_log
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { RunResult } from '@naukri-update/shared';

export class Reporter {
  private logPath: string;
  private webGatewayUrl: string;
  private agentSecret: string;

  constructor(
    configDir: string,
    webGatewayUrl: string = process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000',
    agentSecret: string = process.env['AGENT_SECRET'] ?? ''
  ) {
    this.logPath = path.join(configDir, 'agent-run.log');
    this.webGatewayUrl = webGatewayUrl.replace(/\/+$/, '');
    this.agentSecret = agentSecret;

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  report(result: RunResult): void {
    // 1. Always append to local log file
    const line = JSON.stringify({ ...result, iso: new Date(result.timestamp).toISOString() });
    try {
      appendFileSync(this.logPath, line + '\n', 'utf8');
    } catch (err) {
      console.error('[reporter] Failed to write log:', err);
    }

    const status = result.success ? '✓' : '✗';
    console.log(`[reporter] ${status} ${result.task} (${result.durationMs}ms): ${result.message}`);

    // 2. Report to Next.js gateway on localhost (non-blocking, fire-and-forget)
    this.reportToGateway(result).catch(() => {
      // Gateway offline or unconfigured; local log is preserved
    });
  }

  private async reportToGateway(result: RunResult): Promise<void> {
    try {
      const url = new URL('/api/agent/report', this.webGatewayUrl);
      const payload = JSON.stringify({
        type: 'run-result',
        payload: result,
      });

      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'X-Agent-Secret': this.agentSecret,
            },
            timeout: 5000,
          },
          (res) => {
            res.resume();
            resolve();
          }
        );

        req.on('error', () => resolve());
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(payload);
        req.end();
      });
    } catch {
      // ignore
    }
  }
}
