export default function GuidePage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">User & Operational Guide</h1>
        <p className="text-slate-400 mt-1">
          Complete guide to the Next.js PWA control plane, local background daemon, and security protocols.
        </p>
      </div>

      {/* Overview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">System Architecture & Privacy</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Naukri Update uses a privacy-first decoupled architecture:
        </p>
        <ul className="list-disc list-inside space-y-2 text-xs text-slate-400">
          <li>
            <strong className="text-slate-200">Web Control Plane (PWA):</strong> Hosted at <code>http://localhost:3000</code> or your private domain. It manages scheduling configuration and live monitoring through Supabase.
          </li>
          <li>
            <strong className="text-slate-200">Local Execution Agent:</strong> A lightweight background Node.js daemon running at <code>http://127.0.0.1:7842</code>. It never exposes ports to the internet.
          </li>
          <li>
            <strong className="text-slate-200">Zero Cloud Passwords:</strong> Your Naukri password is encrypted locally using machine-bound AES-256-GCM and stored in <code>~/.config/NaukriUpdate/.credentials.enc</code>. It is never sent to Supabase or any cloud server.
          </li>
          <li>
            <strong className="text-slate-200">Local Resume & Profile:</strong> Candidate resumes and Chrome sessions remain exclusively on your local computer.
          </li>
        </ul>
      </div>

      {/* Daemon OS Setup */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Background Daemon Auto-Start Setup</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          To ensure profile refreshes run on schedule without keeping a terminal open, configure the agent as an OS user service:
        </p>

        <div className="space-y-4 pt-2">
          {/* Linux */}
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Linux (systemd user service)</h3>
            <p className="text-xs text-slate-400">
              Run the built-in generator to create <code>~/.config/systemd/user/naukri-agent.service</code> and <code>~/.config/NaukriUpdate/agent.env</code> (mode <code>0600</code>):
            </p>
            <pre className="rounded bg-slate-900 p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`# 1. Install service unit & initialize agent.env
node apps/agent/dist/main.js --service-install

# 2. Reload and enable service
systemctl --user daemon-reload
systemctl --user enable --now naukri-agent.service

# 3. Check status
systemctl --user status naukri-agent.service`}
            </pre>
          </div>

          {/* macOS */}
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">macOS (LaunchAgent)</h3>
            <p className="text-xs text-slate-400">
              Place a launch agent plist in <code>~/Library/LaunchAgents/com.naukri.agent.plist</code>:
            </p>
            <pre className="rounded bg-slate-900 p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`# 1. Generate plist
node apps/agent/dist/main.js --service-install

# 2. Load agent
launchctl load -w ~/Library/LaunchAgents/com.naukri.agent.plist`}
            </pre>
          </div>

          {/* Windows */}
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Windows (Task Scheduler)</h3>
            <p className="text-xs text-slate-400">
              Register a logon task using <code>schtasks.exe</code>:
            </p>
            <pre className="rounded bg-slate-900 p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`schtasks /create /tn "NaukriAgent" /tr "node C:\\path\\to\\apps\\agent\\dist\\main.js" /sc onlogon /rl limited /f`}
            </pre>
          </div>
        </div>
      </div>

      {/* OTP/CAPTCHA Protocol */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">OTP & CAPTCHA Manual Intervention Protocol</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Naukri occasionally presents security challenges (SMS/Email OTP or visual CAPTCHAs). By design, the automation daemon <strong>never bypasses or automates security challenges</strong>.
        </p>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 space-y-2 text-xs text-amber-300">
          <p className="font-semibold">When a challenge is detected:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-300">
            <li>The dashboard status will turn yellow with an alert: <span className="font-semibold text-rose-400">Action Required: OTP / CAPTCHA</span>.</li>
            <li>Click <strong>"Open Naukri Browser to Solve"</strong> or <strong>"Launch Chrome"</strong> on the Dashboard.</li>
            <li>A dedicated Chrome window will open to your Naukri profile page. Complete the verification challenge manually in the browser.</li>
            <li>Once logged in, you can leave Chrome open or close it. The agent will detect the authenticated session and resume scheduled automations.</li>
          </ol>
        </div>
      </div>

      {/* Updates */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Software Updates (UI vs. Daemon)</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Updates are handled independently for the web interface and the local daemon:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-indigo-400">Web UI (PWA)</h3>
            <p className="text-xs text-slate-400">
              The Next.js Progressive Web App auto-updates via browser Service Worker caching. Whenever new frontend features or bugfixes are deployed, refreshing the browser loads the latest version immediately.
            </p>
          </div>

          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-indigo-400">Local Agent Daemon</h3>
            <p className="text-xs text-slate-400">
              To update the local background daemon to the latest version:
            </p>
            <pre className="rounded bg-slate-900 p-2 text-xs font-mono text-slate-300">
{`git pull
pnpm --filter @naukri-update/agent build
systemctl --user restart naukri-agent.service`}
            </pre>
          </div>
        </div>
      </div>

      {/* Rollback Baseline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Rollback to Legacy Electron App</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          The original Electron desktop application remains fully intact and functional as the verified rollback baseline.
        </p>

        <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-4 space-y-3">
          <p className="text-xs text-slate-400">
            If you ever need to revert to the legacy desktop GUI:
          </p>
          <pre className="rounded bg-slate-900 p-3 text-xs font-mono text-slate-300 overflow-x-auto">
{`# 1. Stop the background agent daemon
systemctl --user stop naukri-agent.service # Linux
# or kill the running node agent process

# 2. Launch legacy Electron app from project root
npm start`}
          </pre>
          <p className="text-xs text-slate-500">
            Both runtimes share the same configuration directory (<code>~/.config/NaukriUpdate</code>), so your credentials, browser profile, and uploaded resumes remain 100% intact and immediately available without manual migration.
          </p>
        </div>
      </div>
    </div>
  );
}

