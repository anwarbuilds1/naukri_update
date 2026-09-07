import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AgentStatus, ApiResponse } from '@naukri-update/shared';

const AGENT_URL = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842';
const AGENT_SECRET = process.env['AGENT_SECRET'] ?? '';

/**
 * GET /api/agent/status
 *
 * Proxies the agent status request to the local agent HTTP server.
 * AGENT_SECRET is kept server-side and never exposed to the browser.
 * Returns a synthetic "offline" status when the agent is unreachable.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${AGENT_URL}/api/agent/status`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body: ApiResponse<never> = {
        success: false,
        error: { code: 'AGENT_ERROR', message: `Agent returned HTTP ${res.status}` },
      };
      return NextResponse.json(body, { status: res.status });
    }

    const data = (await res.json()) as ApiResponse<AgentStatus>;
    return NextResponse.json(data);
  } catch {
    // Agent is offline — return synthetic offline status rather than an error
    const offlineStatus: AgentStatus = {
      status: 'offline',
      version: 'unknown',
      chromeConnected: false,
      lastSeen: 0,
    };
    const body: ApiResponse<AgentStatus> = { success: true, data: offlineStatus };
    return NextResponse.json(body);
  }
}
