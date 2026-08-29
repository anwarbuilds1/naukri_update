/**
 * Central Configuration Service for Naukri Update.
 * Handles loading, validation, defaults, persistence, migration, mapping,
 * backward compatibility, safe updates, reset, and diagnostics.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ConfigService {
  constructor() {
    this.defaults = {
      NAUKRI_PROFILE_URL: 'https://www.naukri.com/mnjuser/profile',
      NAUKRI_EMAIL: '',
      NAUKRI_PASSWORD: '',
      REFRESH_MODE: 'interval',
      REFRESH_INTERVAL_HOURS: '1',
      REFRESH_INTERVAL_MINUTES: '0',
      REFRESH_TIME: '06:11',
      RESUME_UPDATE_ENABLED: 'false',
      RESUME_UPDATE_TIME: '07:00',
      RESUME_FILE: '',
      REFRESH_WINDOW_ENABLED: 'false',
      REFRESH_WINDOW_START: '07:00',
      REFRESH_WINDOW_END: '19:00',
      RESUME_UPLOAD_TIMEOUT_MS: '120000',
    };
  }

  /**
   * Determine platform-appropriate application configuration directory.
   */
  getAppConfigDir() {
    if (process.env.NAUKRI_ENV_PATH) {
      return path.dirname(process.env.NAUKRI_ENV_PATH);
    }
    const home = process.env.HOME || process.env.USERPROFILE || '';
    let appDataDir = '';
    if (process.platform === 'win32') {
      appDataDir = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'NaukriUpdate');
    } else if (process.platform === 'darwin') {
      appDataDir = path.join(home, 'Library', 'Application Support', 'NaukriUpdate');
    } else {
      appDataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'NaukriUpdate');
    }
    return appDataDir;
  }

  /**
   * Get the path to the active .env file.
   */
  getEnvPath() {
    if (process.env.NAUKRI_ENV_PATH) {
      return process.env.NAUKRI_ENV_PATH;
    }
    return path.join(this.getAppConfigDir(), '.env');
  }

  /**
   * Load the configuration from the active env path, applying defaults.
   */
  load() {
    const envPath = this.getEnvPath();
    const config = { ...this.defaults };

    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        // Clean UTF-8 BOM if present and parse lines
        for (const line of content.replace(/^﻿/, '').split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
          if (!match) continue;
          let val = match[2];
          // Strip surrounding quotes
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          config[match[1]] = val;
        }
      } catch (err) {
        console.error('[ConfigService] Failed to read env file:', err);
      }
    }

    return config;
  }

  /**
   * Validate the settings object.
   */
  validate(settings) {
    // 1. Profile URL check
    if (settings.NAUKRI_PROFILE_URL) {
      try {
        const parsed = new URL(settings.NAUKRI_PROFILE_URL);
        if (parsed.protocol !== 'https:' || (parsed.hostname !== 'naukri.com' && !parsed.hostname.endsWith('.naukri.com')) || !parsed.pathname.startsWith('/mnjuser/')) {
          return { success: false, error: 'Profile URL must be a secure HTTPS URL pointing to naukri.com/mnjuser/profile.' };
        }
      } catch (e) {
        return { success: false, error: 'Profile URL must be a valid URL.' };
      }
    } else {
      return { success: false, error: 'Naukri Profile URL is required.' };
    }

    // 2. Email check
    if (settings.NAUKRI_EMAIL) {
      if (!settings.NAUKRI_EMAIL.includes('@')) {
        return { success: false, error: 'Email address must be valid.' };
      }
    }

    // 3. Password check
    if (settings.NAUKRI_PASSWORD === undefined) {
      return { success: false, error: 'Password is required.' };
    }

    // 4. Scheduling Check
    if (settings.REFRESH_MODE === 'interval') {
      const hours = parseInt(settings.REFRESH_INTERVAL_HOURS, 10);
      const minutes = parseInt(settings.REFRESH_INTERVAL_MINUTES, 10);
      if (isNaN(hours) || hours < 0 || isNaN(minutes) || minutes < 0 || (hours === 0 && minutes === 0)) {
        return { success: false, error: 'Headline refresh interval must be greater than 0.' };
      }
    } else if (settings.REFRESH_MODE === 'fixed_time') {
      if (!settings.REFRESH_TIME || !settings.REFRESH_TIME.match(/^([0-9]{2}):([0-9]{2})$/)) {
        return { success: false, error: 'Headline refresh fixed daily time must be in HH:MM format.' };
      }
    }

    if (settings.RESUME_UPDATE_ENABLED === 'true') {
      if (!settings.RESUME_UPDATE_TIME || !settings.RESUME_UPDATE_TIME.match(/^([0-9]{2}):([0-9]{2})$/)) {
        return { success: false, error: 'Daily resume upload time must be in HH:MM format.' };
      }
    }

    if (settings.REFRESH_WINDOW_ENABLED === 'true') {
      if (!settings.REFRESH_WINDOW_START || !settings.REFRESH_WINDOW_START.match(/^([0-9]{2}):([0-9]{2})$/) ||
          !settings.REFRESH_WINDOW_END || !settings.REFRESH_WINDOW_END.match(/^([0-9]{2}):([0-9]{2})$/)) {
        return { success: false, error: 'Active window constraints must be in HH:MM format.' };
      }
    }

    return { success: true };
  }

  /**
   * Save the configuration to the active .env file.
   */
  save(settings) {
    const currentConfig = this.load();
    const mergedConfig = { ...currentConfig, ...settings };
    if (!mergedConfig.NAUKRI_PROFILE_URL) {
      mergedConfig.NAUKRI_PROFILE_URL = this.defaults.NAUKRI_PROFILE_URL;
    }
    const validation = this.validate(mergedConfig);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const envPath = this.getEnvPath();
    const configDir = path.dirname(envPath);

    // Make sure configDir exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let existingContent = '';
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, 'utf8');
    }

    const lines = existingContent.split(/\r?\n/);
    const updatedKeys = new Set();

    // Map properties to settings keys
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) {
        const key = match[1];
        if (settings[key] !== undefined) {
          lines[i] = `${key}=${settings[key]}`;
          updatedKeys.add(key);
        }
      }
    }

    // Append new settings keys
    for (const key of Object.keys(settings)) {
      if (!updatedKeys.has(key)) {
        lines.push(`${key}=${settings[key]}`);
      }
    }

    // Filter out trailing empty lines to keep file neat
    const cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '' || (i > 0 && lines[i-1].trim() !== '')) {
        cleanLines.push(lines[i]);
      }
    }

    fs.writeFileSync(envPath, cleanLines.join('\n'), 'utf8');

    // Restrict permissions on env file (Unix chmod 0600)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(envPath, 0o600);
      } catch (e) {
        console.warn('[ConfigService] Failed to restrict permissions on .env file:', e.message);
      }
    }

    return { success: true };
  }

  /**
   * Migrate configuration from repo root to AppData.
   */
  migrate(repoDir) {
    const appConfigDir = this.getAppConfigDir();
    const appEnvPath = this.getEnvPath();
    const repoEnvPath = path.join(repoDir, '.env');

    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }

    if (!fs.existsSync(appEnvPath) && fs.existsSync(repoEnvPath)) {
      try {
        fs.copyFileSync(repoEnvPath, appEnvPath);
        console.log(`[ConfigService] Migrated .env to AppData: ${appEnvPath}`);

        // Migrate resumes
        const repoResumeDir = path.join(repoDir, 'resume');
        const appResumeDir = path.join(appConfigDir, 'resume');
        if (fs.existsSync(repoResumeDir)) {
          if (!fs.existsSync(appResumeDir)) {
            fs.mkdirSync(appResumeDir, { recursive: true });
          }
          const files = fs.readdirSync(repoResumeDir);
          for (const file of files) {
            fs.copyFileSync(path.join(repoResumeDir, file), path.join(appResumeDir, file));
          }
          console.log('[ConfigService] Migrated resume files to AppData.');
        }
        return true;
      } catch (err) {
        console.error('[ConfigService] Migration failed:', err);
      }
    }
    return false;
  }

  /**
   * Clear email and password credentials.
   */
  clearCredentials() {
    const config = this.load();
    config.NAUKRI_EMAIL = '';
    config.NAUKRI_PASSWORD = '';
    return this.save(config);
  }

  /**
   * Delete resume files and clear resume path.
   */
  deleteResume() {
    const configDir = this.getAppConfigDir();
    const resumeDir = path.join(configDir, 'resume');
    try {
      if (fs.existsSync(resumeDir)) {
        const files = fs.readdirSync(resumeDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(resumeDir, file));
          } catch (e) {}
        }
      }
    } catch (e) {}

    const config = this.load();
    config.RESUME_FILE = '';
    return this.save(config);
  }

  /**
   * Find Google Chrome executable.
   */
  findChrome() {
    const platform = process.platform;
    if (platform === 'win32') {
      const paths = [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    } else if (platform === 'darwin') {
      const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(p)) return p;
    } else {
      const candidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/snap/bin/google-chrome',
        'google-chrome',
        'google-chrome-stable',
        'chromium-browser',
        'chromium'
      ];
      for (const c of candidates) {
        if (c.startsWith('/') && fs.existsSync(c)) {
          return c;
        }
        try {
          const p = execSync(`which ${c}`, { stdio: 'pipe' }).toString().trim();
          if (p && fs.existsSync(p)) return p;
        } catch (e) {}
      }
    }
    return null;
  }

  /**
   * Check OS scheduled tasks.
   */
  isOSTaskConfigured() {
    try {
      if (process.platform === 'win32') {
        const out = execSync('schtasks /query /tn "NaukriUpdateTask"', { stdio: 'pipe' }).toString();
        return out.includes('NaukriUpdateTask');
      } else if (process.platform === 'darwin') {
        const home = process.env.HOME || '';
        const plist = path.join(home, 'Library', 'LaunchAgents', 'com.naukri.update.plist');
        return fs.existsSync(plist);
      } else {
        // Linux crontab
        const out = execSync('crontab -l', { stdio: 'pipe' }).toString();
        return out.includes('run-automation') || out.includes('NaukriUpdate');
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * Run diagnostics/checks on the configuration.
   */
  runDiagnostics() {
    const config = this.load();
    const results = {
      config: { status: 'ok', message: 'Configuration valid.' },
      credentials: { status: 'ok', message: 'Credentials configured.' },
      resume: { status: 'ok', message: 'Resume configured.' },
      chrome: { status: 'ok', message: 'Chrome available.' },
      browserProfile: { status: 'ok', message: 'Browser profile ready.' },
      scheduler: { status: 'ok', message: 'Scheduler ready.' },
      background: { status: 'ok', message: 'Background automation configured.' }
    };

    // 1. Config Validation Check
    const validation = this.validate(config);
    if (!validation.success) {
      results.config = { status: 'failed', message: validation.error };
    }

    // 2. Credentials Configured Check
    if (!config.NAUKRI_EMAIL || !config.NAUKRI_PASSWORD) {
      results.credentials = { status: 'failed', message: 'Naukri email and password are required for automated login.' };
    }

    // 3. Resume Valid Check
    const configDir = this.getAppConfigDir();
    const resumeDir = path.join(configDir, 'resume');
    let hasResume = false;
    if (fs.existsSync(resumeDir)) {
      const files = fs.readdirSync(resumeDir).filter(f => f.toLowerCase().endsWith('.pdf') && !f.startsWith('.'));
      if (files.length > 0) {
        const resumePath = path.join(resumeDir, files[0]);
        try {
          const fd = fs.openSync(resumePath, 'r');
          const buffer = Buffer.alloc(4);
          fs.readSync(fd, buffer, 0, 4, 0);
          fs.closeSync(fd);
          if (buffer.toString() === '%PDF') {
            hasResume = true;
          }
        } catch (e) {}
      }
    }
    if (!hasResume && config.RESUME_UPDATE_ENABLED === 'true') {
      results.resume = { status: 'failed', message: 'Daily resume upload is enabled but no valid resume PDF was found in resume directory.' };
    } else if (!hasResume) {
      results.resume = { status: 'failed', message: 'No valid resume PDF loaded. Required to enable daily upload automation.' };
    }

    // 4. Chrome Available Check
    const chromePath = this.findChrome();
    if (!chromePath) {
      results.chrome = { status: 'failed', message: 'Google Chrome could not be found. Please install Chrome to run automation.' };
    } else {
      results.chrome.message = `Chrome found at: ${chromePath}`;
    }

    // 5. Browser Profile Ready Check
    const profileDir = path.join(configDir, '.naukri-chrome-profile');
    if (!fs.existsSync(profileDir)) {
      results.browserProfile = { status: 'failed', message: 'Browser profile directory not created yet. Connecting Chrome will initialize it.' };
    } else {
      results.browserProfile.message = `Profile initialized at: ${profileDir}`;
    }

    // 6. Scheduler script ready
    const schedulerPath = path.join(__dirname, 'scripts', 'scheduler.js');
    if (!fs.existsSync(schedulerPath)) {
      results.scheduler = { status: 'failed', message: 'Scheduler script was not found in scripts/ directory.' };
    }

    // 7. Background Runtime Task Configured
    const isScheduled = this.isOSTaskConfigured();
    const automationsEnabled = (config.REFRESH_MODE === 'interval' || config.REFRESH_MODE === 'fixed_time' || config.RESUME_UPDATE_ENABLED === 'true');
    if (!isScheduled && automationsEnabled) {
      results.background = { status: 'failed', message: 'Background scheduler is enabled but OS task scheduler hook is missing.' };
    } else if (!isScheduled) {
      results.background = { status: 'failed', message: 'Background scheduler is not configured. Saving settings will register the task.' };
    }

    return results;
  }
}

module.exports = new ConfigService();
