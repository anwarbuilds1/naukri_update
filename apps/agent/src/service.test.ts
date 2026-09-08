import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { describe } from 'node:test';
import {
  ensureAgentEnvFile,
  getAgentEnvFilePath,
  getSystemdServiceContent,
  getSystemdServicePath,
  resolveServicePaths,
} from './service.js';

describe('Linux Systemd & Agent Environment Configuration', () => {
  const dummyPaths = {
    nodeBin: '/usr/bin/node',
    entrypoint: '/opt/naukri-agent/dist/main.js',
    repoDir: '/opt/naukri-agent',
    configDir: '/home/user/.config/NaukriUpdate',
    logsDir: '/home/user/.config/NaukriUpdate/logs',
  };

  test('systemd unit contains EnvironmentFile and preserves NODE_ENV=production', () => {
    const content = getSystemdServiceContent(dummyPaths);
    assert.ok(
      content.includes('Environment=NODE_ENV=production'),
      'systemd unit must preserve Environment=NODE_ENV=production'
    );
    assert.ok(
      content.includes('EnvironmentFile=%h/.config/NaukriUpdate/agent.env'),
      'systemd unit must specify EnvironmentFile=%h/.config/NaukriUpdate/agent.env'
    );
  });

  test('generated secret has restrictive permissions (0600) when none exists', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-service-gen-'));
    try {
      const res = ensureAgentEnvFile(tempDir);
      assert.strictEqual(res.created, true, 'must indicate newly created secret file');
      assert.ok(res.secret.length >= 32, 'generated secret must be cryptographically long');
      assert.strictEqual(res.envFilePath, path.join(tempDir, 'agent.env'));

      // Verify file content format
      const fileContent = fs.readFileSync(res.envFilePath, 'utf8');
      assert.strictEqual(fileContent.trim(), `AGENT_SECRET=${res.secret}`);

      // Verify restrictive permissions (0600 on POSIX)
      if (process.platform !== 'win32') {
        const stats = fs.statSync(res.envFilePath);
        const mode = stats.mode & 0o777;
        assert.strictEqual(mode, 0o600, `Permissions must be 0600, got ${mode.toString(8)}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('existing secret is preserved and not overwritten', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-service-preserve-'));
    try {
      const preExistingSecret = 'super-secret-pre-existing-key-999';
      const envPath = getAgentEnvFilePath(tempDir);
      fs.writeFileSync(envPath, `AGENT_SECRET=${preExistingSecret}\n`, { encoding: 'utf8', mode: 0o600 });

      const res = ensureAgentEnvFile(tempDir);
      assert.strictEqual(res.created, false, 'must indicate existing secret was preserved');
      assert.strictEqual(res.secret, preExistingSecret, 'must read exact pre-existing secret');

      const reReadContent = fs.readFileSync(envPath, 'utf8');
      assert.strictEqual(reReadContent.trim(), `AGENT_SECRET=${preExistingSecret}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reinstall does not rotate the secret across multiple invocations', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-service-idempotent-'));
    try {
      const firstRun = ensureAgentEnvFile(tempDir);
      assert.strictEqual(firstRun.created, true);
      const initialSecret = firstRun.secret;

      // Simulate reinstallation 1
      const secondRun = ensureAgentEnvFile(tempDir);
      assert.strictEqual(secondRun.created, false);
      assert.strictEqual(secondRun.secret, initialSecret, 'secret must remain identical across reinstall');

      // Simulate reinstallation 2
      const thirdRun = ensureAgentEnvFile(tempDir);
      assert.strictEqual(thirdRun.created, false);
      assert.strictEqual(thirdRun.secret, initialSecret, 'secret must remain identical across 3rd run');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('service configuration remains valid with correct paths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naukri-service-paths-'));
    try {
      const paths = resolveServicePaths(tempDir);
      assert.ok(paths.nodeBin && path.isAbsolute(paths.nodeBin), 'nodeBin must be absolute');
      assert.ok(paths.entrypoint && path.isAbsolute(paths.entrypoint), 'entrypoint must be absolute');
      assert.ok(paths.repoDir && path.isAbsolute(paths.repoDir), 'repoDir must be absolute');
      assert.strictEqual(paths.configDir, tempDir);
      assert.strictEqual(paths.logsDir, path.join(tempDir, 'logs'));

      const userHome = os.homedir();
      const servicePath = getSystemdServicePath(userHome);
      assert.strictEqual(
        servicePath,
        path.join(userHome, '.config', 'systemd', 'user', 'naukri-agent.service')
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
