'use client';

import { useEffect, useState } from 'react';
import type { RunResult } from '@naukri-update/shared';

export default function LogsPage() {
  const [logs, setLogs] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'headline-refresh' | 'resume-upload'>('all');

  async function fetchLogs() {
    setLoading(true);
    try {
      const url = filter === 'all' ? '/api/agent/logs?limit=100' : `/api/agent/logs?limit=100&task=${filter}`;
      const res = await fetch(url);
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

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  function formatDate(ts?: number) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation Logs</h1>
          <p className="text-slate-400 mt-1">Audit log of all profile refresh and resume upload attempts.</p>
        </div>
        <button
          onClick={fetchLogs}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
        >
          Refresh Logs
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          All Runs
        </button>
        <button
          onClick={() => setFilter('headline-refresh')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            filter === 'headline-refresh' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Headline Refresh
        </button>
        <button
          onClick={() => setFilter('resume-upload')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
            filter === 'resume-upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Resume Upload
        </button>
      </div>

      {/* Logs Table / List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No automation run logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Result Message</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                      {log.task === 'headline-refresh' ? 'Headline' : 'Resume'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          log.success
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-md truncate" title={log.message}>
                      {log.message}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {(log.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
