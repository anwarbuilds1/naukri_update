import { AgentStatusCard } from '@/components/dashboard/AgentStatusCard';
import { AutomationStatusCard } from '@/components/dashboard/AutomationStatusCard';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-slate-400">Monitor your Naukri automation status.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AgentStatusCard />
        <AutomationStatusCard />
      </div>
    </div>
  );
}
