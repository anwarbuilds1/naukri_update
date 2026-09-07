'use client';

import { useEffect, useState } from 'react';
import { ScheduleConfigSchema, type ScheduleConfig } from '@naukri-update/shared';
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
        </div>

        {/* Headline Refresh Schedule */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Headline Refresh Schedule</h2>

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
    </div>
  );
}
