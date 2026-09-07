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
import * as fs from 'fs';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import * as http from 'http';
import * as path from 'path';
import { isProcessAlive } from './lock.js';

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

let spawnedChromePid: number | null = null;

export function getSpawnedChromePid(): number | null {
  return spawnedChromePid;
}

/**
 * Verifies that a given PID actually belongs to our dedicated Chrome process
 * (checking for remote-debugging-port=9222 and the dedicated profile directory).
 * Protects against killing unrelated Chrome processes or recycled PIDs.
 */
export function isDedicatedChromeProcess(pid: number, profileDir?: string): boolean {
  if (!isProcessAlive(pid)) return false;

  try {
    if (process.platform === 'linux') {
      const cmdlinePath = `/proc/${pid}/cmdline`;
      if (!existsSync(cmdlinePath)) return false;
      const cmdline = fs.readFileSync(cmdlinePath, 'utf8').replace(/\0/g, ' ');
      if (!cmdline.includes('--remote-debugging-port=9222')) return false;
      if (profileDir && !cmdline.includes(path.basename(profileDir))) return false;
      return true;
    }

    if (process.platform === 'darwin') {
      const out = execSync(`ps -p ${pid} -o args=`, { stdio: 'pipe' }).toString();
      if (!out.includes('--remote-debugging-port=9222')) return false;
      if (profileDir && !out.includes(path.basename(profileDir))) return false;
      return true;
    }

    if (process.platform === 'win32') {
      const out = execSync(`wmic process where "ProcessId=${pid}" get CommandLine`, { stdio: 'pipe' }).toString();
      if (!out.includes('--remote-debugging-port=9222')) return false;
      return true;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Checks if the dedicated profile directory is actively held by a running process.
 */
export function isProfileActivelyLocked(profileDir: string): boolean {
  const lockFile = path.join(profileDir, 'SingletonLock');
  if (!existsSync(lockFile)) return false;

  try {
    // On Linux/POSIX, SingletonLock is often a symlink to host-pid
    const target = fs.readlinkSync(lockFile);
    const match = target.match(/-(\d+)$/);
    if (match && match[1]) {
      const pid = parseInt(match[1], 10);
      if (isProcessAlive(pid) && isDedicatedChromeProcess(pid, profileDir)) {
        return true;
      }
    }
  } catch {
    // If not a symlink, check if our recorded PID is alive
    if (spawnedChromePid && isDedicatedChromeProcess(spawnedChromePid, profileDir)) {
      return true;
    }
  }

  return false;
}

/**
 * Start Chrome with CDP enabled on 127.0.0.1:9222.
 * Returns true when CDP becomes available, false on timeout.
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

  // Remove stale SingletonLock only if no live process owns it
  const lockFile = path.join(profileDir, 'SingletonLock');
  if (existsSync(lockFile) && !isProfileActivelyLocked(profileDir)) {
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
  spawnedChromePid = proc.pid ?? null;
  proc.unref();

  // Record PID to runtime state
  try {
    const runtimeDir = path.join(path.dirname(profileDir), 'runtime');
    if (!existsSync(runtimeDir)) mkdirSync(runtimeDir, { recursive: true });
    if (spawnedChromePid) {
      fs.writeFileSync(path.join(runtimeDir, 'chrome.pid'), String(spawnedChromePid), 'utf8');
    }
  } catch {
    // ignore
  }

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
 * Safely disconnects and terminates only the dedicated Naukri Chrome instance.
 * Verifies process command line before termination to protect unrelated Chrome processes.
 */
export async function disconnectChrome(
  cdpEndpoint: string = 'http://127.0.0.1:9222',
  profileDir?: string
): Promise<void> {
  let targetPid: number | null = spawnedChromePid;

  if (!targetPid && profileDir) {
    try {
      const pidFile = path.join(path.dirname(profileDir), 'runtime', 'chrome.pid');
      if (existsSync(pidFile)) {
        const raw = fs.readFileSync(pidFile, 'utf8').trim();
        targetPid = parseInt(raw, 10) || null;
      }
    } catch {
      // ignore
    }
  }

  if (targetPid && isDedicatedChromeProcess(targetPid, profileDir)) {
    try {
      process.kill(targetPid, 'SIGTERM');
      // Give it up to 2 seconds to close cleanly
      await new Promise((r) => setTimeout(r, 1000));
      if (isProcessAlive(targetPid)) {
        process.kill(targetPid, 'SIGKILL');
      }
    } catch {
      // ignore
    }
    spawnedChromePid = null;
  } else {
    // Fallback: targeted kill only matching remote-debugging-port=9222 and profileDir
    try {
      const profileBase = profileDir ? path.basename(profileDir) : '.naukri-chrome-profile';
      if (process.platform === 'win32') {
        execSync(
          `wmic process where "commandline like '%--remote-debugging-port=9222%' and commandline like '%${profileBase}%'" call terminate`,
          { stdio: 'ignore' }
        );
      } else {
        execSync(`pkill -f "remote-debugging-port=9222.*${profileBase}"`, { stdio: 'ignore' });
      }
    } catch {
      // ignore if none running
    }
  }

  // Clean up runtime pid file
  if (profileDir) {
    try {
      const pidFile = path.join(path.dirname(profileDir), 'runtime', 'chrome.pid');
      if (existsSync(pidFile)) unlinkSync(pidFile);
    } catch {
      // ignore
    }
  }

  // Verify CDP is down (wait up to 5s)
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const isUp = await checkCDPAvailable(cdpEndpoint);
    if (!isUp) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
