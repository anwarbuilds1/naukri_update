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

  const agentRes = await agentClient.getDiagnostics();
  return NextResponse.json(agentRes, {
    status: agentRes.success ? 200 : 503,
  });
}
