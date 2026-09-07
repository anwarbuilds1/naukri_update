/**
 * OS Service Management for Naukri Update Agent.
 *
 * Supported OS targets:
 * - Linux: systemd user service (~/.config/systemd/user/naukri-agent.service)
 * - macOS: LaunchAgent (~/Library/LaunchAgents/com.naukri.agent.plist)
 * - Windows: Task Scheduler (schtasks.exe /Create /SC ONLOGON)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ServicePaths {
  nodeBin: string;
  entrypoint: string;
  repoDir: string;
  configDir: string;
  logsDir: string;
}

export function resolveServicePaths(configDir: string): ServicePaths {
  const nodeBin = process.execPath;
  const entrypoint = path.resolve(process.argv[1] || path.join(process.cwd(), 'dist', 'main.js'));
  const repoDir = path.resolve(path.dirname(entrypoint), '..');
  const logsDir = path.join(configDir, 'logs');

  return {
    nodeBin,
    entrypoint,
    repoDir,
    configDir,
    logsDir,
  };
}

// ─── Linux Systemd ───────────────────────────────────────────────────────────

export function getSystemdServiceContent(paths: ServicePaths): string {
  return `[Unit]
Description=Naukri Update Local Background Agent
After=network.target default.target

[Service]
Type=simple
WorkingDirectory=${paths.repoDir}
ExecStart=${paths.nodeBin} ${paths.entrypoint}
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
}

export function getSystemdServicePath(home: string = process.env['HOME'] ?? ''): string {
  return path.join(home, '.config', 'systemd', 'user', 'naukri-agent.service');
}

// ─── macOS LaunchAgent ───────────────────────────────────────────────────────

export function getLaunchAgentPlistContent(paths: ServicePaths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.naukri.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${paths.nodeBin}</string>
        <string>${paths.entrypoint}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${paths.repoDir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${paths.logsDir}/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>${paths.logsDir}/launchd.err</string>
</dict>
</plist>
`;
}

export function getLaunchAgentPath(home: string = process.env['HOME'] ?? ''): string {
  return path.join(home, 'Library', 'LaunchAgents', 'com.naukri.agent.plist');
}

// ─── Windows Task Scheduler ──────────────────────────────────────────────────

export function getWindowsTaskCommand(paths: ServicePaths): { create: string; delete: string; query: string } {
  const taskName = 'NaukriUpdateAgent';
  const target = `\\"${paths.nodeBin}\\" \\"${paths.entrypoint}\\"`;
  return {
    create: `schtasks.exe /Create /TN "${taskName}" /TR "${target}" /SC ONLOGON /F`,
    delete: `schtasks.exe /Delete /TN "${taskName}" /F`,
    query: `schtasks.exe /Query /TN "${taskName}"`,
  };
}

// ─── High-Level Service Actions ──────────────────────────────────────────────

export function installService(configDir: string): { success: boolean; message: string } {
  const paths = resolveServicePaths(configDir);
  const platform = process.platform;

  try {
    if (platform === 'linux') {
      const serviceFile = getSystemdServicePath();
      const dir = path.dirname(serviceFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(serviceFile, getSystemdServiceContent(paths), 'utf8');
      execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
      execSync('systemctl --user enable naukri-agent.service', { stdio: 'pipe' });
      execSync('systemctl --user restart naukri-agent.service', { stdio: 'pipe' });

      return { success: true, message: `Systemd user service installed and started at ${serviceFile}` };
    }

    if (platform === 'darwin') {
      const plistFile = getLaunchAgentPath();
      const dir = path.dirname(plistFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(plistFile, getLaunchAgentPlistContent(paths), 'utf8');
      try {
        execSync(`launchctl unload "${plistFile}"`, { stdio: 'pipe' });
      } catch {
        // ignore unload error if not loaded
      }
      execSync(`launchctl load -w "${plistFile}"`, { stdio: 'pipe' });

      return { success: true, message: `LaunchAgent installed and loaded at ${plistFile}` };
    }

    if (platform === 'win32') {
      const cmds = getWindowsTaskCommand(paths);
      execSync(cmds.create, { stdio: 'pipe' });
      return { success: true, message: 'Windows Task Scheduler task created for user logon.' };
    }

    return { success: false, message: `Unsupported platform: ${platform}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Service installation failed: ${msg}` };
  }
}

export function uninstallService(configDir: string): { success: boolean; message: string } {
  const paths = resolveServicePaths(configDir);
  const platform = process.platform;

  try {
    if (platform === 'linux') {
      const serviceFile = getSystemdServicePath();
      try {
        execSync('systemctl --user stop naukri-agent.service', { stdio: 'pipe' });
        execSync('systemctl --user disable naukri-agent.service', { stdio: 'pipe' });
      } catch {
        // ignore
      }
      if (fs.existsSync(serviceFile)) fs.unlinkSync(serviceFile);
      execSync('systemctl --user daemon-reload', { stdio: 'pipe' });

      return { success: true, message: 'Systemd user service uninstalled.' };
    }

    if (platform === 'darwin') {
      const plistFile = getLaunchAgentPath();
      if (fs.existsSync(plistFile)) {
        try {
          execSync(`launchctl unload -w "${plistFile}"`, { stdio: 'pipe' });
        } catch {
          // ignore
        }
        fs.unlinkSync(plistFile);
      }
      return { success: true, message: 'LaunchAgent uninstalled.' };
    }

    if (platform === 'win32') {
      const cmds = getWindowsTaskCommand(paths);
      execSync(cmds.delete, { stdio: 'pipe' });
      return { success: true, message: 'Windows Task Scheduler task removed.' };
    }

    return { success: false, message: `Unsupported platform: ${platform}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Service uninstall failed: ${msg}` };
  }
}

export function checkServiceStatus(configDir: string): { installed: boolean; running: boolean; detail: string } {
  const paths = resolveServicePaths(configDir);
  const platform = process.platform;

  try {
    if (platform === 'linux') {
      const serviceFile = getSystemdServicePath();
      const installed = fs.existsSync(serviceFile);
      let running = false;
      let detail = 'Service not installed';

      if (installed) {
        try {
          const out = execSync('systemctl --user is-active naukri-agent.service', { stdio: 'pipe' }).toString().trim();
          running = out === 'active';
          detail = `systemd service is ${out}`;
        } catch (err) {
          detail = 'systemd service is inactive or errored';
        }
      }
      return { installed, running, detail };
    }

    if (platform === 'darwin') {
      const plistFile = getLaunchAgentPath();
      const installed = fs.existsSync(plistFile);
      let running = false;
      let detail = 'LaunchAgent not installed';

      if (installed) {
        try {
          const out = execSync('launchctl list', { stdio: 'pipe' }).toString();
          running = out.includes('com.naukri.agent');
          detail = running ? 'LaunchAgent loaded and running' : 'LaunchAgent installed but inactive';
        } catch {
          detail = 'Unable to query launchctl';
        }
      }
      return { installed, running, detail };
    }

    if (platform === 'win32') {
      const cmds = getWindowsTaskCommand(paths);
      try {
        const out = execSync(cmds.query, { stdio: 'pipe' }).toString();
        return { installed: true, running: out.includes('Running'), detail: out.slice(0, 100) };
      } catch {
        return { installed: false, running: false, detail: 'Scheduled task not found' };
      }
    }

    return { installed: false, running: false, detail: `Unsupported platform: ${platform}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: false, running: false, detail: msg };
  }
}
