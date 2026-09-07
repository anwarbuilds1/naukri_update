export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 mt-1">Configure your Naukri credentials and schedule.</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <p className="text-slate-400">
          Settings configuration coming in Phase 2.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          For now, configure the agent using environment variables or the existing Electron app.
        </p>
      </div>
    </div>
  );
}
