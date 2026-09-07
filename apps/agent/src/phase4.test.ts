import assert from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import {
  isValidCommandTransition,
  type CommandStatus,
} from '@naukri-update/shared';
import {
  cleanupStaleResumes,
  sanitizeFilename,
} from './automation.js';
import {
  readEncryptedPassword,
  saveEncryptedPassword,
} from './config.js';
import {
  acquireAutomationLock,
  releaseAutomationLock,
} from './main.js';
import { isProcessAlive } from './lock.js';
import { createAgentServer } from './server.js';

describe('Phase 4: Agent Concurrency & 409 Busy Rejection', () => {
  test('returns 409 AGENT_BUSY when automation is already running', async () => {
    const testSecret = 'test-phase4-secret';
    const testPort = 7891;

    const server = createAgentServer({
      port: testPort,
      agentSecret: testSecret,
      getStatus: () => ({
        status: 'running',
        version: '0.1.0',
        chromeConnected: true,
        lastSeen: Date.now(),
      }),
      handleCommand: async () => {},
      isBusy: () => true, // simulates active automation running
    });

    await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));

    try {
      const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const payload = JSON.stringify({
          type: 'trigger-refresh',
          requestId: 'test-req-busy',
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

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'BUSY');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('Phase 4: Resume Upload Traversal Defense & File Sanitization', () => {
  test('sanitizes malicious filenames and prevents path traversal', () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateSuffix = `_${dd}-${mm}-${yyyy}.pdf`;

    assert.strictEqual(sanitizeFilename('../../../evil.pdf'), `evil${dateSuffix}`);
    assert.strictEqual(sanitizeFilename('..\\..\\windows_evil.pdf'), `windows_evil${dateSuffix}`);
    assert.strictEqual(sanitizeFilename('/root/secret/resume.pdf'), `resume${dateSuffix}`);
    assert.strictEqual(sanitizeFilename('my resume (1) [final]!.pdf'), `my_resume_1_final${dateSuffix}`);
  });

  test('rejects non-PDF payload and path-traversed upload attempts via HTTP endpoint', async () => {
    const testSecret = 'test-secret-resume';
    const testPort = 7892;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p4-resume-'));

    const server = createAgentServer({
      port: testPort,
      agentSecret: testSecret,
      configDir: tempDir,
      getStatus: () => ({
        status: 'idle',
        version: '0.1.0',
        chromeConnected: true,
        lastSeen: Date.now(),
      }),
      handleCommand: async () => {},
      isBusy: () => false,
    });

    await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));

    try {
      // 1. Upload valid PDF with path traversal attempts in header
      const validPdfBuffer = Buffer.from('%PDF-1.4 sample pdf content for testing');
      const uploadRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/agent/resume',
            method: 'POST',
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Length': validPdfBuffer.length,
              'X-Agent-Secret': testSecret,
              'X-Filename': encodeURIComponent('../../../../tmp/escape.pdf'),
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
        req.write(validPdfBuffer);
        req.end();
      });

      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const expectedFilename = `escape_${dd}-${mm}-${yyyy}.pdf`;

      assert.strictEqual(uploadRes.status, 200);
      assert.strictEqual(uploadRes.body.success, true);
      assert.strictEqual(uploadRes.body.data.filename, expectedFilename);
      // Verify saved file is strictly within the resume directory
      const resumeDir = path.join(tempDir, 'resume');
      assert.strictEqual(uploadRes.body.data.path, path.join(resumeDir, expectedFilename));
      assert.strictEqual(fs.existsSync(uploadRes.body.data.path), true);

      // 2. Reject non-PDF payload
      const invalidBuffer = Buffer.from('NOT_A_PDF_DOCUMENT_BINARY');
      const rejectRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/agent/resume',
            method: 'POST',
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Length': invalidBuffer.length,
              'X-Agent-Secret': testSecret,
              'X-Filename': 'bad.pdf',
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
        req.write(invalidBuffer);
        req.end();
      });

      assert.strictEqual(rejectRes.status, 400);
      assert.strictEqual(rejectRes.body.error.code, 'INVALID_FILE_CONTENT');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('cleanupStaleResumes removes older versions while keeping active resume', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-cleanup-'));
    try {
      const file1 = path.join(tempDir, 'Resume_John_Doe_01-01-2026.pdf');
      const file2 = path.join(tempDir, 'Resume_John_Doe_02-01-2026.pdf');
      const current = path.join(tempDir, 'Resume_John_Doe_03-01-2026.pdf');
      const unrelated = path.join(tempDir, 'Other_File.pdf');

      fs.writeFileSync(file1, 'old 1');
      fs.writeFileSync(file2, 'old 2');
      fs.writeFileSync(current, 'current');
      fs.writeFileSync(unrelated, 'unrelated');

      cleanupStaleResumes(tempDir, current, 'Resume_John_Doe_03-01-2026.pdf', () => {});

      assert.strictEqual(fs.existsSync(file1), false, 'Older duplicate file 1 should be removed');
      assert.strictEqual(fs.existsSync(file2), false, 'Older duplicate file 2 should be removed');
      assert.strictEqual(fs.existsSync(current), true, 'Current file should be preserved');
      assert.strictEqual(fs.existsSync(unrelated), true, 'Unrelated file should not be touched');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 4: Automation Lock & Failure Recovery', () => {
  test('acquires, detects collision, and releases automation lock', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-lock-'));
    try {
      // 1. Initial acquisition
      const acquired1 = acquireAutomationLock(tempDir);
      assert.strictEqual(acquired1, true);

      // 2. Immediate second acquisition by active process should be blocked
      const acquired2 = acquireAutomationLock(tempDir);
      assert.strictEqual(acquired2, false);

      // 3. Release
      releaseAutomationLock(tempDir);

      // 4. Acquisition after release should succeed
      const acquired3 = acquireAutomationLock(tempDir);
      assert.strictEqual(acquired3, true);

      releaseAutomationLock(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reclaims lock from dead PID and refuses to reclaim from live PID even if lease is old', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-stale-lock-'));
    try {
      const lockPath = path.join(tempDir, '.automation.lock');

      // 1. Live process with lease older than 10 minutes: MUST NOT be stolen
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, timestamp: Date.now() - 15 * 60 * 1000 }),
        'utf8'
      );
      const acquiredLive = acquireAutomationLock(tempDir);
      assert.strictEqual(acquiredLive, false, 'Must NOT reclaim lock if owning process is alive');

      // 2. Dead process: safe to reclaim
      let deadPid = 9999999;
      while (isProcessAlive(deadPid) && deadPid > 9900000) {
        deadPid--;
      }
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: deadPid, timestamp: Date.now() - 15 * 60 * 1000 }),
        'utf8'
      );
      const acquiredDead = acquireAutomationLock(tempDir);
      assert.strictEqual(acquiredDead, true, 'Should reclaim lock from confirmed dead PID');

      releaseAutomationLock(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 4: Machine-Bound AES-256-GCM Credential Resilience', () => {
  test('gracefully returns empty string on corrupted credential file without crashing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-cred-'));
    try {
      const credPath = path.join(tempDir, '.credentials.enc');
      // Write corrupt random bytes
      fs.writeFileSync(credPath, 'NOT_A_VALID_ENCRYPTED_HEX_STREAM_12345', 'utf8');

      const pass = readEncryptedPassword(credPath);
      assert.strictEqual(pass, '', 'Should return empty string on corrupt encrypted payload');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('encrypts and recovers round-trip credentials', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-cred-rt-'));
    try {
      const credPath = path.join(tempDir, '.credentials.enc');
      const original = 'MyNaukriSecretP@ssw0rd!2026';
      saveEncryptedPassword(credPath, original);
      const recovered = readEncryptedPassword(credPath);
      assert.strictEqual(recovered, original);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Phase 4: State Machine Comprehensive Transition Rules', () => {
  test('strictly validates allowed transitions', () => {
    const validPairs: [CommandStatus, CommandStatus][] = [
      ['queued', 'dispatched'],
      ['dispatched', 'running'],
      ['running', 'succeeded'],
      ['running', 'failed'],
      ['dispatched', 'failed'],
      ['failed', 'queued'],
      ['queued', 'cancelled'],
    ];

    for (const [from, to] of validPairs) {
      assert.strictEqual(isValidCommandTransition(from, to), true, `Expected ${from} -> ${to} to be valid`);
    }
  });

  test('strictly rejects terminal state resurrection and illegal transitions', () => {
    const illegalPairs: [CommandStatus, CommandStatus][] = [
      ['succeeded', 'running'],
      ['succeeded', 'dispatched'],
      ['succeeded', 'queued'],
      ['cancelled', 'running'],
      ['cancelled', 'queued'],
      ['running', 'queued'],
      ['queued', 'running'],
      ['queued', 'succeeded'],
      ['failed', 'running'],
      ['dispatched', 'queued'],
    ];

    for (const [from, to] of illegalPairs) {
      assert.strictEqual(isValidCommandTransition(from, to), false, `Expected ${from} -> ${to} to be rejected`);
    }
  });
});
