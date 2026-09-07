/**
 * Scheduling logic for the Naukri agent.
 *
 * Phase 1: mirrors the scheduling logic in scripts/scheduler.js.
 * Phase 2: will read ScheduleConfig from Supabase agent_config,
 *          falling back to local config.json.
 *
 * The agent runs a poll loop (see main.ts). On each tick, this module
 * decides which tasks (if any) are due to run.
 */

import type { ScheduleConfig, TaskType } from '@naukri-update/shared';

export interface TaskState {
  lastRefreshTime: number; // Unix ms, 0 = never
  lastResumeUploadTime: number; // Unix ms, 0 = never
  paused: boolean;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isTimeInWindow(now: Date, start: string, end: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return true; // full day
  if (s < e) return current >= s && current <= e;
  return current >= s || current <= e; // crosses midnight
}

export function isRefreshDue(config: ScheduleConfig, state: TaskState, now: Date): boolean {
  if (state.paused || config.refreshMode === 'disabled') return false;

  if (config.refreshWindowEnabled) {
    if (!isTimeInWindow(now, config.refreshWindowStart, config.refreshWindowEnd)) return false;
  }

  if (config.refreshMode === 'interval') {
    const intervalMs = (config.refreshIntervalHours * 3600 + config.refreshIntervalMinutes * 60) * 1000;
    if (!state.lastRefreshTime) return true;
    return Date.now() - state.lastRefreshTime >= intervalMs;
  }

  if (config.refreshMode === 'fixed_time') {
    const [h, m] = config.refreshTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h ?? 0, m ?? 0, 0, 0);
    if (now >= target) {
      return !state.lastRefreshTime || state.lastRefreshTime < target.getTime();
    }
    return false;
  }

  return false;
}

export function isResumeUploadDue(config: ScheduleConfig, state: TaskState, now: Date): boolean {
  if (state.paused || !config.resumeUpdateEnabled) return false;

  const [h, m] = config.resumeUpdateTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h ?? 0, m ?? 0, 0, 0);

  if (now >= target) {
    return !state.lastResumeUploadTime || state.lastResumeUploadTime < target.getTime();
  }
  return false;
}

export function getDueTasks(
  config: ScheduleConfig,
  state: TaskState,
  now: Date = new Date()
): TaskType[] {
  const tasks: TaskType[] = [];
  if (isRefreshDue(config, state, now)) tasks.push('headline-refresh');
  if (isResumeUploadDue(config, state, now)) tasks.push('resume-upload');
  return tasks;
}
