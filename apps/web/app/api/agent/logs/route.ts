import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { RunResult } from '@naukri-update/shared';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/agent/logs
 *
 * Fetches persistent automation run history from Supabase run_log table
 * for the authenticated user, falling back to local agent log file.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
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

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const task = searchParams.get('task') ?? '';

  // 1. Query Supabase run_log with RLS
  try {
    let query: any = (supabase.from('run_log') as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (task === 'headline-refresh' || task === 'resume-upload') {
      query = query.eq('task', task);
    }

    const { data: rows, error } = await query;

    if (!error && rows && rows.length > 0) {
      const lines: RunResult[] = rows.map((r: any) => ({
        task: r.task as RunResult['task'],
        success: r.success,
        message: r.message,
        durationMs: r.duration_ms,
        timestamp: Date.parse(r.created_at),
      }));

      return NextResponse.json({
        success: true,
        data: { lines },
      });
    }
  } catch {
    // Ignore database read errors and fall back to local agent
  }

  // 2. Fallback to local agent log file
  const agentLogs = await agentClient.getLogs(limit, task);
  return NextResponse.json(agentLogs);
}
