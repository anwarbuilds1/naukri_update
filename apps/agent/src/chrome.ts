/**
 * Chrome lifecycle management for the Naukri agent.
 *
 * Responsible for:
 * - Finding the Chrome executable
 * - Starting Chrome with CDP on 127.0.0.1:9222
 * - Checking CDP availability
 * - Terminating/disconnecting Chrome
 *
 * All functions are independent of Electron and adhere to the
 * baseline implementation in main.js and scripts/start-naukri-chrome.sh.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import * as http from 'http';
import * as path from 'path';

export interface ChromeManager {
  isAvailable(endpoint?: string): Promise<boolean>;
  ensureRunning(profileDir: string, naukriProfileUrl: string, cdpEndpoint?: string): Promise<boolean>;
  disconnect(endpoint?: string): Promise<void>;
  findExecutable(): string | null;
}

/**
 * Check whether the Chrome CDP endpoint is reachable.
 */
export async function checkCDPAvailable(endpoint: string = 'http://127.0.0.1:9222'): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = new URL('/json/version', endpoint);
      const req = http.get(
        { hostname: url.hostname, port: url.port, path: url.pathname, timeout: 1500 },
        (res) => resolve(res.statusCode === 200)
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Find the Google Chrome executable for the current platform.
 * Mirrors findChromeExecutable() in main.js.
 */
export function findChromeExecutable(): string | null {
  const platform = process.platform;

  if (platform === 'win32') {
    const candidates = [
      `${process.env['PROGRAMFILES'] ?? 'C:/Program Files'}/Google/Chrome/Application/chrome.exe`,
      `${process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)'}/Google/Chrome/Application/chrome.exe`,
      `${process.env['LOCALAPPDATA'] ?? ''}/Google/Chrome/Application/chrome.exe`,
    ];
    return candidates.find(existsSync) ?? null;
  }

  if (platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return existsSync(p) ? p : null;
  }

  // Linux
  const linuxCandidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
  for (const c of linuxCandidates) {
    try {
      const p = execSync(`which ${c}`, { stdio: 'pipe' }).toString().trim();
      if (p && existsSync(p)) return p;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/**
 * Start Chrome with CDP enabled on 127.0.0.1:9222.
 * Returns true when CDP becomes available, false on timeout.
 *
 * Mirrors ensureChromeRunning() in main.js.
 */
export async function ensureChromeRunning(
  profileDir: string,
  naukriProfileUrl: string,
  cdpEndpoint: string = 'http://127.0.0.1:9222'
): Promise<boolean> {
  const available = await checkCDPAvailable(cdpEndpoint);
  if (available) return true;

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    console.error('[chrome] Chrome executable not found.');
    return false;
  }

  // Remove stale SingletonLock
  const lockFile = path.join(profileDir, 'SingletonLock');
  if (existsSync(lockFile)) {
    try {
      unlinkSync(lockFile);
    } catch {
      // ignore
    }
  }

  const chromeArgs = [
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    naukriProfileUrl,
  ];

  const proc = spawn(chromePath, chromeArgs, { detached: true, stdio: 'ignore' });
  proc.unref();

  // Poll for CDP availability (up to 30 seconds)
  return new Promise((resolve) => {
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const ready = await checkCDPAvailable(cdpEndpoint);
      if (ready) {
        clearInterval(poll);
        resolve(true);
      } else if (attempts >= 30) {
        clearInterval(poll);
        resolve(false);
      }
    }, 1000);
  });
}

/**
 * Disconnects and terminates Chrome processes started with remote-debugging-port=9222.
 * Mirrors disconnectChrome() in main.js.
 */
export async function disconnectChrome(cdpEndpoint: string = 'http://127.0.0.1:9222'): Promise<void> {
  try {
    if (process.platform === 'win32') {
      execSync('wmic process where "commandline like \'%--remote-debugging-port=9222%\'" call terminate', {
        stdio: 'ignore',
      });
    } else {
      execSync('pkill -f "remote-debugging-port=9222"', { stdio: 'ignore' });
    }
  } catch {
    // ignore process kill failures if none were running
  }

  // Verify CDP is down (wait up to 5s)
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const isUp = await checkCDPAvailable(cdpEndpoint);
    if (!isUp) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
