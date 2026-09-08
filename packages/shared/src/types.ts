// Task types for automation
export type TaskType = 'headline-refresh' | 'resume-upload';

// Result of a single automation run
export interface RunResult {
  task: TaskType;
  success: boolean;
  message: string;
  durationMs: number;
  timestamp: number; // Unix ms
  screenshotPath?: string; // local path if error screenshot was taken
}

// Schedule configuration (mirrors existing .env config keys)
export interface ScheduleConfig {
  refreshMode: 'interval' | 'fixed_time' | 'disabled';
  refreshIntervalHours: number;
  refreshIntervalMinutes: number;
  refreshTime: string; // HH:MM
  refreshWindowEnabled: boolean;
  refreshWindowStart: string; // HH:MM
  refreshWindowEnd: string; // HH:MM
  resumeUpdateEnabled: boolean;
  resumeUpdateTime: string; // HH:MM
}

// Agent status reported to web/Supabase
export type AgentStatusValue =
  | 'idle'
  | 'running'
  | 'chrome-disconnected'
  | 'otp-required'
  | 'error'
  | 'offline';

export interface AgentStatus {
  status: AgentStatusValue;
  version: string;
  chromeConnected: boolean;
  lastSeen: number; // Unix ms
  lastRefreshTime?: number; // Unix ms
  lastResumeUploadTime?: number; // Unix ms
  currentTask?: TaskType;
  agentId?: string; // Persistent UUIDv4
  uptime?: number; // Uptime in seconds
  pid?: number; // OS process ID
  draining?: boolean; // True during graceful shutdown drain
}

// Commands that the web sends to the agent
export type AgentCommandType =
  | 'trigger-refresh'
  | 'trigger-resume-upload'
  | 'connect-chrome'
  | 'disconnect-chrome'
  | 'reset-browser-profile'
  | 'pause'
  | 'resume';

export interface AgentCommand {
  type: AgentCommandType;
  requestId: string; // UUID for idempotency
  issuedAt: number; // Unix ms
}

// Command state machine
export type CommandStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

const VALID_COMMAND_TRANSITIONS: Record<CommandStatus, readonly CommandStatus[]> = {
  queued: ['dispatched', 'cancelled'],
  dispatched: ['running', 'failed', 'succeeded'],
  running: ['succeeded', 'failed'],
  failed: ['queued'], // allows retry
  succeeded: [], // terminal
  cancelled: [], // terminal
};

export function isValidCommandTransition(from: CommandStatus, to: CommandStatus): boolean {
  return VALID_COMMAND_TRANSITIONS[from]?.includes(to) ?? false;
}

// Stale threshold: 90 seconds (centralized constant)
export const AGENT_HEARTBEAT_STALE_MS = 90_000;

export interface AgentAvailability {
  isOnline: boolean;
  isStale: boolean;
  status: AgentStatusValue;
  lastSeenMs: number;
}

export function getAgentAvailability(
  lastSeenMs: number,
  nowMs: number = Date.now(),
  reportedStatus: AgentStatusValue = 'idle'
): AgentAvailability {
  if (!lastSeenMs || lastSeenMs <= 0) {
    return {
      isOnline: false,
      isStale: true,
      status: 'offline',
      lastSeenMs: 0,
    };
  }

  const ageMs = nowMs - lastSeenMs;
  const isStale = ageMs > AGENT_HEARTBEAT_STALE_MS;

  if (isStale) {
    return {
      isOnline: false,
      isStale: true,
      status: 'offline',
      lastSeenMs,
    };
  }

  return {
    isOnline: reportedStatus !== 'offline',
    isStale: false,
    status: reportedStatus,
    lastSeenMs,
  };
}

// Standard API error format
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Standard API response wrapper
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// Information about active resume on local agent
export interface ResumeInfo {
  exists: boolean;
  filename?: string;
  sizeBytes?: number;
  lastModified?: string;
}

// System diagnostics result
export interface DiagnosticsResult {
  agent: { status: 'ok' | 'failed' | 'warning'; message: string };
  chrome: { status: 'ok' | 'failed' | 'warning'; message: string };
  browserProfile: { status: 'ok' | 'failed' | 'warning'; message: string };
  credentials: { status: 'ok' | 'failed' | 'warning'; message: string };
  resume: { status: 'ok' | 'failed' | 'warning'; message: string };
  scheduler: { status: 'ok' | 'failed' | 'warning'; message: string };
}
