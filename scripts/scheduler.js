/**
/**
 * Scheduler assistant to parse and validate scheduling configuration from .env,
 * read/write refresh state, and decide whether a task should run.
 */
const fs = require('fs');
const path = require('path');

const repoDir = path.join(__dirname, '..');
const stateFile = path.join(repoDir, '.naukri-refresh-state.json');

// Simple helper to load .env manually to avoid dependencies
function loadEnv() {
  const envPath = path.join(repoDir, '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let val = match[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
  return env;
}

const env = loadEnv();
const getEnv = (key, def = '') => (env[key] !== undefined && env[key] !== '' ? env[key] : def);

// Validation helpers
function validateTime(timeStr, fieldName) {
  if (!timeStr) {
    throw new Error(`Required configuration "${fieldName}" is missing or empty.`);
  }
  const match = timeStr.trim().match(/^([0-9]{2}):([0-9]{2})$/);
  if (!match) {
    throw new Error(`Invalid format for "${fieldName}": "${timeStr}". Must be HH:MM (24-hour).`);
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time values for "${fieldName}": "${timeStr}". Hours must be 00-23, minutes 00-59.`);
  }
  return { hours, minutes };
}

function validateInteger(valStr, fieldName, min = 0) {
  const parsed = parseInt(valStr, 10);
  if (isNaN(parsed) || String(parsed) !== String(valStr).trim() || parsed < min) {
    throw new Error(`Invalid value for "${fieldName}": "${valStr}". Must be an integer >= ${min}.`);
  }
  return parsed;
}

function isTimeInWindow(now, startStr, endStr) {
  const start = validateTime(startStr, 'REFRESH_WINDOW_START');
  const end = validateTime(endStr, 'REFRESH_WINDOW_END');
  
  if (start.hours === end.hours && start.minutes === end.minutes) {
    // If start == end, window is active the entire day (always active)
    return true;
  }
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Crosses midnight, e.g., 22:00 -> 02:00
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function getSchedulerConfig() {
  const refreshMode = getEnv('REFRESH_MODE', 'interval');
  if (refreshMode !== 'interval' && refreshMode !== 'fixed_time') {
    throw new Error(`Invalid REFRESH_MODE: "${refreshMode}". Must be "interval" or "fixed_time".`);
  }

  const config = {
    refreshMode,
    refreshIntervalHours: 1,
    refreshIntervalMinutes: 0,
    refreshTime: '',
    refreshWindowEnabled: getEnv('REFRESH_WINDOW_ENABLED', 'false') === 'true',
    refreshWindowStart: getEnv('REFRESH_WINDOW_START', ''),
    refreshWindowEnd: getEnv('REFRESH_WINDOW_END', ''),
    resumeUpdateEnabled: getEnv('RESUME_UPDATE_ENABLED', 'false') === 'true',
    resumeUpdateTime: getEnv('RESUME_UPDATE_TIME', '07:00'),
    resumeFile: getEnv('RESUME_FILE', 'resume/Anwar_Rizwan_Resume.pdf'),
  };

  if (refreshMode === 'interval') {
    config.refreshIntervalHours = validateInteger(getEnv('REFRESH_INTERVAL_HOURS', '1'), 'REFRESH_INTERVAL_HOURS');
    config.refreshIntervalMinutes = validateInteger(getEnv('REFRESH_INTERVAL_MINUTES', '0'), 'REFRESH_INTERVAL_MINUTES');
    if (config.refreshIntervalHours === 0 && config.refreshIntervalMinutes === 0) {
      throw new Error('Total refresh interval must be greater than zero.');
    }
  } else if (refreshMode === 'fixed_time') {
    config.refreshTime = getEnv('REFRESH_TIME', '');
    validateTime(config.refreshTime, 'REFRESH_TIME');
  }

  if (config.refreshWindowEnabled) {
    validateTime(config.refreshWindowStart, 'REFRESH_WINDOW_START');
    validateTime(config.refreshWindowEnd, 'REFRESH_WINDOW_END');
  }

  if (config.resumeUpdateEnabled) {
    validateTime(config.resumeUpdateTime, 'RESUME_UPDATE_TIME');
  }

  return config;
}

function getState() {
  if (fs.existsSync(stateFile)) {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      // If corrupted, return default empty state
    }
  }
  return { lastRefreshTime: 0, lastResumeUploadTime: 0 };
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

function checkRefreshDue(config, state, now) {
  // Check active time window first
  if (config.refreshWindowEnabled) {
    if (!isTimeInWindow(now, config.refreshWindowStart, config.refreshWindowEnd)) {
      return false;
    }
  }

  if (config.refreshMode === 'interval') {
    const intervalMs = (config.refreshIntervalHours * 3600 + config.refreshIntervalMinutes * 60) * 1000;
    if (!state.lastRefreshTime) return true;
    return (now.getTime() - state.lastRefreshTime) >= intervalMs;
  } else if (config.refreshMode === 'fixed_time') {
    const sched = validateTime(config.refreshTime, 'REFRESH_TIME');
    const targetToday = new Date(now);
    targetToday.setHours(sched.hours, sched.minutes, 0, 0);

    if (now >= targetToday) {
      return !state.lastRefreshTime || state.lastRefreshTime < targetToday.getTime();
    }
    return false;
  }
  return false;
}

function checkResumeDue(config, state, now) {
  if (!config.resumeUpdateEnabled) return false;
  
  const sched = validateTime(config.resumeUpdateTime, 'RESUME_UPDATE_TIME');
  const targetToday = new Date(now);
  targetToday.setHours(sched.hours, sched.minutes, 0, 0);

  if (now >= targetToday) {
    return !state.lastResumeUploadTime || state.lastResumeUploadTime < targetToday.getTime();
  }
  return false;
}

function rotateLogs(logFile) {
  if (!fs.existsSync(logFile)) return;
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const runs = content.split(/^=== RUN START ===/m);
    if (runs[0].trim() !== '' || runs.length > 6) {
      const keptRuns = runs.length > 6 ? runs.slice(runs.length - 5) : runs.slice(1);
      const newContent = keptRuns.map(run => '=== RUN START ===' + run).join('');
      fs.writeFileSync(logFile, newContent, 'utf8');
    }
  } catch (err) {
    console.error(`Failed to rotate logs: ${err.message}`);
  }
}

// MAIN CLI EXECUTION
const args = process.argv.slice(2);
const command = args[0];

try {
  const config = getSchedulerConfig();
  const state = getState();
  const now = new Date();

  if (command === '--validate') {
    console.log('SUCCESS: Configuration is valid.');
    console.log('Parsed Scheduling Config:', JSON.stringify(config, null, 2));
    console.log('Current State:', JSON.stringify(state, null, 2));
    process.exit(0);
  }

  if (command === '--should-refresh') {
    const due = checkRefreshDue(config, state, now);
    process.exit(due ? 0 : 1);
  }

  if (command === '--should-upload-resume') {
    const due = checkResumeDue(config, state, now);
    process.exit(due ? 0 : 1);
  }

  if (command === '--update-refresh-time') {
    state.lastRefreshTime = now.getTime();
    saveState(state);
    console.log(`Updated lastRefreshTime to: ${now.toISOString()}`);
    process.exit(0);
  }

  if (command === '--update-resume-time') {
    state.lastResumeUploadTime = now.getTime();
    saveState(state);
    console.log(`Updated lastResumeUploadTime to: ${now.toISOString()}`);
    process.exit(0);
  }

  if (command === '--rotate-logs') {
    const logFile = args[1];
    if (!logFile) {
      console.error('ERROR: Missing log file path for --rotate-logs');
      process.exit(1);
    }
    rotateLogs(logFile);
    process.exit(0);
  }

  console.error(`Unknown scheduler command: "${command}"`);
  process.exit(1);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
