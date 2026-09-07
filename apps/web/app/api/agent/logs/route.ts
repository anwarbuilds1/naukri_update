import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AGENT_URL = process.env['AGENT_URL'] ?? 'http://127.0.0.1:7842';
const AGENT_SECRET = process.env['AGENT_SECRET'] ?? '';

/**
 * GET /api/agent/logs
 *
 * Returns recent run log lines from the local agent.
 * Phase 2: will also query Supabase run_log for structured history.
 *
 * Query params:
 *   limit  - max lines to return (default 50)
 *   task   - filter by 'headline-refresh' or 'resume-upload'
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get('limit') ?? '50';
  const task = searchParams.get('task') ?? '';

  const params = new URLSearchParams({ limit });
  if (task) params.set('task', task);

  try {
    const res = await fetch(`${AGENT_URL}/api/agent/logs?${params.toString()}`, {
      headers: { 'X-Agent-Secret': AGENT_SECRET },
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'AGENT_UNREACHABLE', message: 'Agent is not running.' },
      },
      { status: 503 }
    );
  }
}
