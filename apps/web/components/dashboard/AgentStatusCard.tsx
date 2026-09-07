/**
 * AgentStatusCard — shows live agent status.
 *
 * Phase 1: static placeholder. Phase 2 will poll GET /api/agent/status.
 */
export function AgentStatusCard() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        Agent Status
      </h2>
      <div className="mt-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" aria-hidden="true" />
        <span className="font-medium text-slate-300">Offline</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Start the local agent to see live status.
        {/* TODO (Phase 2): poll GET /api/agent/status every 30s */}
      </p>
    </div>
  );
}
