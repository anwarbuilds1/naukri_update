/**
 * Central Configuration Service for Naukri Update.
 * Handles loading, validation, defaults, disk persistence (config.json + .env sync),
 * OS secure credential integration, migration, schema versioning, and diagnostics.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const SecureStoreService = require('./secure-store');

class ConfigService {
  constructor() {
    this.SCHEMA_VERSION = 1;
    this.defaults = {
      version: 1,
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
   * Get path to active config.json file.
   */
  getConfigJsonPath() {
    return path.join(this.getAppConfigDir(), 'config.json');
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
   * Secure store instance bound to AppData directory.
   */
  getSecureStore() {
    return new SecureStoreService(this.getAppConfigDir());
  }

  /**
   * Load configuration from disk, performing schema migrations and secure password resolution.
   */
  load() {
    const jsonPath = this.getConfigJsonPath();
    const envPath = this.getEnvPath();
    let config = { ...this.defaults };
    let loadedFromDisk = false;

    // 1. Try loading from config.json first (Primary Source of Truth)
    if (fs.existsSync(jsonPath)) {
      try {
        const rawJson = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(rawJson);
        config = { ...this.defaults, ...parsed };
        loadedFromDisk = true;
      } catch (err) {
        console.error('[ConfigService] Corrupted config.json detected. Backing up:', err.message);
        try {
          fs.renameSync(jsonPath, `${jsonPath}.bak.${Date.now()}`);
        } catch (e) {}
      }
    }

    // 2. Fallback to .env if config.json was not loaded
    if (!loadedFromDisk && fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.replace(/^﻿/, '').split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
          if (!match) continue;
          let val = match[2];
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          config[match[1]] = val;
        }
        loadedFromDisk = true;
      } catch (err) {
        console.error('[ConfigService] Failed to read env file:', err.message);
      }
    }

    // 3. Resolve Secure Credentials (Password)
    const secureStore = this.getSecureStore();
    let securePass = secureStore.getPassword();

    if (!securePass && config.NAUKRI_PASSWORD && config.NAUKRI_PASSWORD !== '[SECURE_STORE]') {
      // Migrate plain-text password from legacy .env into SecureStore
      secureStore.setPassword(config.NAUKRI_PASSWORD);
      securePass = config.NAUKRI_PASSWORD;
    }

    config.NAUKRI_PASSWORD = securePass || '';

    // 4. Schema Migration check
    if (config.version === undefined || config.version < this.SCHEMA_VERSION) {
      config.version = this.SCHEMA_VERSION;
    }

    // 5. Check Resume File Availability without destroying settings
    const resumeInfo = this.checkResumeHealth(config.RESUME_FILE);
    config.RESUME_FILE_EXISTS = resumeInfo.exists;
    config.RESUME_FILE_STATUS = resumeInfo.status;
    if (resumeInfo.exists && resumeInfo.resolvedPath) {
      config.RESUME_FILE = resumeInfo.relativePath;
    }

    return config;
  }

  /**
   * Health check for resume file without deleting configuration.
   */
  checkResumeHealth(savedPath) {
    const configDir = this.getAppConfigDir();
    const resumeDir = path.join(configDir, 'resume');

    // 1. Check directory resume file
    if (fs.existsSync(resumeDir)) {
      try {
        const files = fs.readdirSync(resumeDir).filter(f => f.toLowerCase().endsWith('.pdf') && !f.startsWith('.'));
        if (files.length > 0) {
          const targetFile = files[0];
          const fullPath = path.join(resumeDir, targetFile);
          if (fs.existsSync(fullPath)) {
            return {
              exists: true,
              status: 'Available',
              resolvedPath: fullPath,
              relativePath: `resume/${targetFile}`
            };
          }
        }
      } catch (e) {}
    }

    // 2. Check explicit path
    if (savedPath) {
      const fullPath = path.isAbsolute(savedPath) ? savedPath : path.join(configDir, savedPath);
      if (fs.existsSync(fullPath)) {
        return {
          exists: true,
          status: 'Available',
          resolvedPath: fullPath,
          relativePath: savedPath
        };
      }
    }

    return {
      exists: false,
      status: savedPath ? 'File not found' : 'Unconfigured',
      resolvedPath: null,
      relativePath: savedPath || ''
    };
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

    // 3. Scheduling Check
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
   * Save configuration to disk atomically with secure credential separation and .env sync.
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

    const configDir = this.getAppConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 1. Save Password to SecureStore and exclude from plain-text json/env
    if (settings.NAUKRI_PASSWORD !== undefined && settings.NAUKRI_PASSWORD !== '••••••••') {
      const secureStore = this.getSecureStore();
      if (settings.NAUKRI_PASSWORD) {
        secureStore.setPassword(settings.NAUKRI_PASSWORD);
      } else {
        secureStore.clearPassword();
      }
    }

    // Prepare JSON payload (Excludes plain-text password)
    const jsonPayload = { ...mergedConfig };
    delete jsonPayload.NAUKRI_PASSWORD;
    delete jsonPayload.RESUME_FILE_EXISTS;
    delete jsonPayload.RESUME_FILE_STATUS;
    jsonPayload.version = this.SCHEMA_VERSION;

    // 2. Atomic Write to config.json
    const jsonPath = this.getConfigJsonPath();
    const jsonTmp = `${jsonPath}.tmp`;
    fs.writeFileSync(jsonTmp, JSON.stringify(jsonPayload, null, 2), 'utf8');
    if (process.platform !== 'win32') {
      try { fs.chmodSync(jsonTmp, 0o600); } catch (e) {}
    }
    fs.renameSync(jsonTmp, jsonPath);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(jsonPath, 0o600); } catch (e) {}
    }

    // 3. Synchronize non-sensitive settings to .env for CLI compatibility
    const envPath = this.getEnvPath();
    const envData = { ...jsonPayload, NAUKRI_PASSWORD: '[SECURE_STORE]' };
    
    let existingContent = '';
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, 'utf8');
    }

    const lines = existingContent.split(/\r?\n/);
    const updatedKeys = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) {
        const key = match[1];
        if (envData[key] !== undefined) {
          lines[i] = `${key}=${envData[key]}`;
          updatedKeys.add(key);
        }
      }
    }

    for (const key of Object.keys(envData)) {
      if (!updatedKeys.has(key) && key !== 'version') {
        lines.push(`${key}=${envData[key]}`);
      }
    }

    const cleanLines = lines.filter((l, idx, arr) => l.trim() !== '' || (idx > 0 && arr[idx - 1].trim() !== ''));
    const envTmp = `${envPath}.tmp`;
    fs.writeFileSync(envTmp, cleanLines.join('\n'), 'utf8');
    if (process.platform !== 'win32') {
      try { fs.chmodSync(envTmp, 0o600); } catch (e) {}
    }
    fs.renameSync(envTmp, envPath);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(envPath, 0o600); } catch (e) {}
    }

    return { success: true };
  }

  /**
   * Migrate configuration from repo root to AppData.
   */
  migrate(repoDir) {
    const appConfigDir = this.getAppConfigDir();
    const jsonPath = this.getConfigJsonPath();
    const envPath = this.getEnvPath();
    const repoEnvPath = path.join(repoDir, '.env');

    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }

    if (!fs.existsSync(jsonPath) && !fs.existsSync(envPath) && fs.existsSync(repoEnvPath)) {
      try {
        fs.copyFileSync(repoEnvPath, envPath);
        console.log(`[ConfigService] Migrated .env to AppData: ${envPath}`);

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
        
        // Convert to config.json & SecureStore
        this.save(this.load());
        return true;
      } catch (err) {
        console.error('[ConfigService] Migration failed:', err);
      }
    }
    return false;
  }

  /**
   * Clear email and password credentials safely.
   */
  clearCredentials() {
    const secureStore = this.getSecureStore();
    secureStore.clearPassword();
    
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
   * Perform full intentional application reset.
   */
  resetAll() {
    const configDir = this.getAppConfigDir();
    const filesToDelete = [
      'config.json',
      'config.json.tmp',
      '.env',
      '.env.tmp',
      '.credentials.enc',
      '.credentials.enc.tmp',
      '.naukri-refresh-state.json',
      'naukri-refresh.log',
      'naukri-hourly-refresh.log',
      'naukri-app.log',
      'chrome_startup.log',
      '.naukri-hourly-refresh.lock'
    ];

    for (const f of filesToDelete) {
      try {
        const p = path.join(configDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {}
    }

    const resumeDir = path.join(configDir, 'resume');
    try {
      if (fs.existsSync(resumeDir)) {
        const files = fs.readdirSync(resumeDir);
        for (const f of files) {
          try { fs.unlinkSync(path.join(resumeDir, f)); } catch (e) {}
        }
      }
    } catch (e) {}

    const profileDir = path.join(configDir, '.naukri-chrome-profile');
    try {
      if (fs.existsSync(profileDir)) {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    } catch (e) {}

    const secureStore = this.getSecureStore();
    secureStore.clearPassword();

    return { success: true };
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

    const validation = this.validate(config);
    if (!validation.success) {
      results.config = { status: 'failed', message: validation.error };
    }

    if (!config.NAUKRI_EMAIL || !config.NAUKRI_PASSWORD) {
      results.credentials = { status: 'failed', message: 'Naukri email and password are required for automated login.' };
    }

    const health = this.checkResumeHealth(config.RESUME_FILE);
    if (!health.exists && config.RESUME_UPDATE_ENABLED === 'true') {
      results.resume = { status: 'failed', message: 'Daily resume upload is enabled but no valid resume PDF was found.' };
    } else if (!health.exists) {
      results.resume = { status: 'failed', message: 'No valid resume PDF loaded.' };
    }

    const chromePath = this.findChrome();
    if (!chromePath) {
      results.chrome = { status: 'failed', message: 'Google Chrome could not be found. Please install Chrome.' };
    } else {
      results.chrome.message = `Chrome found at: ${chromePath}`;
    }

    const configDir = this.getAppConfigDir();
    const profileDir = path.join(configDir, '.naukri-chrome-profile');
    if (!fs.existsSync(profileDir)) {
      results.browserProfile = { status: 'failed', message: 'Browser profile directory not created yet.' };
    } else {
      results.browserProfile.message = `Profile initialized at: ${profileDir}`;
    }

    const schedulerPath = path.join(__dirname, 'scripts', 'scheduler.js');
    if (!fs.existsSync(schedulerPath)) {
      results.scheduler = { status: 'failed', message: 'Scheduler script was not found in scripts/ directory.' };
    }

    const isScheduled = this.isOSTaskConfigured();
    const automationsEnabled = (config.REFRESH_MODE === 'interval' || config.REFRESH_MODE === 'fixed_time' || config.RESUME_UPDATE_ENABLED === 'true');
    if (!isScheduled && automationsEnabled) {
      results.background = { status: 'failed', message: 'Background scheduler is enabled but OS task scheduler hook is missing.' };
    } else if (!isScheduled) {
      results.background = { status: 'failed', message: 'Background scheduler is not configured.' };
    }

    return results;
  }
}

module.exports = new ConfigService();
