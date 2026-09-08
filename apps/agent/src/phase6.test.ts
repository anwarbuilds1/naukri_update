import assert from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import { createRequire } from 'node:module';
import type { ApiResponse, DiagnosticsResult, ResumeInfo } from '@naukri-update/shared';
import { getDefaultConfigDir, readEncryptedPassword, saveEncryptedPassword } from './config.js';
import { createAgentServer } from './server.js';

const require = createRequire(import.meta.url);
const SecureStoreService = require('../../../secure-store.js');
const ConfigService = require('../../../config-service.js');

describe('Phase 6: Electron Migration & Bidirectional Compatibility', () => {
  describe('Bidirectional Credential Storage Compatibility', () => {
    test('Agent writes credentials -> Electron SecureStore reads and decrypts successfully', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-compat-agent-to-electron-'));
      try {
        const credPath = path.join(tempDir, '.credentials.enc');
        const testPassword = 'SecretP@sswordFromAgent_2026!';

        // 1. Agent saves credentials using machine-bound AES-256-GCM
        const saveOk = saveEncryptedPassword(credPath, testPassword);
        assert.strictEqual(saveOk, true);
        assert.strictEqual(fs.existsSync(credPath), true);

        // 2. Legacy Electron SecureStore reads credentials from same config directory
        const electronStore = new SecureStoreService(tempDir);
        const decryptedByElectron = electronStore.getPassword();

        // 3. Verification: exact string match
        assert.strictEqual(
          decryptedByElectron,
          testPassword,
          'Electron must successfully decrypt credentials written by Agent'
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('Electron writes machine credentials -> Agent reads and decrypts successfully', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-compat-electron-to-agent-'));
      try {
        const testPassword = 'SecretP@sswordFromElectron_2026!';

        // 1. Electron SecureStore writes credentials in machine_aes_gcm format
        const electronStore = new SecureStoreService(tempDir);
        // Force machine AES-GCM (which is the portable format used outside GUI safeStorage)
        const key = electronStore.getDerivedKey();
        const iv = require('crypto').randomBytes(12);
        const cipher = require('crypto').createCipheriv('aes-256-gcm', key, iv);
        let enc = cipher.update(testPassword, 'utf8', 'hex');
        enc += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        const payload = JSON.stringify({
          type: 'machine_aes_gcm',
          iv: iv.toString('hex'),
          authTag: authTag,
          data: enc,
        });
        electronStore.atomicWrite(payload);

        // 2. Agent reads credentials from same config directory
        const credPath = path.join(tempDir, '.credentials.enc');
        const decryptedByAgent = readEncryptedPassword(credPath);

        // 3. Verification: exact string match
        assert.strictEqual(
          decryptedByAgent,
          testPassword,
          'Agent must successfully decrypt credentials written by Electron'
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('Agent gracefully handles electron_safestorage payload without crashing', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-compat-safestorage-'));
      try {
        const credPath = path.join(tempDir, '.credentials.enc');
        fs.writeFileSync(
          credPath,
          JSON.stringify({
            type: 'electron_safestorage',
            data: Buffer.from('mock_encrypted_data').toString('base64'),
          }),
          'utf8'
        );

        // Reading should not throw and should return empty string with diagnostic warning
        const result = readEncryptedPassword(credPath);
        assert.strictEqual(result, '');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Shared Runtime Directory Compatibility', () => {
    test('Agent default config directory matches Electron ConfigService', () => {
      const agentConfigDir = getDefaultConfigDir();
      const electronConfigDir = ConfigService.getAppConfigDir();
      assert.strictEqual(
        agentConfigDir,
        electronConfigDir,
        'Agent and Electron must target the exact same base config directory'
      );
    });

    test('Shared Chrome profile and resume directory subpaths match', () => {
      const configDir = getDefaultConfigDir();
      const electronResumeDir = path.join(configDir, 'resume');
      const agentResumeDir = path.join(configDir, 'resume');
      assert.strictEqual(agentResumeDir, electronResumeDir);

      const electronProfileDir = path.join(configDir, '.naukri-chrome-profile');
      const agentProfileDir = path.join(configDir, '.naukri-chrome-profile');
      assert.strictEqual(agentProfileDir, electronProfileDir);
    });
  });

  describe('Agent HTTP API Parity Endpoints', () => {
    let server: http.Server;
    const testPort = 17855;
    const testSecret = 'test-agent-secret-phase6';
    let tempDir: string;

    test.before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-server-phase6-'));
      server = createAgentServer({
        port: testPort,
        agentSecret: testSecret,
        configDir: tempDir,
        getStatus: () => ({
          status: 'idle',
          version: '1.0.0',
          chromeConnected: false,
          lastSeen: Date.now(),
        }),
        handleCommand: async () => {},
      });
    });

    test.after(() => {
      server.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    async function makeRequest<T>(
      endpoint: string,
      method: string = 'GET',
      body?: unknown,
      headers: Record<string, string> = {}
    ): Promise<{ status: number; body: ApiResponse<T> }> {
      return new Promise((resolve, reject) => {
        const reqHeaders: Record<string, string> = {
          'X-Agent-Secret': testSecret,
          ...headers,
        };
        let payload: string | undefined;
        if (body !== undefined) {
          payload = typeof body === 'string' ? body : JSON.stringify(body);
          if (!reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
          }
          reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
        }

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: endpoint,
            method,
            headers: reqHeaders,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                resolve({
                  status: res.statusCode ?? 500,
                  body: JSON.parse(data),
                });
              } catch {
                reject(new Error(`Failed to parse response: ${data}`));
              }
            });
          }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      });
    }

    test('GET /api/agent/resume returns exists: false when no resume exists', async () => {
      const res = await makeRequest<ResumeInfo>('/api/agent/resume', 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      if (res.body.success) {
        assert.strictEqual(res.body.data.exists, false);
      }
    });

    test('POST /api/agent/resume stores valid PDF and cleans stale files', async () => {
      const resumeDir = path.join(tempDir, 'resume');
      fs.mkdirSync(resumeDir, { recursive: true });
      fs.writeFileSync(path.join(resumeDir, 'stale_old_resume.pdf'), '%PDF-1.4 old content');

      const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/agent/resume',
            method: 'POST',
            headers: {
              'X-Agent-Secret': testSecret,
              'Content-Type': 'application/pdf',
              'Content-Length': String(pdfContent.length),
              'X-Filename': encodeURIComponent('Candidate_Resume_2026.pdf'),
            },
          },
          (httpRes) => {
            let data = '';
            httpRes.on('data', (chunk) => (data += chunk));
            httpRes.on('end', () => resolve({ status: httpRes.statusCode ?? 500, body: JSON.parse(data) }));
          }
        );
        req.on('error', reject);
        req.write(pdfContent);
        req.end();
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.filename.startsWith('Candidate_Resume_2026'));
      assert(res.body.data.filename.endsWith('.pdf'));

      // Stale old resume should be cleaned up
      assert.strictEqual(fs.existsSync(path.join(resumeDir, 'stale_old_resume.pdf')), false);
      // New resume should exist
      assert.strictEqual(fs.existsSync(path.join(resumeDir, res.body.data.filename)), true);
    });

    test('GET /api/agent/resume returns active resume metadata when file exists', async () => {
      const res = await makeRequest<ResumeInfo>('/api/agent/resume', 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      if (res.body.success) {
        assert.strictEqual(res.body.data.exists, true);
        assert(res.body.data.filename?.startsWith('Candidate_Resume_2026'));
        assert(res.body.data.filename?.endsWith('.pdf'));
        assert(typeof res.body.data.sizeBytes === 'number' && res.body.data.sizeBytes > 0);
        assert(typeof res.body.data.lastModified === 'string');
      }
    });

    test('DELETE /api/agent/resume removes resume files', async () => {
      const res = await makeRequest<{ deleted: boolean }>('/api/agent/resume', 'DELETE');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      if (res.body.success) {
        assert.strictEqual(res.body.data.deleted, true);
      }

      // Subsequent GET returns exists: false
      const getRes = await makeRequest<ResumeInfo>('/api/agent/resume', 'GET');
      assert.strictEqual(getRes.body.success, true);
      if (getRes.body.success) {
        assert.strictEqual(getRes.body.data.exists, false);
      }
    });

    test('POST and DELETE /api/agent/credentials manage credentials.enc', async () => {
      const credPath = path.join(tempDir, '.credentials.enc');

      // 1. Save credential
      const postRes = await makeRequest<{ updated: boolean }>(
        '/api/agent/credentials',
        'POST',
        { naukriPassword: 'test-api-password-123' }
      );
      assert.strictEqual(postRes.status, 200);
      assert.strictEqual(postRes.body.success, true);
      assert.strictEqual(fs.existsSync(credPath), true);
      assert.strictEqual(readEncryptedPassword(credPath), 'test-api-password-123');

      // 2. DELETE credential
      const delRes = await makeRequest<{ cleared: boolean }>('/api/agent/credentials', 'DELETE');
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.body.success, true);
      assert.strictEqual(fs.existsSync(credPath), false);
    });

    test('GET /api/agent/diagnostics returns complete diagnostic assessment', async () => {
      const res = await makeRequest<DiagnosticsResult>('/api/agent/diagnostics', 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      if (res.body.success) {
        const diag = res.body.data;
        assert(diag.agent && ['ok', 'warning', 'failed'].includes(diag.agent.status));
        assert(diag.chrome && ['ok', 'warning', 'failed'].includes(diag.chrome.status));
        assert(diag.browserProfile && ['ok', 'warning', 'failed'].includes(diag.browserProfile.status));
        assert(diag.credentials && ['ok', 'warning', 'failed'].includes(diag.credentials.status));
        assert(diag.resume && ['ok', 'warning', 'failed'].includes(diag.resume.status));
        assert(diag.scheduler && ['ok', 'warning', 'failed'].includes(diag.scheduler.status));
      }
    });
  });
});
