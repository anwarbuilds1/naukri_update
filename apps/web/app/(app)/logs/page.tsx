export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-slate-400 mt-1">View automation run history.</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <p className="text-slate-400">Run logs coming in Phase 2 (reads from Supabase run_log table).</p>
      </div>
    </div>
  );
}
