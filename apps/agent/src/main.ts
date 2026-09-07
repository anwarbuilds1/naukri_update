/**
 * Naukri Update Agent — Main entry point.
 *
 * Architecture:
 *   main.ts
 *     ↓
 *   poll loop (every 60s)
 *     ↓
 *   scheduler (getDueTasks)
 *     ↓
 *   lock acquisition (.naukri-automation.lock)
 *     ↓
 *   task dispatcher (runTask)
 *     ↓
 *   Chrome / Playwright automation
 *     ↓
 *   lock release & reporter
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentCommandType, AgentStatus, TaskType } from '@naukri-update/shared';
import { runTask } from './automation.js';
import { checkCDPAvailable, disconnectChrome, ensureChromeRunning } from './chrome.js';
import { loadAgentConfig } from './config.js';
import { GatewayClient } from './gateway.js';
import { Reporter } from './reporter.js';
import { getDueTasks } from './scheduler.js';
import { createAgentServer } from './server.js';

let config = loadAgentConfig();
const reporter = new Reporter(config.configDir);
const gateway = new GatewayClient(process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000', config.agentSecret);

// ─── Automation Lock Management (30-min stale timeout) ───────────────────────

export function getLockFilePath(configDir: string): string {
  return path.join(configDir, '.naukri-automation.lock');
}

export function acquireAutomationLock(configDir: string): boolean {
  const lockFilePath = getLockFilePath(configDir);

  if (fs.existsSync(lockFilePath)) {
    try {
      const raw = fs.readFileSync(lockFilePath, 'utf8');
      const lockData = JSON.parse(raw) as { pid?: number; timestamp?: number };
      const ageMs = Date.now() - (lockData.timestamp || 0);
      const isStale = ageMs > 30 * 60 * 1000; // 30 mins

      let processActive = false;
      if (lockData.pid) {
        try {
          process.kill(lockData.pid, 0);
          processActive = true;
        } catch {
          processActive = false;
        }
      }

      if (processActive && !isStale) {
        console.log(`[AutomationLock] Skipping execution: another automation run (PID ${lockData.pid}) is active.`);
        return false;
      }
    } catch {
      // ignore JSON parse or read error on lockfile
    }
  }

  try {
    const dir = path.dirname(lockFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      lockFilePath,
      JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
      'utf8'
    );
    return true;
  } catch {
    return true;
  }
}

export function releaseAutomationLock(configDir: string): void {
  try {
    const lockFilePath = getLockFilePath(configDir);
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {
    // ignore
  }
}

// ─── State ──────────────────────────────────────────────────────────────────

let isRunning = false;
const taskState = {
  lastRefreshTime: 0,
  lastResumeUploadTime: 0,
  paused: false,
};

let chromeConnected = false;
let currentStatus: AgentStatus['status'] = 'idle';

function getAgentStatus(): AgentStatus {
  return {
    status: currentStatus,
    version: config.version,
    chromeConnected,
    lastSeen: Date.now(),
    lastRefreshTime: taskState.lastRefreshTime || undefined,
    lastResumeUploadTime: taskState.lastResumeUploadTime || undefined,
    currentTask: isRunning ? (currentStatus === 'running' ? 'headline-refresh' : undefined) : undefined,
  };
}

// ─── Task Runner ─────────────────────────────────────────────────────────────

async function runDueTasks(tasks: TaskType[]): Promise<void> {
  if (isRunning || tasks.length === 0) return;

  if (!acquireAutomationLock(config.configDir)) {
    console.log('[main] Could not acquire automation lock. Skipping task batch.');
    return;
  }

  isRunning = true;
  currentStatus = 'running';
  gateway.sendHeartbeat(currentStatus, chromeConnected, config.version).catch(() => {});

  try {
    // Reload config dynamically in case credentials or resume file changed
    config = loadAgentConfig();

    for (const task of tasks) {
      console.log(`[main] Starting automation task: ${task}`);
      const result = await runTask(task, {
        cdpEndpoint: config.cdpEndpoint,
        naukriProfileUrl: config.naukriProfileUrl,
        naukriLoginUrl: config.naukriLoginUrl,
        naukriEmail: config.naukriEmail,
        naukriPassword: config.naukriPassword,
        configDir: config.configDir,
        profileDir: config.profileDir,
        resumeDir: config.resumeDir,
        rawResumeFile: config.rawResumeFile,
        resumeUploadTimeoutMs: config.resumeUploadTimeoutMs,
      });

      reporter.report(result);

      if (result.success) {
        if (task === 'headline-refresh') taskState.lastRefreshTime = Date.now();
        if (task === 'resume-upload') taskState.lastResumeUploadTime = Date.now();
      } else {
        if (result.message.includes('OTP') || result.message.includes('CAPTCHA')) {
          currentStatus = 'otp-required';
        } else {
          currentStatus = 'error';
        }
      }
    }
  } finally {
    releaseAutomationLock(config.configDir);
    isRunning = false;
    if (currentStatus === 'running') {
      currentStatus = 'idle';
    }
    gateway.sendHeartbeat(currentStatus, chromeConnected, config.version).catch(() => {});
  }
}

// ─── Command Handler ─────────────────────────────────────────────────────────

async function handleCommand(type: string, requestId: string): Promise<void> {
  console.log(`[main] Command received: ${type} (${requestId})`);

  switch (type as AgentCommandType) {
    case 'pause':
      taskState.paused = true;
      currentStatus = 'idle';
      break;
    case 'resume':
      taskState.paused = false;
      break;
    case 'trigger-refresh':
      if (!isRunning) {
        setImmediate(() => void runDueTasks(['headline-refresh']));
      } else {
        console.log('[main] Trigger refresh ignored: automation already running.');
      }
      break;
    case 'trigger-resume-upload':
      if (!isRunning) {
        setImmediate(() => void runDueTasks(['resume-upload']));
      } else {
        console.log('[main] Trigger resume upload ignored: automation already running.');
      }
      break;
    case 'connect-chrome':
      console.log('[main] Ensuring Chrome is running with CDP...');
      await ensureChromeRunning(config.profileDir, config.naukriProfileUrl, config.cdpEndpoint);
      chromeConnected = await checkCDPAvailable(config.cdpEndpoint);
      break;
    case 'disconnect-chrome':
      console.log('[main] Disconnecting Chrome processes...');
      await disconnectChrome(config.cdpEndpoint);
      chromeConnected = false;
      break;
    case 'reset-browser-profile':
      console.warn('[main] reset-browser-profile requested.');
      await disconnectChrome(config.cdpEndpoint);
      if (fs.existsSync(config.profileDir)) {
        try {
          fs.rmSync(config.profileDir, { recursive: true, force: true });
          console.log('[main] Browser profile directory reset.');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[main] Failed to remove profile dir: ${msg}`);
        }
      }
      break;
    default:
      throw new Error(`Unknown command type: ${type}`);
  }
}

// ─── Poll Loop ───────────────────────────────────────────────────────────────

async function pollLoop(): Promise<void> {
  // 1. Check Chrome CDP status
  chromeConnected = await checkCDPAvailable(config.cdpEndpoint);
  if (!chromeConnected && currentStatus !== 'running') {
    currentStatus = 'chrome-disconnected';
  } else if (!isRunning && currentStatus === 'chrome-disconnected') {
    currentStatus = 'idle';
  }

  // 2. Synchronize schedule from Next.js gateway (backed by Supabase agent_config)
  try {
    const remoteSchedule = await gateway.fetchSchedule();
    if (remoteSchedule) {
      config.schedule = remoteSchedule;
    }
  } catch {
    // Gateway offline; continue using local schedule
  }

  // 3. Send periodic heartbeat to gateway
  gateway.sendHeartbeat(currentStatus, chromeConnected, config.version).catch(() => {});

  // 4. Check for due tasks
  if (!isRunning && !taskState.paused) {
    const tasks = getDueTasks(config.schedule, taskState);
    if (tasks.length > 0) {
      console.log(`[main] Tasks due: ${tasks.join(', ')}`);
      void runDueTasks(tasks);
    }
  }
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[main] Naukri Update Agent v${config.version} starting...`);
  console.log(`[main] Config directory: ${config.configDir}`);
  console.log(`[main] Profile directory: ${config.profileDir}`);
  console.log(`[main] CDP endpoint: ${config.cdpEndpoint}`);
  console.log(`[main] Agent API port: ${config.port}`);

  if (!config.agentSecret) {
    console.warn('[main] WARNING: AGENT_SECRET is not set. Agent API is unauthenticated.');
    console.warn('[main] Set AGENT_SECRET environment variable before exposing agent to network.');
  }

  // Release any stale lock from a previous crashed run of this PID
  releaseAutomationLock(config.configDir);

  // Start local HTTP server
  createAgentServer({
    port: config.port,
    agentSecret: config.agentSecret,
    getStatus: getAgentStatus,
    handleCommand,
  });

  // Initial poll
  await pollLoop();

  // Poll every 60 seconds
  setInterval(() => {
    void pollLoop();
  }, 60000);

  console.log('[main] Agent running. Poll interval: 60s.');
}

// Only invoke main when run as entry point
if (process.argv[1] && process.argv[1].endsWith('main.js')) {
  main().catch((err: unknown) => {
    console.error('[main] Fatal error:', err);
    process.exit(1);
  });
}
