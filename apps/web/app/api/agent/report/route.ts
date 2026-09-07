import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@naukri-update/database';

/**
 * Helper to get an admin Supabase client ONLY on the server for the local agent gateway.
 * Never exposed to browser or client bundles.
 */
function getAdminSupabase() {
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * POST /api/agent/report
 *
 * Endpoint for the local agent to report heartbeats and run results.
 * Authenticated via X-Agent-Secret header.
 *
 * SECURITY REQUIREMENT:
 * The associated user_id is derived strictly server-side from the authenticated
 * agent identity (via AGENT_USER_ID or authoritative agent_config).
 * Any user_id provided in the request body is strictly IGNORED.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env['AGENT_SECRET'];
  if (expectedSecret) {
    const provided = req.headers.get('x-agent-secret');
    if (provided !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid agent secret.' } },
        { status: 401 }
      );
    }
  }

  const adminSupabase = getAdminSupabase();
  if (!adminSupabase) {
    // If Supabase is not configured yet, accept report gracefully (local dev)
    return NextResponse.json({ success: true, warning: 'Supabase unconfigured on server.' });
  }

  // 1. Derive user_id server-side
  let targetUserId = process.env['AGENT_USER_ID'];
  if (!targetUserId) {
    // Lookup single-user agent_config owner
    const { data: firstConfig } = await (adminSupabase.from('agent_config') as any)
      .select('user_id')
      .limit(1)
      .maybeSingle();

    if ((firstConfig as any)?.user_id) {
      targetUserId = (firstConfig as any).user_id;
    }
  }

  if (!targetUserId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AGENT_USER_UNRESOLVED',
          message: 'Server could not resolve the user identity for this agent. Set AGENT_USER_ID in web environment.',
        },
      },
      { status: 422 }
    );
  }

  let body: {
    type: 'heartbeat' | 'run-result' | 'command-update';
    payload: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON.' } },
      { status: 400 }
    );
  }

  try {
    if (body.type === 'heartbeat') {
      const p = body.payload;
      await (adminSupabase.from('agent_status') as any).upsert(
        {
          user_id: targetUserId,
          last_seen: new Date().toISOString(),
          version: typeof p['version'] === 'string' ? p['version'] : '0.1.0',
          chrome_connected: Boolean(p['chromeConnected']),
          status: typeof p['status'] === 'string' ? (p['status'] as any) : 'idle',
        },
        { onConflict: 'user_id' }
      );
    } else if (body.type === 'command-update') {
      const p = body.payload;
      const requestId = p['requestId'] as string | undefined;
      const status = p['status'] as string | undefined;
      const previousStatus = p['previousStatus'] as string | undefined;
      const errorMessage = (p['errorMessage'] as string | undefined) ?? null;

      if (requestId && status) {
        let updateQuery = (adminSupabase.from('agent_commands') as any)
          .update({
            status,
            error_message: errorMessage,
          })
          .eq('request_id', requestId);

        if (previousStatus) {
          updateQuery = updateQuery.eq('status', previousStatus);
        }

        await updateQuery;
      }
    } else if (body.type === 'run-result') {
      const p = body.payload;
      await (adminSupabase.from('run_log') as any).insert({
        user_id: targetUserId,
        task: p['task'] as any,
        success: Boolean(p['success']),
        message: typeof p['message'] === 'string' ? p['message'] : '',
        duration_ms: typeof p['durationMs'] === 'number' ? p['durationMs'] : 0,
      });

      // If associated with a command requestId, atomically update command state from running -> succeeded / failed
      const requestId = p['requestId'] as string | undefined;
      if (requestId) {
        const finalStatus = p['success'] ? 'succeeded' : 'failed';
        await (adminSupabase.from('agent_commands') as any)
          .update({
            status: finalStatus,
            error_message: p['success'] ? null : (typeof p['message'] === 'string' ? p['message'] : 'Execution failed'),
          })
          .eq('request_id', requestId)
          .eq('status', 'running');
      }

      // Also update agent_status heartbeat
      await (adminSupabase.from('agent_status') as any).upsert(
        {
          user_id: targetUserId,
          last_seen: new Date().toISOString(),
          status: p['success'] ? 'idle' : 'error',
        },
        { onConflict: 'user_id' }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: msg } },
      { status: 500 }
    );
  }
}
