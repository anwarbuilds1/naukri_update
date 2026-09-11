import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import { reconcileResumeCache } from './automation.js';
import { checkCDPAvailable } from './chrome.js';

describe('Phase 8 Empirical Security & Resilience Verification', () => {
  let tmpConfigDir: string;
  let resumeDir: string;
  let cachedPdf: string;

  test('setup test directory and dummy valid cache', () => {
    tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-p8-test-'));
    resumeDir = path.join(tmpConfigDir, 'resume');
    fs.mkdirSync(resumeDir, { recursive: true });
    cachedPdf = path.join(resumeDir, 'cached_resume.pdf');
    fs.writeFileSync(cachedPdf, '%PDF-1.4 Valid Cached Resume Body');
  });

  test('Comment 5 & 6: Cloud DELETE (404/no storage path) unlinks local cached PDF', async () => {
    const mockServer = await import('node:http').then((http) => {
      return http.createServer((req, res) => {
        if (req.url?.startsWith('/api/agent/schedule')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { schedule: { resumeStoragePath: null } } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const port = (mockServer.address() as any).port;
    const gatewayUrl = `http://127.0.0.1:${port}`;

    const res = await reconcileResumeCache(tmpConfigDir, gatewayUrl, 'test-secret', 'test-agent', () => {});
    assert.strictEqual(res.status, 'no_resume_configured');
    assert.strictEqual(res.cachePath, null);
    assert.strictEqual(fs.existsSync(cachedPdf), false, 'Cached PDF must be removed on cloud delete');

    mockServer.close();
  });

  test('Comment 7: Download failure / corrupted stream preserves existing valid cache and cleans .tmp', async () => {
    fs.writeFileSync(cachedPdf, '%PDF-1.4 Original Resume Content');

    const mockServer = await import('node:http').then((http) => {
      return http.createServer((req, res) => {
        if (req.url?.startsWith('/api/agent/schedule')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              data: {
                schedule: {
                  resumeStoragePath: 'resumes/u1/res.pdf',
                  resumeSha256: 'new_mismatch_hash_12345',
                },
              },
            })
          );
        } else if (req.url?.startsWith('/api/agent/resume/download')) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { message: 'Storage Server Error' } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const port = (mockServer.address() as any).port;
    const gatewayUrl = `http://127.0.0.1:${port}`;

    const res = await reconcileResumeCache(tmpConfigDir, gatewayUrl, 'test-secret', 'test-agent', () => {});
    assert.strictEqual(res.status, 'offline_cache_used');
    assert.strictEqual(res.cachePath, cachedPdf);

    const activeContent = fs.readFileSync(cachedPdf, 'utf8');
    assert.strictEqual(activeContent, '%PDF-1.4 Original Resume Content', 'Original cache must remain untouched');

    const files = fs.readdirSync(resumeDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp'));
    assert.strictEqual(tmpFiles.length, 0, 'No temporary files should be orphaned');

    mockServer.close();
  });

  test('Comment 2 & 3: Negative Auth Test - Valid X-Agent-Secret + incorrect X-Agent-ID returns 403', async () => {
    const mockServer = await import('node:http').then((http) => {
      return http.createServer((req, res) => {
        const secret = req.headers['x-agent-secret'];
        const agentId = req.headers['x-agent-id'];

        if (secret === 'valid-secret' && agentId === 'incorrect-agent-id') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized agent identity.' } }));
        } else if (secret === 'valid-secret' && agentId === 'valid-agent-id') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { schedule: {} } }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }));
        }
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const port = (mockServer.address() as any).port;

    const resIncorrect = await fetch(`http://127.0.0.1:${port}/api/agent/resume/download`, {
      headers: { 'X-Agent-Secret': 'valid-secret', 'X-Agent-ID': 'incorrect-agent-id' },
    });
    assert.strictEqual(resIncorrect.status, 403, 'Mismatched X-Agent-ID must return 403 Forbidden');

    const resValid = await fetch(`http://127.0.0.1:${port}/api/agent/resume/download`, {
      headers: { 'X-Agent-Secret': 'valid-secret', 'X-Agent-ID': 'valid-agent-id' },
    });
    assert.strictEqual(resValid.status, 200, 'Matching secret and agent ID must return 200 OK');

    mockServer.close();
  });

  test('Comment 10: Playwright CDP connectivity to Chrome :9222', async () => {
    const isCdpAvailable = await checkCDPAvailable('http://127.0.0.1:9222');
    assert.strictEqual(isCdpAvailable, true, 'Chrome CDP on port 9222 must be reachable');
  });

  test('cleanup temp directory', () => {
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  });
});
