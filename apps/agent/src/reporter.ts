/**
 * Run result reporter.
 *
 * Writes run results to:
 * 1. Local log file (always, as fallback)
 * 2. Supabase run_log (when connected, Phase 2+)
 *
 * Phase 1: local file logging only.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { RunResult } from '@naukri-update/shared';

export class Reporter {
  private logPath: string;

  constructor(configDir: string) {
    this.logPath = path.join(configDir, 'agent-run.log');
    // Ensure configDir exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  report(result: RunResult): void {
    const line = JSON.stringify({ ...result, iso: new Date(result.timestamp).toISOString() });
    try {
      appendFileSync(this.logPath, line + '\n', 'utf8');
    } catch (err) {
      console.error('[reporter] Failed to write log:', err);
    }

    const status = result.success ? '✓' : '✗';
    console.log(`[reporter] ${status} ${result.task} (${result.durationMs}ms): ${result.message}`);

    // TODO (Phase 2): POST to Supabase run_log via createServerClient()
    // Only when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured.
  }
}
