'use client';

import { useEffect, useState } from 'react';
import type { AgentCommandType, AgentStatus } from '@naukri-update/shared';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req-' + Math.random().toString(36).slice(2) + Date.now();
}

function getRelativeTime(timestamp?: number): { text: string; isStale: boolean } {
  if (!timestamp || timestamp <= 0) return { text: 'Never', isStale: true };
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const isStale = diffSec > 90;

  if (diffSec < 10) return { text: 'Just now', isStale: false };
  if (diffSec < 60) return { text: `${diffSec}s ago`, isStale: false };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { text: `${diffMin}m ago`, isStale };
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { text: `${diffHours}h ago`, isStale: true };
  return { text: `${Math.floor(diffHours / 24)}d ago`, isStale: true };
}

export function AgentStatusCard() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  async function fetchStatus() {
    try {
      const res = await fetch('/api/agent/status');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStatus(json.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 10000);
    const clockInterval = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(clockInterval);
    };
  }, []);

  async function handleCommand(type: AgentCommandType) {
    setCommandLoading(type);
    setCommandFeedback(null);

    try {
      const requestId = generateRequestId();
      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          requestId,
          issuedAt: Date.now(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setCommandFeedback(json.data?.duplicate ? 'Command already queued' : 'Command sent successfully');
        await fetchStatus();
      } else if (res.status === 409 || json.error?.code === 'AGENT_BUSY') {
        setCommandFeedback('Agent is currently busy running automation');
      } else {
        setCommandFeedback(json.error?.message || 'Failed to dispatch command');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCommandFeedback('Error: ' + msg);
    } finally {
      setCommandLoading(null);
      setTimeout(() => setCommandFeedback(null), 4000);
    }
  }

  const currentStatus = status?.status ?? 'offline';
  const isOnline = currentStatus !== 'offline';
  const isBusy = currentStatus === 'running';

  const statusConfig: Record<string, { label: string; color: string; badge: string }> = {
    idle: { label: 'Idle / Ready', color: 'bg-emerald-500', badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    running: { label: 'Automation Running', color: 'bg-blue-500 animate-pulse', badge: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    'chrome-disconnected': { label: 'Chrome Disconnected', color: 'bg-amber-500', badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    'otp-required': { label: 'Action Required: OTP / CAPTCHA', color: 'bg-rose-500 animate-ping', badge: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    error: { label: 'Error', color: 'bg-red-500', badge: 'text-red-400 bg-red-500/10 border-red-500/20' },
    offline: { label: 'Agent Offline', color: 'bg-slate-500', badge: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  };

  const badge = statusConfig[currentStatus] || statusConfig['offline']!;
  const heartbeat = getRelativeTime(status?.lastSeen);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Agent Status</h2>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.badge}`}>
          <span className={`h-2 w-2 rounded-full ${badge.color}`} />
          {badge.label}
        </span>
      </div>

      {/* Busy Task Indicator */}
      {isBusy && (
        <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300">
          <svg className="h-4 w-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <div>
            <span className="font-semibold">Automation in progress:</span>{' '}
            <span>{status?.currentTask === 'resume-upload' ? 'Uploading resume to Naukri...' : 'Refreshing profile headline on Naukri...'}</span>
          </div>
        </div>
      )}

      {/* High-visibility OTP/CAPTCHA manual intervention banner */}
      {currentStatus === 'otp-required' && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 p-4 text-sm text-rose-300 space-y-1">
          <p className="font-bold flex items-center gap-2">⚠️ Naukri Requires Manual Verification</p>
          <p className="text-xs text-rose-200">
            Please open your dedicated Chrome window and complete the OTP or CAPTCHA challenge manually. The agent cannot automate security challenges by design.
          </p>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 block">Chrome CDP</span>
          <span className={`font-semibold mt-0.5 block ${status?.chromeConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
            {status?.chromeConnected ? 'Port 9222 (Ready)' : 'Disconnected'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 block">Last Heartbeat</span>
          <span
            className={`font-semibold mt-0.5 block ${heartbeat.isStale ? 'text-amber-400' : 'text-slate-300'}`}
            title={status?.lastSeen ? new Date(status.lastSeen).toLocaleString() : 'No heartbeat'}
          >
            {heartbeat.text}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 block">Agent Version</span>
          <span className="font-semibold text-slate-300 mt-0.5 block">
            {status?.version ? `v${status.version}` : '—'}
          </span>
        </div>
      </div>

      {/* Command Actions */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-slate-400">Quick Actions</span>
          {commandFeedback && <span className="text-xs text-indigo-400">{commandFeedback}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleCommand('trigger-refresh')}
            disabled={!isOnline || isBusy || commandLoading !== null}
            className="rounded-md bg-indigo-600/90 hover:bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition disabled:opacity-40 disabled:pointer-events-none"
            title={isBusy ? 'Agent is currently busy' : 'Trigger headline refresh'}
          >
            {commandLoading === 'trigger-refresh' ? 'Dispatching...' : 'Refresh Headline'}
          </button>

          <button
            onClick={() => handleCommand('trigger-resume-upload')}
            disabled={!isOnline || isBusy || commandLoading !== null}
            className="rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-white transition disabled:opacity-40 disabled:pointer-events-none"
            title={isBusy ? 'Agent is currently busy' : 'Trigger resume upload'}
          >
            {commandLoading === 'trigger-resume-upload' ? 'Dispatching...' : 'Upload Resume'}
          </button>

          <button
            onClick={() => handleCommand('connect-chrome')}
            disabled={!isOnline || isBusy || commandLoading !== null}
            className="rounded-md border border-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition disabled:opacity-40 disabled:pointer-events-none"
          >
            {commandLoading === 'connect-chrome' ? 'Connecting...' : 'Launch Chrome'}
          </button>

          <button
            onClick={() => handleCommand('disconnect-chrome')}
            disabled={!isOnline || isBusy || commandLoading !== null}
            className="rounded-md border border-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition disabled:opacity-40 disabled:pointer-events-none"
          >
            {commandLoading === 'disconnect-chrome' ? 'Stopping...' : 'Stop Chrome'}
          </button>
        </div>
      </div>
    </div>
  );
}
