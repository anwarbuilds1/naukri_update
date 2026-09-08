import { NextResponse } from 'next/server';
import { getAgentAvailability, type AgentStatus, type ApiResponse } from '@naukri-update/shared';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/agent/status
 *
 * Observes live agent state and falls back to persisted Supabase heartbeat
 * when the agent is offline/unreachable. Does NOT write to agent_status on
 * every browser poll (heartbeats write to agent_status).
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    // Supabase unconfigured: fall back to live agent status directly
    const agentRes = await agentClient.getStatus();
    if (agentRes.success && agentRes.data) {
      return NextResponse.json(agentRes);
    }
    return NextResponse.json({
      success: true,
      data: {
        status: 'offline',
        version: '0.1.0',
        chromeConnected: false,
        lastSeen: 0,
      },
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      },
      { status: 401 }
    );
  }

  // 1. Attempt live query to local agent
  const agentRes = await agentClient.getStatus();
  if (agentRes.success && agentRes.data) {
    return NextResponse.json(agentRes);
  }

  // 2. Fall back to persisted Supabase agent_status
  try {
    const { data: statusRow } = await (supabase.from('agent_status') as any)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (statusRow) {
      const row = statusRow as any;
      const lastSeenMs = Date.parse(row.last_seen);
      const availability = getAgentAvailability(lastSeenMs, Date.now(), row.status);

      const status: AgentStatus = {
        status: availability.status,
        version: row.version,
        chromeConnected: row.chrome_connected,
        lastSeen: lastSeenMs,
      };

      const response: ApiResponse<AgentStatus> = {
        success: true,
        data: status,
      };
      return NextResponse.json(response);
    }
  } catch {
    // Ignore database read errors
  }

  // 3. Fallback: entirely offline
  const fallbackStatus: AgentStatus = {
    status: 'offline',
    version: '0.1.0',
    chromeConnected: false,
    lastSeen: 0,
  };

  return NextResponse.json({
    success: true,
    data: fallbackStatus,
  });
}
