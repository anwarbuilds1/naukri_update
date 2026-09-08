'use client';

import { useEffect, useState } from 'react';
import { ScheduleConfigSchema, type DiagnosticsResult, type ScheduleConfig } from '@naukri-update/shared';
import type { AgentConfigRow } from '@naukri-update/database';
import { createBrowserSupabaseClient } from '@/lib/supabase';

interface FormState extends ScheduleConfig {
  naukriEmail: string;
  naukriPassword: string;
}

const DEFAULT_FORM: FormState = {
  naukriEmail: '',
  naukriPassword: '',
  refreshMode: 'interval',
  refreshIntervalHours: 1,
  refreshIntervalMinutes: 0,
  refreshTime: '06:11',
  refreshWindowEnabled: false,
  refreshWindowStart: '07:00',
  refreshWindowEnd: '19:00',
  resumeUpdateEnabled: false,
  resumeUpdateTime: '07:00',
};

export default function SettingsPage() {
  const [formData, setFormData] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingCreds, setClearingCreds] = useState(false);
  const [resettingProfile, setResettingProfile] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from('agent_config')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          const config = data as AgentConfigRow | null;
          if (config) {
            setFormData((prev) => ({
              ...prev,
              naukriEmail: config.naukri_email || '',
              refreshMode: config.refresh_mode,
              refreshIntervalHours: config.refresh_interval_hours,
              refreshIntervalMinutes: config.refresh_interval_minutes,
              refreshTime: config.refresh_time,
              refreshWindowEnabled: config.refresh_window_enabled,
              refreshWindowStart: config.refresh_window_start,
              refreshWindowEnd: config.refresh_window_end,
              resumeUpdateEnabled: config.resume_update_enabled,
              resumeUpdateTime: config.resume_update_time,
            }));
          }
        }
      } catch (err) {
        console.warn('Could not load settings from Supabase:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);

    // Validate schedule with shared Zod schema
    const scheduleData: ScheduleConfig = {
      refreshMode: formData.refreshMode,
      refreshIntervalHours: Number(formData.refreshIntervalHours),
      refreshIntervalMinutes: Number(formData.refreshIntervalMinutes),
      refreshTime: formData.refreshTime,
      refreshWindowEnabled: formData.refreshWindowEnabled,
      refreshWindowStart: formData.refreshWindowStart,
      refreshWindowEnd: formData.refreshWindowEnd,
      resumeUpdateEnabled: formData.resumeUpdateEnabled,
      resumeUpdateTime: formData.resumeUpdateTime,
    };

    const parse = ScheduleConfigSchema.safeParse(scheduleData);
    if (!parse.success) {
      setMessage({
        type: 'error',
        text: 'Validation error: ' + parse.error.issues.map((i) => i.message).join(', '),
      });
      setSaving(false);
      return;
    }

    let scheduleSuccess = false;
    let credentialsSuccess = true;
    let credentialsError = '';

    // 1. Save schedule & email to Supabase agent_config
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage({ type: 'error', text: 'You must be signed in to save settings.' });
        setSaving(false);
        return;
      }

      const { error: dbError } = await (supabase.from('agent_config') as any).upsert({
        user_id: user.id,
        refresh_mode: scheduleData.refreshMode,
        refresh_interval_hours: scheduleData.refreshIntervalHours,
        refresh_interval_minutes: scheduleData.refreshIntervalMinutes,
        refresh_time: scheduleData.refreshTime,
        refresh_window_enabled: scheduleData.refreshWindowEnabled,
        refresh_window_start: scheduleData.refreshWindowStart,
        refresh_window_end: scheduleData.refreshWindowEnd,
        resume_update_enabled: scheduleData.resumeUpdateEnabled,
        resume_update_time: scheduleData.resumeUpdateTime,
        naukri_email: formData.naukriEmail || null,
      }, { onConflict: 'user_id' });

      if (dbError) {
        throw dbError;
      }
      scheduleSuccess = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: `Failed to save schedule to database: ${msg}` });
      setSaving(false);
      return;
    }

    // 2. Forward credentials to local agent if password is provided
    if (formData.naukriPassword) {
      try {
        const res = await fetch('/api/agent/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            naukriEmail: formData.naukriEmail,
            naukriPassword: formData.naukriPassword,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          credentialsSuccess = false;
          credentialsError = json.error?.message || 'Agent unreachable';
        } else {
          // Clear password input from state once saved
          setFormData((prev) => ({ ...prev, naukriPassword: '' }));
        }
      } catch (err: unknown) {
        credentialsSuccess = false;
        credentialsError = err instanceof Error ? err.message : String(err);
      }
    }

    // 3. Report result with transactional partial-failure handling
    if (scheduleSuccess && credentialsSuccess) {
      setMessage({
        type: 'success',
        text: 'Settings saved successfully. Credentials updated on local agent.',
      });
    } else if (scheduleSuccess && !credentialsSuccess) {
      setMessage({
        type: 'warning',
        text: `Schedule settings saved to database, but agent password update failed (${credentialsError}). Ensure your local agent is running on port 7842.`,
      });
    }

    setSaving(false);
  }

  async function handleClearCredentials() {
    if (
      !confirm(
        'Are you sure you want to clear stored Naukri credentials? Automated logins will stop until reconfigured.'
      )
    ) {
      return;
    }
    setClearingCreds(true);
    setMessage(null);
    try {
      const res = await fetch('/api/agent/credentials', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setFormData((prev) => ({ ...prev, naukriEmail: '', naukriPassword: '' }));
        setMessage({ type: 'success', text: 'Stored credentials cleared successfully.' });
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to clear credentials.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: 'Error: ' + msg });
    } finally {
      setClearingCreds(false);
    }
  }

  async function handleResetProfile() {
    if (
      !confirm(
        'Are you sure you want to reset the dedicated Chrome browser profile? This will close Chrome, clear stored cookies, and log you out of Naukri.'
      )
    ) {
      return;
    }
    setResettingProfile(true);
    setMessage(null);
    try {
      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reset-browser-profile',
          requestId: 'reset-' + Date.now(),
          issuedAt: Date.now(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMessage({
          type: 'success',
          text: 'Chrome profile directory reset successfully. You will need to log in again on the next run.',
        });
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'Failed to reset profile.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: 'Error: ' + msg });
    } finally {
      setResettingProfile(false);
    }
  }

  async function handleRunDiagnostics() {
    setRunningDiagnostics(true);
    try {
      const res = await fetch('/api/agent/diagnostics');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDiagnostics(json.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setRunningDiagnostics(false);
    }
  }

  function applyPreset(hours: number) {
    setFormData((prev) => ({
      ...prev,
      refreshMode: 'interval',
      refreshIntervalHours: hours,
      refreshIntervalMinutes: 0,
    }));
  }

  if (loading) {
    return <div className="p-6 text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure your Naukri credentials and automation schedule.</p>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : message.type === 'warning'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Credentials Section */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Naukri Credentials</h2>
          <p className="text-xs text-slate-400">
            Your password is sent directly to your local agent and stored using machine-bound AES-256-GCM. It is never stored in Supabase.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">Naukri Email</label>
              <input
                type="email"
                value={formData.naukriEmail}
                onChange={(e) => setFormData({ ...formData, naukriEmail: e.target.value })}
                placeholder="your.email@example.com"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">
                Naukri Password {formData.naukriPassword ? '' : '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                value={formData.naukriPassword}
                onChange={(e) => setFormData({ ...formData, naukriPassword: e.target.value })}
                placeholder="••••••••••••"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">Need to remove stored credentials completely?</span>
            <button
              type="button"
              onClick={handleClearCredentials}
              disabled={clearingCreds}
              className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
            >
              {clearingCreds ? 'Clearing...' : 'Clear Credentials'}
            </button>
          </div>
        </div>

        {/* Headline Refresh Schedule */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Headline Refresh Schedule</h2>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset(1)}
                className={`px-2 py-0.5 rounded text-xs border transition ${
                  formData.refreshMode === 'interval' && formData.refreshIntervalHours === 1 && formData.refreshIntervalMinutes === 0
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-medium'
                    : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                1h (Aggressive)
              </button>
              <button
                type="button"
                onClick={() => applyPreset(3)}
                className={`px-2 py-0.5 rounded text-xs border transition ${
                  formData.refreshMode === 'interval' && formData.refreshIntervalHours === 3 && formData.refreshIntervalMinutes === 0
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-medium'
                    : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                3h (Moderate)
              </button>
              <button
                type="button"
                onClick={() => applyPreset(6)}
                className={`px-2 py-0.5 rounded text-xs border transition ${
                  formData.refreshMode === 'interval' && formData.refreshIntervalHours === 6 && formData.refreshIntervalMinutes === 0
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-medium'
                    : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                6h (Conservative)
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">Refresh Mode</label>
              <select
                value={formData.refreshMode}
                onChange={(e) =>
                  setFormData({ ...formData, refreshMode: e.target.value as ScheduleConfig['refreshMode'] })
                }
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="interval">Repeat Every X Hours (Interval)</option>
                <option value="fixed_time">Fixed Time Once Daily</option>
                <option value="disabled">Disabled (Manual Only)</option>
              </select>
            </div>

            {formData.refreshMode === 'interval' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium uppercase text-slate-400">Interval Hours</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={formData.refreshIntervalHours}
                    onChange={(e) =>
                      setFormData({ ...formData, refreshIntervalHours: parseInt(e.target.value, 10) || 0 })
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase text-slate-400">Interval Minutes</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={formData.refreshIntervalMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, refreshIntervalMinutes: parseInt(e.target.value, 10) || 0 })
                    }
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {formData.refreshMode === 'fixed_time' && (
              <div>
                <label className="block text-xs font-medium uppercase text-slate-400">Fixed Daily Time (HH:MM)</label>
                <input
                  type="text"
                  pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                  value={formData.refreshTime}
                  onChange={(e) => setFormData({ ...formData, refreshTime: e.target.value })}
                  placeholder="06:11"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.refreshWindowEnabled}
                  onChange={(e) => setFormData({ ...formData, refreshWindowEnabled: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                />
                Limit automation to active daily window
              </label>

              {formData.refreshWindowEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium uppercase text-slate-400">Window Start (HH:MM)</label>
                    <input
                      type="text"
                      pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                      value={formData.refreshWindowStart}
                      onChange={(e) => setFormData({ ...formData, refreshWindowStart: e.target.value })}
                      placeholder="07:00"
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase text-slate-400">Window End (HH:MM)</label>
                    <input
                      type="text"
                      pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                      value={formData.refreshWindowEnd}
                      onChange={(e) => setFormData({ ...formData, refreshWindowEnd: e.target.value })}
                      placeholder="19:00"
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resume Upload Schedule */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Daily Resume Upload</h2>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={formData.resumeUpdateEnabled}
                onChange={(e) => setFormData({ ...formData, resumeUpdateEnabled: e.target.checked })}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
              />
              Enable daily resume re-upload
            </label>

            {formData.resumeUpdateEnabled && (
              <div>
                <label className="block text-xs font-medium uppercase text-slate-400">Upload Time (HH:MM)</label>
                <input
                  type="text"
                  pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                  value={formData.resumeUpdateTime}
                  onChange={(e) => setFormData({ ...formData, resumeUpdateTime: e.target.value })}
                  placeholder="07:00"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* System Diagnostics */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">System Diagnostics</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify local agent status, Chrome CDP connectivity, browser profile, and credentials.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={runningDiagnostics}
            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
          >
            {runningDiagnostics ? 'Running Diagnostics...' : 'Run Diagnostics'}
          </button>
        </div>

        {diagnostics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {Object.entries(diagnostics).map(([key, value]) => {
              const statusColors: Record<string, string> = {
                ok: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
                warning: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
                failed: 'border-red-500/20 bg-red-500/10 text-red-400',
              };
              const dotColors: Record<string, string> = {
                ok: 'bg-emerald-500',
                warning: 'bg-amber-500',
                failed: 'bg-red-500',
              };
              const titles: Record<string, string> = {
                agent: 'Agent Daemon',
                chrome: 'Google Chrome / CDP',
                browserProfile: 'Dedicated Profile',
                credentials: 'Naukri Credentials',
                resume: 'Active Resume',
                scheduler: 'Automation Scheduler',
              };
              return (
                <div
                  key={key}
                  className={`rounded-lg border p-3.5 space-y-1.5 ${statusColors[value.status] || statusColors['warning']}`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                    <span>{titles[key] || key}</span>
                    <span className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${dotColors[value.status] || 'bg-slate-500'}`} />
                      {value.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{value.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Maintenance & Reset */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Maintenance & Recovery</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Reset dedicated browser session or resolve stuck profile issues.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-slate-950/60 border border-slate-800/80 p-4">
          <div className="space-y-0.5">
            <h4 className="text-sm font-medium text-white">Reset Dedicated Chrome Profile</h4>
            <p className="text-xs text-slate-400">
              Closes running Chrome processes and purges the local profile directory. Useful if Naukri cookies expire or session enters a loop.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetProfile}
            disabled={resettingProfile}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40 shrink-0"
          >
            {resettingProfile ? 'Resetting...' : 'Reset Browser Profile'}
          </button>
        </div>
      </div>

      {/* Local Storage Information */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Local Configuration & Data</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            All passwords, session cookies, and candidate resume PDFs remain strictly on your local computer.
          </p>
        </div>

        <div className="rounded-lg bg-slate-950/80 border border-slate-800/80 p-4 space-y-2">
          <div className="text-xs text-slate-400 font-medium uppercase">Active Storage Directory:</div>
          <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 rounded border border-slate-800 font-mono text-xs text-indigo-300">
            <span>~/.config/NaukriUpdate</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('~/.config/NaukriUpdate');
                setCopiedPath(true);
                setTimeout(() => setCopiedPath(false), 2000);
              }}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              {copiedPath ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed pt-1">
            Contains: <code>config.json</code>, <code>.credentials.enc</code> (machine AES-256-GCM), <code>resume/</code>, <code>.naukri-chrome-profile/</code>, and <code>logs/</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
