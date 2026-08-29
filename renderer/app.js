// State Management
let currentTab = 'dashboard';
let currentLogType = 'refresh';
let isFirstRun = false;
let wizardStep = 1;
let currentResume = null;

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const tabTitle = document.getElementById('tab-title');

// Status Elements
const globalStatusDot = document.getElementById('global-status-dot');
const globalStatusText = document.getElementById('global-status-text');
const quickChromeBtn = document.getElementById('quick-chrome-btn');

// Dashboard Naukri Account selectors
const naukriConnectionBadge = document.getElementById('naukri-connection-badge');
const dashConnectChrome = document.getElementById('dash-connect-chrome');
const naukriStatusMessage = document.getElementById('naukri-status-message');
const settingsTogglePassBtn = document.getElementById('settings-toggle-pass-btn');
const settingsPassword = document.getElementById('naukri-password');

// Resume Elements
const resumeStatusBadge = document.getElementById('resume-status-badge');
const resumeFileName = document.getElementById('resume-file-name');
const resumeFileMeta = document.getElementById('resume-file-meta');
const selectResumeBtn = document.getElementById('select-resume-btn');
const settingsResumeName = document.getElementById('settings-resume-name');
const settingsResumeMeta = document.getElementById('settings-resume-meta');

// Scheduling State Elements
const headlineStatusBadge = document.getElementById('headline-status-badge');
const headlineScheduleDesc = document.getElementById('headline-schedule-desc');
const headlineNextRun = document.getElementById('headline-next-run');
const resumeUploadStatusBadge = document.getElementById('resume-upload-status-badge');
const resumeUploadScheduleDesc = document.getElementById('resume-upload-schedule-desc');
const resumeUploadNextRun = document.getElementById('resume-upload-next-run');

// Execution State
const lastRunStatus = document.getElementById('last-run-status');
const lastHeadlineTime = document.getElementById('last-headline-time');
const lastResumeTime = document.getElementById('last-resume-time');

// Manual Triggers
const triggerHeadlineBtn = document.getElementById('trigger-headline-btn');
const triggerResumeBtn = document.getElementById('trigger-resume-btn');

// Form Toggles & Elements
const settingsForm = document.getElementById('settings-form');
const saveStatus = document.getElementById('save-status');

const headlineEnabled = document.getElementById('headline-enabled');
const headlineSettingsBox = document.getElementById('headline-settings-box');
const refreshMode = document.getElementById('refresh-mode');
const intervalInputs = document.getElementById('interval-inputs');
const fixedTimeInputs = document.getElementById('fixed-time-inputs');

const resumeEnabled = document.getElementById('resume-enabled');
const resumeSettingsBox = document.getElementById('resume-settings-box');

const windowEnabled = document.getElementById('window-enabled');
const windowSettingsBox = document.getElementById('window-settings-box');

// Logs Elements
const logTabBtns = document.querySelectorAll('.log-tab-btn');
const logContent = document.getElementById('log-content');
const logConsoleBox = document.getElementById('log-console-box');
const clearLogsBtn = document.getElementById('clear-logs-btn');

// Wizard Elements
const firstRunModal = document.getElementById('first-run-modal');
const wizNextBtn = document.getElementById('wiz-next-btn');
const wizPrevBtn = document.getElementById('wiz-prev-btn');
const wizError = document.getElementById('wiz-error');
const wizSelectResumeBtn = document.getElementById('wiz-select-resume-btn');
const wizResumeBox = document.getElementById('wiz-resume-box');
const wizResumeName = document.getElementById('wiz-resume-name');
const wizResumeMeta = document.getElementById('wiz-resume-meta');

// -------------------------------------------------------------
// Navigation & Tab Switching
// -------------------------------------------------------------
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  navItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tabName}"]`).classList.add('active');

  tabContents.forEach(content => content.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentTab = tabName;
  tabTitle.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);

  if (tabName === 'logs') {
    loadLogs();
  } else if (tabName === 'dashboard') {
    updateAutomationDashboard();
  } else if (tabName === 'guide') {
    loadGuidePaths();
  }
}

// -------------------------------------------------------------
// Form Layout Interactions (Toggle Display of Boxes)
// -------------------------------------------------------------
headlineEnabled.addEventListener('change', () => {
  headlineSettingsBox.style.display = headlineEnabled.checked ? 'block' : 'none';
});

refreshMode.addEventListener('change', () => {
  if (refreshMode.value === 'interval') {
    intervalInputs.style.display = 'grid';
    fixedTimeInputs.style.display = 'none';
  } else {
    intervalInputs.style.display = 'none';
    fixedTimeInputs.style.display = 'block';
  }
});

resumeEnabled.addEventListener('change', () => {
  resumeSettingsBox.style.display = resumeEnabled.checked ? 'block' : 'none';
});

windowEnabled.addEventListener('change', () => {
  windowSettingsBox.style.display = windowEnabled.checked ? 'block' : 'none';
});

// -------------------------------------------------------------
// Settings Load / Save
// -------------------------------------------------------------
async function loadSettings() {
  try {
    const env = await window.api.getSettings();

    // Account details
    document.getElementById('naukri-profile-url').value = env.NAUKRI_PROFILE_URL || 'https://www.naukri.com/mnjuser/profile';
    document.getElementById('naukri-email').value = env.NAUKRI_EMAIL || '';
    document.getElementById('naukri-password').value = env.NAUKRI_PASSWORD || '';

    // Headline Settings
    headlineEnabled.checked = env.REFRESH_MODE === 'interval' || env.REFRESH_MODE === 'fixed_time';
    headlineSettingsBox.style.display = headlineEnabled.checked ? 'block' : 'none';

    refreshMode.value = env.REFRESH_MODE === 'fixed_time' ? 'fixed_time' : 'interval';
    if (refreshMode.value === 'interval') {
      intervalInputs.style.display = 'grid';
      fixedTimeInputs.style.display = 'none';
    } else {
      intervalInputs.style.display = 'none';
      fixedTimeInputs.style.display = 'block';
    }

    document.getElementById('interval-hours').value = env.REFRESH_INTERVAL_HOURS !== undefined ? env.REFRESH_INTERVAL_HOURS : 1;
    document.getElementById('interval-minutes').value = env.REFRESH_INTERVAL_MINUTES !== undefined ? env.REFRESH_INTERVAL_MINUTES : 0;
    document.getElementById('refresh-time').value = env.REFRESH_TIME || '06:11';

    // Resume Settings
    resumeEnabled.checked = env.RESUME_UPDATE_ENABLED === 'true';
    resumeSettingsBox.style.display = resumeEnabled.checked ? 'block' : 'none';
    document.getElementById('resume-time').value = env.RESUME_UPDATE_TIME || '07:00';

    // Window Settings
    windowEnabled.checked = env.REFRESH_WINDOW_ENABLED === 'true';
    windowSettingsBox.style.display = windowEnabled.checked ? 'block' : 'none';
    document.getElementById('window-start').value = env.REFRESH_WINDOW_START || '07:00';
    document.getElementById('window-end').value = env.REFRESH_WINDOW_END || '19:00';

    // First Run Check
    if (!env.NAUKRI_EMAIL || !env.NAUKRI_PASSWORD) {
      isFirstRun = true;
      showFirstRunWizard();
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveStatus.textContent = 'Saving configuration...';
  saveStatus.className = 'save-status';

  // Validation
  if (headlineEnabled.checked && refreshMode.value === 'interval') {
    const hours = parseInt(document.getElementById('interval-hours').value, 10);
    const mins = parseInt(document.getElementById('interval-minutes').value, 10);
    if (hours === 0 && mins === 0) {
      saveStatus.textContent = 'Error: Refresh interval must be greater than 0.';
      saveStatus.className = 'save-status error';
      return;
    }
  }

  const settings = {
    NAUKRI_PROFILE_URL: document.getElementById('naukri-profile-url').value.trim(),
    NAUKRI_EMAIL: document.getElementById('naukri-email').value.trim(),
    NAUKRI_PASSWORD: document.getElementById('naukri-password').value,
    REFRESH_MODE: headlineEnabled.checked ? refreshMode.value : '',
    REFRESH_INTERVAL_HOURS: document.getElementById('interval-hours').value,
    REFRESH_INTERVAL_MINUTES: document.getElementById('interval-minutes').value,
    REFRESH_TIME: document.getElementById('refresh-time').value,
    RESUME_UPDATE_ENABLED: resumeEnabled.checked ? 'true' : 'false',
    RESUME_UPDATE_TIME: document.getElementById('resume-time').value,
    REFRESH_WINDOW_ENABLED: windowEnabled.checked ? 'true' : 'false',
    REFRESH_WINDOW_START: document.getElementById('window-start').value,
    REFRESH_WINDOW_END: document.getElementById('window-end').value
  };

  try {
    const result = await window.api.saveSettings(settings);
    if (result.success) {
      saveStatus.textContent = 'Configuration saved successfully.';
      saveStatus.className = 'save-status success';
      updateAutomationDashboard();
      setTimeout(() => {
        saveStatus.textContent = '';
      }, 4000);
    } else {
      saveStatus.textContent = `Error: ${result.error}`;
      saveStatus.className = 'save-status error';
    }
  } catch (err) {
    saveStatus.textContent = `Error: ${err.message}`;
    saveStatus.className = 'save-status error';
  }
});

// -------------------------------------------------------------
// Resume Handling
// -------------------------------------------------------------
async function updateResumeDisplay() {
  try {
    const info = await window.api.getResumeInfo();
    currentResume = info.exists ? info : null;

    if (info.exists) {
      // Dashboard display
      resumeStatusBadge.textContent = 'Valid PDF';
      resumeStatusBadge.className = 'badge badge-success';
      resumeFileName.textContent = info.name;

      const sizeKB = (info.sizeBytes / 1024).toFixed(1);
      const dateStr = new Date(info.mtime).toLocaleString();
      resumeFileMeta.textContent = `${sizeKB} KB · Modified: ${dateStr}`;

      // Settings display
      settingsResumeName.textContent = info.name;
      settingsResumeMeta.textContent = `${sizeKB} KB · Active authoritative copy in AppData.`;

      // Wizard display
      wizResumeName.textContent = info.name;
      wizResumeMeta.textContent = `${sizeKB} KB · Valid PDF. Ready for upload.`;
    } else if (info.status === 'File not found') {
      resumeStatusBadge.textContent = 'File missing';
      resumeStatusBadge.className = 'badge badge-danger';
      resumeFileName.textContent = info.name ? `${info.name} (Missing)` : 'Resume file missing';
      resumeFileMeta.textContent = 'The saved resume file is missing from disk. Click below to select a new PDF.';

      settingsResumeName.textContent = 'Resume File Missing';
      settingsResumeMeta.textContent = 'The previously saved resume file could not be found. Please select a valid PDF file.';

      wizResumeName.textContent = 'Resume File Missing';
      wizResumeMeta.textContent = 'The configured resume file is missing. Click below to choose another resume.';
    } else {
      resumeStatusBadge.textContent = 'Unconfigured';
      resumeStatusBadge.className = 'badge';
      resumeFileName.textContent = 'No resume selected';
      resumeFileMeta.textContent = 'Upload a resume PDF to enable daily re-upload updates.';

      settingsResumeName.textContent = 'No Authoritative Resume Loaded';
      settingsResumeMeta.textContent = 'Please select a valid PDF resume file. This file will be managed inside application data.';

      wizResumeName.textContent = 'No Resume Selected';
      wizResumeMeta.textContent = 'Click below to upload a PDF resume. Only PDF format is accepted.';
    }
  } catch (err) {
    console.error('Failed to get resume info:', err);
  }
}

async function handleSelectResume() {
  try {
    const result = await window.api.selectResume();
    if (result.success) {
      await updateResumeDisplay();
    } else if (result.error) {
      await showCustomAlert('Invalid File', result.error);
    }
  } catch (err) {
    await showCustomAlert('File Selection Failed', err.message);
  }
}

selectResumeBtn.addEventListener('click', handleSelectResume);
wizSelectResumeBtn.addEventListener('click', handleSelectResume);

// -------------------------------------------------------------
// Logs Viewer
// -------------------------------------------------------------
logTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    logTabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLogType = btn.getAttribute('data-log');
    loadLogs();
  });
});

async function loadLogs() {
  logContent.textContent = 'Fetching activity logs...';
  try {
    const logs = await window.api.getLogs();
    const activeLogText = currentLogType === 'refresh' ? logs.refresh : logs.runner;

    if (!activeLogText || activeLogText.trim() === '') {
      logContent.textContent = 'No logs recorded yet. Execution logs will populate here once automation runs.';
      return;
    }

    // Render logs
    logContent.textContent = activeLogText;

    // Auto scroll to bottom
    setTimeout(() => {
      logConsoleBox.scrollTop = logConsoleBox.scrollHeight;
    }, 100);
  } catch (err) {
    logContent.textContent = `Failed to load logs: ${err.message}`;
  }
}

clearLogsBtn.addEventListener('click', loadLogs);

// -------------------------------------------------------------
// Chrome / CDP Connection Monitoring
// -------------------------------------------------------------
async function updateChromeStatus() {
  try {
    const status = await window.api.getChromeStatus();
    if (status.connected) {
      globalStatusDot.className = 'dot online';
      globalStatusText.textContent = 'Chrome CDP Online';
      quickChromeBtn.disabled = true;
    } else {
      globalStatusDot.className = 'dot';
      globalStatusText.textContent = 'Chrome CDP Offline';
      quickChromeBtn.disabled = false;
    }
  } catch (err) {
    console.error('Error getting Chrome status:', err);
  }
}

async function handleOpenChrome() {
  const res = await window.api.openChrome();
  if (!res.success) {
    await showCustomAlert('Launch Failed', 'Failed to launch Google Chrome. Ensure Google Chrome is installed on this computer.');
    updateChromeStatus();
  }
}

quickChromeBtn.addEventListener('click', handleOpenChrome);

// Dashboard Naukri Credentials Card Logic
async function updateDashboardCredentialsCard() {
  try {
    const env = await window.api.getSettings();
    if (!env.NAUKRI_EMAIL || !env.NAUKRI_PASSWORD) {
      naukriConnectionBadge.textContent = 'Not configured';
      naukriConnectionBadge.className = 'badge';
      naukriStatusMessage.textContent = 'Please configure your credentials in the Settings tab.';
      dashConnectChrome.disabled = true;
    } else {
      const state = await window.api.getConnectionState();
      updateConnectionStateUI(state);
    }
  } catch (err) {
    console.error('Failed to update credentials card:', err);
  }
}

function updateConnectionStateUI(state) {
  let displayStatus = state.status.charAt(0).toUpperCase() + state.status.slice(1);
  naukriConnectionBadge.textContent = displayStatus;
  naukriStatusMessage.textContent = state.message || 'Ready to connect.';

  if (state.status === 'connected') {
    naukriConnectionBadge.className = 'badge badge-success';
    dashConnectChrome.disabled = false;
    dashConnectChrome.textContent = 'Disconnect';
  } else if (state.status === 'failed') {
    naukriConnectionBadge.className = 'badge failed';
    dashConnectChrome.disabled = false;
    dashConnectChrome.textContent = 'Retry';
  } else if (state.status === 'verifying') {
    naukriConnectionBadge.className = 'badge waiting';
    dashConnectChrome.disabled = true;
    dashConnectChrome.textContent = 'Waiting...';
  } else if (state.status === 'connecting') {
    naukriConnectionBadge.className = 'badge connecting';
    dashConnectChrome.disabled = true;
    dashConnectChrome.textContent = 'Connecting...';
  } else {
    naukriConnectionBadge.className = 'badge ready';
    dashConnectChrome.disabled = false;
    if (state.message === 'Chrome was closed.' || state.message === 'Chrome was disconnected.') {
      dashConnectChrome.textContent = 'Reconnect';
    } else {
      dashConnectChrome.textContent = 'Connect Chrome';
    }
  }
}

settingsTogglePassBtn.addEventListener('click', () => {
  if (settingsPassword.type === 'password') {
    settingsPassword.type = 'text';
    settingsTogglePassBtn.textContent = '🙈';
  } else {
    settingsPassword.type = 'password';
    settingsTogglePassBtn.textContent = '👁';
  }
});

dashConnectChrome.addEventListener('click', async () => {
  if (dashConnectChrome.textContent === 'Disconnect') {
    dashConnectChrome.disabled = true;
    dashConnectChrome.textContent = 'Disconnecting...';
    await window.api.disconnectChrome();
    return;
  }

  dashConnectChrome.disabled = true;
  dashConnectChrome.textContent = 'Connecting...';
  naukriConnectionBadge.textContent = 'Connecting';
  naukriConnectionBadge.className = 'badge connecting';
  naukriStatusMessage.textContent = 'Initializing Chrome session...';

  await window.api.connectNaukri();
});

window.api.onConnectionState((state) => {
  updateConnectionStateUI(state);
});


// -------------------------------------------------------------
// Automation Dashboard & Timing Estimations
// -------------------------------------------------------------
async function updateAutomationDashboard() {
  try {
    const data = await window.api.getAutomationStatus();
    const config = data.config;
    const state = data.state;

    // Headline Status Card
    const headlineActive = config.refreshMode === 'interval' || config.refreshMode === 'fixed_time';
    if (headlineActive) {
      if (state.paused) {
        headlineStatusBadge.textContent = 'Paused';
        headlineStatusBadge.className = 'badge paused';
      } else {
        headlineStatusBadge.textContent = 'Active';
        headlineStatusBadge.className = 'badge badge-success';
      }

      if (config.refreshMode === 'interval') {
        headlineScheduleDesc.textContent = `Toggling dot every ${config.refreshIntervalHours}h ${config.refreshIntervalMinutes}m.`;
      } else {
        headlineScheduleDesc.textContent = `Toggling dot at daily scheduled time: ${config.refreshTime}.`;
      }
    } else {
      headlineStatusBadge.textContent = 'Disabled';
      headlineStatusBadge.className = 'badge';
      headlineScheduleDesc.textContent = 'Toggle is turned OFF in Settings.';
    }

    // Resume Upload Status Card
    if (config.resumeUpdateEnabled) {
      if (state.paused) {
        resumeUploadStatusBadge.textContent = 'Paused';
        resumeUploadStatusBadge.className = 'badge paused';
      } else {
        resumeUploadStatusBadge.textContent = 'Active';
        resumeUploadStatusBadge.className = 'badge badge-success';
      }
      resumeUploadScheduleDesc.textContent = `Uploading daily at ${config.resumeUpdateTime}.`;
    } else {
      resumeUploadStatusBadge.textContent = 'Disabled';
      resumeUploadStatusBadge.className = 'badge';
      resumeUploadScheduleDesc.textContent = 'Daily upload is turned OFF in Settings.';
    }

    // Window constraint description
    if (config.refreshWindowEnabled) {
      headlineNextRun.textContent = `Window: ${config.refreshWindowStart} to ${config.refreshWindowEnd}`;
    } else {
      headlineNextRun.textContent = `No active window constraints.`;
    }

    // Last Run Information
    if (state.lastRefreshTime || state.lastResumeUploadTime) {
      lastRunStatus.textContent = 'Success';
      lastRunStatus.className = 'status-value badge badge-success';
    } else {
      lastRunStatus.textContent = 'Pending';
      lastRunStatus.className = 'status-value badge';
    }

    lastHeadlineTime.textContent = state.lastRefreshTime ? new Date(state.lastRefreshTime).toLocaleString() : 'Never';
    lastResumeTime.textContent = state.lastResumeUploadTime ? new Date(state.lastResumeUploadTime).toLocaleString() : 'Never';
  } catch (err) {
    console.error('Failed to update dashboard:', err);
  }
}

// Manual Triggers
triggerHeadlineBtn.addEventListener('click', async () => {
  triggerHeadlineBtn.disabled = true;
  await window.api.triggerHeadlineRefresh();
  setTimeout(() => { triggerHeadlineBtn.disabled = false; }, 2000);
});

triggerResumeBtn.addEventListener('click', async () => {
  if (!currentResume) {
    await showCustomAlert('Missing Resume', 'Please select a valid PDF resume file in settings before uploading.');
    return;
  }
  triggerResumeBtn.disabled = true;
  await window.api.triggerResumeUpload();
  setTimeout(() => { triggerResumeBtn.disabled = false; }, 2000);
});

// IPC listener for background task updates
window.api.onStatusUpdate(() => {
  updateAutomationDashboard();
  loadLogs();
});

// -------------------------------------------------------------
// First Run Wizard Experience
// -------------------------------------------------------------
// -------------------------------------------------------------
// First Run Wizard Experience
// -------------------------------------------------------------
// -------------------------------------------------------------
// First Run Wizard Experience
// -------------------------------------------------------------
const wizConnectChromeBtn = document.getElementById('wiz-connect-chrome-btn');
const wizConnectionStatus = document.getElementById('wiz-connection-status');

if (wizConnectChromeBtn) {
  wizConnectChromeBtn.addEventListener('click', async () => {
    const email = document.getElementById('wiz-email').value.trim();
    const password = document.getElementById('wiz-password').value;
    const url = document.getElementById('wiz-url').value.trim();

    if (!email || !password || !url) {
      wizError.textContent = 'Please fill out email, password, and URL before connecting Chrome.';
      return;
    }

    // Save settings temporarily so the connection process has access to credentials
    await window.api.saveSettings({
      NAUKRI_PROFILE_URL: url,
      NAUKRI_EMAIL: email,
      NAUKRI_PASSWORD: password
    });

    wizConnectionStatus.innerHTML = `
      <span class="dot" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--accent-yellow); display: inline-block;"></span>
      <span>Connecting...</span>
    `;

    const state = await window.api.connectNaukri();
    updateWizConnectionStatus(state);
  });
}

function updateWizConnectionStatus(state) {
  if (!wizConnectionStatus) return;
  const status = state.status;
  let color = 'var(--accent-red)';
  let label = 'Disconnected';
  if (status === 'connected') {
    color = 'var(--accent-green)';
    label = 'Connected';
  } else if (status === 'connecting') {
    color = 'var(--accent-yellow)';
    label = 'Connecting...';
  } else if (status === 'verifying') {
    color = 'var(--accent-yellow)';
    label = 'Please complete OTP/CAPTCHA in Chrome';
  } else if (status === 'failed') {
    color = 'var(--accent-red)';
    label = `Failed: ${state.message}`;
  }
  wizConnectionStatus.innerHTML = `
    <span class="dot" style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; display: inline-block;"></span>
    <span>${label}</span>
  `;
}

// Watch connection state updates
window.api.onConnectionState((state) => {
  updateWizConnectionStatus(state);
  if (naukriConnectionBadge) {
    updateConnectionBadge(state);
  }
});

function showFirstRunWizard() {
  wizardStep = 0;
  populateWizardFields();
  updateWizardUI();
  firstRunModal.classList.add('active');
}

async function populateWizardFields() {
  try {
    const settings = await window.api.getSettings();
    if (settings) {
      document.getElementById('wiz-url').value = settings.NAUKRI_PROFILE_URL || 'https://www.naukri.com/mnjuser/profile';
      document.getElementById('wiz-email').value = settings.NAUKRI_EMAIL || '';
      document.getElementById('wiz-password').value = settings.NAUKRI_PASSWORD || '';

      document.getElementById('wiz-resume-enabled').checked = settings.RESUME_UPDATE_ENABLED === 'true';
      document.getElementById('wiz-resume-time').value = settings.RESUME_UPDATE_TIME || '07:00';

      document.getElementById('wiz-headline-enabled').checked = settings.REFRESH_MODE !== '';
      document.getElementById('wiz-refresh-mode').value = settings.REFRESH_MODE === 'fixed_time' ? 'fixed_time' : 'interval';
      document.getElementById('wiz-interval-hours').value = settings.REFRESH_INTERVAL_HOURS || '1';
      document.getElementById('wiz-interval-minutes').value = settings.REFRESH_INTERVAL_MINUTES || '0';
      document.getElementById('wiz-refresh-time').value = settings.REFRESH_TIME || '06:11';

      toggleWizResumeTimeGroup();
      toggleWizHeadlineSettingsGroup();
    }
  } catch (e) { }

  try {
    const resumeInfo = await window.api.getResumeInfo();
    if (resumeInfo && resumeInfo.exists) {
      currentResume = resumeInfo;
      wizResumeName.textContent = resumeInfo.name;
      wizResumeMeta.textContent = `${Math.round(resumeInfo.sizeBytes / 1024)} KB • Last modified: ${new Date(resumeInfo.mtime).toLocaleString()}`;
      wizResumeBox.style.borderColor = 'var(--accent-green)';
      wizResumeBox.style.backgroundColor = 'rgba(16, 185, 129, 0.02)';
    } else {
      currentResume = null;
      wizResumeName.textContent = 'No Resume Selected';
      wizResumeMeta.textContent = 'Click below to upload a PDF resume. Only PDF format is accepted.';
      wizResumeBox.style.borderColor = 'var(--border-color)';
      wizResumeBox.style.backgroundColor = 'var(--bg-tertiary)';
    }
  } catch (e) { }
}

function toggleWizResumeTimeGroup() {
  const enabled = document.getElementById('wiz-resume-enabled').checked;
  document.getElementById('wiz-resume-time-group').style.display = enabled ? 'block' : 'none';
}

function toggleWizHeadlineSettingsGroup() {
  const enabled = document.getElementById('wiz-headline-enabled').checked;
  const group = document.getElementById('wiz-headline-settings-group');
  group.style.display = enabled ? 'block' : 'none';

  if (enabled) {
    const mode = document.getElementById('wiz-refresh-mode').value;
    document.getElementById('wiz-headline-interval').style.display = mode === 'interval' ? 'grid' : 'none';
    document.getElementById('wiz-headline-fixed').style.display = mode === 'fixed_time' ? 'block' : 'none';
  }
}

document.getElementById('wiz-resume-enabled').addEventListener('change', toggleWizResumeTimeGroup);
document.getElementById('wiz-headline-enabled').addEventListener('change', toggleWizHeadlineSettingsGroup);
document.getElementById('wiz-refresh-mode').addEventListener('change', toggleWizHeadlineSettingsGroup);

function updateWizardUI() {
  // Hide all panels
  document.querySelectorAll('.wizard-step-panel').forEach(panel => {
    panel.style.display = 'none';
    panel.classList.remove('active');
  });
  // Show active panel
  const activePanel = document.getElementById(`wizard-step-${wizardStep}`);
  if (activePanel) {
    activePanel.style.display = 'block';
    setTimeout(() => {
      activePanel.classList.add('active');
    }, 50);
  }

  const progressFill = document.getElementById('wizard-progress-fill');
  const stepsText = document.getElementById('wizard-steps-text');

  const pct = Math.round((wizardStep / 9) * 100);
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (stepsText) {
    if (wizardStep === 0) {
      stepsText.textContent = 'Welcome Screen';
    } else {
      stepsText.textContent = `Step ${wizardStep} of 9`;
    }
  }

  // Footer buttons state
  wizPrevBtn.style.visibility = wizardStep > 0 ? 'visible' : 'hidden';
  wizNextBtn.textContent = wizardStep === 9 ? 'Finish Setup' : (wizardStep === 0 ? 'Get Started' : 'Next');
  wizError.textContent = '';
}

wizNextBtn.addEventListener('click', async () => {
  wizError.textContent = '';

  if (wizardStep === 0) {
    wizardStep = 1;
    updateWizardUI();
  } else if (wizardStep === 1) {
    const url = document.getElementById('wiz-url').value.trim();
    if (!url) {
      wizError.textContent = 'Please enter your Naukri Profile URL.';
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      wizError.textContent = 'Please enter a valid URL (starting with http:// or https://).';
      return;
    }
    document.getElementById('naukri-profile-url').value = url;
    wizardStep = 2;
    updateWizardUI();
  } else if (wizardStep === 2) {
    const email = document.getElementById('wiz-email').value.trim();
    const password = document.getElementById('wiz-password').value;
    if (!email || !password) {
      wizError.textContent = 'Please enter both your Naukri Email and Password.';
      return;
    }
    if (!email.includes('@')) {
      wizError.textContent = 'Please enter a valid email address.';
      return;
    }
    document.getElementById('naukri-email').value = email;
    document.getElementById('naukri-password').value = password;
    wizardStep = 3;
    updateWizardUI();
  } else if (wizardStep === 3) {
    const status = await window.api.getConnectionState();
    if (status.status !== 'connected') {
      const proceed = await showCustomConfirm({
        title: "Browser Session Not Established",
        message: "You have not verified your Naukri session via the dedicated Chrome. Background automation may fail. Do you want to proceed anyway?",
        buttonText: "Proceed",
        buttonClass: "btn-secondary"
      });
      if (!proceed) return;
    }
    wizardStep = 4;
    updateWizardUI();
  } else if (wizardStep === 4) {
    if (!currentResume) {
      wizError.textContent = 'Please select a valid PDF resume to continue.';
      return;
    }
    wizardStep = 5;
    updateWizardUI();
  } else if (wizardStep === 5) {
    const resOn = document.getElementById('wiz-resume-enabled').checked;
    const resTime = document.getElementById('wiz-resume-time').value;

    resumeEnabled.checked = resOn;
    document.getElementById('resume-time').value = resTime;
    resumeSettingsBox.style.display = resOn ? 'block' : 'none';

    wizardStep = 6;
    updateWizardUI();
  } else if (wizardStep === 6) {
    const headOn = document.getElementById('wiz-headline-enabled').checked;
    const strat = document.getElementById('wiz-refresh-mode').value;
    const hours = document.getElementById('wiz-interval-hours').value;
    const minutes = document.getElementById('wiz-interval-minutes').value;
    const fixedTime = document.getElementById('wiz-refresh-time').value;

    headlineEnabled.checked = headOn;
    refreshMode.value = strat;
    document.getElementById('interval-hours').value = hours;
    document.getElementById('interval-minutes').value = minutes;
    document.getElementById('refresh-time').value = fixedTime;

    headlineSettingsBox.style.display = headOn ? 'block' : 'none';
    if (strat === 'interval') {
      intervalInputs.style.display = 'grid';
      fixedTimeInputs.style.display = 'none';
    } else {
      intervalInputs.style.display = 'none';
      fixedTimeInputs.style.display = 'block';
    }

    wizardStep = 7;
    updateWizardUI();
  } else if (wizardStep === 7) {
    wizardStep = 8;
    updateWizardUI();
    runWizardDiagnostics();
  } else if (wizardStep === 8) {
    wizardStep = 9;
    updateWizardUI();
  } else if (wizardStep === 9) {
    const headOn = headlineEnabled.checked;
    const resOn = resumeEnabled.checked;
    const bgOn = document.getElementById('wiz-background-enabled').checked;

    const settings = {
      NAUKRI_PROFILE_URL: document.getElementById('naukri-profile-url').value.trim(),
      NAUKRI_EMAIL: document.getElementById('naukri-email').value.trim(),
      NAUKRI_PASSWORD: document.getElementById('naukri-password').value,
      REFRESH_MODE: headOn ? refreshMode.value : '',
      REFRESH_INTERVAL_HOURS: document.getElementById('interval-hours').value,
      REFRESH_INTERVAL_MINUTES: document.getElementById('interval-minutes').value,
      REFRESH_TIME: document.getElementById('refresh-time').value,
      RESUME_UPDATE_ENABLED: resOn ? 'true' : 'false',
      RESUME_UPDATE_TIME: document.getElementById('resume-time').value,
      REFRESH_WINDOW_ENABLED: windowEnabled.checked ? 'true' : 'false',
      REFRESH_WINDOW_START: document.getElementById('window-start').value,
      REFRESH_WINDOW_END: document.getElementById('window-end').value
    };

    wizNextBtn.textContent = 'Saving...';
    wizNextBtn.disabled = true;

    try {
      const result = await window.api.saveSettings(settings);
      if (result.success) {
        firstRunModal.classList.remove('active');
        isFirstRun = false;
        await updateAutomationDashboard();
        switchTab('dashboard');
      } else {
        wizError.textContent = `Error: ${result.error}`;
        wizNextBtn.textContent = 'Finish Setup';
        wizNextBtn.disabled = false;
      }
    } catch (err) {
      wizError.textContent = `Error: ${err.message}`;
      wizNextBtn.textContent = 'Finish Setup';
      wizNextBtn.disabled = false;
    }
  }
});

wizPrevBtn.addEventListener('click', () => {
  if (wizardStep > 0) {
    wizardStep--;
    updateWizardUI();
  }
});

if (wizSelectResumeBtn) {
  wizSelectResumeBtn.addEventListener('click', async () => {
    wizError.textContent = '';
    const res = await window.api.selectResume();
    if (res.success) {
      currentResume = res;
      wizResumeName.textContent = res.name;
      wizResumeMeta.textContent = `${Math.round(res.sizeBytes / 1024)} KB • mtime: ${new Date(res.mtime).toLocaleString()}`;
      wizResumeBox.style.borderColor = 'var(--accent-green)';
      wizResumeBox.style.backgroundColor = 'rgba(16, 185, 129, 0.02)';
    } else if (res.error) {
      wizError.textContent = res.error;
    }
  });
}

async function runWizardDiagnostics() {
  const btn = document.getElementById('wiz-run-diagnostics-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Checking...';
  }

  const indicators = ['config', 'creds', 'resume', 'chrome', 'profile', 'scheduler'];
  indicators.forEach(ind => {
    const el = document.getElementById(`diag-${ind}`);
    if (el) {
      el.style.color = 'var(--text-tertiary)';
      el.textContent = 'Checking...';
    }
  });

  try {
    const res = await window.api.runDiagnostics();

    const setStatus = (id, success, message) => {
      const el = document.getElementById(`diag-${id}`);
      if (el) {
        if (success) {
          el.style.color = 'var(--accent-green)';
          el.textContent = '✓ OK';
        } else {
          el.style.color = 'var(--accent-red)';
          el.textContent = `✗ ${message}`;
        }
      }
    };

    setStatus('config', res.schemaValid, 'Schema Invalid');
    setStatus('creds', res.credentialsProvided, 'Missing Credentials');
    setStatus('resume', res.resumeFileValid, res.resumeError || 'Invalid PDF');
    setStatus('chrome', res.chromeExecutableAvailable, 'Chrome not found');
    setStatus('profile', res.browserProfileDirectoryReady, 'Directory error');
    setStatus('scheduler', res.backgroundSchedulerExecutableReady, 'Script error');

  } catch (err) {
    wizError.textContent = `Diagnostics failed: ${err.message}`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify System Readiness';
    }
  }
}

if (document.getElementById('wiz-run-diagnostics-btn')) {
  document.getElementById('wiz-run-diagnostics-btn').addEventListener('click', runWizardDiagnostics);
}

// -------------------------------------------------------------
// Privacy Modal, Help Guide & Data Control Listeners
// -------------------------------------------------------------

document.getElementById('wiz-view-full-guide-link').addEventListener('click', (e) => {
  e.preventDefault();
  firstRunModal.classList.remove('active');
  switchTab('guide');
});

// Load guide dynamic paths
async function loadGuidePaths() {
  try {
    const info = await window.api.getAppInfo();
    document.querySelectorAll('.path-env-val').forEach(el => el.textContent = info.envPath);
    document.querySelectorAll('.path-resume-val').forEach(el => el.textContent = info.resumeDir);
    document.querySelectorAll('.path-chrome-val').forEach(el => el.textContent = info.browserProfileDir);
    document.querySelectorAll('.path-logs-val').forEach(el => el.textContent = info.logPath + '\n' + info.hourlyLogPath);
    document.querySelectorAll('.path-configdir-text').forEach(el => el.textContent = info.configDir);
  } catch (err) {
    console.error('Failed to load guide paths:', err);
  }
}

// User Guide Search & Filter
const guideSearchInput = document.getElementById('guide-search-input');
const guideNavItems = document.querySelectorAll('#guide-nav-list li');
const guideSections = document.querySelectorAll('.guide-section');

guideNavItems.forEach(item => {
  item.addEventListener('click', () => {
    guideNavItems.forEach(el => el.classList.remove('active'));
    item.classList.add('active');

    const secId = item.getAttribute('data-section');
    const secEl = document.getElementById(secId);
    if (secEl) {
      secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

guideSearchInput.addEventListener('input', () => {
  const query = guideSearchInput.value.toLowerCase().trim();

  if (!query) {
    guideNavItems.forEach(el => el.style.display = 'block');
    guideSections.forEach(el => {
      el.style.display = 'block';
      removeHighlight(el);
    });
    return;
  }

  guideSections.forEach(section => {
    const text = section.innerText.toLowerCase();
    const secId = section.getAttribute('id');
    const navItem = document.querySelector(`#guide-nav-list li[data-section="${secId}"]`);

    if (text.includes(query)) {
      section.style.display = 'block';
      if (navItem) navItem.style.display = 'block';
      highlightText(section, query);
    } else {
      section.style.display = 'none';
      if (navItem) navItem.style.display = 'none';
    }
  });
});

function highlightText(element, query) {
  removeHighlight(element);
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToReplace = [];
  while (node = walk.nextNode()) {
    if (node.nodeValue.toLowerCase().includes(query)) {
      nodesToReplace.push(node);
    }
  }
  nodesToReplace.forEach(node => {
    const parent = node.parentNode;
    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'MARK') return;

    const text = node.nodeValue;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    const span = document.createElement('span');
    span.innerHTML = text.replace(regex, '<mark style="background-color: var(--accent-indigo); color: white; border-radius: 2px; padding: 0 2px;">$1</mark>');
    parent.replaceChild(span, node);
  });
}

function removeHighlight(element) {
  const marks = element.querySelectorAll('mark');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    const textNode = document.createTextNode(mark.textContent);
    parent.replaceChild(textNode, mark);
    parent.normalize();
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Why Needed" components & dictionary
const whyData = {
  profileUrl: {
    title: "Naukri Profile URL",
    purpose: "Used to navigate directly to your profile editor page in the dedicated browser session.",
    storage: "Saved locally in your `.env` file.",
    sharing: "Used only for navigation within the dedicated Chrome browser during automation.",
    deletion: "You can clear or edit this URL from the Settings page."
  },
  email: {
    title: "Naukri Email / Username",
    purpose: "Used to log in to your Naukri account when the dedicated browser session is not authenticated.",
    storage: "Saved locally in your `.env` file.",
    sharing: "Sent only to Naukri.com's login server during authentication.",
    deletion: "You can remove it anytime from Settings → Privacy & Data Management → Clear Saved Credentials."
  },
  password: {
    title: "Naukri Password",
    purpose: "Used to automatically authenticate your Naukri account if Chrome requires logging in.",
    storage: "Stored locally as plain text in your `.env` file. It is not encrypted.",
    sharing: "Sent only to Naukri.com during login. It is never sent to our servers and is excluded from all application logs.",
    deletion: "You can remove it anytime from Settings → Privacy & Data Management → Clear Saved Credentials."
  },
  resume: {
    title: "Resume PDF File",
    purpose: "Uploaded to your Naukri profile daily (or manually) to refresh your profile's update timestamp.",
    storage: "Stored in a dedicated `resume/` directory inside your local application config folder.",
    sharing: "Uploaded directly to Naukri.com when the resume automation runs. It does not leave your machine for any other destination.",
    deletion: "You can delete the local copy from Settings → Privacy & Data Management → Remove Resume File."
  },
  headline: {
    title: "Headline Refresh Automation",
    purpose: "Maintains profile activity by periodically adding or removing a trailing period (.) to your resume headline.",
    storage: "Configuration is stored locally in your `.env` file.",
    sharing: "Updates are sent directly to Naukri.com using the dedicated browser session.",
    deletion: "You can disable this automation by toggling the switch to OFF."
  },
  resumeUpload: {
    title: "Daily Resume PDF Upload",
    purpose: "Re-uploads your resume once a day at a scheduled time. To prevent Naukri from showing duplicate warnings, the app adds a dated suffix (e.g., `resume_29-08-2026.pdf`) during upload.",
    storage: "Configuration is stored locally in your `.env` file.",
    sharing: "The PDF is uploaded directly to Naukri.com.",
    deletion: "You can disable this automation by toggling the switch to OFF."
  },
  timeWindow: {
    title: "Active Time Window",
    purpose: "Restricts background automation to only execute during specific hours of the day (e.g. 9 AM to 6 PM) to match human activity.",
    storage: "Saved locally in your `.env` file.",
    sharing: "This setting is strictly local and never shared.",
    deletion: "You can disable this limitation by toggling the switch to OFF."
  },
  background: {
    title: "Background Scheduling",
    purpose: "Enables automation to run in the background at scheduled times using your operating system's native task scheduler.",
    storage: "The setting is stored locally in your `.env` file.",
    sharing: "This setting is strictly local and never shared.",
    deletion: "You can stop background execution by turning off both automation toggles and saving settings."
  }
};

const whyModal = document.getElementById('why-modal');
const whyTitle = document.getElementById('why-title');
const whyBody = document.getElementById('why-body');
const whyCloseBtn = document.getElementById('why-close-btn');

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.why-btn');
  if (btn) {
    const key = btn.getAttribute('data-why');
    const data = whyData[key];
    if (data) {
      whyTitle.textContent = `Why do we need your ${data.title}?`;
      whyBody.innerHTML = `
        <p style="margin-bottom: 12px; line-height: 1.5; font-size: 0.92rem;"><strong style="color: var(--text-primary); display: inline-block; width: 140px;">Purpose:</strong> <span style="color: var(--text-secondary);">${data.purpose}</span></p>
        <p style="margin-bottom: 12px; line-height: 1.5; font-size: 0.92rem;"><strong style="color: var(--text-primary); display: inline-block; width: 140px;">Storage:</strong> <span style="color: var(--text-secondary);">${data.storage}</span></p>
        <p style="margin-bottom: 12px; line-height: 1.5; font-size: 0.92rem;"><strong style="color: var(--text-primary); display: inline-block; width: 140px;">External Sharing:</strong> <span style="color: var(--text-secondary);">${data.sharing}</span></p>
        <p style="line-height: 1.5; font-size: 0.92rem;"><strong style="color: var(--text-primary); display: inline-block; width: 140px;">How to remove:</strong> <span style="color: var(--text-secondary);">${data.deletion}</span></p>
      `;
      whyModal.classList.add('active');
    }
  }
});

whyCloseBtn.addEventListener('click', () => {
  whyModal.classList.remove('active');
});

whyModal.addEventListener('click', (e) => {
  if (e.target === whyModal) {
    whyModal.classList.remove('active');
  }
});
// -------------------------------------------------------------
// Custom Confirmation & Alert Dialog Helper
// -------------------------------------------------------------
function showCustomConfirm({ title, message, requireText, buttonText, buttonClass, hideCancel }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const bodyEl = document.getElementById('confirm-body');
    const inputContainer = document.getElementById('confirm-input-container');
    const inputLabel = document.getElementById('confirm-input-label');
    const inputField = document.getElementById('confirm-text-input');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const actionBtn = document.getElementById('confirm-action-btn');

    titleEl.textContent = title || "Confirm Action";
    bodyEl.innerHTML = message || "";

    // Reset inputs
    inputField.value = "";
    if (requireText) {
      inputContainer.style.display = "block";
      inputLabel.textContent = `Type "${requireText}" to confirm:`;
      inputField.placeholder = requireText;
      actionBtn.disabled = true;

      // Real-time input checking
      inputField.oninput = () => {
        actionBtn.disabled = inputField.value.trim() !== requireText;
      };
    } else {
      inputContainer.style.display = "none";
      actionBtn.disabled = false;
      inputField.oninput = null;
    }

    if (hideCancel) {
      cancelBtn.style.display = "none";
    } else {
      cancelBtn.style.display = "block";
    }

    // Button styling
    actionBtn.textContent = buttonText || "Confirm";
    if (buttonClass) {
      actionBtn.className = `btn ${buttonClass}`;
    } else {
      actionBtn.className = "btn btn-primary";
    }

    modal.classList.add('active');

    if (requireText) {
      inputField.focus();
    } else {
      actionBtn.focus();
    }

    function cleanup() {
      modal.classList.remove('active');
      cancelBtn.removeEventListener('click', onCancel);
      actionBtn.removeEventListener('click', onConfirm);
      modal.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    function onConfirm() {
      cleanup();
      resolve(true);
    }

    function onOverlayClick(e) {
      if (e.target === modal && !hideCancel) {
        onCancel();
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape' && !hideCancel) {
        onCancel();
      }
    }

    cancelBtn.addEventListener('click', onCancel);
    actionBtn.addEventListener('click', onConfirm);
    modal.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);
  });
}

function showCustomAlert(title, message) {
  return showCustomConfirm({
    title: title,
    message: message,
    buttonText: "OK",
    hideCancel: true
  });
}

// Privacy & Data Management Buttons
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnClearCreds = document.getElementById('btn-clear-creds');
const btnRemoveResume = document.getElementById('btn-remove-resume');
const btnResetBrowser = document.getElementById('btn-reset-browser');
const btnResetApp = document.getElementById('btn-reset-app');

btnOpenFolder.addEventListener('click', async () => {
  await window.api.openAppFolder();
});

btnClearCreds.addEventListener('click', async () => {
  const confirmed = await showCustomConfirm({
    title: "Clear Saved Credentials",
    message: "Are you sure you want to clear your saved Naukri credentials from the local `.env` configuration file? This will stop automated logins until you re-enter them.",
    buttonText: "Clear Credentials",
    buttonClass: "btn-danger"
  });

  if (confirmed) {
    const res = await window.api.clearCredentials();
    if (res.success) {
      document.getElementById('naukri-email').value = '';
      document.getElementById('naukri-password').value = '';
      await showCustomAlert("Success", "Credentials cleared successfully.");
      loadSettings();
    }
  }
});

btnRemoveResume.addEventListener('click', async () => {
  const confirmed = await showCustomConfirm({
    title: "Remove Resume PDF",
    message: "Are you sure you want to delete your resume PDF files from the local storage? This will disable the resume upload automation.",
    buttonText: "Remove Resume",
    buttonClass: "btn-danger"
  });

  if (confirmed) {
    const res = await window.api.deleteResume();
    if (res.success) {
      await showCustomAlert("Success", "Resume files deleted successfully.");
      updateResumeDisplay();
    }
  }
});

btnResetBrowser.addEventListener('click', async () => {
  const confirmed = await showCustomConfirm({
    title: "Reset Browser Session",
    message: "Are you sure you want to reset the dedicated Chrome browser profile? This will close Chrome, delete all cookies, caches, and stored login sessions, and require you to log in to Naukri again next time.",
    buttonText: "Reset Browser",
    buttonClass: "btn-danger"
  });

  if (confirmed) {
    const originalText = btnResetBrowser.textContent;
    btnResetBrowser.textContent = "Resetting...";
    btnResetBrowser.disabled = true;
    const res = await window.api.resetBrowserProfile();
    btnResetBrowser.textContent = originalText;
    btnResetBrowser.disabled = false;
    if (res.success) {
      await showCustomAlert("Success", "Dedicated Chrome browser profile reset successfully.");
    } else {
      await showCustomAlert("Error", `Error resetting browser profile: ${res.error}`);
    }
  }
});

btnResetApp.addEventListener('click', async () => {
  const verifyText = "reset all";
  const confirmed = await showCustomConfirm({
    title: "Reset Entire Application",
    message: "<strong>WARNING:</strong> This will completely wipe all settings (.env), credentials, resume files, execution logs, background tasks, and browser session data. The application will return to its original first-run state.",
    requireText: verifyText,
    buttonText: "Wipe Everything",
    buttonClass: "btn-danger"
  });

  if (confirmed) {
    const originalText = btnResetApp.textContent;
    btnResetApp.textContent = "Wiping...";
    btnResetApp.disabled = true;
    const res = await window.api.resetApplication();
    btnResetApp.textContent = originalText;
    btnResetApp.disabled = false;
    if (res.success) {
      await showCustomAlert("Success", "Application reset completed successfully. Re-launching configuration wizard.");
      isFirstRun = true;
      firstRunModal.classList.add('active');
      wizardStep = 0;
      populateWizardFields();
      updateWizardUI();
      loadSettings();
      updateResumeDisplay();
    } else {
      await showCustomAlert("Error", `Error during application reset: ${res.error}`);
    }
  }
});

// Auto-Update Listener & UI logic
function setupAutoUpdater() {
  const updateBanner = document.getElementById('update-banner');
  const updateTitle = document.getElementById('update-banner-title');
  const updateSubtitle = document.getElementById('update-banner-subtitle');
  const updateBtn = document.getElementById('btn-update-action');

  if (!updateBanner || !window.api) return;

  if (typeof window.api.onUpdateAvailable === 'function') {
    window.api.onUpdateAvailable((info) => {
      updateTitle.textContent = `🚀 Update Available (v${info.version})!`;
      updateSubtitle.textContent = `A new release is ready for installation.`;
      updateBtn.textContent = 'Download & Install';
      updateBtn.disabled = false;
      updateBanner.style.display = 'flex';

      updateBtn.onclick = async () => {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Downloading...';
        const res = await window.api.downloadAndInstallUpdate();
        if (res && res.message) {
          updateSubtitle.textContent = res.message;
        }
      };
    });
  }

  if (typeof window.api.onUpdateDownloadProgress === 'function') {
    window.api.onUpdateDownloadProgress((progress) => {
      updateBtn.textContent = `Downloading (${progress.percent}%)`;
    });
  }

  if (typeof window.api.onUpdateDownloaded === 'function') {
    window.api.onUpdateDownloaded((info) => {
      updateTitle.textContent = `✅ Update Ready (v${info.version})!`;
      updateSubtitle.textContent = `The update has been downloaded. Restart to apply.`;
      updateBtn.textContent = 'Restart & Install Now';
      updateBtn.disabled = false;

      updateBtn.onclick = () => {
        window.api.quitAndInstall();
      };
    });
  }
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
async function init() {
  await updateResumeDisplay();
  await loadSettings();
  await updateDashboardCredentialsCard();
  await updateChromeStatus();
  await updateAutomationDashboard();
  setupAutoUpdater();

  // Status check loop every 3 seconds
  setInterval(updateChromeStatus, 3000);
}

document.addEventListener('DOMContentLoaded', init);
