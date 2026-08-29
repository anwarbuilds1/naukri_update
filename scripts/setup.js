#!/usr/bin/env node
/**
 * =============================================================
 * Naukri Update — One-Command Setup Bootstrapper
 * =============================================================
 *
 * Run with:  npm run setup
 *
 * Phases:
 *   1. Environment Detection  (OS, Node.js, Chrome)
 *   2. Dependency Installation (npm install)
 *   3. Directory Initialization
 *   4. Configuration Migration / Initialization
 *   5. [reserved — handled in-app] Browser Preparation
 *   6. [reserved — handled in-app] Background Automation
 *   7. Launch Desktop Application
 */

'use strict';

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { execSync, execFile, spawnSync } = require('child_process');

// ─────────────────────────────────────────────
// ANSI helpers
// ─────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};

function log(msg)        { process.stdout.write(msg + '\n'); }
function ok(msg)         { log(`  ${c.green}✓${c.reset}  ${msg}`); }
function warn(msg)       { log(`  ${c.yellow}⚠${c.reset}  ${msg}`); }
function fail(msg)       { log(`  ${c.red}✗${c.reset}  ${msg}`); }
function info(msg)       { log(`  ${c.cyan}→${c.reset}  ${msg}`); }
function header(title)   { log(`\n${c.bold}${c.cyan}${title}${c.reset}`); }
function divider()       { log(`${c.dim}${'─'.repeat(56)}${c.reset}`); }

// ─────────────────────────────────────────────
// Platform helpers
// ─────────────────────────────────────────────
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'
const ROOT_DIR = path.resolve(__dirname, '..');

function platformLabel() {
  if (PLATFORM === 'win32')  return 'Windows';
  if (PLATFORM === 'darwin') return 'macOS';
  return 'Linux';
}

// ─────────────────────────────────────────────
// PHASE 1 — Environment Detection
// ─────────────────────────────────────────────
function detectEnvironment() {
  header('PHASE 1 — Environment Detection');
  divider();

  // OS
  ok(`Operating System : ${platformLabel()} (${os.release()})`);
  ok(`Architecture     : ${os.arch()}`);

  // Node.js version
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 18) {
    fail(`Node.js ${process.versions.node} detected — version 18 or higher is required.`);
    log('');
    log(`  ${c.bold}Please upgrade Node.js:${c.reset}`);
    log(`    • Visit https://nodejs.org and download the LTS installer.`);
    log(`    • Re-run: ${c.bold}npm run setup${c.reset} after upgrading.`);
    log('');
    process.exit(1);
  }
  ok(`Node.js          : v${process.versions.node} ✓`);

  // npm
  try {
    const npmVer = execSync('npm --version', { encoding: 'utf8' }).trim();
    ok(`npm              : v${npmVer} ✓`);
  } catch {
    fail('npm was not found on PATH. This is unusual — reinstall Node.js to fix it.');
    process.exit(1);
  }

  // Google Chrome
  const chromePath = detectChrome();
  if (chromePath) {
    ok(`Google Chrome    : found`);
    ok(`  Path           : ${chromePath}`);
  } else {
    warn('Google Chrome    : NOT FOUND');
    warn('  Chrome is required for browser automation.');
    warn('  Install it from https://www.google.com/chrome/');
    warn('  You can still complete setup and install Chrome later.');
  }

  log('');
}

function detectChrome() {
  const candidates = {
    win32:  [
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.PROGRAMFILES || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ],
    linux:  [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ],
  };

  const paths = candidates[PLATFORM] || candidates.linux;
  return paths.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || null;
}

// ─────────────────────────────────────────────
// PHASE 2 — Dependency Installation
// ─────────────────────────────────────────────
function installDependencies() {
  header('PHASE 2 — Dependency Installation');
  divider();

  const nodeModules = path.join(ROOT_DIR, 'node_modules');
  const electronBin  = path.join(nodeModules, '.bin', PLATFORM === 'win32' ? 'electron.cmd' : 'electron');

  // Check if already installed
  if (fs.existsSync(nodeModules) && fs.existsSync(electronBin)) {
    ok('Dependencies already installed — skipping.');
    log('');
    return;
  }

  info('Installing dependencies (this may take a moment)...');

  const result = spawnSync('npm', ['install', '--prefer-offline'], {
    cwd:   ROOT_DIR,
    stdio: 'inherit',
    shell: PLATFORM === 'win32',
  });

  if (result.status !== 0) {
    log('');
    fail('npm install failed.');
    log(`  Run ${c.bold}npm install${c.reset} manually to see the full error output.`);
    process.exit(1);
  }

  ok('Dependencies installed successfully.');
  log('');
}

// ─────────────────────────────────────────────
// PHASE 3 — Directory Initialization
// ─────────────────────────────────────────────
function getAppDataDir() {
  // Mirror the logic in config-service.js so paths are consistent
  const home = os.homedir();
  if (PLATFORM === 'win32')  return path.join(process.env.APPDATA || home, 'naukri-update');
  if (PLATFORM === 'darwin') return path.join(home, 'Library', 'Application Support', 'naukri-update');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'naukri-update');
}

function initDirectories() {
  header('PHASE 3 — Application Directory Initialization');
  divider();

  const appDataDir = getAppDataDir();
  const subdirs = ['resume', 'logs', 'temp'];

  ensureDir(appDataDir);
  ok(`App data directory : ${appDataDir}`);

  subdirs.forEach(sub => {
    ensureDir(path.join(appDataDir, sub));
    ok(`  /${sub}`);
  });

  log('');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ─────────────────────────────────────────────
// PHASE 4 — Configuration Migration / Init
// ─────────────────────────────────────────────
function initConfiguration() {
  header('PHASE 4 — Configuration Initialization');
  divider();

  // Try to load ConfigService (only available after npm install)
  let ConfigService;
  try {
    ConfigService = require(path.join(ROOT_DIR, 'config-service'));
  } catch (e) {
    warn('Could not load ConfigService — configuration will be initialized on first app launch.');
    log('');
    return;
  }

  // Migrate any repo-root .env to AppData
  ConfigService.migrate(ROOT_DIR);

  const envPath = ConfigService.getEnvPath();
  const appCfgDir = ConfigService.getAppConfigDir();

  if (fs.existsSync(envPath)) {
    ok(`Existing configuration found.`);
    ok(`  Path : ${envPath}`);
    info('Settings will be pre-loaded in the onboarding wizard on first launch.');
    info('You can choose to import them or start fresh from the in-app wizard.');
  } else {
    info('No existing configuration found.');
    info('The in-app onboarding wizard will guide you through setup.');
    // Create an empty .env so the app can detect its presence
    try {
      fs.writeFileSync(envPath, '# Naukri Update Configuration\n# Managed by the desktop application.\n', { mode: 0o600 });
      ok(`Configuration file created at: ${envPath}`);
    } catch (e) {
      warn(`Could not create config file: ${e.message}`);
    }
  }

  log('');
}

// ─────────────────────────────────────────────
// PHASE 7 — Launch Desktop Application
// ─────────────────────────────────────────────
function launchApp() {
  header('PHASE 7 — Launching Desktop Application');
  divider();

  const electronBin = path.join(
    ROOT_DIR, 'node_modules', '.bin',
    PLATFORM === 'win32' ? 'electron.cmd' : 'electron'
  );

  if (!fs.existsSync(electronBin)) {
    fail('Electron binary not found. Dependencies may not have installed correctly.');
    log(`  Try running ${c.bold}npm install${c.reset} manually, then ${c.bold}npm start${c.reset}.`);
    process.exit(1);
  }

  log('');
  log(`  ${c.bold}${c.green}Naukri Update setup complete.${c.reset}`);
  log('');
  log(`  ${c.cyan}Launching Naukri Update...${c.reset}`);
  log('');
  log(`  ${c.dim}You can close this terminal window.${c.reset}`);
  log('');

  // Detach the Electron process so the terminal can be closed
  const { spawn } = require('child_process');
  const child = spawn(
    electronBin,
    ['main.js', '--no-sandbox'],
    {
      cwd:      ROOT_DIR,
      detached: true,
      stdio:    'ignore',
    }
  );
  child.unref();
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
function main() {
  log('');
  log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗${c.reset}`);
  log(`${c.bold}${c.cyan}║         Naukri Update — Setup & Launch           ║${c.reset}`);
  log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════╝${c.reset}`);
  log('');

  try {
    detectEnvironment();
    installDependencies();
    initDirectories();
    initConfiguration();
    launchApp();
  } catch (err) {
    log('');
    fail('Setup encountered an unexpected error:');
    log(`  ${c.red}${err.message}${c.reset}`);
    log('');
    info('This is safe to retry. Run the same command again:');
    log(`    ${c.bold}npm run setup${c.reset}`);
    log('');
    process.exit(1);
  }
}

main();
