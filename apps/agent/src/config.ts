/**
 * Agent local configuration and credential loader.
 *
 * The agent reads its configuration from:
 * 1. Environment variables (primary in container/cloud or CLI override)
 * 2. Local config.json in the application directory (mirroring ConfigService)
 * 3. Encrypted credentials (.credentials.enc) using machine-bound AES-256-GCM
 *
 * IMPORTANT: NAUKRI_PASSWORD is only stored locally and never sent to Supabase.
 * No Electron dependencies are imported here.
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ScheduleConfig } from '@naukri-update/shared';

export interface AgentConfig {
  /** Local HTTP server port (agent API) */
  port: number;
  /** CDP endpoint for Chrome */
  cdpEndpoint: string;
  /** Local directory for config/state files */
  configDir: string;
  /** Chrome user data profile directory */
  profileDir: string;
  /** Directory containing resume PDFs */
  resumeDir: string;
  /** Explicitly configured resume file if any */
  rawResumeFile?: string;
  /** Naukri profile URL */
  naukriProfileUrl: string;
  /** Naukri login URL */
  naukriLoginUrl: string;
  /** Naukri email (non-sensitive) */
  naukriEmail: string;
  /** Naukri password (from secure local store or env) */
  naukriPassword: string;
  /** Timeout for resume upload in ms */
  resumeUploadTimeoutMs: number;
  /** Agent API shared secret (used to authenticate web UI requests) */
  agentSecret: string;
  /** Schedule configuration */
  schedule: ScheduleConfig;
  /** Agent version */
  version: string;
}

/** Default schedule config matching existing defaults */
export const DEFAULT_SCHEDULE: ScheduleConfig = {
  refreshMode: 'interval',
  refreshIntervalHours: 1,
  refreshIntervalMinutes: 0,
  refreshTime: '06:11',
  refreshWindowEnabled: false,
  refreshWindowStart: '07:00',
  refreshWindowEnd: '19:00',
  resumeUpdateEnabled: false,
  resumeUpdateTime: '07:00',
};

/**
 * Resolves the OS-specific application directory.
 * Linux: ~/.config/NaukriUpdate
 * macOS: ~/Library/Application Support/NaukriUpdate
 * Windows: %APPDATA%\NaukriUpdate
 */
export function getDefaultConfigDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const platform = process.platform;

  if (platform === 'win32') {
    return path.join(process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'), 'NaukriUpdate');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'NaukriUpdate');
  }
  const xdgConfig = process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config');
  return path.join(xdgConfig, 'NaukriUpdate');
}

export function getLogsDir(configDir: string = getDefaultConfigDir()): string {
  return path.join(configDir, 'logs');
}

export function getRuntimeDir(configDir: string = getDefaultConfigDir()): string {
  return path.join(configDir, 'runtime');
}

/**
 * Get machine-unique hardware ID for fallback encryption key.
 * Independent of Electron safeStorage.
 */
export function getMachineId(): string {
  try {
    if (process.platform === 'linux') {
      if (fs.existsSync('/etc/machine-id')) {
        return fs.readFileSync('/etc/machine-id', 'utf8').trim();
      }
      if (fs.existsSync('/var/lib/dbus/machine-id')) {
        return fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      }
    } else if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { stdio: 'pipe' }).toString();
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) return match[1];
    } else if (process.platform === 'win32') {
      const out = execSync('wmic csproduct get uuid', { stdio: 'pipe' }).toString();
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines[1]) return lines[1];
    }
  } catch {
    // ignore
  }

  const userInfo = process.env['USER'] ?? process.env['USERNAME'] ?? 'default_user';
  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? 'default_home';
  return crypto.createHash('sha256').update(`${userInfo}:${homeDir}:naukri_update_seed`).digest('hex');
}

/**
 * Derive a 256-bit AES key from the machine ID using PBKDF2.
 */
export function getDerivedKey(machineId: string = getMachineId()): Buffer {
  return crypto.pbkdf2Sync(machineId, 'naukri_secure_salt_v1', 100000, 32, 'sha256');
}

/**
 * Decrypts a password from .credentials.enc using machine-bound AES-256-GCM.
 */
export function readEncryptedPassword(credentialsPath: string): string {
  if (!fs.existsSync(credentialsPath)) {
    return '';
  }

  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (parsed.type === 'machine_aes_gcm' && parsed.data && parsed.iv && parsed.authTag) {
      const key = getDerivedKey();
      const iv = Buffer.from(parsed.iv, 'hex');
      const authTag = Buffer.from(parsed.authTag, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    if (parsed.type === 'electron_safestorage') {
      console.warn(
        `[config] Stored credentials in ${credentialsPath} use Electron safeStorage. ` +
        'Standalone Agent requires portable machine-bound AES-256-GCM encryption. ' +
        'Please re-save credentials in the Web UI to enable headless daemon automation.'
      );
      return '';
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[config] Could not decrypt credentials from ${credentialsPath}: ${message}`);
  }

  return '';
}

/**
 * Saves a password to .credentials.enc using machine-bound AES-256-GCM.
 */
export function saveEncryptedPassword(credentialsPath: string, password: string): boolean {
  try {
    const dir = path.dirname(credentialsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!password) {
      if (fs.existsSync(credentialsPath)) {
        fs.unlinkSync(credentialsPath);
      }
      return true;
    }

    const key = getDerivedKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const data = JSON.stringify({
      type: 'machine_aes_gcm',
      iv: iv.toString('hex'),
      authTag: authTag,
      data: encrypted,
    });

    const tmpPath = `${credentialsPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, data, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, credentialsPath);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[config] Failed to write encrypted credentials: ${message}`);
    return false;
  }
}

/**
 * Resolves AGENT_SECRET from environment or from user-owned agent.env file.
 */
export function loadAgentSecret(configDir: string = getDefaultConfigDir()): string {
  if (process.env['AGENT_SECRET']) {
    return process.env['AGENT_SECRET'];
  }

  const envFile = path.join(configDir, 'agent.env');
  if (fs.existsSync(envFile)) {
    try {
      const lines = fs.readFileSync(envFile, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('AGENT_SECRET=')) {
          const secret = trimmed.slice('AGENT_SECRET='.length).trim().replace(/^['"]|['"]$/g, '');
          if (secret) {
            process.env['AGENT_SECRET'] = secret;
            return secret;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return '';
}

export function loadAgentConfig(): AgentConfig {
  const configDir = process.env['NAUKRI_CONFIG_DIR'] ?? getDefaultConfigDir();
  const jsonPath = path.join(configDir, 'config.json');
  const credentialsPath = path.join(configDir, '.credentials.enc');

  let fileConfig: Record<string, unknown> = {};
  if (fs.existsSync(jsonPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[config] Failed to parse config.json at ${jsonPath}: ${message}`);
    }
  }

  // Password resolution order:
  // 1. NAUKRI_PASSWORD environment variable
  // 2. Encrypted .credentials.enc file (AES-256-GCM machine key)
  // 3. Plaintext in config.json if not sentinel
  let naukriPassword = process.env['NAUKRI_PASSWORD'] ?? '';
  if (!naukriPassword) {
    naukriPassword = readEncryptedPassword(credentialsPath);
  }
  if (!naukriPassword && typeof fileConfig['NAUKRI_PASSWORD'] === 'string') {
    const fromJson = fileConfig['NAUKRI_PASSWORD'];
    if (fromJson && fromJson !== '[SECURE_STORE]') {
      naukriPassword = fromJson;
    }
  }

  const naukriProfileUrl =
    process.env['NAUKRI_PROFILE_URL'] ??
    (typeof fileConfig['NAUKRI_PROFILE_URL'] === 'string'
      ? fileConfig['NAUKRI_PROFILE_URL']
      : 'https://www.naukri.com/mnjuser/profile');

  const naukriEmail =
    process.env['NAUKRI_EMAIL'] ??
    (typeof fileConfig['NAUKRI_EMAIL'] === 'string' ? fileConfig['NAUKRI_EMAIL'] : '');

  const rawResumeFile =
    process.env['RESUME_FILE'] ??
    (typeof fileConfig['RESUME_FILE'] === 'string' ? fileConfig['RESUME_FILE'] : undefined);

  const resumeUploadTimeoutMs =
    parseInt(
      process.env['RESUME_UPLOAD_TIMEOUT_MS'] ??
        (typeof fileConfig['RESUME_UPLOAD_TIMEOUT_MS'] === 'number'
          ? String(fileConfig['RESUME_UPLOAD_TIMEOUT_MS'])
          : '120000'),
      10
    ) || 120000;

  // Build schedule
  const schedule: ScheduleConfig = {
    refreshMode:
      (process.env['REFRESH_MODE'] as ScheduleConfig['refreshMode']) ??
      (fileConfig['REFRESH_MODE'] as ScheduleConfig['refreshMode']) ??
      DEFAULT_SCHEDULE.refreshMode,
    refreshIntervalHours:
      parseInt(
        process.env['REFRESH_INTERVAL_HOURS'] ??
          (typeof fileConfig['REFRESH_INTERVAL_HOURS'] === 'number'
            ? String(fileConfig['REFRESH_INTERVAL_HOURS'])
            : '1'),
        10
      ) || 1,
    refreshIntervalMinutes:
      parseInt(
        process.env['REFRESH_INTERVAL_MINUTES'] ??
          (typeof fileConfig['REFRESH_INTERVAL_MINUTES'] === 'number'
            ? String(fileConfig['REFRESH_INTERVAL_MINUTES'])
            : '0'),
        10
      ) || 0,
    refreshTime:
      process.env['REFRESH_TIME'] ??
      (typeof fileConfig['REFRESH_TIME'] === 'string'
        ? fileConfig['REFRESH_TIME']
        : DEFAULT_SCHEDULE.refreshTime),
    refreshWindowEnabled:
      process.env['REFRESH_WINDOW_ENABLED'] === 'true' ||
      fileConfig['REFRESH_WINDOW_ENABLED'] === true ||
      DEFAULT_SCHEDULE.refreshWindowEnabled,
    refreshWindowStart:
      process.env['REFRESH_WINDOW_START'] ??
      (typeof fileConfig['REFRESH_WINDOW_START'] === 'string'
        ? fileConfig['REFRESH_WINDOW_START']
        : DEFAULT_SCHEDULE.refreshWindowStart),
    refreshWindowEnd:
      process.env['REFRESH_WINDOW_END'] ??
      (typeof fileConfig['REFRESH_WINDOW_END'] === 'string'
        ? fileConfig['REFRESH_WINDOW_END']
        : DEFAULT_SCHEDULE.refreshWindowEnd),
    resumeUpdateEnabled:
      process.env['RESUME_UPDATE_ENABLED'] === 'true' ||
      fileConfig['RESUME_UPDATE_ENABLED'] === true ||
      DEFAULT_SCHEDULE.resumeUpdateEnabled,
    resumeUpdateTime:
      process.env['RESUME_UPDATE_TIME'] ??
      (typeof fileConfig['RESUME_UPDATE_TIME'] === 'string'
        ? fileConfig['RESUME_UPDATE_TIME']
        : DEFAULT_SCHEDULE.resumeUpdateTime),
  };

  return {
    port: parseInt(process.env['AGENT_PORT'] ?? '7842', 10),
    cdpEndpoint: process.env['CDP_ENDPOINT'] ?? 'http://127.0.0.1:9222',
    configDir,
    profileDir: path.join(configDir, '.naukri-chrome-profile'),
    resumeDir: path.join(configDir, 'resume'),
    rawResumeFile,
    naukriProfileUrl,
    naukriLoginUrl: `https://www.naukri.com/nlogin/login?URL=${encodeURIComponent(naukriProfileUrl)}`,
    naukriEmail,
    naukriPassword,
    resumeUploadTimeoutMs,
    agentSecret: loadAgentSecret(configDir),
    schedule,
    version: '0.1.0',
  };
}
