import assert from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import type { ScheduleConfig } from '@naukri-update/shared';
import {
  isDedicatedChromeProcess,
  isProfileActivelyLocked,
} from './chrome.js';
import {
  acquireAgentInstanceLock,
  acquireAutomationLock,
  getAgentLockPath,
  getAutomationLockPath,
  isProcessAlive,
  releaseAgentInstanceLock,
  releaseAutomationLock,
} from './lock.js';
import {
  AgentLogger,
  redactSensitiveData,
} from './logger.js';
import {
  isRefreshDue,
  isResumeUploadDue,
  MAX_MISSED_RUN_GRACE_WINDOW_MS,
  MIN_INTER_RUN_INTERVAL_MS,
} from './scheduler.js';
import { createAgentServer } from './server.js';
import {
  getLaunchAgentPlistContent,
  getSystemdServiceContent,
  getWindowsTaskCommand,
  resolveServicePaths,
} from './service.js';
import {
  loadOrCreateAgentId,
  loadTaskState,
  saveTaskState,
  type TaskStateData,
} from './state.js';

describe('Phase 5: Single-Agent Instance Lock & Collision Prevention', () => {
  test('acquires lock exclusively and blocks second active instance', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-inst-lock-'));
    try {
      // 1. Initial acquisition
      const res1 = acquireAgentInstanceLock(tempDir, 'test-agent-1', '0.1.0');
      assert.strictEqual(res1.acquired, true);

      // Verify lockfile exists
      const lockPath = getAgentLockPath(tempDir);
      assert.strictEqual(fs.existsSync(lockPath), true);
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(data.pid, process.pid);
      assert.strictEqual(data.agentId, 'test-agent-1');

      // 2. Second attempt by active PID is recognized as same process
      const res2 = acquireAgentInstanceLock(tempDir, 'test-agent-1', '0.1.0');
      assert.strictEqual(res2.acquired, true);

      // 3. Release lock
      releaseAgentInstanceLock(tempDir);
      assert.strictEqual(fs.existsSync(lockPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reclaims lock safely from confirmed dead PID', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-dead-lock-'));
    try {
      const lockPath = getAgentLockPath(tempDir);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      // Find an unused/dead PID (e.g. 9999999 or check liveness)
      let deadPid = 9999999;
      while (isProcessAlive(deadPid) && deadPid > 9900000) {
        deadPid--;
      }

      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          pid: deadPid,
          timestamp: Date.now() - 60000,
          startedAt: Date.now() - 60000,
          version: '0.1.0',
          agentId: 'dead-agent-id',
        }),
        'utf8'
      );

      const res = acquireAgentInstanceLock(tempDir, 'new-agent-id', '0.1.0');
      assert.strictEqual(res.acquired, true, 'Should reclaim lock from dead PID');

      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(data.pid, process.pid);
      assert.strictEqual(data.agentId, 'new-agent-id');

      releaseAgentInstanceLock(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reclaims lock safely from corrupted lockfile', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-corrupt-lock-'));
    try {
      const lockPath = getAgentLockPath(tempDir);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'MALFORMED_JSON_{{{', 'utf8');

      const res = acquireAgentInstanceLock(tempDir, 'recovered-agent', '0.1.0');
      assert.strictEqual(res.acquired, true);

      releaseAgentInstanceLock(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: Automation Task Lock Invariants', () => {
  test('never reclaims automation lock from live PID even if lease/timestamp is older than 10 minutes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-task-lock-live-'));
    try {
      const lockPath = getAutomationLockPath(tempDir);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      // Write a lockfile owned by current live process, but timestamped 30 minutes ago
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, timestamp: Date.now() - 30 * 60 * 1000 }),
        'utf8'
      );

      // Attempt to acquire lock: must fail because owning PID is actively alive
      const acquired = acquireAutomationLock(tempDir);
      assert.strictEqual(
        acquired,
        false,
        'Automation lock MUST NOT be stolen or reclaimed while the owning PID is alive, regardless of lease age'
      );

      // Clean up
      releaseAutomationLock(tempDir);
      assert.strictEqual(fs.existsSync(lockPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reclaims automation lock when owning process is confirmed dead', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-task-lock-dead-'));
    try {
      const lockPath = getAutomationLockPath(tempDir);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      let deadPid = 9999999;
      while (isProcessAlive(deadPid) && deadPid > 9900000) {
        deadPid--;
      }

      // Write lockfile with confirmed dead PID
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: deadPid, timestamp: Date.now() - 5 * 60 * 1000 }),
        'utf8'
      );

      const acquired = acquireAutomationLock(tempDir);
      assert.strictEqual(acquired, true, 'Should reclaim lock when owner PID is confirmed dead');

      // Now the lock is owned by current process
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(content.pid, process.pid);

      releaseAutomationLock(tempDir);
      assert.strictEqual(fs.existsSync(lockPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: Persistent Agent Identity & Idempotence', () => {
  test('generates persistent agent_id and preserves it across restarts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-id-test-'));
    try {
      const id1 = loadOrCreateAgentId(tempDir);
      assert.ok(id1 && id1.length > 20, 'Should generate valid UUID');

      // Subsequent calls must return identical agent_id without re-generating
      const id2 = loadOrCreateAgentId(tempDir);
      assert.strictEqual(id1, id2, 'agent_id must be persistent across invocations');

      const id3 = loadOrCreateAgentId(tempDir);
      assert.strictEqual(id1, id3);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: Scheduler Grace Window & Anti-Duplicate Semantics', () => {
  const baseConfig: ScheduleConfig = {
    refreshMode: 'fixed_time',
    refreshIntervalHours: 1,
    refreshIntervalMinutes: 0,
    refreshTime: '10:00',
    refreshWindowEnabled: false,
    refreshWindowStart: '09:00',
    refreshWindowEnd: '18:00',
    resumeUpdateEnabled: false,
    resumeUpdateTime: '10:00',
  };

  test('executes missed run if within 15-minute grace window', () => {
    const state: TaskStateData = {
      lastRefreshTime: 0,
      lastResumeUploadTime: 0,
      paused: false,
      lastScheduledCheck: 0,
    };

    // Scheduled for 10:00, current time is 10:08 (8 minutes late, within grace window)
    const now = new Date();
    now.setHours(10, 8, 0, 0);

    const due = isRefreshDue(baseConfig, state, now);
    assert.strictEqual(due, true, 'Should run if within 15-minute grace window');
  });

  test('skips missed run if older than 15-minute grace window (e.g. after sleep/wake)', () => {
    const state: TaskStateData = {
      lastRefreshTime: 0,
      lastResumeUploadTime: 0,
      paused: false,
      lastScheduledCheck: 0,
    };

    // Scheduled for 10:00, current time is 10:25 (25 minutes late, exceeds 15 min grace window)
    const now = new Date();
    now.setHours(10, 25, 0, 0);

    const due = isRefreshDue(baseConfig, state, now);
    assert.strictEqual(due, false, 'Should skip run if outside 15-minute grace window');
  });

  test('enforces 10-minute minimum inter-run spacing regardless of schedule mode', () => {
    const now = new Date();
    now.setHours(10, 5, 0, 0);

    // Ran 3 minutes ago
    const state: TaskStateData = {
      lastRefreshTime: now.getTime() - 3 * 60 * 1000,
      lastResumeUploadTime: 0,
      paused: false,
      lastScheduledCheck: 0,
    };

    const due = isRefreshDue(baseConfig, state, now);
    assert.strictEqual(due, false, 'Must enforce minimum inter-run interval (10 min)');
  });
});

describe('Phase 5: Scheduler State Persistence Across Restarts', () => {
  test('persists and recovers task state via atomic write swap', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-state-test-'));
    try {
      const stateToSave: TaskStateData = {
        lastRefreshTime: 1757280000000,
        lastResumeUploadTime: 1757270000000,
        paused: true,
        lastScheduledCheck: 1757280005000,
      };

      saveTaskState(tempDir, stateToSave);

      const recovered = loadTaskState(tempDir);
      assert.strictEqual(recovered.lastRefreshTime, stateToSave.lastRefreshTime);
      assert.strictEqual(recovered.lastResumeUploadTime, stateToSave.lastResumeUploadTime);
      assert.strictEqual(recovered.paused, true);
      assert.strictEqual(recovered.lastScheduledCheck, stateToSave.lastScheduledCheck);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: Targeted Chrome Process Verification', () => {
  test('does not misidentify unrelated processes as dedicated Chrome', () => {
    // Current test process is Node, not Chrome with port 9222
    assert.strictEqual(isDedicatedChromeProcess(process.pid), false);
    // Non-existent PID
    assert.strictEqual(isDedicatedChromeProcess(9999999), false);
  });

  test('detects profile is not locked when empty', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-lock-'));
    try {
      assert.strictEqual(isProfileActivelyLocked(tempDir), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: Structured Logging & Secret Redaction', () => {
  test('redacts sensitive passwords, secrets, tokens, and cookies from log entries', () => {
    const sensitiveString = 'SuperSecretNaukriP@ss2026!';
    const rawMessage = `Connected to Naukri with password=${sensitiveString} and token=abc12345`;
    const redacted = redactSensitiveData(rawMessage, [sensitiveString]);

    assert.ok(!String(redacted).includes(sensitiveString), 'Secret must not be in redacted message');
    assert.ok(String(redacted).includes('[REDACTED]'));

    const objectWithSecrets = {
      user: 'test@example.com',
      password: sensitiveString,
      agentSecret: 'my-agent-secret',
      authCookie: 'session-xyz',
      nested: {
        token: 'nested-token',
        normalField: 'hello',
      },
    };

    const redactedObj = redactSensitiveData(objectWithSecrets, [sensitiveString]) as any;
    assert.strictEqual(redactedObj.password, '[REDACTED]');
    assert.strictEqual(redactedObj.agentSecret, '[REDACTED]');
    assert.strictEqual(redactedObj.authCookie, '[REDACTED]');
    assert.strictEqual(redactedObj.nested.token, '[REDACTED]');
    assert.strictEqual(redactedObj.nested.normalField, 'hello');
  });

  test('AgentLogger creates log directory and writes structured JSON log entries', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    try {
      const logger = new AgentLogger(tempDir);
      logger.info('test-component', 'Test log message', { key: 'value' }, 'TEST_EVENT');

      const logFile = path.join(tempDir, 'logs', 'agent.log');
      assert.strictEqual(fs.existsSync(logFile), true);

      const content = fs.readFileSync(logFile, 'utf8').trim();
      const entry = JSON.parse(content);
      assert.strictEqual(entry.component, 'test-component');
      assert.strictEqual(entry.message, 'Test log message');
      assert.strictEqual(entry.event, 'TEST_EVENT');
      assert.strictEqual(entry.level, 'info');
      assert.strictEqual(entry.details.key, 'value');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 5: OS Service Generation Verification', () => {
  const dummyPaths = {
    nodeBin: '/usr/bin/node',
    entrypoint: '/opt/naukri-agent/dist/main.js',
    repoDir: '/opt/naukri-agent',
    configDir: '/home/user/.config/NaukriUpdate',
    logsDir: '/home/user/.config/NaukriUpdate/logs',
  };

  test('generates valid Linux systemd service definition', () => {
    const systemd = getSystemdServiceContent(dummyPaths);
    assert.ok(systemd.includes('Description=Naukri Update Local Background Agent'));
    assert.ok(systemd.includes(`ExecStart=${dummyPaths.nodeBin} ${dummyPaths.entrypoint}`));
    assert.ok(systemd.includes('Restart=always'));
    assert.ok(systemd.includes(`WorkingDirectory=${dummyPaths.repoDir}`));
    assert.ok(systemd.includes('WantedBy=default.target'));
    assert.ok(systemd.includes('Environment=NODE_ENV=production'));
    assert.ok(systemd.includes('EnvironmentFile=%h/.config/NaukriUpdate/agent.env'));
  });

  test('generates valid macOS LaunchAgent plist definition', () => {
    const plist = getLaunchAgentPlistContent(dummyPaths);
    assert.ok(plist.includes('<string>com.naukri.agent</string>'));
    assert.ok(plist.includes(`<string>${dummyPaths.nodeBin}</string>`));
    assert.ok(plist.includes(`<string>${dummyPaths.entrypoint}</string>`));
    assert.ok(plist.includes('<key>RunAtLoad</key>'));
    assert.ok(plist.includes('<true/>'));
    assert.ok(plist.includes('<key>KeepAlive</key>'));
  });

  test('generates valid Windows Task Scheduler commands', () => {
    const cmds = getWindowsTaskCommand(dummyPaths);
    assert.ok(cmds.create.includes('schtasks.exe /Create /TN "NaukriUpdateAgent"'));
    assert.ok(cmds.create.includes('/SC ONLOGON'));
    assert.ok(cmds.delete.includes('schtasks.exe /Delete /TN "NaukriUpdateAgent"'));
    assert.ok(cmds.query.includes('schtasks.exe /Query /TN "NaukriUpdateAgent"'));
  });
});

describe('Phase 5: Draining State & 503 Rejection', () => {
  test('returns 503 AGENT_DRAINING when agent is in draining shutdown state', async () => {
    const testSecret = 'drain-test-secret';
    const testPort = 7893;

    const server = createAgentServer({
      port: testPort,
      agentSecret: testSecret,
      getStatus: () => ({
        status: 'idle',
        version: '0.1.0',
        chromeConnected: true,
        lastSeen: Date.now(),
        draining: true,
      }),
      handleCommand: async () => {},
      isBusy: () => false,
      isDraining: () => true, // simulates active draining shutdown
    });

    await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));

    try {
      const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const payload = JSON.stringify({
          type: 'trigger-refresh',
          requestId: 'test-req-draining',
        });

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/agent/command',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'X-Agent-Secret': testSecret,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              resolve({
                status: res.statusCode || 0,
                body: JSON.parse(data),
              });
            });
          }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'AGENT_DRAINING');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
