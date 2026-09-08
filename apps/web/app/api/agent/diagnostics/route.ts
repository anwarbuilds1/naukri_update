import { NextResponse } from 'next/server';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/agent/diagnostics
 *
 * Runs comprehensive diagnostics on the local agent environment, Chrome availability,
 * browser profile, credentials, and resume configuration.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  let supabaseStatus: { status: 'ok' | 'failed' | 'warning'; message: string };

  if (!supabase) {
    supabaseStatus = {
      status: 'failed',
      message: 'Supabase URL/Key is unconfigured in web control plane.',
    };
  } else {
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

    supabaseStatus = {
      status: 'ok',
      message: 'Supabase authentication and database connection active.',
    };
  }

  const agentRes = await agentClient.getDiagnostics();
  if (agentRes.success) {
    const mergedData = {
      ...agentRes.data,
      supabase: supabaseStatus,
    };
    return NextResponse.json({
      success: true,
      data: mergedData,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error: agentRes.error,
      details: { supabase: supabaseStatus },
    },
    { status: 503 }
  );
}
