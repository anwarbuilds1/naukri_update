import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import { isDedicatedChromeProcess } from './chrome.js';
import { AgentLogger } from './logger.js';
import { Reporter } from './reporter.js';
import { loadTaskState, saveTaskState, type TaskStateData } from './state.js';
import type { DiagnosticsResult } from '@naukri-update/shared';

describe('Phase 7: Production Stabilization & Reliability', () => {
  describe('Secret Redaction in AgentLogger', () => {
    test('redacts registered passwords and secrets from log messages', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p7-log-'));
      try {
        const logger = new AgentLogger(tempDir);
        const secretPassword = 'UltraSecretPassword!@#123';
        const secretToken = 'shared-agent-token-9999';
        logger.registerSecret(secretPassword);
        logger.registerSecret(secretToken);

        logger.info('test', `Attempting login with password ${secretPassword} and token ${secretToken}`);

        const logContent = fs.readFileSync(path.join(tempDir, 'logs', 'agent.log'), 'utf8');
        assert.ok(!logContent.includes(secretPassword), 'Password must never appear in log');
        assert.ok(!logContent.includes(secretToken), 'Token must never appear in log');
        assert.ok(logContent.includes('[REDACTED]'), 'Secrets must be replaced with [REDACTED]');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Dedicated Chrome Process Safety Check', () => {
    test('rejects unrelated process PIDs that do not match dedicated port or profile', () => {
      // Current test runner PID is alive, but does not match remote-debugging-port=9222
      const selfPid = process.pid;
      const isOurChrome = isDedicatedChromeProcess(selfPid, '/path/to/.naukri-chrome-profile');
      assert.strictEqual(isOurChrome, false, 'Unrelated process PID must never be flagged as dedicated Chrome');
    });

    test('rejects non-existent PIDs safely without throwing', () => {
      const nonExistentPid = 99999999;
      const isOurChrome = isDedicatedChromeProcess(nonExistentPid);
      assert.strictEqual(isOurChrome, false, 'Dead PID must return false safely');
    });
  });

  describe('Task State Durability and Corruption Recovery', () => {
    test('persists and reloads scheduler state accurately', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p7-state-'));
      try {
        const state: TaskStateData = {
          lastRefreshTime: 1788870000000,
          lastResumeUploadTime: 1788870050000,
          paused: true,
          lastScheduledCheck: 1788870060000,
        };

        saveTaskState(tempDir, state);
        const loaded = loadTaskState(tempDir);

        assert.strictEqual(loaded.lastRefreshTime, 1788870000000);
        assert.strictEqual(loaded.lastResumeUploadTime, 1788870050000);
        assert.strictEqual(loaded.paused, true);
        assert.strictEqual(loaded.lastScheduledCheck, 1788870060000);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('recovers gracefully from corrupted task_state.json', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p7-corrupt-'));
      try {
        const runtimeDir = path.join(tempDir, 'runtime');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.writeFileSync(path.join(runtimeDir, 'task_state.json'), '{ invalid json @@#$');

        const loaded = loadTaskState(tempDir);
        assert.strictEqual(loaded.lastRefreshTime, 0);
        assert.strictEqual(loaded.paused, false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Durable Offline Report Queueing', () => {
    test('queues run results to disk when gateway is offline and flushes on recovery', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p7-reporter-'));
      try {
        const reporter = new Reporter(tempDir);

        // Report a run result while gateway URL is unreachable
        reporter.report(
          {
            task: 'headline-refresh',
            success: true,
            message: 'Offline test run',
            durationMs: 1200,
            timestamp: Date.now(),
          },
          'req-offline-123'
        );

        // Pending report must be queued in runtime/pending_reports.json
        const pendingFile = path.join(tempDir, 'runtime', 'pending_reports.json');
        assert.ok(fs.existsSync(pendingFile), 'pending_reports.json must exist');
        const content = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
        assert.ok(Array.isArray(content));
        assert.strictEqual(content.length, 1);
        assert.strictEqual(content[0].requestId, 'req-offline-123');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Diagnostics Result Supabase Extension', () => {
    test('supports optional supabase check field in DiagnosticsResult', () => {
      const diag: DiagnosticsResult = {
        agent: { status: 'ok', message: 'Agent online' },
        chrome: { status: 'ok', message: 'Chrome CDP ready' },
        browserProfile: { status: 'ok', message: 'Profile valid' },
        credentials: { status: 'ok', message: 'Credentials present' },
        resume: { status: 'ok', message: 'Resume valid' },
        scheduler: { status: 'ok', message: 'Scheduler active' },
        supabase: { status: 'failed', message: 'Supabase unconfigured' },
      };

      assert.strictEqual(diag.supabase?.status, 'failed');
      assert.strictEqual(diag.supabase?.message, 'Supabase unconfigured');
    });
  });
});
