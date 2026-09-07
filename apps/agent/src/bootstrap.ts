/**
 * Idempotent installer & bootstrap utility for the Naukri Update Agent.
 *
 * Responsibilities:
 * 1. Creates required directory hierarchy (~/.config/NaukriUpdate/{resume,logs,runtime,...})
 * 2. Generates persistent agent_id if not already present (strictly preserved on rerun)
 * 3. Verifies Google Chrome executable availability
 * 4. Checks agent health if already running
 * 5. Prints dashboard URL and setup instructions
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { findChromeExecutable } from './chrome.js';
import { loadAgentConfig } from './config.js';
import { loadOrCreateAgentId } from './state.js';

export interface BootstrapResult {
  agentId: string;
  configDir: string;
  profileDir: string;
  resumeDir: string;
  logsDir: string;
  runtimeDir: string;
  chromePath: string | null;
  agentRunning: boolean;
  dashboardUrl: string;
}

export async function runBootstrap(): Promise<BootstrapResult> {
  const config = loadAgentConfig();
  const configDir = config.configDir;
  const runtimeDir = path.join(configDir, 'runtime');
  const logsDir = path.join(configDir, 'logs');
  const resumeDir = config.resumeDir;
  const profileDir = config.profileDir;

  // 1. Create directory hierarchy idempotently
  const dirs = [configDir, runtimeDir, logsDir, resumeDir, profileDir];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  // 2. Ensure persistent agent_id exists (idempotent, never regenerates)
  const agentId = loadOrCreateAgentId(configDir);

  // 3. Check Chrome availability
  const chromePath = findChromeExecutable();

  // 4. Probe agent health endpoint if running
  const agentRunning = await new Promise<boolean>((resolve) => {
    try {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: config.port,
          path: '/api/agent/status',
          method: 'GET',
          headers: config.agentSecret ? { 'X-Agent-Secret': config.agentSecret } : {},
          timeout: 1500,
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
      req.end();
    } catch {
      resolve(false);
    }
  });

  const dashboardUrl = process.env['WEB_GATEWAY_URL'] || 'http://localhost:3000';

  return {
    agentId,
    configDir,
    profileDir,
    resumeDir,
    logsDir,
    runtimeDir,
    chromePath,
    agentRunning,
    dashboardUrl,
  };
}
