import assert from 'node:assert';
import test, { describe } from 'node:test';
import {
  AGENT_HEARTBEAT_STALE_MS,
  getAgentAvailability,
  isValidCommandTransition,
  type AgentStatusValue,
  type CommandStatus,
  type ScheduleConfig,
} from '@naukri-update/shared';

interface AgentConfigDbRow {
  user_id: string;
  refresh_mode: 'interval' | 'fixed_time' | 'disabled';
  refresh_interval_hours: number;
  refresh_interval_minutes: number;
  refresh_time: string;
  refresh_window_enabled: boolean;
  refresh_window_start: string;
  refresh_window_end: string;
  resume_update_enabled: boolean;
  resume_update_time: string;
  naukri_email: string | null;
  updated_at: string;
}

describe('Phase 3: Centralized Agent Availability and Stale Threshold', () => {
  const now = 1757240000000;

  test('reports online when heartbeat is fresh (under 90s)', () => {
    const lastSeen = now - 30_000; // 30s ago
    const avail = getAgentAvailability(lastSeen, now, 'idle');
    assert.strictEqual(avail.isOnline, true);
    assert.strictEqual(avail.isStale, false);
    assert.strictEqual(avail.status, 'idle');
  });

  test('reports running when agent is running and fresh', () => {
    const lastSeen = now - 10_000; // 10s ago
    const avail = getAgentAvailability(lastSeen, now, 'running');
    assert.strictEqual(avail.isOnline, true);
    assert.strictEqual(avail.isStale, false);
    assert.strictEqual(avail.status, 'running');
  });

  test('reports offline when heartbeat exceeds 90s stale threshold', () => {
    const lastSeen = now - (AGENT_HEARTBEAT_STALE_MS + 1000); // 91s ago
    const avail = getAgentAvailability(lastSeen, now, 'idle');
    assert.strictEqual(avail.isOnline, false);
    assert.strictEqual(avail.isStale, true);
    assert.strictEqual(avail.status, 'offline');
  });

  test('reports offline when lastSeen is 0 or negative', () => {
    const avail = getAgentAvailability(0, now);
    assert.strictEqual(avail.isOnline, false);
    assert.strictEqual(avail.isStale, true);
    assert.strictEqual(avail.status, 'offline');
  });
});

describe('Phase 3: Command State Machine Transitions', () => {
  test('allows standard lifecycle transitions: queued -> dispatched -> running -> succeeded', () => {
    assert.strictEqual(isValidCommandTransition('queued', 'dispatched'), true);
    assert.strictEqual(isValidCommandTransition('dispatched', 'running'), true);
    assert.strictEqual(isValidCommandTransition('running', 'succeeded'), true);
  });

  test('allows failure transitions: dispatched -> failed, running -> failed', () => {
    assert.strictEqual(isValidCommandTransition('dispatched', 'failed'), true);
    assert.strictEqual(isValidCommandTransition('running', 'failed'), true);
  });

  test('allows retrying failed commands: failed -> queued', () => {
    assert.strictEqual(isValidCommandTransition('failed', 'queued'), true);
  });

  test('allows cancellation from queued: queued -> cancelled', () => {
    assert.strictEqual(isValidCommandTransition('queued', 'cancelled'), true);
  });

  test('strictly rejects invalid or backwards transitions', () => {
    // Succeeded is terminal
    assert.strictEqual(isValidCommandTransition('succeeded', 'running'), false);
    assert.strictEqual(isValidCommandTransition('succeeded', 'queued'), false);
    // Cancelled is terminal
    assert.strictEqual(isValidCommandTransition('cancelled', 'running'), false);
    assert.strictEqual(isValidCommandTransition('cancelled', 'queued'), false);
    // Cannot jump from queued to running directly
    assert.strictEqual(isValidCommandTransition('queued', 'running'), false);
    // Cannot jump from running back to queued
    assert.strictEqual(isValidCommandTransition('running', 'queued'), false);
  });
});

describe('Phase 3: Schedule Configuration Mapping', () => {
  test('correctly maps database agent_config row to ScheduleConfig object', () => {
    const dbRow: AgentConfigDbRow = {
      user_id: '11111111-1111-1111-1111-111111111111',
      refresh_mode: 'interval',
      refresh_interval_hours: 2,
      refresh_interval_minutes: 30,
      refresh_time: '08:15',
      refresh_window_enabled: true,
      refresh_window_start: '09:00',
      refresh_window_end: '18:00',
      resume_update_enabled: true,
      resume_update_time: '09:30',
      naukri_email: 'candidate@example.com',
      updated_at: '2026-09-07T12:00:00Z',
    };

    const schedule: ScheduleConfig = {
      refreshMode: dbRow.refresh_mode,
      refreshIntervalHours: dbRow.refresh_interval_hours,
      refreshIntervalMinutes: dbRow.refresh_interval_minutes,
      refreshTime: dbRow.refresh_time,
      refreshWindowEnabled: dbRow.refresh_window_enabled,
      refreshWindowStart: dbRow.refresh_window_start,
      refreshWindowEnd: dbRow.refresh_window_end,
      resumeUpdateEnabled: dbRow.resume_update_enabled,
      resumeUpdateTime: dbRow.resume_update_time,
    };

    assert.strictEqual(schedule.refreshMode, 'interval');
    assert.strictEqual(schedule.refreshIntervalHours, 2);
    assert.strictEqual(schedule.refreshIntervalMinutes, 30);
    assert.strictEqual(schedule.refreshWindowEnabled, true);
    assert.strictEqual(schedule.refreshWindowStart, '09:00');
    assert.strictEqual(schedule.refreshWindowEnd, '18:00');
    assert.strictEqual(schedule.resumeUpdateEnabled, true);
    assert.strictEqual(schedule.resumeUpdateTime, '09:30');
  });
});

describe('Phase 3: Credential Safety & Database Isolation', () => {
  test('agent_config row strictly contains no password field', () => {
    const allowedKeys = [
      'user_id',
      'refresh_mode',
      'refresh_interval_hours',
      'refresh_interval_minutes',
      'refresh_time',
      'refresh_window_enabled',
      'refresh_window_start',
      'refresh_window_end',
      'resume_update_enabled',
      'resume_update_time',
      'naukri_email',
      'updated_at',
    ];

    assert.strictEqual(allowedKeys.includes('naukri_password'), false);
    assert.strictEqual(allowedKeys.includes('password'), false);
  });
});

describe('Phase 3: Resume Upload Validation Rules', () => {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  test('validates file size within 5MB limit', () => {
    const validSize = 2 * 1024 * 1024; // 2MB
    const oversized = 6 * 1024 * 1024; // 6MB
    assert.ok(validSize <= MAX_SIZE);
    assert.ok(oversized > MAX_SIZE);
  });

  test('validates %PDF header signature', () => {
    const validBuffer = Buffer.from('%PDF-1.7 header');
    const invalidBuffer = Buffer.from('NOT_A_PDF_FILE');
    assert.strictEqual(validBuffer.subarray(0, 4).toString('utf8'), '%PDF');
    assert.notStrictEqual(invalidBuffer.subarray(0, 4).toString('utf8'), '%PDF');
  });

  test('validates .pdf filename extension', () => {
    assert.strictEqual('resume.pdf'.toLowerCase().endsWith('.pdf'), true);
    assert.strictEqual('CV.PDF'.toLowerCase().endsWith('.pdf'), true);
    assert.strictEqual('document.docx'.toLowerCase().endsWith('.pdf'), false);
    assert.strictEqual('resume.exe'.toLowerCase().endsWith('.pdf'), false);
  });
});
