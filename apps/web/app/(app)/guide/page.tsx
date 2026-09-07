export default function GuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Guide</h1>
        <p className="text-slate-400 mt-1">Setup and usage documentation.</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 prose prose-invert max-w-none p-6">
        <h2>Getting Started</h2>
        <ol>
          <li>Install the Naukri Update Agent on your local machine.</li>
          <li>Configure your Naukri credentials in the agent environment.</li>
          <li>Start the agent with <code>pnpm start</code> from <code>apps/agent</code>.</li>
          <li>Configure your schedule in Settings.</li>
          <li>The agent will automatically refresh your headline and upload your resume on schedule.</li>
        </ol>
        <h2>Architecture</h2>
        <p>See <code>docs/architecture.md</code> for the full architecture overview.</p>
      </div>
    </div>
  );
}
