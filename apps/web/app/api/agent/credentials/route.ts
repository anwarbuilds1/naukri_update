import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { agentClient } from '@/lib/agent-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CredentialsUpdateSchema = z.object({
  naukriEmail: z.string().email('Invalid email address format.'),
  naukriPassword: z.string().min(1, 'Password cannot be empty.'),
});

/**
 * POST /api/agent/credentials
 *
 * Saves non-sensitive email in Supabase agent_config (user_id = auth.uid()).
 * Forwards password directly to local agent's machine-bound .credentials.enc.
 * NEVER writes password to Supabase and NEVER logs password.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON.' },
      },
      { status: 400 }
    );
  }

  const parse = CredentialsUpdateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid credentials payload.',
          details: parse.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const { naukriEmail, naukriPassword } = parse.data;

  // 1. Update non-sensitive email in Supabase (explicit user ownership)
  try {
    await (supabase.from('agent_config') as any)
      .upsert(
        {
          user_id: user.id,
          naukri_email: naukriEmail,
        },
        { onConflict: 'user_id' }
      );
  } catch (err: unknown) {
    console.warn('[credentials] Failed to update email in agent_config:', err);
  }

  // 2. Forward password to local agent (localhost only, AES-256-GCM on agent)
  const agentRes = await agentClient.sendCredentials({
    naukriEmail,
    naukriPassword,
  });

  return NextResponse.json(agentRes, {
    status: agentRes.success ? 200 : 503,
  });
}
