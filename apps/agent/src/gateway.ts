/**
 * Gateway client for communication between local agent and Next.js server on localhost.
 * Handles heartbeats and schedule fetching without needing direct Supabase credentials.
 */

import * as http from 'http';
import type { AgentStatusValue, ScheduleConfig } from '@naukri-update/shared';

export class GatewayClient {
  private baseUrl: string;
  private agentSecret: string;

  constructor(
    baseUrl: string = process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000',
    agentSecret: string = process.env['AGENT_SECRET'] ?? ''
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.agentSecret = agentSecret;
  }

  /**
   * Send heartbeat to Next.js gateway.
   */
  async sendHeartbeat(
    status: AgentStatusValue,
    chromeConnected: boolean,
    version: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/api/agent/report', this.baseUrl);
        const payload = JSON.stringify({
          type: 'heartbeat',
          payload: {
            status,
            chromeConnected,
            version,
          },
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

  /**
   * Fetch authoritative schedule config from Next.js gateway (backed by Supabase agent_config).
   */
  async fetchSchedule(): Promise<ScheduleConfig | null> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/api/agent/schedule', this.baseUrl);
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'GET',
            headers: {
              'X-Agent-Secret': this.agentSecret,
            },
            timeout: 5000,
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const data = JSON.parse(body);
                  if (data.success && data.data?.schedule) {
                    resolve(data.data.schedule as ScheduleConfig);
                    return;
                  }
                } catch {
                  // ignore
                }
              }
              resolve(null);
            });
          }
        );

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.end();
      } catch {
        resolve(null);
      }
    });
  }
}
