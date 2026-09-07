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
