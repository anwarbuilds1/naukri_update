/**
 * Automation stub for the Naukri agent.
 *
 * Phase 1: defines the interface and stubs for automation tasks.
 * Phase 2: will port naukri-profile-refresh.js logic here with
 *          injectable config (rather than module-level globals).
 *
 * The existing naukri-profile-refresh.js remains UNTOUCHED at the
 * repository root and continues to work for the Electron app.
 */

import type { RunResult, TaskType } from '@naukri-update/shared';

export interface AutomationOptions {
  cdpEndpoint: string;
  naukriProfileUrl: string;
  naukriEmail: string;
  /** Password: obtained from local credential store, never from network */
  naukriPassword: string;
  configDir: string;
  resumeUploadTimeoutMs?: number;
}

/**
 * Run a single automation task.
 *
 * Phase 1: stub that returns a not-implemented result.
 * Phase 2: will connect to Chrome via CDP and execute the task.
 */
export async function runTask(
  task: TaskType,
  options: AutomationOptions
): Promise<RunResult> {
  const start = Date.now();

  // TODO (Phase 2): implement by porting naukri-profile-refresh.js
  // updateAndVerifyHeadline() and uploadAndVerifyResume() with
  // injected options rather than module-level config globals.
  console.warn(`[automation] Task ${task} is not yet implemented in the agent. Stub returning failure.`);

  void options; // suppress unused variable warning in Phase 1

  return {
    task,
    success: false,
    message: 'Not implemented in Phase 1. Use existing naukri-profile-refresh.js via Electron.',
    durationMs: Date.now() - start,
    timestamp: Date.now(),
  };
}
