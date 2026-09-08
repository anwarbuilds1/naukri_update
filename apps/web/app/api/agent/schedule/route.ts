import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@naukri-update/database';
import type { ScheduleConfig } from '@naukri-update/shared';
import { resolveAgentSecret } from '@/lib/agent-client';

function getAdminSupabase() {
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * GET /api/agent/schedule
 *
 * Provides the single source of truth schedule from Supabase agent_config
 * to the authenticated local agent.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = resolveAgentSecret();
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
    return NextResponse.json({ success: false, error: { code: 'DB_UNCONFIGURED', message: 'Supabase unconfigured.' } });
  }

  let targetUserId = process.env['AGENT_USER_ID'];
  if (!targetUserId) {
    const { data: firstConfig } = await (adminSupabase.from('agent_config') as any)
      .select('user_id')
      .limit(1)
      .maybeSingle();
    targetUserId = (firstConfig as any)?.user_id;
  }

  if (!targetUserId) {
    return NextResponse.json({ success: false, error: { code: 'NO_CONFIG', message: 'No agent_config found.' } });
  }

  const { data: row } = await (adminSupabase.from('agent_config') as any)
    .select('*')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Config row not found.' } });
  }

  const configRow = row as any;
  const schedule: ScheduleConfig = {
    refreshMode: configRow.refresh_mode,
    refreshIntervalHours: configRow.refresh_interval_hours,
    refreshIntervalMinutes: configRow.refresh_interval_minutes,
    refreshTime: configRow.refresh_time,
    refreshWindowEnabled: configRow.refresh_window_enabled,
    refreshWindowStart: configRow.refresh_window_start,
    refreshWindowEnd: configRow.refresh_window_end,
    resumeUpdateEnabled: configRow.resume_update_enabled,
    resumeUpdateTime: configRow.resume_update_time,
  };

  return NextResponse.json({
    success: true,
    data: {
      schedule,
      naukriEmail: configRow.naukri_email,
    },
  });
}
