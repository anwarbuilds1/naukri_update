/**
 * Auto-Updater Service for Naukri Update.
 * Checks for updates via electron-updater and GitHub Releases API.
 * Notifies the renderer process when updates are available and handles automated installation.
 */

const { autoUpdater } = require('electron-updater');
const { app, ipcMain, shell } = require('electron');
const https = require('https');

class AutoUpdaterService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.repoOwner = 'anwarbuilds1';
    this.repoName = 'naukri_update';
    this.updateInfo = null;

    // Configure electron-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.initListeners();
  }

  initListeners() {
    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      this.updateInfo = info;
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || 'Bug fixes and performance improvements.',
        releaseDate: info.releaseDate || new Date().toISOString()
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] App is up to date.');
      this.sendToRenderer('update-not-available', { version: app.getVersion() });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      this.sendToRenderer('update-download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded. Ready to install.');
      this.sendToRenderer('update-downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] electron-updater error:', err.message);
      // Fallback to GitHub Release API check
      this.checkGitHubReleases();
    });

    // IPC Handlers
    ipcMain.handle('check-for-updates', async () => {
      return await this.checkForUpdates();
    });

    ipcMain.handle('download-and-install-update', async () => {
      try {
        if (this.updateInfo) {
          await autoUpdater.downloadUpdate();
          return { success: true, message: 'Downloading update in background...' };
        } else {
          // Open releases page as fallback
          shell.openExternal(`https://github.com/${this.repoOwner}/${this.repoName}/releases/latest`);
          return { success: true, message: 'Opening latest release page...' };
        }
      } catch (err) {
        console.error('[AutoUpdater] Download failed:', err);
        shell.openExternal(`https://github.com/${this.repoOwner}/${this.repoName}/releases/latest`);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('quit-and-install', () => {
      autoUpdater.quitAndInstall();
    });
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates() {
    const currentVersion = app.getVersion();
    try {
      if (app.isPackaged) {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, currentVersion, updateInfo: result ? result.updateInfo : null };
      } else {
        return await this.checkGitHubReleases();
      }
    } catch (err) {
      console.warn('[AutoUpdater] Primary check failed, running GitHub API fallback:', err.message);
      return await this.checkGitHubReleases();
    }
  }

  checkGitHubReleases() {
    return new Promise((resolve) => {
      const currentVersion = app.getVersion();
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.repoOwner}/${this.repoName}/releases/latest`,
        headers: { 'User-Agent': 'Naukri-Update-Desktop' },
        timeout: 5000
      };

      https.get(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(body);
              const latestTag = (data.tag_name || '').replace(/^v/, '');
              
              if (latestTag && this.isVersionHigher(latestTag, currentVersion)) {
                const info = {
                  version: latestTag,
                  releaseNotes: data.body || '',
                  htmlUrl: data.html_url
                };
                this.sendToRenderer('update-available', info);
                resolve({ success: true, updateAvailable: true, currentVersion, latestVersion: latestTag, info });
                return;
              }
            }
            this.sendToRenderer('update-not-available', { version: currentVersion });
            resolve({ success: true, updateAvailable: false, currentVersion });
          } catch (e) {
            resolve({ success: false, error: e.message, currentVersion });
          }
        });
      }).on('error', (err) => {
        console.error('[AutoUpdater] GitHub release check error:', err.message);
        resolve({ success: false, error: err.message, currentVersion });
      });
    });
  }

  isVersionHigher(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return true;
      if (num1 < num2) return false;
    }
    return false;
  }
}

module.exports = AutoUpdaterService;
