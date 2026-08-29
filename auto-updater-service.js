/**
 * Auto-Updater Service for Naukri Update.
 * Checks for updates via electron-updater and GitHub Releases API.
 * Notifies the renderer process when updates are available and handles automated installation safely.
 */

const { autoUpdater } = require('electron-updater');
const { app, ipcMain, shell } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');

class AutoUpdaterService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.repoOwner = 'anwarbuilds1';
    this.repoName = 'naukri_update';
    this.updateInfo = null;
    this.isDownloading = false;

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
      this.isDownloading = true;
      this.sendToRenderer('update-download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded. Ready to install.');
      this.isDownloading = false;
      this.sendToRenderer('update-downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] electron-updater notice:', err.message);
      this.isDownloading = false;
      // Fallback to GitHub Release API check
      this.checkGitHubReleases();
    });

    // IPC Handlers
    ipcMain.handle('check-for-updates', async () => {
      return await this.checkForUpdates();
    });

    ipcMain.handle('download-and-install-update', async () => {
      try {
        if (this.updateInfo && app.isPackaged) {
          this.isDownloading = true;
          await autoUpdater.downloadUpdate();
          return { success: true, message: 'Downloading update in background...' };
        } else {
          // Open releases page as fallback for unpackaged / .deb formats
          const targetUrl = `https://github.com/${this.repoOwner}/${this.repoName}/releases/latest`;
          shell.openExternal(targetUrl);
          return { success: true, fallbackUrl: targetUrl, message: 'Opening latest release page...' };
        }
      } catch (err) {
        console.error('[AutoUpdater] Download failed:', err);
        const targetUrl = `https://github.com/${this.repoOwner}/${this.repoName}/releases/latest`;
        shell.openExternal(targetUrl);
        return { success: false, fallbackUrl: targetUrl, error: err.message };
      }
    });

    ipcMain.handle('quit-and-install', () => {
      // Check if an automation task is currently running before restarting
      const lockPath = path.join(app.getPath('userData'), '.naukri-automation.lock');
      if (fs.existsSync(lockPath)) {
        try {
          const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          const ageMs = Date.now() - (lockData.timestamp || 0);
          if (ageMs < 30 * 60 * 1000) {
            return {
              success: false,
              error: 'An automation task is currently running. Please wait for it to complete before restarting.'
            };
          }
        } catch (e) {}
      }

      try {
        autoUpdater.quitAndInstall(false, true);
        return { success: true };
      } catch (err) {
        console.error('[AutoUpdater] quitAndInstall failed:', err.message);
        return { success: false, error: err.message };
      }
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
                  releaseNotes: data.body || 'New update released on GitHub.',
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
            this.sendToRenderer('update-error', { error: 'Unable to parse GitHub release data.' });
            resolve({ success: false, error: e.message, currentVersion });
          }
        });
      }).on('error', (err) => {
        console.error('[AutoUpdater] GitHub release check error:', err.message);
        this.sendToRenderer('update-error', { error: 'Unable to check for updates. Check internet connection.' });
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

