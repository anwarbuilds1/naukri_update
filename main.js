const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, nativeImage, shell } = require('electron');
app.name = 'Naukri Update';
const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');
const http = require('http');

const ConfigService = require('./config-service');

// Perform migration of repo .env to AppData if applicable
ConfigService.migrate(__dirname);

const configDir = ConfigService.getAppConfigDir();
const ACTIVE_ENV_PATH = ConfigService.getEnvPath();
const appLogPath = path.join(configDir, 'naukri-app.log');

function logAppInfo(message, details = '') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message} ${details}`.trim();
  console.log(line);
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.appendFileSync(appLogPath, `${line}\n`, 'utf8');
  } catch (e) { }
}

process.on('uncaughtException', (err) => {
  logAppInfo('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : String(err));
});

process.on('unhandledRejection', (reason) => {
  logAppInfo('UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : String(reason));
});

// CLI Arguments parsing
const args = process.argv;
const isHeadlessRun = args.includes('--run-automation');

logAppInfo('=== APPLICATION STARTUP ===');
logAppInfo(`App Name: ${app.name}`);
logAppInfo(`Platform: ${process.platform} (${process.arch})`);
logAppInfo(`Node Version: ${process.versions.node}`);
logAppInfo(`Electron Version: ${process.versions.electron}`);
logAppInfo(`Executable Path: ${process.execPath}`);
logAppInfo(`Resources Path: ${process.resourcesPath || 'N/A'}`);
logAppInfo(`App Path (__dirname): ${__dirname}`);
logAppInfo(`Config Directory: ${configDir}`);
logAppInfo(`Active Env Path: ${ACTIVE_ENV_PATH}`);
logAppInfo(`Is Headless Run: ${isHeadlessRun}`);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let checkIntervalTimer = null;
let chromeProcess = null;

// Initialize configuration if neither config.json nor .env exists
const jsonPath = ConfigService.getConfigJsonPath();
if (!fs.existsSync(jsonPath) && !fs.existsSync(ACTIVE_ENV_PATH)) {
  ConfigService.save(ConfigService.defaults);
}

// Helpers for IPC compatibility/legacy access
function loadEnvFile() {
  return ConfigService.load();
}

function saveEnvFile(envData) {
  ConfigService.save(envData);
}

// OS level scheduler operations
function isNaukriCronLine(line) {
  if (!line || line.trim() === '') return false;
  const l = line.toLowerCase();
  return l.includes('naukri') || l.includes('--run-automation') || l.includes('naukri-refresh-runner') || l.includes('hourly-naukri-refresh');
}

function getProductionAppPath() {
  const appPath = app.getPath('exe');
  // If running in dev mode via node_modules/electron/dist/electron
  if (!app.isPackaged) {
    const candidates = [
      '/opt/Naukri Update/naukri-update',
      '/usr/bin/naukri-update',
      '/usr/local/bin/naukri-update'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return appPath;
}

function configureOSSchedule(envData) {
  const isEnabled = envData.REFRESH_MODE === 'interval' || envData.REFRESH_MODE === 'fixed_time' || envData.RESUME_UPDATE_ENABLED === 'true';
  const appPath = getProductionAppPath();

  if (process.platform === 'win32') {
    const taskName = "NaukriUpdateTask";
    try {
      try {
        execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'ignore' });
      } catch (e) {}

      if (isEnabled) {
        execSync(`schtasks /create /tn "${taskName}" /tr "\\"${appPath}\\" --run-automation" /sc minute /mo 15 /f`, { stdio: 'ignore' });
        console.log('Windows scheduled task updated.');
      }
    } catch (err) {
      console.error('Failed to configure Windows Task Scheduler:', err);
    }
  } else if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    const plistPath = path.join(home, 'Library', 'LaunchAgents', 'com.naukri.update.plist');
    try {
      if (fs.existsSync(plistPath)) {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
        fs.unlinkSync(plistPath);
      }

      if (isEnabled) {
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.naukri.update</string>
    <key>ProgramArguments</key>
    <array>
        <string>${appPath}</string>
        <string>--run-automation</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;
        fs.writeFileSync(plistPath, plistContent, 'utf8');
        execSync(`launchctl load "${plistPath}"`, { stdio: 'ignore' });
        console.log('macOS LaunchAgent updated.');
      }
    } catch (err) {
      console.error('Failed to configure macOS LaunchAgent:', err);
    }
  } else {
    // Linux cron
    try {
      let cronContent = '';
      try {
        cronContent = execSync('crontab -l', { stdio: 'pipe' }).toString();
      } catch (e) {}

      // Idempotently strip all existing Naukri entries (dev, prod, scripts, duplicates)
      const lines = cronContent.split('\n').filter(line => !isNaukriCronLine(line) && line.trim() !== '');

      if (isEnabled) {
        lines.push(`*/15 * * * * DISPLAY=:1 XDG_RUNTIME_DIR=/run/user/${process.getuid()} "${appPath}" --run-automation > /dev/null 2>&1`);
      }

      const newCron = lines.length > 0 ? lines.join('\n') + '\n' : '';
      const tempCronFile = path.join(configDir, 'temp_cron');
      fs.writeFileSync(tempCronFile, newCron, 'utf8');
      execSync(`crontab "${tempCronFile}"`, { stdio: 'ignore' });
      if (fs.existsSync(tempCronFile)) fs.unlinkSync(tempCronFile);
      console.log(`Linux crontab updated cleanly. Retained ${lines.length} lines. Naukri job active: ${isEnabled}`);
    } catch (err) {
      console.error('Failed to configure Linux crontab:', err);
    }
  }
}

// Chrome CDP check
function checkCDPAvailable() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:9222/json/version', { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Find Google Chrome Executable
function findChromeExecutable() {
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
    // Linux
    const candidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
    for (const c of candidates) {
      try {
        const p = execSync(`which ${c}`, { stdio: 'pipe' }).toString().trim();
        if (p && fs.existsSync(p)) return p;
      } catch (e) { }
    }
  }
  return null;
}

// Start Chrome
function ensureChromeRunning() {
  return checkCDPAvailable().then((available) => {
    if (available) return true;

    const chromePath = findChromeExecutable();
    if (!chromePath) {
      console.error('Chrome executable not found on this system.');
      return false;
    }

    const profileDir = path.join(configDir, '.naukri-chrome-profile');

    // Clean SingletonLock on Linux/macOS
    const lockFile = path.join(profileDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch (e) { }
    }

    const chromeArgs = [
      '--remote-debugging-port=9222',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDir}`,
      'https://www.naukri.com/mnjuser/profile'
    ];

    console.log(`Launching Chrome: ${chromePath} ${chromeArgs.join(' ')}`);
    chromeProcess = spawn(chromePath, chromeArgs, {
      detached: true,
      stdio: 'ignore'
    });
    chromeProcess.unref();

    // Poll for CDP
    return new Promise((resolve) => {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        checkCDPAvailable().then((ready) => {
          if (ready) {
            clearInterval(poll);
            resolve(true);
          } else if (attempts >= 30) {
            clearInterval(poll);
            resolve(false);
          }
        });
      }, 1000);
    });
  });
}

// Running scheduler checks headlessly or in-app
function checkTaskDue(flag) {
  try {
    const schedulerPath = path.join(__dirname, 'scripts', 'scheduler.js');
    execSync(`"${process.execPath}" "${schedulerPath}" ${flag}`, {
      env: { ...process.env, NAUKRI_ENV_PATH: ACTIVE_ENV_PATH, ELECTRON_RUN_AS_NODE: '1' }
    });
    return true; // 0 exit code means due
  } catch (e) {
    return false; // non-zero means not due
  }
}

function updateLastRunTime(flag) {
  try {
    const schedulerPath = path.join(__dirname, 'scripts', 'scheduler.js');
    execSync(`"${process.execPath}" "${schedulerPath}" ${flag}`, {
      env: { ...process.env, NAUKRI_ENV_PATH: ACTIVE_ENV_PATH, ELECTRON_RUN_AS_NODE: '1' }
    });
  } catch (e) {
    console.error(`Failed to update runtime state for ${flag}:`, e);
  }
}

function runAutomationTask(flag) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'naukri-profile-refresh.js');
    const child = spawn(process.execPath, [scriptPath, flag], {
      env: { ...process.env, NAUKRI_ENV_PATH: ACTIVE_ENV_PATH, ELECTRON_RUN_AS_NODE: '1' }
    });

    let output = '';
    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => output += data.toString());

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Failed with code ${code}.\n${output}`));
      }
    });
  });
}

// Main background scheduler execution
function executeDueTasks() {
  const shouldRefresh = checkTaskDue('--should-refresh');
  const shouldUpload = checkTaskDue('--should-upload-resume');

  if (!shouldRefresh && !shouldUpload) return;

  ensureChromeRunning().then((chromeReady) => {
    if (!chromeReady) {
      showNotification('Automation Failed', 'Could not open dedicated Chrome profile for automation.');
      return;
    }

    let chain = Promise.resolve();

    if (shouldRefresh) {
      chain = chain.then(() => {
        return runAutomationTask('--refresh-headline')
          .then(() => {
            updateLastRunTime('--update-refresh-time');
            showNotification('Profile Refreshed', 'Naukri resume headline refreshed successfully.');
          })
          .catch((err) => {
            showNotification('Headline Refresh Failed', err.message.split('\n')[0]);
          });
      });
    }

    if (shouldUpload) {
      chain = chain.then(() => {
        return runAutomationTask('--upload-resume')
          .then(() => {
            updateLastRunTime('--update-resume-time');
            showNotification('Resume Uploaded', 'Naukri resume PDF uploaded and verified.');
          })
          .catch((err) => {
            showNotification('Resume Upload Failed', err.message.split('\n')[0]);
          });
      });
    }
  });
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
  }
}

const lockFilePath = path.join(configDir, '.naukri-automation.lock');

function acquireAutomationLock() {
  if (fs.existsSync(lockFilePath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
      const ageMs = Date.now() - (lockData.timestamp || 0);
      const isStale = ageMs > 30 * 60 * 1000; // 30 mins timeout
      
      let processActive = false;
      if (lockData.pid) {
        try {
          process.kill(lockData.pid, 0);
          processActive = true;
        } catch (e) {
          processActive = false;
        }
      }

      if (processActive && !isStale) {
        console.log(`[AutomationLock] Skipping execution: another automation run (PID ${lockData.pid}) is active.`);
        return false;
      }
    } catch (e) {}
  }

  try {
    fs.writeFileSync(lockFilePath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), 'utf8');
    return true;
  } catch (e) {
    return true;
  }
}

function releaseAutomationLock() {
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
    }
  } catch (e) {}
}

// Headless Entry Point
if (isHeadlessRun) {
  app.whenReady().then(() => {
    if (!acquireAutomationLock()) {
      app.quit();
      return;
    }

    const shouldRefresh = checkTaskDue('--should-refresh');
    const shouldUpload = checkTaskDue('--should-upload-resume');

    if (!shouldRefresh && !shouldUpload) {
      releaseAutomationLock();
      app.quit();
      return;
    }

    ensureChromeRunning().then((chromeReady) => {
      if (!chromeReady) {
        releaseAutomationLock();
        app.quit();
        return;
      }

      let chain = Promise.resolve();
      if (shouldRefresh) {
        chain = chain.then(() => runAutomationTask('--refresh-headline').then(() => updateLastRunTime('--update-refresh-time')));
      }
      if (shouldUpload) {
        chain = chain.then(() => runAutomationTask('--upload-resume').then(() => updateLastRunTime('--update-resume-time')));
      }

      chain.then(() => { releaseAutomationLock(); app.quit(); }).catch(() => { releaseAutomationLock(); app.quit(); });
    });
  });
} else {
  // GUI Entry Point
  app.whenReady().then(() => {
    // Idempotently clean stale cron jobs and sync OS schedule on app boot
    try {
      const currentConfig = ConfigService.load();
      configureOSSchedule(currentConfig);
    } catch (e) {}

    loadPausedState();
    createWindow();
    createTray();

    // Initialize Auto-Updater Service
    try {
      const AutoUpdaterService = require('./auto-updater-service');
      const autoUpdaterService = new AutoUpdaterService(mainWindow);
      setTimeout(() => {
        autoUpdaterService.checkForUpdates();
      }, 5000);
    } catch (err) {
      console.warn('[main.js] AutoUpdaterService initialization skipped:', err.message);
    }

    // Run task scheduler check every 60 seconds
    checkIntervalTimer = setInterval(executeDueTasks, 60000);

    // Enable auto launch on boot
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true
    });

    // Start connection health check
    startConnectionHealthCheck();

    // Verify initial connection status
    verifyInitialConnectionState();
  });

  app.on('will-quit', () => {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
    }
    if (activeBrowser) {
      activeBrowser.close().catch(() => { });
    }
  });
}

function createWindow() {
  logAppInfo('Creating BrowserWindow...');
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const preloadPath = path.join(__dirname, 'preload.js');
  const indexPath = path.join(__dirname, 'renderer', 'index.html');

  logAppInfo(`Resource path check - Icon: ${iconPath} (exists: ${fs.existsSync(iconPath)})`);
  logAppInfo(`Resource path check - Preload: ${preloadPath} (exists: ${fs.existsSync(preloadPath)})`);
  logAppInfo(`Resource path check - Index HTML: ${indexPath} (exists: ${fs.existsSync(indexPath)})`);

  mainWindow = new BrowserWindow({
    width: 950,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    title: 'Naukri Update',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    logAppInfo('Renderer started loading index.html');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logAppInfo('Renderer successfully loaded index.html');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logAppInfo(`Renderer failed loading index.html: ${errorCode} - ${errorDescription} (${validatedURL})`);
  });

  mainWindow.loadFile(indexPath);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      logAppInfo('Window closed -> hiding to tray');
    } else {
      logAppInfo('Window closing -> app exiting');
    }
  });
}

let isAutomationPaused = false;

function loadPausedState() {
  const stateFile = path.join(configDir, '.naukri-refresh-state.json');
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      isAutomationPaused = !!state.paused;
    } catch (e) { }
  }
}

function setPausedState(paused) {
  isAutomationPaused = paused;
  const stateFile = path.join(configDir, '.naukri-refresh-state.json');
  let state = { lastRefreshTime: 0, lastResumeUploadTime: 0 };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) { }
  }
  state.paused = paused;
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) { }

  updateTrayMenu();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update');
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const connectionStatus = naukriConnectionState.status;
  let connectionLabel = 'Disconnected';
  if (connectionStatus === 'connected') {
    connectionLabel = 'Connected';
  } else if (connectionStatus === 'connecting') {
    connectionLabel = 'Connecting...';
  } else if (connectionStatus === 'verifying') {
    connectionLabel = 'Verifying OTP/CAPTCHA...';
  } else if (connectionStatus === 'failed') {
    connectionLabel = 'Connection Failed';
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: `Connection: ${connectionLabel}`, enabled: false },
    {
      label: 'Reconnect Chrome',
      click: () => {
        startNaukriConnection(mainWindow ? mainWindow.webContents : null);
      }
    },
    { type: 'separator' },
    {
      label: isAutomationPaused ? 'Resume Automation' : 'Pause Automation',
      click: () => {
        setPausedState(!isAutomationPaused);
      }
    },
    { type: 'separator' },
    { label: 'Quit Application', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  tray.setToolTip('Naukri Update');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function triggerHeadlineTask() {
  ensureChromeRunning().then((chromeReady) => {
    if (!chromeReady) {
      showNotification('Automation Failed', 'Could not open dedicated Chrome profile.');
      return;
    }
    showNotification('Headline Refresh', 'Headline refresh task started manually.');
    runAutomationTask('--refresh-headline')
      .then(() => {
        updateLastRunTime('--update-refresh-time');
        showNotification('Profile Refreshed', 'Naukri resume headline refreshed successfully.');
        if (mainWindow) mainWindow.webContents.send('status-update');
      })
      .catch((err) => {
        showNotification('Headline Refresh Failed', err.message.split('\n')[0]);
        if (mainWindow) mainWindow.webContents.send('status-update');
      });
  });
}

function triggerResumeTask() {
  ensureChromeRunning().then((chromeReady) => {
    if (!chromeReady) {
      showNotification('Automation Failed', 'Could not open dedicated Chrome profile.');
      return;
    }
    showNotification('Resume Upload', 'Resume upload task started manually.');
    runAutomationTask('--upload-resume')
      .then(() => {
        updateLastRunTime('--update-resume-time');
        showNotification('Resume Uploaded', 'Naukri resume PDF uploaded and verified.');
        if (mainWindow) mainWindow.webContents.send('status-update');
      })
      .catch((err) => {
        showNotification('Resume Upload Failed', err.message.split('\n')[0]);
        if (mainWindow) mainWindow.webContents.send('status-update');
      });
  });
}

// IPC Handlers

ipcMain.handle('run-diagnostics', () => {
  return ConfigService.runDiagnostics();
});

ipcMain.handle('get-app-info', () => {
  return {
    platform: process.platform,
    configDir: configDir,
    envPath: ACTIVE_ENV_PATH,
    resumeDir: path.join(configDir, 'resume'),
    browserProfileDir: path.join(configDir, '.naukri-chrome-profile'),
    logPath: path.join(configDir, 'naukri-refresh.log'),
    hourlyLogPath: path.join(configDir, 'naukri-hourly-refresh.log')
  };
});

ipcMain.handle('open-app-folder', () => {
  shell.openPath(configDir);
  return { success: true };
});

ipcMain.handle('clear-credentials', () => {
  saveEnvFile({ NAUKRI_EMAIL: '', NAUKRI_PASSWORD: '' });
  return { success: true };
});

ipcMain.handle('delete-resume', () => {
  const resumeDir = path.join(configDir, 'resume');
  try {
    if (fs.existsSync(resumeDir)) {
      const files = fs.readdirSync(resumeDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(resumeDir, file));
        } catch (e) { }
      }
    }
  } catch (e) { }
  saveEnvFile({ RESUME_FILE: '' });
  return { success: true };
});

ipcMain.handle('reset-browser-profile', async () => {
  await disconnectChrome();
  const profileDir = path.join(configDir, '.naukri-chrome-profile');
  try {
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('reset-application', async () => {
  await disconnectChrome();

  // Stop schedule
  try {
    configureOSSchedule({ REFRESH_MODE: '', RESUME_UPDATE_ENABLED: 'false' });
  } catch (e) { }

  return ConfigService.resetAll();
});

ipcMain.handle('get-settings', () => {
  return ConfigService.load();
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const existing = ConfigService.load();
    if (settings.NAUKRI_PASSWORD === '••••••••') {
      settings.NAUKRI_PASSWORD = existing.NAUKRI_PASSWORD || '';
    }
    ConfigService.save(settings);
    configureOSSchedule(settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-resume-info', () => {
  const config = ConfigService.load();
  const health = ConfigService.checkResumeHealth(config.RESUME_FILE);

  if (health.exists && health.resolvedPath) {
    try {
      const stat = fs.statSync(health.resolvedPath);
      return {
        exists: true,
        status: health.status,
        name: path.basename(health.resolvedPath),
        sizeBytes: stat.size,
        mtime: stat.mtime
      };
    } catch (e) { }
  }

  return {
    exists: false,
    status: health.status,
    name: config.RESUME_FILE ? path.basename(config.RESUME_FILE) : ''
  };
});

ipcMain.handle('select-resume', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const selectedPath = result.filePaths[0];

  // Reuse core validation logic from naukri-profile-refresh.js dynamically
  try {
    const { validateFile } = require('./naukri-profile-refresh');
    await validateFile(selectedPath);
  } catch (err) {
    return { success: false, error: `Invalid PDF: ${err.message}` };
  }

  const resumeDir = path.join(configDir, 'resume');
  const targetPath = path.join(resumeDir, path.basename(selectedPath));

  try {
    // Delete any old files to satisfy Single-File Rule
    const files = fs.readdirSync(resumeDir);
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(resumeDir, f));
      } catch (e) { }
    }

    fs.copyFileSync(selectedPath, targetPath);

    // Update env
    const relativePath = `resume/${path.basename(selectedPath)}`;
    saveEnvFile({ RESUME_FILE: relativePath });

    const stat = fs.statSync(targetPath);
    return {
      success: true,
      name: path.basename(selectedPath),
      sizeBytes: stat.size,
      mtime: stat.mtime
    };
  } catch (err) {
    return { success: false, error: `Failed to copy resume: ${err.message}` };
  }
});

ipcMain.handle('get-logs', () => {
  const logs = { refresh: '', runner: '' };

  const refreshLogFile = path.join(configDir, 'naukri-refresh.log');
  const hourlyLogFile = path.join(configDir, 'naukri-hourly-refresh.log');

  // Helper to read last 50 lines safely, removing sensitive stuff
  const readLogLines = (filePath) => {
    if (!fs.existsSync(filePath)) return '';
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const cleanLines = lines.slice(-50).map(line => {
        // Strip sensitive info if any
        return line
          .replace(/NAUKRI_PASSWORD=([^\s]+)/g, 'NAUKRI_PASSWORD=••••••••')
          .replace(/password:?\s*["'][^"']+["']/gi, 'password: "••••••••"');
      });
      return cleanLines.join('\n');
    } catch (e) {
      return `Failed to read logs: ${e.message}`;
    }
  };

  logs.refresh = readLogLines(refreshLogFile);
  logs.runner = readLogLines(hourlyLogFile);
  return logs;
});

ipcMain.handle('get-automation-status', () => {
  const stateFile = path.join(configDir, '.naukri-refresh-state.json');
  let state = { lastRefreshTime: 0, lastResumeUploadTime: 0 };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) { }
  }

  const envData = loadEnvFile();
  return {
    state,
    config: {
      refreshMode: envData.REFRESH_MODE || 'interval',
      refreshIntervalHours: parseInt(envData.REFRESH_INTERVAL_HOURS || '1', 10),
      refreshIntervalMinutes: parseInt(envData.REFRESH_INTERVAL_MINUTES || '0', 10),
      refreshTime: envData.REFRESH_TIME || '06:11',
      refreshWindowEnabled: envData.REFRESH_WINDOW_ENABLED === 'true',
      refreshWindowStart: envData.REFRESH_WINDOW_START || '07:00',
      refreshWindowEnd: envData.REFRESH_WINDOW_END || '19:00',
      resumeUpdateEnabled: envData.RESUME_UPDATE_ENABLED === 'true',
      resumeUpdateTime: envData.RESUME_UPDATE_TIME || '07:00'
    }
  };
});

let activeBrowser = null;
let naukriConnectionState = { status: 'disconnected', message: 'Chrome is not connected.' };
let healthCheckTimer = null;

function updateState(status, message) {
  naukriConnectionState = { status, message };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('naukri-connection-state', naukriConnectionState);
  }
  updateTrayTooltip(status);
  updateTrayMenu();
}

function updateTrayTooltip(status) {
  if (tray) {
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    tray.setToolTip(`Naukri Update (${statusText})`);
  }
}

async function handleBrowserClosed() {
  if (activeBrowser) {
    try {
      activeBrowser.removeAllListeners('disconnected');
      await activeBrowser.close().catch(() => { });
    } catch (e) { }
    activeBrowser = null;
  }
  updateState('disconnected', 'Chrome was closed.');
}

function startConnectionHealthCheck() {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(async () => {
    if (naukriConnectionState.status === 'connected' || naukriConnectionState.status === 'verifying') {
      const cdpAvailable = await checkCDPAvailable();
      if (!cdpAvailable) {
        console.log('Health check failed: CDP is unreachable.');
        await handleBrowserClosed();
      }
    }
  }, 2000);
}

async function verifyInitialConnectionState() {
  console.log('Verifying initial connection state...');
  updateState('connecting', 'Checking browser status...');
  const cdpAvailable = await checkCDPAvailable();
  if (!cdpAvailable) {
    updateState('disconnected', 'Chrome is not connected.');
    return;
  }

  updateState('connecting', 'Verifying Naukri session...');
  let tempBrowser = null;
  try {
    const { chromium } = require('playwright-core');
    tempBrowser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
    const context = tempBrowser.contexts()[0];
    if (context) {
      let page = context.pages().find(p => p.url().includes('naukri.com/mnjuser/profile'));
      if (!page) {
        page = await context.newPage();
      }
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });

      const isAuthenticated = async () => {
        if (!page.url().includes('naukri.com/mnjuser/profile')) return false;
        try {
          await page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
            .first()
            .waitFor({ state: 'visible', timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      };

      if (await isAuthenticated()) {
        console.log('Initial connection verified: Naukri authenticated.');
        activeBrowser = tempBrowser;
        activeBrowser.on('disconnected', () => {
          handleBrowserClosed();
        });
        updateState('connected', 'Chrome and Naukri session are active.');
        return;
      }
    }
  } catch (err) {
    console.error('Failed to verify initial connection:', err);
  }

  if (tempBrowser) {
    await tempBrowser.close().catch(() => { });
  }
  updateState('disconnected', 'Authentication required. Please connect Chrome.');
}

async function startNaukriConnection(webContents) {
  const updateStateLocal = (status, message) => {
    updateState(status, message);
  };

  if (naukriConnectionState.status === 'connecting' || naukriConnectionState.status === 'verifying') {
    console.log('Connection attempt already in progress.');
    return;
  }

  // Disconnect any existing activeBrowser first
  if (activeBrowser) {
    try {
      activeBrowser.removeAllListeners('disconnected');
      await activeBrowser.close().catch(() => { });
    } catch (e) { }
    activeBrowser = null;
  }

  updateStateLocal('connecting', 'Opening dedicated Chrome...');

  const env = loadEnvFile();
  const email = env.NAUKRI_EMAIL;
  const password = env.NAUKRI_PASSWORD;

  if (!email || !password) {
    updateStateLocal('failed', 'Naukri credentials are required. Please configure them first in Settings.');
    return;
  }

  const chromeReady = await ensureChromeRunning();
  if (!chromeReady) {
    updateStateLocal('failed', 'Unable to start Chrome. Please check if Chrome is installed.');
    return;
  }

  updateStateLocal('connecting', 'Connecting over CDP...');

  let browser = null;
  try {
    const { chromium } = require('playwright-core');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
  } catch (err) {
    updateStateLocal('failed', 'Unable to connect to Chrome. Try restarting the app.');
    return;
  }

  try {
    const context = browser.contexts()[0];
    if (!context) {
      updateStateLocal('failed', 'No Chrome browser context found.');
      if (browser) await browser.close().catch(() => { });
      return;
    }

    let page = context.pages().find(p => p.url().includes('naukri.com/mnjuser/profile'));
    if (!page) {
      page = await context.newPage();
    }

    updateStateLocal('connecting', 'Checking active session...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });

    const isAuthenticated = async () => {
      if (!page.url().includes('naukri.com/mnjuser/profile')) return false;
      try {
        await page.locator('#lazyResumeHead span.edit.icon, [data-ga-track*="resumeHeadline"] .edit')
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    };

    if (await isAuthenticated()) {
      updateStateLocal('connected', 'Chrome and Naukri session are active.');
      activeBrowser = browser;
      activeBrowser.on('disconnected', () => {
        handleBrowserClosed();
      });
      browser = null; // Prevent finally block from closing it
      return;
    }

    updateStateLocal('connecting', 'Navigating to Naukri login page...');
    await page.goto('https://www.naukri.com/entry/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const emailSelector = '#usernameField, input[name="username"], input[type="email"], input[autocomplete="username"]';
    const passwordSelector = '#passwordField, input[name="password"], input[type="password"], input[autocomplete="current-password"]';
    const submitSelector = 'button.blue-btn, button[type="submit"]:not(.otpButton), button[type="submit"], button:has-text("Login")';

    try {
      await page.waitForSelector(emailSelector, { timeout: 10000 });
    } catch (e) { }

    if (page.url().includes('naukri.com/mnjuser/profile') && await isAuthenticated()) {
      updateStateLocal('connected', 'Chrome and Naukri session are active.');
      activeBrowser = browser;
      activeBrowser.on('disconnected', () => {
        handleBrowserClosed();
      });
      browser = null;
      return;
    }

    updateStateLocal('connecting', 'Entering credentials...');
    await page.fill(emailSelector, email);
    await page.fill(passwordSelector, password);
    await page.click(submitSelector);

    updateStateLocal('connecting', 'Authenticating...');

    let authenticated = false;
    let loginFailed = false;
    let failReason = '';
    const startTime = Date.now();
    const timeout = 120000;

    while (Date.now() - startTime < timeout) {
      if (await isAuthenticated()) {
        authenticated = true;
        break;
      }

      const errorMsgEl = page.locator('.err-container:visible, .error-message:visible, [id*="error-message"]:visible, .error-hdr:visible').first();
      if (await errorMsgEl.count() > 0) {
        const txt = await errorMsgEl.innerText();
        if (txt && txt.trim().length > 0) {
          loginFailed = true;
          failReason = txt.trim();
          break;
        }
      }

      const otpInput = page.locator('input[name="otp"]:visible, input[placeholder*="OTP"]:visible, input[id*="otp"]:visible, .otp-container:visible').first();
      const isOtpUrl = page.url().includes('/otp') || page.url().includes('/verify') || page.url().includes('/challenge') || page.url().includes('/verification');
      if (await otpInput.count() > 0 || isOtpUrl) {
        updateStateLocal('verifying', 'Please complete OTP/CAPTCHA in the Chrome window.');
      }

      const isClosed = await page.isClosed().catch(() => true);
      if (isClosed) {
        loginFailed = true;
        failReason = 'Chrome window was closed.';
        break;
      }

      await page.waitForTimeout(1000);
    }

    if (authenticated) {
      updateStateLocal('connected', 'Chrome and Naukri session are active.');
      activeBrowser = browser;
      activeBrowser.on('disconnected', () => {
        handleBrowserClosed();
      });
      browser = null;
    } else if (loginFailed) {
      updateStateLocal('failed', `Login failed: ${failReason}`);
    } else {
      updateStateLocal('failed', 'Authentication timed out. Please try again.');
    }

  } catch (err) {
    updateStateLocal('failed', `Error: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => { });
    }
  }
}

async function disconnectChrome() {
  if (activeBrowser) {
    try {
      activeBrowser.removeAllListeners('disconnected');
      await activeBrowser.close().catch(() => { });
    } catch (e) { }
    activeBrowser = null;
  }

  if (chromeProcess) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${chromeProcess.pid} /f /t`);
      } else {
        process.kill(-chromeProcess.pid, 'SIGKILL');
      }
    } catch (e) {
      try {
        chromeProcess.kill('SIGKILL');
      } catch (err) { }
    }
    chromeProcess = null;
  } else {
    try {
      if (process.platform === 'win32') {
        exec('wmic process where "commandline like \'%--remote-debugging-port=9222%\'" call terminate');
      } else {
        exec('pkill -f "remote-debugging-port=9222"');
      }
    } catch (e) { }
  }

  updateState('disconnected', 'Chrome was disconnected.');
}

ipcMain.handle('disconnect-chrome', async () => {
  await disconnectChrome();
  return { success: true };
});

ipcMain.handle('connect-naukri', async (event) => {
  startNaukriConnection(event.sender);
  return naukriConnectionState;
});

ipcMain.handle('get-connection-state', () => {
  return naukriConnectionState;
});

ipcMain.handle('open-chrome', async () => {
  const success = await ensureChromeRunning();
  return { success };
});

ipcMain.handle('get-chrome-status', async () => {
  const ready = await checkCDPAvailable();
  return { connected: ready };
});

ipcMain.handle('trigger-headline-refresh', () => {
  triggerHeadlineTask();
  return { success: true };
});

ipcMain.handle('trigger-resume-upload', () => {
  triggerResumeTask();
  return { success: true };
});

ipcMain.handle('pause-automation', () => {
  setPausedState(true);
  return { success: true };
});

ipcMain.handle('resume-automation', () => {
  setPausedState(false);
  return { success: true };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app running in tray
  }
});
