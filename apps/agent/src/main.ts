/**
 * Naukri Update Agent — Production Background Daemon.
 *
 * Explicit Lifecycle:
 *   1. Load Configuration
 *   2. Validate Configuration & Initialize Directories
 *   3. Acquire Single-Agent Daemon Lock (atomic O_CREAT|O_EXCL)
 *   4. Initialize Persistent Identity & Scheduler State
 *   5. Initialize HTTP Server
 *   6. Initialize Gateway Client
 *   7. Initial Heartbeat & Schedule Sync
 *   8. Start Scheduler Poll Loop
 *
 * Graceful Shutdown (SIGINT, SIGTERM, SIGHUP):
 *   - Enter Draining state
 *   - Reject new commands (503 Service Unavailable)
 *   - Drain active task (up to 25s)
 *   - Disconnect Chrome CDP
 *   - Release instance & automation locks
 *   - Close HTTP server
 *   - Exit cleanly
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { AgentCommandType, AgentStatus, TaskType } from '@naukri-update/shared';
import { runTask } from './automation.js';
import { runBootstrap } from './bootstrap.js';
import { checkCDPAvailable, disconnectChrome, ensureChromeRunning } from './chrome.js';
import { loadAgentConfig } from './config.js';
import { GatewayClient } from './gateway.js';
import {
  acquireAgentInstanceLock,
  acquireAutomationLock,
  getAutomationLockPath,
  releaseAgentInstanceLock,
  releaseAutomationLock,
  touchAutomationLock,
} from './lock.js';

// Re-exports for backwards compatibility with tests and callers
export { acquireAutomationLock, releaseAutomationLock };
export const getLockFilePath = getAutomationLockPath;
import { AgentLogger } from './logger.js';
import { Reporter } from './reporter.js';
import { getDueTasks } from './scheduler.js';
import { createAgentServer } from './server.js';
import { checkServiceStatus, installService, uninstallService } from './service.js';
import { loadOrCreateAgentId, loadTaskState, saveTaskState, type TaskStateData } from './state.js';

// ─── Global Daemon Context ───────────────────────────────────────────────────

let config = loadAgentConfig();
let logger = new AgentLogger(config.configDir);
let reporter = new Reporter(config.configDir);
let gateway = new GatewayClient(process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000', config.agentSecret);

let agentId: string = '';
let startTime: number = Date.now();
let isRunning = false;
let isDraining = false;
let currentTaskName: TaskType | undefined = undefined;
let chromeConnected = false;
let currentStatus: AgentStatus['status'] = 'idle';
let pollIntervalTimer: NodeJS.Timeout | null = null;
let httpServer: http.Server | null = null;

let taskState: TaskStateData = {
  lastRefreshTime: 0,
  lastResumeUploadTime: 0,
  paused: false,
  lastScheduledCheck: 0,
};

// ─── Status Provider ─────────────────────────────────────────────────────────

export function getAgentStatus(): AgentStatus {
  return {
    status: currentStatus,
    version: config.version,
    chromeConnected,
    lastSeen: Date.now(),
    lastRefreshTime: taskState.lastRefreshTime || undefined,
    lastResumeUploadTime: taskState.lastResumeUploadTime || undefined,
    currentTask: isRunning ? currentTaskName : undefined,
    agentId,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    pid: process.pid,
    draining: isDraining,
  };
}

// ─── Task Runner ─────────────────────────────────────────────────────────────

export async function runDueTasks(tasks: TaskType[], requestId?: string): Promise<void> {
  if (isRunning || tasks.length === 0 || isDraining) return;

  if (!acquireAutomationLock(config.configDir)) {
    logger.warn('main', 'Could not acquire automation lock. Skipping task batch.', { tasks });
    if (requestId) {
      gateway.updateCommandStatus(requestId, 'failed', 'dispatched', 'Could not acquire automation lock').catch(() => {});
    }
    return;
  }

  isRunning = true;
  currentStatus = 'running';
  if (requestId) {
    gateway.updateCommandStatus(requestId, 'running', 'dispatched').catch(() => {});
  }
  gateway.sendHeartbeat(currentStatus, chromeConnected, config.version, agentId, Math.floor((Date.now() - startTime) / 1000)).catch(() => {});

  try {
    // Reload config dynamically in case credentials or resume file changed
    config = loadAgentConfig();
    logger.registerSecret(config.naukriPassword);
    logger.registerSecret(config.agentSecret);

    for (const task of tasks) {
      if (isDraining) {
        logger.warn('main', `Daemon draining; aborting remaining task batch at: ${task}`);
        break;
      }

      currentTaskName = task;
      touchAutomationLock(config.configDir);
      logger.info('main', `Starting automation task: ${task}`, { requestId });

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

      // Commit local task state IMMEDIATELY upon automation success
      // Ensures reporting network glitches never cause duplicate executions
      if (result.success) {
        if (task === 'headline-refresh') taskState.lastRefreshTime = Date.now();
        if (task === 'resume-upload') taskState.lastResumeUploadTime = Date.now();
        taskState.lastScheduledCheck = Date.now();
        saveTaskState(config.configDir, taskState);
        logger.info('main', `Task ${task} succeeded; local state persisted.`, { durationMs: result.durationMs });
      } else {
        if (result.message.includes('OTP') || result.message.includes('CAPTCHA')) {
          currentStatus = 'otp-required';
        } else {
          currentStatus = 'error';
        }
        logger.error('main', `Task ${task} failed: ${result.message}`, { durationMs: result.durationMs });
      }

      // Report to local run log & Next.js gateway
      try {
        reporter.report(result, requestId);
      } catch (repErr: unknown) {
        logger.warn('main', 'Failed to report result to gateway (local state is intact)', { error: String(repErr) });
      }
    }
  } finally {
    releaseAutomationLock(config.configDir);
    isRunning = false;
    currentTaskName = undefined;
    if (currentStatus === 'running') {
      currentStatus = 'idle';
    }
    gateway.sendHeartbeat(currentStatus, chromeConnected, config.version, agentId, Math.floor((Date.now() - startTime) / 1000)).catch(() => {});
  }
}

// ─── Command Handler ─────────────────────────────────────────────────────────

export async function handleCommand(type: string, requestId: string): Promise<void> {
  logger.info('main', `Command received: ${type}`, { requestId });

  if (isDraining) {
    gateway.updateCommandStatus(requestId, 'failed', 'dispatched', 'Agent daemon is currently draining for shutdown.').catch(() => {});
    return;
  }

  switch (type as AgentCommandType) {
    case 'pause':
      taskState.paused = true;
      saveTaskState(config.configDir, taskState);
      currentStatus = 'idle';
      gateway.updateCommandStatus(requestId, 'succeeded', 'dispatched').catch(() => {});
      break;
    case 'resume':
      taskState.paused = false;
      saveTaskState(config.configDir, taskState);
      gateway.updateCommandStatus(requestId, 'succeeded', 'dispatched').catch(() => {});
      break;
    case 'trigger-refresh':
      setImmediate(() => void runDueTasks(['headline-refresh'], requestId));
      break;
    case 'trigger-resume-upload':
      setImmediate(() => void runDueTasks(['resume-upload'], requestId));
      break;
    case 'connect-chrome':
      logger.info('main', 'Ensuring dedicated Chrome is running with CDP...');
      await ensureChromeRunning(config.profileDir, config.naukriProfileUrl, config.cdpEndpoint);
      chromeConnected = await checkCDPAvailable(config.cdpEndpoint);
      gateway.updateCommandStatus(
        requestId,
        chromeConnected ? 'succeeded' : 'failed',
        'dispatched',
        chromeConnected ? undefined : 'Chrome failed to start'
      ).catch(() => {});
      break;
    case 'disconnect-chrome':
      logger.info('main', 'Disconnecting Chrome processes...');
      await disconnectChrome(config.cdpEndpoint, config.profileDir);
      chromeConnected = false;
      gateway.updateCommandStatus(requestId, 'succeeded', 'dispatched').catch(() => {});
      break;
    case 'reset-browser-profile':
      logger.warn('main', 'reset-browser-profile requested.');
      await disconnectChrome(config.cdpEndpoint, config.profileDir);
      if (fs.existsSync(config.profileDir)) {
        try {
          fs.rmSync(config.profileDir, { recursive: true, force: true });
          logger.info('main', 'Browser profile directory reset.');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('main', `Failed to remove profile dir: ${msg}`);
        }
      }
      gateway.updateCommandStatus(requestId, 'succeeded', 'dispatched').catch(() => {});
      break;
    default:
      gateway.updateCommandStatus(requestId, 'failed', 'dispatched', `Unknown command type: ${type}`).catch(() => {});
      throw new Error(`Unknown command type: ${type}`);
  }
}

// ─── Poll Loop ───────────────────────────────────────────────────────────────

export async function pollLoop(): Promise<void> {
  if (isDraining) return;

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

  // 3. Send periodic heartbeat to gateway and flush any pending offline reports
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  gateway.sendHeartbeat(currentStatus, chromeConnected, config.version, agentId, uptime).catch(() => {});
  reporter.flushPendingReports().catch(() => {});

  // 4. Check for due tasks
  if (!isRunning && !taskState.paused) {
    const tasks = getDueTasks(config.schedule, taskState);
    if (tasks.length > 0) {
      logger.info('main', `Tasks due: ${tasks.join(', ')}`);
      void runDueTasks(tasks);
    }
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

export async function gracefulShutdown(signal: string): Promise<void> {
  if (isDraining) return;
  isDraining = true;

  logger.info('main', `Received ${signal}. Initiating graceful shutdown...`);

  // 1. Stop scheduler poll loop
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
    pollIntervalTimer = null;
  }

  // 2. If automation task is running, wait up to 25 seconds for clean finish
  if (isRunning) {
    logger.info('main', 'Waiting for in-flight automation task to drain (up to 25s)...');
    const drainStart = Date.now();
    while (isRunning && Date.now() - drainStart < 25000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // 3. Save final task state
  saveTaskState(config.configDir, taskState);

  // 4. Release locks
  releaseAutomationLock(config.configDir);
  releaseAgentInstanceLock(config.configDir);

  // 5. Close HTTP server
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
    });
    httpServer = null;
  }

  logger.info('main', 'Agent daemon shut down cleanly.');
  process.exit(0);
}

// ─── Startup Sequence ────────────────────────────────────────────────────────

export async function startAgent(): Promise<void> {
  startTime = Date.now();

  // Stage 1: Load Configuration
  config = loadAgentConfig();

  // Stage 2: Validate Configuration & Initialize Directories
  const dirs = [config.configDir, path.join(config.configDir, 'runtime'), path.join(config.configDir, 'logs'), config.resumeDir, config.profileDir];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // Stage 3: Initialize Logger & Register Secrets
  logger = new AgentLogger(config.configDir);
  logger.registerSecret(config.naukriPassword);
  logger.registerSecret(config.agentSecret);

  logger.info('main', `Naukri Update Agent v${config.version} starting (PID ${process.pid})...`);

  // Stage 4: Persistent Identity
  agentId = loadOrCreateAgentId(config.configDir);
  logger.info('main', `Agent Identity: ${agentId}`);

  // Stage 5: Acquire Single-Agent Daemon Lock
  const lockResult = acquireAgentInstanceLock(config.configDir, agentId, config.version);
  if (!lockResult.acquired) {
    logger.error('main', `Failed to acquire instance lock: ${lockResult.reason}`);
    console.error(`[main] FATAL: ${lockResult.reason}`);
    process.exit(1);
  }
  logger.info('main', 'Single-agent instance lock acquired successfully.');

  // Stage 6: Load Persisted Task State
  taskState = loadTaskState(config.configDir);
  logger.info('main', 'Loaded scheduler state', {
    lastRefreshTime: taskState.lastRefreshTime ? new Date(taskState.lastRefreshTime).toISOString() : 'never',
    lastResumeUploadTime: taskState.lastResumeUploadTime ? new Date(taskState.lastResumeUploadTime).toISOString() : 'never',
    paused: taskState.paused,
  });

  // Stage 7: Initialize Reporter & Gateway
  reporter = new Reporter(config.configDir);
  reporter.flushPendingReports().catch(() => {});
  gateway = new GatewayClient(process.env['WEB_GATEWAY_URL'] ?? 'http://127.0.0.1:3000', config.agentSecret);

  // Stage 8: Initialize Local HTTP Server
  httpServer = createAgentServer({
    port: config.port,
    agentSecret: config.agentSecret,
    configDir: config.configDir,
    getStatus: getAgentStatus,
    handleCommand,
    isBusy: () => isRunning,
    isDraining: () => isDraining,
  });

  // Stage 9: Register Signal Handlers for Graceful Shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const sig of signals) {
    process.on(sig, () => {
      void gracefulShutdown(sig);
    });
  }

  process.on('uncaughtException', (err) => {
    logger.error('main', `Uncaught exception: ${err.message}`, { stack: err.stack });
    releaseAutomationLock(config.configDir);
    releaseAgentInstanceLock(config.configDir);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('main', `Unhandled promise rejection: ${String(reason)}`);
  });

  // Stage 10: Initial Poll & Heartbeat
  await pollLoop();

  // Stage 11: Start Scheduler Poll Loop (every 60s)
  pollIntervalTimer = setInterval(() => {
    void pollLoop();
  }, 60000);

  logger.info('main', `Agent daemon fully operational on http://127.0.0.1:${config.port}`);
}

// ─── CLI Entrypoint Dispatcher ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--bootstrap')) {
    console.log('[main] Running bootstrap sequence...');
    const res = await runBootstrap();
    console.log('\n=== Naukri Agent Bootstrap Complete ===');
    console.log(`Agent ID:       ${res.agentId}`);
    console.log(`Config Dir:     ${res.configDir}`);
    console.log(`Profile Dir:    ${res.profileDir}`);
    console.log(`Resume Dir:     ${res.resumeDir}`);
    console.log(`Logs Dir:       ${res.logsDir}`);
    console.log(`Chrome Binary:  ${res.chromePath ?? 'NOT FOUND'}`);
    console.log(`Agent Running:  ${res.agentRunning ? 'YES' : 'NO'}`);
    console.log(`Dashboard URL:  ${res.dashboardUrl}`);
    console.log('=======================================\n');
    return;
  }

  if (args.includes('--service-install')) {
    const res = installService(config.configDir);
    console.log(`[service] ${res.message}`);
    process.exit(res.success ? 0 : 1);
  }

  if (args.includes('--service-uninstall')) {
    const res = uninstallService(config.configDir);
    console.log(`[service] ${res.message}`);
    process.exit(res.success ? 0 : 1);
  }

  if (args.includes('--service-status')) {
    const res = checkServiceStatus(config.configDir);
    console.log(`[service] Installed: ${res.installed} | Running: ${res.running} | Detail: ${res.detail}`);
    return;
  }

  await startAgent();
}

// Only invoke main when executed as entry point
if (process.argv[1] && (process.argv[1].endsWith('main.js') || process.argv[1].endsWith('main.ts'))) {
  main().catch((err: unknown) => {
    console.error('[main] Fatal error during startup:', err);
    process.exit(1);
  });
}
