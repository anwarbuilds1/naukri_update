/**
 * Agent local configuration.
 *
 * The agent reads its config from the local filesystem (mirroring ConfigService)
 * and optionally from Supabase agent_config when connected.
 *
 * IMPORTANT: NAUKRI_PASSWORD is read from the local credential store only.
 * It is never fetched from or written to Supabase.
 *
 * Phase 1: stub that reads from environment variables for bootstrap.
 * Phase 2: will read from config.json (ported from config-service.js).
 */

import type { ScheduleConfig } from '@naukri-update/shared';

export interface AgentConfig {
  /** Local HTTP server port (agent API) */
  port: number;
  /** CDP endpoint for Chrome */
  cdpEndpoint: string;
  /** Local directory for config/state files */
  configDir: string;
  /** Naukri profile URL */
  naukriProfileUrl: string;
  /** Naukri email (non-sensitive) */
  naukriEmail: string;
  /** Agent API shared secret (used to authenticate web UI requests) */
  agentSecret: string;
  /** Schedule configuration */
  schedule: ScheduleConfig;
  /** Agent version */
  version: string;
}

/** Default schedule config matching existing .env defaults */
const DEFAULT_SCHEDULE: ScheduleConfig = {
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
 * Load agent configuration from environment variables.
 *
 * TODO (Phase 2): Replace with full ConfigService port that reads
 * from <configDir>/config.json, mirroring the existing config-service.js.
 */
export function loadAgentConfig(): AgentConfig {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const platform = process.platform;

  let defaultConfigDir: string;
  if (platform === 'win32') {
    defaultConfigDir = `${process.env['APPDATA'] ?? `${home}/AppData/Roaming`}/NaukriUpdate`;
  } else if (platform === 'darwin') {
    defaultConfigDir = `${home}/Library/Application Support/NaukriUpdate`;
  } else {
    const xdgConfig = process.env['XDG_CONFIG_HOME'] ?? `${home}/.config`;
    defaultConfigDir = `${xdgConfig}/NaukriUpdate`;
  }

  return {
    port: parseInt(process.env['AGENT_PORT'] ?? '7842', 10),
    cdpEndpoint: process.env['CDP_ENDPOINT'] ?? 'http://127.0.0.1:9222',
    configDir: process.env['NAUKRI_CONFIG_DIR'] ?? defaultConfigDir,
    naukriProfileUrl: process.env['NAUKRI_PROFILE_URL'] ?? 'https://www.naukri.com/mnjuser/profile',
    naukriEmail: process.env['NAUKRI_EMAIL'] ?? '',
    agentSecret: process.env['AGENT_SECRET'] ?? '',
    schedule: DEFAULT_SCHEDULE,
    version: process.env['npm_package_version'] ?? '0.1.0',
  };
}
