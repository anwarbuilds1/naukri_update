import { z } from 'zod';

// HH:MM time string validator
const timeString = z.string().regex(/^([0-1]\d|2[0-3]):([0-5]\d)$/, {
  message: 'Time must be in HH:MM format (24-hour)',
});

export const ScheduleConfigSchema = z.object({
  refreshMode: z.enum(['interval', 'fixed_time', 'disabled']),
  refreshIntervalHours: z.number().int().min(0).max(23),
  refreshIntervalMinutes: z.number().int().min(0).max(59),
  refreshTime: timeString,
  refreshWindowEnabled: z.boolean(),
  refreshWindowStart: timeString,
  refreshWindowEnd: timeString,
  resumeUpdateEnabled: z.boolean(),
  resumeUpdateTime: timeString,
}).refine(
  (d) =>
    d.refreshMode !== 'interval' ||
    d.refreshIntervalHours > 0 ||
    d.refreshIntervalMinutes > 0,
  { message: 'Interval must be greater than zero when mode is "interval"' }
);

export const AgentCommandSchema = z.object({
  type: z.enum([
    'trigger-refresh',
    'trigger-resume-upload',
    'connect-chrome',
    'disconnect-chrome',
    'reset-browser-profile',
    'pause',
    'resume',
  ]),
  requestId: z.string().uuid(),
  issuedAt: z.number().int().positive(),
});

export const AgentStatusSchema = z.object({
  status: z.enum([
    'idle',
    'running',
    'chrome-disconnected',
    'otp-required',
    'error',
    'offline',
  ]),
  version: z.string(),
  chromeConnected: z.boolean(),
  lastSeen: z.number().int().positive(),
  lastRefreshTime: z.number().int().positive().optional(),
  lastResumeUploadTime: z.number().int().positive().optional(),
  currentTask: z.enum(['headline-refresh', 'resume-upload']).optional(),
});

// Credentials update payload (password never leaves the agent)
export const CredentialsPayloadSchema = z.object({
  naukriEmail: z.string().email(),
  // Password transport: design decision - see docs/agent-api.md
  // For Phase 1 the agent sets credentials locally; web sends email only
  // The password is sent directly to the agent's local HTTP server
  // using a shared AGENT_SECRET token, never through Supabase.
});

export const RunResultSchema = z.object({
  task: z.enum(['headline-refresh', 'resume-upload']),
  success: z.boolean(),
  message: z.string(),
  durationMs: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  screenshotPath: z.string().optional(),
});
