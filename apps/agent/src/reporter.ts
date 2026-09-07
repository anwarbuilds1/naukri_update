/**
 * Run result reporter.
 *
 * Writes run results to:
 * 1. Local log file (always, as baseline)
 * 2. Next.js Agent API gateway (POST /api/agent/report) for persistent Supabase run_log
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { RunResult } from '@naukri-update/shared';

export interface PendingReportItem {
  id: string;
  result: RunResult;
  requestId?: string;
  enqueuedAt: number;
}

export class Reporter {
  private logPath: string;
  private pendingReportsPath: string;
  private webGatewayUrl: string;
  private agentSecret: string;
  private isFlushing = false;

  constructor(
    configDir: string,
    webGatewayUrl: string = process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000',
    agentSecret: string = process.env['AGENT_SECRET'] ?? ''
  ) {
    this.logPath = path.join(configDir, 'agent-run.log');
    this.pendingReportsPath = path.join(configDir, 'runtime', 'pending_reports.json');
    this.webGatewayUrl = webGatewayUrl.replace(/\/+$/, '');
    this.agentSecret = agentSecret;

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const runtimeDir = path.dirname(this.pendingReportsPath);
    if (!existsSync(runtimeDir)) {
      mkdirSync(runtimeDir, { recursive: true });
    }
  }

  getPendingReports(): PendingReportItem[] {
    if (!existsSync(this.pendingReportsPath)) return [];
    try {
      const raw = readFileSync(this.pendingReportsPath, 'utf8');
      return JSON.parse(raw) as PendingReportItem[];
    } catch {
      return [];
    }
  }

  savePendingReports(items: PendingReportItem[]): void {
    try {
      const tmpPath = `${this.pendingReportsPath}.tmp.${Date.now()}`;
      writeFileSync(tmpPath, JSON.stringify(items, null, 2), 'utf8');
      renameSync(tmpPath, this.pendingReportsPath);
    } catch (err) {
      console.error('[reporter] Failed to save pending reports:', err);
    }
  }

  report(result: RunResult, requestId?: string): void {
    // 1. Always append to local log file
    const line = JSON.stringify({ ...result, iso: new Date(result.timestamp).toISOString(), requestId });
    try {
      appendFileSync(this.logPath, line + '\n', 'utf8');
    } catch (err) {
      console.error('[reporter] Failed to write log:', err);
    }

    const status = result.success ? '✓' : '✗';
    console.log(`[reporter] ${status} ${result.task} (${result.durationMs}ms): ${result.message}`);

    // 2. Add to persistent pending reports queue (durable across restarts)
    const pending = this.getPendingReports();
    const item: PendingReportItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      result,
      requestId,
      enqueuedAt: Date.now(),
    };
    pending.push(item);
    this.savePendingReports(pending);

    // 3. Attempt flush to Next.js gateway
    this.flushPendingReports().catch(() => {});
  }

  async flushPendingReports(): Promise<number> {
    if (this.isFlushing) {
      for (let i = 0; i < 20 && this.isFlushing; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.isFlushing) return 0;
    }
    this.isFlushing = true;
    let deliveredCount = 0;

    try {
      const pending = this.getPendingReports();
      if (pending.length === 0) return 0;

      const remaining: PendingReportItem[] = [];

      for (let i = 0; i < pending.length; i++) {
        const item = pending[i]!;
        const ok = await this.sendToGateway(item.result, item.requestId);
        if (ok) {
          deliveredCount++;
        } else {
          // Gateway offline or errored; preserve this and remaining items for next retry
          remaining.push(item);
          remaining.push(...pending.slice(i + 1));
          break;
        }
      }

      this.savePendingReports(remaining);
    } finally {
      this.isFlushing = false;
    }

    return deliveredCount;
  }

  private sendToGateway(result: RunResult, requestId?: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/api/agent/report', this.webGatewayUrl);
        const payload = JSON.stringify({
          type: 'run-result',
          payload: { ...result, requestId },
        });

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
            resolve(res.statusCode === 200);
          }
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.write(payload);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}
