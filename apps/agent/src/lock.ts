/**
 * Production-grade atomic process and task locking.
 *
 * Provides:
 * 1. Single-Agent Daemon Instance Lock (atomic O_CREAT|O_EXCL, live PID checking).
 * 2. Automation Task Lock (active PID lease, safe dead-PID reclamation).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AgentLockData {
  pid: number;
  timestamp: number;
  startedAt: number;
  version: string;
  agentId: string;
}

export interface AutomationLockData {
  pid: number;
  timestamp: number;
}

export interface InstanceLockResult {
  acquired: boolean;
  existingPid?: number;
  reason?: string;
}

/**
 * Checks if a process with the given PID is currently alive.
 */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    // EPERM means process exists but we lack permission to signal it (still alive!)
    if (code === 'EPERM') return true;
    // ESRCH means process does not exist (dead)
    return false;
  }
}

// ─── Single-Agent Instance Lock ──────────────────────────────────────────────

export function getAgentLockPath(configDir: string): string {
  return path.join(configDir, 'runtime', 'agent.lock');
}

export function acquireAgentInstanceLock(
  configDir: string,
  agentId: string,
  version: string
): InstanceLockResult {
  const lockPath = getAgentLockPath(configDir);
  const runtimeDir = path.dirname(lockPath);

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const payload: AgentLockData = {
    pid: process.pid,
    timestamp: Date.now(),
    startedAt: Date.now(),
    version,
    agentId,
  };

  const payloadStr = JSON.stringify(payload, null, 2);

  // Attempt atomic exclusive creation
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL
      fs.writeFileSync(fd, payloadStr, 'utf8');
      fs.closeSync(fd);
      return { acquired: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== 'EEXIST') {
        return { acquired: false, reason: `Failed to create lockfile: ${String(err)}` };
      }

      // Lockfile already exists. Inspect owner.
      let existingData: AgentLockData | null = null;
      try {
        const content = fs.readFileSync(lockPath, 'utf8');
        existingData = JSON.parse(content) as AgentLockData;
      } catch {
        // Corrupted lockfile: reclaim
        try {
          fs.unlinkSync(lockPath);
          continue; // retry
        } catch {
          // ignore
        }
      }

      if (existingData && existingData.pid) {
        if (existingData.pid === process.pid) {
          // Already owned by current process
          return { acquired: true };
        }

        if (isProcessAlive(existingData.pid)) {
          return {
            acquired: false,
            existingPid: existingData.pid,
            reason: `Another agent daemon (PID ${existingData.pid}) is actively running.`,
          };
        }

        // Previous PID is confirmed dead. Reclaim lock.
        try {
          fs.unlinkSync(lockPath);
          continue; // retry atomic creation
        } catch {
          // ignore
        }
      } else {
        // Empty or malformed lockfile. Reclaim.
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch {
          // ignore
        }
      }
    }
  }

  return { acquired: false, reason: 'Failed to acquire instance lock after reclaiming stale lock.' };
}

export function releaseAgentInstanceLock(configDir: string): void {
  try {
    const lockPath = getAgentLockPath(configDir);
    if (!fs.existsSync(lockPath)) return;

    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw) as AgentLockData;
    if (data.pid === process.pid) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore release errors on shutdown
  }
}

// ─── Automation Task Lock ────────────────────────────────────────────────────

export function getAutomationLockPath(configDir: string): string {
  const legacy1 = path.join(configDir, '.automation.lock');
  if (fs.existsSync(legacy1)) return legacy1;
  const legacy2 = path.join(configDir, '.naukri-automation.lock');
  if (fs.existsSync(legacy2)) return legacy2;
  return legacy1;
}

export function acquireAutomationLock(configDir: string): boolean {
  const lockPath = getAutomationLockPath(configDir);
  const dir = path.dirname(lockPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw) as AutomationLockData;

      // INVARIANT: If the owning PID is alive, the automation lock must NEVER
      // be reclaimed solely because the lease/heartbeat timestamp is older than 10 minutes.
      // Automatic reclamation occurs ONLY after confirming the owning process is dead.
      if (data.pid && isProcessAlive(data.pid)) {
        return false; // Active owner process is alive; lock must not be stolen
      }

      // Owner process is confirmed dead or PID is missing/invalid: safe to reclaim
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    } catch {
      // Corrupt lockfile, safe to reclaim
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }

  try {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
      'utf8'
    );
    return true;
  } catch {
    return false;
  }
}

export function touchAutomationLock(configDir: string): void {
  try {
    const lockPath = getAutomationLockPath(configDir);
    if (fs.existsSync(lockPath)) {
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
        'utf8'
      );
    }
  } catch {
    // ignore
  }
}

export function releaseAutomationLock(configDir: string): void {
  try {
    const lockPath = getAutomationLockPath(configDir);
    if (fs.existsSync(lockPath)) {
      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const data = JSON.parse(raw) as AutomationLockData;
        if (data.pid === process.pid) {
          fs.unlinkSync(lockPath);
        }
      } catch {
        fs.unlinkSync(lockPath);
      }
    }

    // Also clean up any legacy lock file names in configDir
    for (const alt of [path.join(configDir, '.automation.lock'), path.join(configDir, '.naukri-automation.lock')]) {
      if (fs.existsSync(alt)) {
        try {
          fs.unlinkSync(alt);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}
