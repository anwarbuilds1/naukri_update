/**
 * AutomationStatusCard — shows last run times for each task.
 *
 * Phase 1: static placeholder. Phase 2 will read from Supabase run_log.
 */
export function AutomationStatusCard() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        Automation
      </h2>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Headline Refresh</span>
          <span className="text-slate-500">—</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Resume Upload</span>
          <span className="text-slate-500">—</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {/* TODO (Phase 2): read lastRefreshTime / lastResumeUploadTime from Supabase */}
        Last run times available in Phase 2.
      </p>
    </div>
  );
}
