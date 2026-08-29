const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getResumeInfo: () => ipcRenderer.invoke('get-resume-info'),
  selectResume: () => ipcRenderer.invoke('select-resume'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getAutomationStatus: () => ipcRenderer.invoke('get-automation-status'),
  openChrome: () => ipcRenderer.invoke('open-chrome'),
  getChromeStatus: () => ipcRenderer.invoke('get-chrome-status'),
  triggerHeadlineRefresh: () => ipcRenderer.invoke('trigger-headline-refresh'),
  triggerResumeUpload: () => ipcRenderer.invoke('trigger-resume-upload'),
  connectNaukri: () => ipcRenderer.invoke('connect-naukri'),
  disconnectChrome: () => ipcRenderer.invoke('disconnect-chrome'),
  getConnectionState: () => ipcRenderer.invoke('get-connection-state'),
  onConnectionState: (callback) => ipcRenderer.on('naukri-connection-state', (event, state) => callback(state)),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', () => callback()),
  
  // New API handles for transparency and data management
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openAppFolder: () => ipcRenderer.invoke('open-app-folder'),
  clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
  deleteResume: () => ipcRenderer.invoke('delete-resume'),
  resetBrowserProfile: () => ipcRenderer.invoke('reset-browser-profile'),
  resetApplication: () => ipcRenderer.invoke('reset-application'),
  runDiagnostics: () => ipcRenderer.invoke('run-diagnostics'),

  // Explicit security-focused aliases requested by system requirements
  chooseResume: () => ipcRenderer.invoke('select-resume'),
  disconnectNaukri: () => ipcRenderer.invoke('disconnect-chrome'),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-state'),
  pauseAutomation: () => ipcRenderer.invoke('pause-automation'),
  resumeAutomation: () => ipcRenderer.invoke('resume-automation')
});
