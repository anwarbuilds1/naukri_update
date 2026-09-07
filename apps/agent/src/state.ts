/**
 * Persistent state management for the local agent.
 *
 * Manages:
 * 1. Persistent Agent ID (UUIDv4) stored across restarts in runtime/agent_id.
 * 2. Scheduler State (last run timestamps, pause status, scheduled checks)
 *    persisted via atomic file swaps to prevent duplicate execution upon restart.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface TaskStateData {
  lastRefreshTime: number; // Unix ms, 0 = never
  lastResumeUploadTime: number; // Unix ms, 0 = never
  paused: boolean;
  lastScheduledCheck: number; // Unix ms
}

export const DEFAULT_TASK_STATE: TaskStateData = {
  lastRefreshTime: 0,
  lastResumeUploadTime: 0,
  paused: false,
  lastScheduledCheck: 0,
};

export function getRuntimeDir(configDir: string): string {
  return path.join(configDir, 'runtime');
}

/**
 * Loads or creates a persistent Agent ID (UUIDv4).
 * Generated once on initial startup and retained across restarts.
 */
export function loadOrCreateAgentId(configDir: string): string {
  const runtimeDir = getRuntimeDir(configDir);
  const idFilePath = path.join(runtimeDir, 'agent_id');

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  if (fs.existsSync(idFilePath)) {
    try {
      const existing = fs.readFileSync(idFilePath, 'utf8').trim();
      if (existing && existing.length >= 16) {
        return existing;
      }
    } catch {
      // ignore
    }
  }

  const newId = crypto.randomUUID();
  const tmpPath = `${idFilePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, newId, 'utf8');
    fs.renameSync(tmpPath, idFilePath);
  } catch {
    // If atomic rename fails, write directly
    fs.writeFileSync(idFilePath, newId, 'utf8');
  }

  return newId;
}

/**
 * Loads persisted task state from runtime/task_state.json.
 */
export function loadTaskState(configDir: string): TaskStateData {
  const stateFilePath = path.join(getRuntimeDir(configDir), 'task_state.json');

  if (!fs.existsSync(stateFilePath)) {
    return { ...DEFAULT_TASK_STATE };
  }

  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TaskStateData>;
    return {
      lastRefreshTime: typeof parsed.lastRefreshTime === 'number' ? parsed.lastRefreshTime : 0,
      lastResumeUploadTime: typeof parsed.lastResumeUploadTime === 'number' ? parsed.lastResumeUploadTime : 0,
      paused: Boolean(parsed.paused),
      lastScheduledCheck: typeof parsed.lastScheduledCheck === 'number' ? parsed.lastScheduledCheck : 0,
    };
  } catch {
    return { ...DEFAULT_TASK_STATE };
  }
}

/**
 * Persists task state to disk atomically using temporary file rename.
 */
export function saveTaskState(configDir: string, state: TaskStateData): void {
  const runtimeDir = getRuntimeDir(configDir);
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const targetPath = path.join(runtimeDir, 'task_state.json');
  const tmpPath = `${targetPath}.${process.pid}.tmp`;

  try {
    const payload = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err: unknown) {
    // Fallback: direct write
    try {
      fs.writeFileSync(targetPath, JSON.stringify(state), 'utf8');
    } catch {
      // ignore write errors on shutdown
    }
  }
}
