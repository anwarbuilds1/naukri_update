export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to Naukri Update</h1>
          <p className="mt-2 text-slate-400">
            Automate your Naukri profile to stay visible to recruiters.
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <p className="font-medium text-slate-300">Onboarding wizard — Phase 2</p>
          <p className="mt-2 text-sm text-slate-500">
            The setup wizard is coming in Phase 2. For now, configure the agent
            using environment variables and start it with{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">
              pnpm start
            </code>{' '}
            from the <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">apps/agent</code> directory.
          </p>
          <div className="mt-4">
            <a
              href="/dashboard"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Go to Dashboard →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
