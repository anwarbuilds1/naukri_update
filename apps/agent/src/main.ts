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
 *   task dispatcher (runTask)
 *     ↓
 *   Chrome / Playwright automation
 *
 * Phase 1: establishes the poll loop and HTTP server.
 *          Tasks return stub results. Chrome/Playwright in Phase 2.
 *
 * The existing Electron app remains the production automation baseline.
 */

import { loadAgentConfig } from './config.js';
import { createAgentServer } from './server.js';
import { getDueTasks } from './scheduler.js';
import { runTask } from './automation.js';
import { Reporter } from './reporter.js';
import { checkCDPAvailable } from './chrome.js';
import type { AgentStatus, AgentCommandType, TaskType } from '@naukri-update/shared';

const config = loadAgentConfig();
const reporter = new Reporter(config.configDir);

// ─── Automation lock ────────────────────────────────────────────
let isRunning = false;

// ─── State ──────────────────────────────────────────────────────
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
  };
}

// ─── Command handler ─────────────────────────────────────────────
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
      }
      break;
    case 'trigger-resume-upload':
      if (!isRunning) {
        setImmediate(() => void runDueTasks(['resume-upload']));
      }
      break;
    case 'connect-chrome':
    case 'disconnect-chrome':
    case 'reset-browser-profile':
      // TODO (Phase 2): implement Chrome lifecycle commands
      console.warn(`[main] Command ${type} not yet implemented in Phase 1.`);
      break;
    default:
      throw new Error(`Unknown command type: ${type}`);
  }
}

// ─── Task runner ─────────────────────────────────────────────────
async function runDueTasks(tasks: TaskType[]): Promise<void> {
  if (isRunning || tasks.length === 0) return;
  isRunning = true;
  currentStatus = 'running';

  for (const task of tasks) {
    const result = await runTask(task, {
      cdpEndpoint: config.cdpEndpoint,
      naukriProfileUrl: config.naukriProfileUrl,
      naukriEmail: config.naukriEmail,
      naukriPassword: '', // TODO (Phase 2): read from local credential store
      configDir: config.configDir,
    });

    reporter.report(result);

    if (result.success) {
      if (task === 'headline-refresh') taskState.lastRefreshTime = Date.now();
      if (task === 'resume-upload') taskState.lastResumeUploadTime = Date.now();
    }
  }

  isRunning = false;
  currentStatus = 'idle';
}

// ─── Poll loop ───────────────────────────────────────────────────
async function pollLoop(): Promise<void> {
  // Update Chrome status
  chromeConnected = await checkCDPAvailable(config.cdpEndpoint);
  if (!chromeConnected && currentStatus !== 'running') {
    currentStatus = 'chrome-disconnected';
  } else if (!isRunning) {
    currentStatus = 'idle';
  }

  // Check for due tasks
  if (!isRunning && !taskState.paused) {
    const tasks = getDueTasks(config.schedule, taskState);
    if (tasks.length > 0) {
      console.log(`[main] Tasks due: ${tasks.join(', ')}`);
      void runDueTasks(tasks);
    }
  }
}

// ─── Startup ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`[main] Naukri Update Agent v${config.version} starting...`);
  console.log(`[main] Config dir: ${config.configDir}`);
  console.log(`[main] CDP endpoint: ${config.cdpEndpoint}`);
  console.log(`[main] Agent API port: ${config.port}`);

  if (!config.agentSecret) {
    console.warn('[main] WARNING: AGENT_SECRET is not set. Agent API is unauthenticated.');
    console.warn('[main] Set AGENT_SECRET environment variable before exposing agent to the network.');
  }

  // Start local HTTP server
  createAgentServer({
    port: config.port,
    agentSecret: config.agentSecret,
    getStatus: getAgentStatus,
    handleCommand,
  });

  // Initial poll
  await pollLoop();

  // Poll every 60 seconds (same as Electron in-app timer)
  setInterval(() => { void pollLoop(); }, 60_000);

  console.log('[main] Agent running. Poll interval: 60s.');
}

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
