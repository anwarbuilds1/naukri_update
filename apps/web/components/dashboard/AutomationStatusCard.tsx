'use client';

import { useEffect, useState } from 'react';
import type { RunResult } from '@naukri-update/shared';

export function AutomationStatusCard() {
  const [logs, setLogs] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch('/api/agent/logs?limit=5');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.lines) {
            setLogs(json.data.lines);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const latestHeadline = logs.find((l) => l.task === 'headline-refresh');
  const latestResume = logs.find((l) => l.task === 'resume-upload');

  function formatDate(ts?: number) {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Automation History</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div>
            <span className="text-sm font-medium text-white block">Headline Refresh</span>
            <span className="text-xs text-slate-500 block">
              {latestHeadline ? latestHeadline.message.slice(0, 45) : 'No recent runs'}
            </span>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                latestHeadline?.success
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : latestHeadline
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {latestHeadline ? (latestHeadline.success ? 'Success' : 'Failed') : '—'}
            </span>
            <span className="text-xs text-slate-500 block mt-1">
              {formatDate(latestHeadline?.timestamp)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div>
            <span className="text-sm font-medium text-white block">Resume Upload</span>
            <span className="text-xs text-slate-500 block">
              {latestResume ? latestResume.message.slice(0, 45) : 'No recent uploads'}
            </span>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                latestResume?.success
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : latestResume
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-500'
              }`}
            >
              {latestResume ? (latestResume.success ? 'Success' : 'Failed') : '—'}
            </span>
            <span className="text-xs text-slate-500 block mt-1">
              {formatDate(latestResume?.timestamp)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
