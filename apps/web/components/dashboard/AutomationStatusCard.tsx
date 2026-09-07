'use client';

import { useEffect, useState } from 'react';
import type { RunResult, ScheduleConfig } from '@naukri-update/shared';

export function AutomationStatusCard() {
  const [logs, setLogs] = useState<RunResult[]>([]);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [logsRes, schedRes] = await Promise.allSettled([
          fetch('/api/agent/logs?limit=10'),
          fetch('/api/agent/schedule'),
        ]);

        if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
          const json = await logsRes.value.json();
          if (json.success && json.data?.lines) {
            setLogs(json.data.lines);
          }
        }

        if (schedRes.status === 'fulfilled' && schedRes.value.ok) {
          const json = await schedRes.value.json();
          if (json.success && json.data?.schedule) {
            setSchedule(json.data.schedule);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const headlineLogs = logs.filter((l) => l.task === 'headline-refresh');
  const resumeLogs = logs.filter((l) => l.task === 'resume-upload');

  const latestHeadline = headlineLogs[0];
  const lastSuccessHeadline = headlineLogs.find((l) => l.success);
  const lastFailedHeadline = headlineLogs.find((l) => !l.success);

  const latestResume = resumeLogs[0];
  const lastSuccessResume = resumeLogs.find((l) => l.success);
  const lastFailedResume = resumeLogs.find((l) => !l.success);

  function formatDate(ts?: number) {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDuration(ms?: number) {
    if (ms === undefined || ms === null) return '';
    return `(${(ms / 1000).toFixed(1)}s)`;
  }

  function renderScheduleSummary() {
    if (!schedule) {
      return (
        <div className="text-xs text-slate-500 italic">
          Schedule managed locally by agent
        </div>
      );
    }

    let refreshText = 'Disabled';
    if (schedule.refreshMode === 'interval') {
      const parts: string[] = [];
      if (schedule.refreshIntervalHours > 0) parts.push(`${schedule.refreshIntervalHours}h`);
      if (schedule.refreshIntervalMinutes > 0) parts.push(`${schedule.refreshIntervalMinutes}m`);
      refreshText = `Every ${parts.join(' ') || '1h'}`;
    } else if (schedule.refreshMode === 'fixed_time') {
      refreshText = `Daily at ${schedule.refreshTime || '10:00'}`;
    }

    const windowText = schedule.refreshWindowEnabled
      ? `${schedule.refreshWindowStart} – ${schedule.refreshWindowEnd}`
      : '24/7 (Anytime)';

    const resumeText = schedule.resumeUpdateEnabled
      ? `Daily at ${schedule.resumeUpdateTime || '09:00'}`
      : 'Disabled';

    return (
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 text-xs">
        <div>
          <span className="text-slate-500 block">Headline Frequency</span>
          <span className="font-semibold text-slate-300 mt-0.5 block">{refreshText}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Active Window</span>
          <span className="font-semibold text-slate-300 mt-0.5 block">{windowText}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Resume Auto-Sync</span>
          <span className="font-semibold text-slate-300 mt-0.5 block">{resumeText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Automation History & Schedule</h2>
      </div>

      {/* Schedule Configuration Card */}
      {renderScheduleSummary()}

      {/* Headline Refresh Task Status */}
      <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Headline Refresh</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                latestHeadline?.success
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : latestHeadline
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {latestHeadline ? (latestHeadline.success ? 'Success' : 'Failed') : 'No runs yet'}
            </span>
            {latestHeadline && (
              <span className="text-xs text-slate-500">{formatDuration(latestHeadline.durationMs)}</span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Last run:</span>
            <span className="text-slate-300">{formatDate(latestHeadline?.timestamp)}</span>
          </div>
          {lastSuccessHeadline && lastSuccessHeadline !== latestHeadline && (
            <div className="flex justify-between">
              <span className="text-slate-500">Last success:</span>
              <span className="text-emerald-400">{formatDate(lastSuccessHeadline.timestamp)}</span>
            </div>
          )}
          {lastFailedHeadline && (
            <div className="rounded border border-red-500/20 bg-red-500/5 p-2 mt-1">
              <div className="flex justify-between text-red-400 font-medium">
                <span>Last failure:</span>
                <span>{formatDate(lastFailedHeadline.timestamp)}</span>
              </div>
              <p className="text-red-300/90 text-xs mt-0.5 break-words">{lastFailedHeadline.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* Resume Upload Task Status */}
      <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Resume Upload</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                latestResume?.success
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : latestResume
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {latestResume ? (latestResume.success ? 'Success' : 'Failed') : 'No runs yet'}
            </span>
            {latestResume && (
              <span className="text-xs text-slate-500">{formatDuration(latestResume.durationMs)}</span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Last run:</span>
            <span className="text-slate-300">{formatDate(latestResume?.timestamp)}</span>
          </div>
          {lastSuccessResume && lastSuccessResume !== latestResume && (
            <div className="flex justify-between">
              <span className="text-slate-500">Last success:</span>
              <span className="text-emerald-400">{formatDate(lastSuccessResume.timestamp)}</span>
            </div>
          )}
          {lastFailedResume && (
            <div className="rounded border border-red-500/20 bg-red-500/5 p-2 mt-1">
              <div className="flex justify-between text-red-400 font-medium">
                <span>Last failure:</span>
                <span>{formatDate(lastFailedResume.timestamp)}</span>
              </div>
              <p className="text-red-300/90 text-xs mt-0.5 break-words">{lastFailedResume.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
